import { DEFAULT_SUBREDDITS } from "@/config/subreddits";
import { getMeta, setMeta } from "@/lib/db";
import { extractProblemPhrases } from "@/lib/problems/extract";
import { clusterIdeas } from "@/lib/ideas/cluster";
import { synthesizeIdea } from "@/lib/ideas/synthesize";
import { runEnhancedPipeline } from "@/lib/pipeline/enhanced";
import {
  loadIdeaById,
  loadIdeaPostIds,
  loadIdeaPosts,
  loadIdeas,
  loadPostsSince,
  loadProblemsForPosts,
  replaceProblems,
  storeIdeas,
  upsertPosts,
} from "@/lib/storage";
import type { AppIdeaDetails, IdeaCluster, SortOption } from "@/lib/types";
import { syncReddit } from "@/lib/reddit/fetcher";
import { logger } from "@/lib/logger";

const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6h

export const WINDOW_DAYS: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "365d": 365,
};

export const DEFAULT_WINDOW_KEY = "30d";

export interface IdeaSummary {
  id: string;
  title: string;
  score: number;
  postsCount: number;
  subsCount: number;
  upvotesSum: number;
  commentsSum: number;
  trend: number[];
  trendSlope: number;
  topKeywords: string[];
  sampleSnippet: string;
  examplePostIds: string[];
  canonical: string;
  updatedAt: number;
  complexityTier?: AppIdeaDetails["complexityTier"] | null;
  predictedEffortDays?: number | null;
  worthEstimate?: string | null;
}

export interface IdeasResponse {
  updatedAt: string;
  windowDays: number;
  ideas: IdeaSummary[];
}

export interface RunSummary {
  subs: number;
  postsFetched: number;
  relevant: number;
  clusters: number;
  ideas: number;
  durationMs: number;
}

export interface IdeaWithDetails extends IdeaSummary {
  details: AppIdeaDetails | null;
}

export function resolveWindowKey(key?: string) {
  if (key && WINDOW_DAYS[key]) {
    return { key, days: WINDOW_DAYS[key] } as const;
  }
  return { key: DEFAULT_WINDOW_KEY, days: WINDOW_DAYS[DEFAULT_WINDOW_KEY] } as const;
}

