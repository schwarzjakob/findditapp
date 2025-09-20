import Snoowrap from "snoowrap";
import { DEFAULT_SUBREDDITS } from "@/config/subreddits";
import { isOptedOut } from "@/config/optOut";
import { getMeta, setMeta } from "@/lib/db";
import type { RedditPost } from "@/lib/types";
import { logger } from "@/lib/logger";

const REQUEST_DELAY_MS = 1100;
const MAX_ATTEMPTS = 3;
const PUBLIC_LIMIT = 100;

const USER_AGENT =
  process.env.REDDIT_USER_AGENT ??
  "FindditBot/0.1 (https://github.com/finddit)";

function hasCredentials() {
  return (
    !!process.env.REDDIT_CLIENT_ID &&
    !!process.env.REDDIT_CLIENT_SECRET &&
    !!process.env.REDDIT_USERNAME &&
    !!process.env.REDDIT_PASSWORD
  );
}

let snoowrapClient: Snoowrap | undefined;

function getSnoowrapClient(): Snoowrap {
  if (!hasCredentials()) {
    throw new Error("Reddit credentials not provided");
  }

  if (!snoowrapClient) {
    snoowrapClient = new Snoowrap({
      userAgent: USER_AGENT,
      clientId: process.env.REDDIT_CLIENT_ID!,
      clientSecret: process.env.REDDIT_CLIENT_SECRET!,
      username: process.env.REDDIT_USERNAME!,
      password: process.env.REDDIT_PASSWORD!,
    });
  }
  return snoowrapClient;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithBackoff(url: string, attempt = 0): Promise<Response> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
  });

  if (response.ok) {
    return response;
  }

  if (attempt >= MAX_ATTEMPTS) {
    throw new Error(`Failed to fetch ${url} after ${MAX_ATTEMPTS} attempts`);
  }

  if (response.status === 429 || response.status >= 500) {
    const delay = Math.pow(2, attempt) * 1000;
    await sleep(delay);
    return fetchWithBackoff(url, attempt + 1);
  }

  throw new Error(`Error fetching ${url}: ${response.statusText}`);
}

function mapListingToPosts(listing: any[]): RedditPost[] {
  return listing
    .map((item) => item?.data)
    .filter(Boolean)
    .map((data) => ({
      id: data.id,
      subreddit: data.subreddit,
      title: data.title ?? "",
      selftext: data.selftext ?? "",
      url: data.url ?? `https://reddit.com${data.permalink}`,
      createdUtc: Number(data.created_utc ?? 0),
      upvotes: Number(data.score ?? data.ups ?? 0),
      comments: Number(data.num_comments ?? 0),
      author: data.author ? `u/${data.author}` : undefined,
    }));
}

async function fetchPublicSearch(
  subreddit: string,
  start: number,
  end: number,
): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/r/${subreddit}/search.json?q=timestamp%3A${start}..${end}&syntax=cloudsearch&restrict_sr=1&sort=new&limit=${PUBLIC_LIMIT}`;
  const res = await fetchWithBackoff(url);
  const json = await res.json();
  return mapListingToPosts(json?.data?.children ?? []);
}

async function fetchPublicNew(
  subreddit: string,
  limit = PUBLIC_LIMIT,
): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/r/${subreddit}/new.json?limit=${limit}`;
  const res = await fetchWithBackoff(url);
  const json = await res.json();
  return mapListingToPosts(json?.data?.children ?? []);
}

async function fetchWithSnoowrap(
  subreddit: string,
  start: number,
  end: number,
): Promise<RedditPost[]> {
  const client = getSnoowrapClient();
  const results = await client
    .getSubreddit(subreddit)
    .search({
      query: `timestamp:${start}..${end}`,
      syntax: "cloudsearch",
      sort: "new",
      time: "all",
      limit: PUBLIC_LIMIT,
      restrict_sr: true,
    });

  return results.map((submission) => ({
    id: submission.id,
    subreddit: submission.subreddit_name_prefixed?.replace("r/", "") ?? subreddit,
    title: submission.title ?? "",
    selftext: submission.selftext ?? "",
    url: submission.url ?? `https://reddit.com${submission.permalink}`,
    createdUtc: Number(submission.created_utc ?? submission.created ?? 0),
    upvotes: Number(submission.score ?? 0),
    comments: Number(submission.num_comments ?? 0),
    author: submission.author ? `u/${submission.author.name}` : undefined,
  }));
}

export interface SyncOptions {
  subreddits?: string[];
  windowDays: number;
}

export async function syncReddit(options: SyncOptions) {
  const now = Math.floor(Date.now() / 1000);
  const windowSeconds = options.windowDays * 24 * 60 * 60;
  const start = now - windowSeconds;
  const subs = options.subreddits ?? DEFAULT_SUBREDDITS;

  const allPosts: RedditPost[] = [];

  console.log(`Fetching posts from ${subs.length} subreddits`);

  for (const subreddit of subs) {
    const metaKey = `lastFetched:${subreddit}`;
    const lastFetchedRaw = getMeta(metaKey);
    const lastFetched = lastFetchedRaw ? Number(lastFetchedRaw) : 0;
    const fetchStart = Math.max(start, lastFetched - 3600);

    let posts: RedditPost[] = [];

    if (hasCredentials()) {
      posts = await fetchWithSnoowrap(subreddit, fetchStart, now);
    } else {
      const [searchPosts, newPosts] = await Promise.all([
        fetchPublicSearch(subreddit, fetchStart, now),
        fetchPublicNew(subreddit, PUBLIC_LIMIT / 2),
      ]);
      const merged = [...searchPosts, ...newPosts];
      const seen = new Set<string>();
      posts = merged.filter((post) => {
        if (seen.has(post.id)) return false;
        seen.add(post.id);
        return true;
      });
    }

    const filtered = posts.filter((post) =>
      post.createdUtc >= start && !isOptedOut(post.subreddit, post.author),
    );
    if (filtered.length > 0) {
      const newest = filtered.reduce(
        (max, post) => Math.max(max, post.createdUtc),
        lastFetched,
      );
      setMeta(metaKey, String(newest));
    }
    allPosts.push(...filtered);
    await sleep(REQUEST_DELAY_MS);
  }

  return allPosts;
}
