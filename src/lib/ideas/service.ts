import { DEFAULT_SUBREDDITS } from "@/config/subreddits";
import { clusterIdeas } from "@/lib/ideas/cluster";
import { synthesizeIdea } from "@/lib/ideas/synthesize";
import {
  loadIdeaById,
  loadIdeaPostIds,
  loadIdeaPosts,
  loadIdeas,
  loadPostsSince,
  storeIdeas,
  type IdeaRecordRow,
} from "@/lib/storage";
import type { AppIdeaDetails, IdeaCluster, SortOption, ClusterPost } from "@/lib/types";

const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6h

export const WINDOW_DAYS: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
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
  canonical: string;
  complexityTier?: string;
  predictedEffortDays?: number;
  worthEstimate?: string;
  updatedAt: string;
  wtpMentions?: number;
  examplePostIds: string[];
}

export interface IdeasResponse {
  ideas: IdeaSummary[];
  totalPosts: number;
  windowDays: number;
  updatedAt?: string;
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
  posts: ClusterPost[];
}

export function resolveWindowKey(key?: string) {
  if (key && key in WINDOW_DAYS) {
    return { key, days: WINDOW_DAYS[key] } as const;
  }
  return { key: DEFAULT_WINDOW_KEY, days: WINDOW_DAYS[DEFAULT_WINDOW_KEY] } as const;
}

function parseJsonArray<T>(value: string | null | undefined): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function toIdeaSummary(row: IdeaRecordRow, examplePostIds: string[] = []): IdeaSummary {
  const trend = parseJsonArray<number>(row.trend_json);
  const topKeywords = parseJsonArray<string>(row.top_keywords);
  return {
    id: row.id,
    title: row.title,
    score: row.score ?? 0,
    postsCount: row.posts_count ?? 0,
    subsCount: row.subs_count ?? 0,
    upvotesSum: row.upvotes_sum ?? 0,
    commentsSum: row.comments_sum ?? 0,
    trend,
    trendSlope: row.trend_slope ?? 0,
    topKeywords,
    sampleSnippet: row.sample_snippet ?? '',
    canonical: row.canonical ?? '',
    complexityTier: row.complexity_tier ?? undefined,
    predictedEffortDays: row.effort_days ?? undefined,
    worthEstimate: row.worth_estimate ?? undefined,
    updatedAt: new Date(row.updated_at ?? Date.now()).toISOString(),
    wtpMentions: row.wtp_mentions ?? undefined,
    examplePostIds,
  };
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
    console.log("\n=== NO_POSTS_IN_DATABASE ===");
    storeIdeas(windowDays, []);
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

  // Step 3: OpenAI analysis
  const problemData = [];
  const batchSize = 50;
  const postsToProcess = posts.slice(0, 300);

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
    const validResults = batchResults.filter(Boolean);
    problemData.push(...validResults);

    console.log(`Analyzed ${Math.min(i + batchSize, postsToProcess.length)}/${postsToProcess.length} posts`);
  }

  const actionableProblems = problemData.filter(
    d => d.analysis.isActionableProblem && d.analysis.confidence > 0.5
  );

  console.log(`Found ${actionableProblems.length} actionable problems from ${problemData.length} analyzed posts`);

  if (actionableProblems.length === 0) {
    console.log("\n=== NO_ACTIONABLE_PROBLEMS_FOUND ===");
    storeIdeas(windowDays, []);
    return {
      subs: subreddits.length,
      postsFetched: problemData.length,
      relevant: problemData.length,
      clusters: 0,
      ideas: 0,
      durationMs: Date.now() - startedAt,
    };
  }

  // Step 4: Simplified clustering using existing clusterIdeas function
  console.log('\n=== CLUSTERING_WITH_OPENAI ===');
  const clusteringProblems = actionableProblems.flatMap(({ post, phrases }) =>
    phrases.map((phrase) => ({ ...phrase, postId: phrase.postId || post.id }))
  );
  const postsForClustering = actionableProblems.map(({ post }) => post);
  const uniquePosts = Array.from(new Map(postsForClustering.map((post) => [post.id, post])).values());

  console.log(`Clustering ${clusteringProblems.length} problem phrases`);

  const clusters = clusterIdeas({
    posts: uniquePosts,
    problems: clusteringProblems,
    windowDays,
  });

  console.log(`Found ${clusters.length} high-quality clusters from ${clusters.length} total clusters`);

  if (clusters.length === 0) {
    console.log("\n=== NO_QUALITY_CLUSTERS_FOUND ===");
    storeIdeas(windowDays, []);
    return {
      subs: subreddits.length,
      postsFetched: problemData.length,
      relevant: problemData.length,
      clusters: 0,
      ideas: 0,
      durationMs: Date.now() - startedAt,
    };
  }

  // Step 5: Generate business ideas using existing synthesizeIdea function
  console.log('\n=== GENERATING_IDEAS ===');
  const ideas: Array<IdeaCluster & { details?: AppIdeaDetails }> = [];

  for (const cluster of clusters) {
    try {
      const details = synthesizeIdea(cluster);
      ideas.push({ ...cluster, details });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`Failed to generate idea for cluster ${cluster.id}: ${message}`);
    }
  }

  console.log(`Generated ${ideas.length} business opportunities`);
  console.log(`${ideas.length} viable opportunities, ${ideas.length} final ranked ideas`);

  console.log('\n=== STORING_RESULTS ===');
  storeIdeas(windowDays, ideas);

  console.log('\n=== PIPELINE_COMPLETE ===');
  const summary = {
    subs: subreddits.length,
    postsFetched: problemData.length,
    relevant: actionableProblems.length,
    clusters: clusters.length,
    ideas: ideas.length,
    durationMs: Date.now() - startedAt,
  };

  console.log(`Successfully generated ${ideas.length} ideas in ${Math.round(summary.durationMs / 1000)}s`);

  return summary;
}