export async function refreshIdeas(windowDays: number, subreddits = DEFAULT_SUBREDDITS): Promise<RunSummary> {
  const startedAt = Date.now();

  if (!process.env.OPENAI_API_KEY) {
    console.log("\n=== NO_OPENAI_KEY_AVAILABLE ===");
    throw new Error("OpenAI API key required for analysis");
  }

  console.log("\n=== ANALYSIS_PIPELINE_START ===");

  // Only analyze existing posts - no fetching
  const cutoffUtc = Math.floor(Date.now() / 1000) - windowDays * 24 * 60 * 60;
  const posts = loadPostsSince(cutoffUtc);

  console.log(`Found ${posts.length} posts in database for analysis (window: ${windowDays} days)`);

  if (posts.length === 0) {
    console.log("\n=== NO_POSTS_AVAILABLE_FOR_ANALYSIS ===");
    storeIdeas(windowDays, []);
    setMeta(cacheKey(windowDays), String(Date.now()));
    return {
      subs: subreddits.length,
      postsFetched: 0,
      relevant: 0,
      clusters: 0,
      ideas: 0,
      durationMs: Date.now() - startedAt,
    };
  }

  console.log(`\n=== ANALYZING_WITH_OPENAI ===`);
  console.log(`Processing ${posts.length} posts for idea analysis`);

  // Import OpenAI analysis components
  const { extractProblemsWithLLM } = await import('@/lib/problems/extract');
  const { clusterSemanticProblems } = await import('@/lib/clustering/semantic');
  const { calculateBusinessMetrics, assessQuality, rankOpportunities, filterViableOpportunities } = await import('@/lib/analysis/business');
  const { analyzeClusterWithLLM } = await import('@/lib/llm/openai');

  // Step 3: OpenAI analysis
  const problemData = [];
  const batchSize = 5;
  const postsToProcess = posts.slice(0, 100);

  console.log(`Analyzing ${postsToProcess.length} posts in batches of ${batchSize}`);

  for (let i = 0; i < postsToProcess.length; i += batchSize) {
    const batch = postsToProcess.slice(i, i + batchSize);

    const batchPromises = batch.map(async (post) => {
      try {
        const { phrases, analysis } = await extractProblemsWithLLM(post);
        return { post, phrases, analysis };
      } catch (error) {
        console.log(`Failed to analyze post ${post.id}: ${error.message}`);
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    problemData.push(...batchResults.filter(Boolean));

    console.log(`Analyzed ${problemData.length}/${postsToProcess.length} posts`);

    if (i + batchSize < postsToProcess.length) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  const actionableProblems = problemData.filter(d =>
    d.analysis.isActionableProblem && d.analysis.confidence > 0.5
  );

  console.log(`Found ${actionableProblems.length} actionable problems from ${problemData.length} analyzed posts`);

  if (actionableProblems.length === 0) {
    console.log("\n=== NO_ACTIONABLE_PROBLEMS_FOUND ===");
    storeIdeas(windowDays, []);
    setMeta(cacheKey(windowDays), String(Date.now()));
    return {
      subs: subreddits.length,
      postsFetched: fetchedCount,
      relevant: problemData.length,
      clusters: 0,
      ideas: 0,
      durationMs: Date.now() - startedAt,
    };
  }

  // Step 4: Clustering
  console.log('\n=== CLUSTERING_WITH_OPENAI ===');
  const allPhrases = actionableProblems.flatMap(d => d.phrases);
  const allPosts = actionableProblems.map(d => d.post);

  console.log(`Clustering ${allPhrases.length} problem phrases`);

  const clusteringResult = await clusterSemanticProblems(allPhrases, allPosts, {
    minClusterSize: 2,
    similarityThreshold: 0.6
  });

  const highQualityClusters = clusteringResult.clusters.filter(cluster =>
    cluster.coherence_score >= 0.5 && cluster.size >= 2
  );

  console.log(`Found ${highQualityClusters.length} high-quality clusters from ${clusteringResult.clusters.length} total clusters`);

  if (highQualityClusters.length === 0) {
    console.log("\n=== NO_QUALITY_CLUSTERS_FOUND ===");
    storeIdeas(windowDays, []);
    setMeta(cacheKey(windowDays), String(Date.now()));
    return {
      subs: subreddits.length,
      postsFetched: fetchedCount,
      relevant: problemData.length,
      clusters: clusteringResult.clusters.length,
      ideas: 0,
      durationMs: Date.now() - startedAt,
    };
  }

  // Step 5: Business analysis and idea generation
  console.log('\n=== GENERATING_IDEAS ===');
  const opportunities = [];

  for (const cluster of highQualityClusters) {
    try {
      const clusterPostIds = new Set(cluster.posts.map(p => p.id));
      const clusterAnalyses = problemData
        .filter(d => clusterPostIds.has(d.post.id))
        .map(d => d.analysis);

      if (clusterAnalyses.length === 0) continue;

      const businessMetrics = calculateBusinessMetrics(cluster, clusterAnalyses, cluster.posts);
      const qualityAssessment = assessQuality(cluster, clusterAnalyses, businessMetrics);

      const clusterData = {
        title: `Cluster of ${cluster.size} posts`,
        phrases: cluster.phrases.map(p => p.phrase),
        posts: cluster.posts.map(p => ({
          title: p.title,
          content: p.selftext || '',
          subreddit: p.subreddit,
          upvotes: p.upvotes,
          comments: p.comments
        })),
        businessMetrics,
        qualityAssessment
      };

      const llmAnalysis = await analyzeClusterWithLLM(clusterData);

      opportunities.push({
        cluster,
        analyses: clusterAnalyses,
        businessMetrics,
        qualityAssessment,
        llmAnalysis,
        posts: cluster.posts
      });

    } catch (error) {
      console.log(`Failed to generate idea for cluster ${cluster.id}: ${error.message}`);
    }
  }

  console.log(`Generated ${opportunities.length} business opportunities`);

  const viableOpportunities = filterViableOpportunities(opportunities);
  const rankedOpportunities = rankOpportunities(viableOpportunities);

  console.log(`${viableOpportunities.length} viable opportunities, ${rankedOpportunities.length} final ranked ideas`);

  const clustersWithDetails = rankedOpportunities.map(opp => ({
    id: opp.cluster.id,
    title: opp.llmAnalysis.title,
    canonical: opp.cluster.phrases[0]?.canonical || 'unknown',
    phrases: opp.cluster.phrases.map(p => p.phrase),
    posts: opp.cluster.posts.map(post => ({
      id: post.id,
      subreddit: post.subreddit,
      url: post.url,
      title: post.title,
      createdUtc: post.createdUtc,
      upvotes: post.upvotes,
      comments: post.comments,
      author: post.author,
      matchedSnippet: opp.cluster.phrases[0]?.snippet || post.title,
      problemPhrase: opp.cluster.phrases[0]?.phrase || post.title
    })),
    score: opp.qualityAssessment.overall_score,
    postsCount: opp.cluster.size,
    subsCount: new Set(opp.cluster.posts.map(p => p.subreddit)).size,
    upvotesSum: opp.cluster.posts.reduce((sum, p) => sum + (p.upvotes || 0), 0),
    commentsSum: opp.cluster.posts.reduce((sum, p) => sum + (p.comments || 0), 0),
    trend: Array(7).fill(0),
    trendSlope: 0,
    topKeywords: opp.llmAnalysis.key_features.slice(0, 5),
    sampleSnippet: opp.llmAnalysis.summary,
    details: {
      problemTitle: opp.llmAnalysis.title,
      summary: opp.llmAnalysis.summary,
      targetUsers: opp.llmAnalysis.target_users,
      jobToBeDone: opp.llmAnalysis.solution_approach,
      solution: opp.llmAnalysis.solution_approach,
      keyFeatures: opp.llmAnalysis.key_features,
      requirements: [],
      complexityTier: opp.llmAnalysis.technical_complexity,
      predictedEffortDays: opp.llmAnalysis.estimated_effort_days,
      valueProp: opp.llmAnalysis.monetization_potential,
      worthEstimate: opp.businessMetrics.revenue_potential,
      monetization: opp.llmAnalysis.monetization_potential,
      risks: opp.llmAnalysis.risks,
      wtpMentions: opp.analyses.reduce((sum, a) => sum + a.willingness_to_pay_signals, 0),
      evidenceKeywords: opp.llmAnalysis.key_features
    }
  }));

  console.log("\n=== STORING_RESULTS ===");
  storeIdeas(windowDays, clustersWithDetails);
  setMeta(cacheKey(windowDays), String(Date.now()));

  const summary: RunSummary = {
    subs: subreddits.length,
    postsFetched: 0, // No posts fetched - analysis only
    relevant: problemData.length,
    clusters: highQualityClusters.length,
    ideas: clustersWithDetails.length,
    durationMs: Date.now() - startedAt,
  };

  console.log(`\n=== PIPELINE_COMPLETE ===`);
  console.log(`Successfully generated ${clustersWithDetails.length} ideas in ${Math.round(summary.durationMs / 1000)}s`);
  return summary;
}

function cacheKey(windowDays: number) {
  return `ideas_cache_ts:${windowDays}`;
}

export async function ensureIdeas({
  windowDays,
  force = false,
  subreddits = DEFAULT_SUBREDDITS,
}: {
  windowDays: number;
  force?: boolean;
  subreddits?: string[];
}): Promise<RunSummary | null> {
  const key = cacheKey(windowDays);
  const last = getMeta(key);
  const lastTime = last ? Number(last) : 0;
  const expired = Date.now() - lastTime > CACHE_TTL_MS;
  if (!force && !expired && lastTime > 0) {
    logger.info(
      {
        stage: "cache",
        windowDays,
        lastUpdated: new Date(lastTime).toISOString(),
      },
      "IDEA_CACHE_HIT",
    );
    return null;
  }
  return await refreshIdeas(windowDays, subreddits);
}

export function listIdeas(windowDays: number): IdeaSummary[] {
  const rows = loadIdeas(windowDays);
  return rows.map((row) => {
    const details = row.details_json ? (JSON.parse(row.details_json) as AppIdeaDetails) : null;
    return {
      id: row.id,
      title: row.title,
      score: row.score,
      postsCount: row.posts_count,
      subsCount: row.subs_count,
      upvotesSum: row.upvotes_sum,
      commentsSum: row.comments_sum,
      trend: row.trend_json ? (JSON.parse(row.trend_json) as number[]) : [],
      trendSlope: row.trend_slope ?? 0,
      topKeywords: row.top_keywords ? (JSON.parse(row.top_keywords) as string[]) : [],
      sampleSnippet: row.sample_snippet ?? "",
      examplePostIds: loadIdeaPostIds(row.id, 3),
      canonical: row.canonical,
      updatedAt: row.updated_at,
      complexityTier: (row.complexity_tier as AppIdeaDetails["complexityTier"] | null) ?? details?.complexityTier ?? null,
      predictedEffortDays: row.effort_days ?? details?.predictedEffortDays ?? null,
      worthEstimate: row.worth_estimate ?? details?.worthEstimate ?? null,
    };
  });
}

export function sortIdeas(ideas: IdeaSummary[], sort: SortOption) {
  const copy = [...ideas];
  if (sort === "trending") {
    copy.sort((a, b) => b.trendSlope - a.trendSlope);
  } else if (sort === "fresh") {
    copy.sort((a, b) => b.updatedAt - a.updatedAt);
  } else {
    copy.sort((a, b) => b.score - a.score);
  }
  return copy;
}

export function filterIdeas(ideas: IdeaSummary[], query?: string) {
  if (!query) return ideas;
  const needle = query.toLowerCase();
  return ideas.filter((idea) => {
    return (
      idea.title.toLowerCase().includes(needle) ||
      idea.topKeywords.some((kw) => kw.toLowerCase().includes(needle)) ||
      idea.sampleSnippet.toLowerCase().includes(needle)
    );
  });
}

export function toIdeasResponse(
  ideas: IdeaSummary[],
  windowDays: number,
): IdeasResponse {
  const updatedAt = ideas.length > 0 ? ideas[0].updatedAt : Date.now();
  return {
    updatedAt: new Date(updatedAt).toISOString(),
    windowDays,
    ideas,
  };
}

export function getIdeaDetails(ideaId: string) {
  const rows = loadIdeaPosts(ideaId);
  return rows.map((row) => ({
    id: row.id,
    subreddit: row.subreddit,
    url: row.url,
    title: row.title,
    createdAt: new Date(row.createdUtc * 1000).toISOString(),
    upvotes: row.upvotes,
    comments: row.comments,
    matchedSnippet: row.snippet ?? "",
    author: row.author ?? undefined,
    problemPhrase: row.phrase ?? "",
  }));
}

export function getIdeaById(ideaId: string): IdeaWithDetails | null {
  const row = loadIdeaById(ideaId);
  if (!row) return null;
  const details = row.details_json ? (JSON.parse(row.details_json) as AppIdeaDetails) : null;
  const base: IdeaSummary = {
    id: row.id,
    title: row.title,
    score: row.score,
    postsCount: row.posts_count,
    subsCount: row.subs_count,
    upvotesSum: row.upvotes_sum,
    commentsSum: row.comments_sum,
    trend: row.trend_json ? (JSON.parse(row.trend_json) as number[]) : [],
    trendSlope: row.trend_slope ?? 0,
    topKeywords: row.top_keywords ? (JSON.parse(row.top_keywords) as string[]) : [],
    sampleSnippet: row.sample_snippet ?? "",
    examplePostIds: loadIdeaPostIds(row.id, 3),
    canonical: row.canonical,
    updatedAt: row.updated_at,
    complexityTier: (row.complexity_tier as AppIdeaDetails["complexityTier"] | null) ?? details?.complexityTier ?? null,
    predictedEffortDays: row.effort_days ?? details?.predictedEffortDays ?? null,
    worthEstimate: row.worth_estimate ?? details?.worthEstimate ?? null,
  };

  return {
    ...base,
    details,
  };
}
