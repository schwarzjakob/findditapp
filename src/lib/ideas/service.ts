import { DEFAULT_SUBREDDITS } from "@/config/subreddits";
import { getMeta, setMeta } from "@/lib/db";
import { extractProblemPhrases } from "@/lib/problems/extract";
import { clusterIdeas } from "@/lib/ideas/cluster";
import { synthesizeIdea } from "@/lib/ideas/synthesize";
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

async function refreshIdeas(windowDays: number, subreddits = DEFAULT_SUBREDDITS): Promise<RunSummary> {
  const startedAt = Date.now();

  logger.info({ stage: "banner" }, "=== SOURCING_REDDIT_POSTS ===");
  const fetchedPosts = await syncReddit({ windowDays, subreddits });
  logger.info({ postsFetched: fetchedPosts.length, subs: subreddits.length }, "SOURCING_DONE");
  if (fetchedPosts.length > 0) {
    upsertPosts(fetchedPosts);
  }

  const cutoffUtc = Math.floor(Date.now() / 1000) - windowDays * 24 * 60 * 60;
  const posts = loadPostsSince(cutoffUtc);
  if (posts.length === 0) {
    logger.info({ stage: "banner" }, "=== FILTERING_RELEVANT_POSTS ===");
    logger.info({ relevant: 0, discarded: 0 }, "EXTRACT_DONE");
    logger.info({ stage: "banner" }, "=== CLUSTERING_POSTS ===");
    logger.info({ clusters: 0, avgClusterSize: 0 }, "CLUSTER_DONE");
    logger.info({ stage: "banner" }, "=== SYNTHESIZING_APP_IDEAS ===");
    logger.info({ ideas: 0 }, "IDEA_SYNTH_DONE");
    logger.info({ stage: "banner" }, "=== SCORING_IDEAS ===");
    logger.info({ ideas: 0, topScore: 0 }, "SCORE_DONE");
    logger.info({ stage: "banner" }, "=== PERSISTING_RESULTS ===");
    storeIdeas(windowDays, []);
    setMeta(cacheKey(windowDays), String(Date.now()));
    logger.info({ ideasUpserted: 0, relations: 0 }, "PERSIST_DONE");
    const summary = {
      subs: subreddits.length,
      postsFetched: fetchedPosts.length,
      relevant: 0,
      clusters: 0,
      ideas: 0,
      durationMs: Date.now() - startedAt,
    } satisfies RunSummary;
    logger.info({ stage: "banner", ...summary }, "=== INGEST_COMPLETE ===");
    return summary;
  }

  logger.info({ stage: "banner" }, "=== FILTERING_RELEVANT_POSTS ===");
  const problems = posts.flatMap((post) => extractProblemPhrases(post));
  if (problems.length > 0) {
    replaceProblems(problems);
  }
  const uniqueRelevant = new Set(problems.map((p) => p.postId));
  logger.info({ relevant: uniqueRelevant.size, discarded: posts.length - uniqueRelevant.size }, "EXTRACT_DONE");

  logger.info({ stage: "banner" }, "=== CLUSTERING_POSTS ===");
  const problemsFromDb = loadProblemsForPosts(posts.map((post) => post.id));
  const clusters = clusterIdeas({ posts, problems: problemsFromDb, windowDays });
  const avgClusterSize = clusters.length
    ? Number((clusters.reduce((sum, c) => sum + c.postsCount, 0) / clusters.length).toFixed(2))
    : 0;
  logger.info({ clusters: clusters.length, avgClusterSize }, "CLUSTER_DONE");

  logger.info({ stage: "banner" }, "=== SYNTHESIZING_APP_IDEAS ===");
  const clustersWithDetails = clusters.map((cluster) => ({
    ...cluster,
    details: synthesizeIdea(cluster),
  }));
  logger.info({ ideas: clustersWithDetails.length }, "IDEA_SYNTH_DONE");

  logger.info({ stage: "banner" }, "=== SCORING_IDEAS ===");
  const topScore = clustersWithDetails[0]?.score ?? 0;
  logger.info({ ideas: clustersWithDetails.length, topScore }, "SCORE_DONE");

  logger.info({ stage: "banner" }, "=== PERSISTING_RESULTS ===");
  storeIdeas(windowDays, clustersWithDetails);
  setMeta(cacheKey(windowDays), String(Date.now()));
  const relationCount = clustersWithDetails.reduce((acc, cluster) => acc + cluster.posts.length, 0);
  logger.info({ ideasUpserted: clustersWithDetails.length, relations: relationCount }, "PERSIST_DONE");

  const summary: RunSummary = {
    subs: subreddits.length,
    postsFetched: fetchedPosts.length,
    relevant: uniqueRelevant.size,
    clusters: clustersWithDetails.length,
    ideas: clustersWithDetails.length,
    durationMs: Date.now() - startedAt,
  };
  logger.info({ stage: "banner", ...summary }, "=== INGEST_COMPLETE ===");
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