export async function ensureIdeas({
  windowDays,
  subreddits = DEFAULT_SUBREDDITS,
}: {
  windowDays: number;
  subreddits?: string[];
}) {
  return await refreshIdeas(windowDays, subreddits);
}

export function listIdeas(windowDays: number): IdeaSummary[] {
  const rows = loadIdeas(windowDays);
  return rows.map((row) => toIdeaSummary(row, loadIdeaPostIds(row.id, 3)));
}

export function sortIdeas(ideas: IdeaSummary[], sort: SortOption) {
  switch (sort) {
    case "trending":
      return ideas.sort((a, b) => {
        const slopeDelta = b.trendSlope - a.trendSlope;
        return slopeDelta !== 0 ? slopeDelta : b.score - a.score;
      });
    case "fresh":
      return ideas.sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    default:
      return ideas.sort((a, b) => b.score - a.score);
  }
}

export function filterIdeas(ideas: IdeaSummary[], query?: string) {
  if (!query) return ideas;
  const lowerQuery = query.toLowerCase();
  return ideas.filter(idea =>
    idea.title.toLowerCase().includes(lowerQuery) ||
    idea.canonical.toLowerCase().includes(lowerQuery)
  );
}

export function toIdeasResponse(
  ideas: IdeaSummary[],
  windowDays: number,
): IdeasResponse {
  const totalPosts = ideas.reduce((sum, idea) => sum + idea.postsCount, 0);
  const updatedAt = ideas.length
    ? new Date(Math.max(...ideas.map((idea) => new Date(idea.updatedAt).getTime()))).toISOString()
    : undefined;
  return { ideas, totalPosts, windowDays, updatedAt };
}

export function getIdeaDetails(ideaId: string): IdeaWithDetails | null {
  const row = loadIdeaById(ideaId);
  if (!row) return null;

  const examplePostIds = loadIdeaPostIds(ideaId, 5);
  const summary = toIdeaSummary(row, examplePostIds);

  let details: AppIdeaDetails | null = null;
  if (row.details_json) {
    try {
      details = JSON.parse(row.details_json) as AppIdeaDetails;
    } catch {
      details = null;
    }
  }

  const postsRaw = loadIdeaPosts(ideaId);
  const posts: ClusterPost[] = postsRaw.map((post) => ({
    id: post.id,
    subreddit: post.subreddit,
    url: post.url,
    title: post.title,
    createdUtc: post.createdUtc,
    upvotes: post.upvotes,
    comments: post.comments,
    author: post.author ?? undefined,
    matchedSnippet: post.snippet ?? post.title,
    problemPhrase: post.phrase ?? post.title,
  }));

  return {
    ...summary,
    details,
    posts,
  };
}

export function getIdeaById(ideaId: string): IdeaWithDetails | null {
  return getIdeaDetails(ideaId);
}
