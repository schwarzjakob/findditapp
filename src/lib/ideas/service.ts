import { DEFAULT_SUBREDDITS } from "@/config/subreddits";
import { getMeta, setMeta } from "@/lib/db";
import { extractProblemPhrases } from "@/lib/problems/extract";
import { clusterIdeas } from "@/lib/ideas/cluster";
import {
  loadIdeaPostIds,
  loadIdeaPosts,
  loadIdeas,
  loadPostsSince,
  loadProblemsForPosts,
  replaceProblems,
  storeIdeas,
  upsertPosts,
} from "@/lib/storage";
import type { IdeaCluster, SortOption } from "@/lib/types";
import { syncReddit } from "@/lib/reddit/fetcher";

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
}

export interface IdeasResponse {
  updatedAt: string;
  windowDays: number;
  ideas: IdeaSummary[];
}

export function resolveWindowKey(key?: string) {
  if (key && WINDOW_DAYS[key]) {
    return { key, days: WINDOW_DAYS[key] } as const;
  }
  return { key: DEFAULT_WINDOW_KEY, days: WINDOW_DAYS[DEFAULT_WINDOW_KEY] } as const;
}

async function refreshIdeas(windowDays: number, subreddits = DEFAULT_SUBREDDITS) {
  const fetchedPosts = await syncReddit({ windowDays, subreddits });
  if (fetchedPosts.length > 0) {
    upsertPosts(fetchedPosts);
  }

  const cutoffUtc = Math.floor(Date.now() / 1000) - windowDays * 24 * 60 * 60;
  const posts = loadPostsSince(cutoffUtc);
  if (posts.length === 0) {
    storeIdeas(windowDays, []);
    setMeta(cacheKey(windowDays), String(Date.now()));
    return;
  }

  const problems = posts.flatMap((post) => extractProblemPhrases(post));
  if (problems.length > 0) {
    replaceProblems(problems);
  }

  const problemsFromDb = loadProblemsForPosts(posts.map((post) => post.id));
  const clusters = clusterIdeas({ posts, problems: problemsFromDb, windowDays });
  storeIdeas(windowDays, clusters);
  setMeta(cacheKey(windowDays), String(Date.now()));
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
}) {
  const key = cacheKey(windowDays);
  const last = getMeta(key);
  const lastTime = last ? Number(last) : 0;
  const expired = Date.now() - lastTime > CACHE_TTL_MS;
  if (!force && !expired && lastTime > 0) {
    return;
  }
  await refreshIdeas(windowDays, subreddits);
}

export function listIdeas(windowDays: number): IdeaSummary[] {
  const rows = loadIdeas(windowDays);
  return rows.map((row) => ({
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
  }));
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
