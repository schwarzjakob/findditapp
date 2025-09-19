import crypto from "node:crypto";
import { PRIMARY_CUE_IDS } from "@/config/patterns";
import type {
  ClusterPost,
  IdeaCluster,
  ProblemPhrase,
  RedditPost,
} from "@/lib/types";
import { computePostScore, computeIdeaScore } from "@/lib/ideas/score";
import { computeTrend } from "@/lib/ideas/trend";
import { diceCoefficient, jaroWinklerDistance } from "@/lib/text/similarity";

interface ClusterEntry {
  post: RedditPost;
  phrase: ProblemPhrase;
}

interface ClusterDraft {
  canonical: string;
  entries: ClusterEntry[];
  phraseCounts: Map<string, number>;
}

const SIMILARITY_THRESHOLD = 0.85;
const KEYWORD_STOPWORDS = new Set([
  "to",
  "into",
  "from",
  "for",
  "and",
  "the",
  "a",
  "an",
  "of",
  "on",
  "in",
  "with",
  "my",
  "our",
  "their",
  "your",
  "how",
  "do",
  "i",
  "we",
]);

function hashCanonical(canonical: string) {
  return crypto.createHash("sha1").update(canonical).digest("hex").slice(0, 10);
}

function representativePhrase(draft: ClusterDraft) {
  let bestPhrase = "";
  let bestCount = -1;
  for (const [phrase, count] of draft.phraseCounts.entries()) {
    if (count > bestCount) {
      bestPhrase = phrase;
      bestCount = count;
    }
  }
  return bestPhrase;
}

function similarity(a: string, b: string) {
  const dice = diceCoefficient(a, b);
  const jaro = jaroWinklerDistance(a, b);
  return Math.max(dice, jaro);
}

function mergeDrafts(target: ClusterDraft, source: ClusterDraft) {
  for (const entry of source.entries) {
    target.entries.push(entry);
  }
  for (const [phrase, count] of source.phraseCounts.entries()) {
    target.phraseCounts.set(phrase, (target.phraseCounts.get(phrase) ?? 0) + count);
  }
}

function buildDrafts(posts: RedditPost[], problems: ProblemPhrase[]): ClusterDraft[] {
  const postMap = new Map(posts.map((post) => [post.id, post]));
  const drafts = new Map<string, ClusterDraft>();

  for (const problem of problems) {
    const post = postMap.get(problem.postId);
    if (!post) continue;

    const draft = drafts.get(problem.canonical) ?? {
      canonical: problem.canonical,
      entries: [],
      phraseCounts: new Map<string, number>(),
    };

    draft.entries.push({ post, phrase: problem });
    draft.phraseCounts.set(
      problem.phrase,
      (draft.phraseCounts.get(problem.phrase) ?? 0) + 1,
    );

    drafts.set(problem.canonical, draft);
  }

  return Array.from(drafts.values());
}

function mergeSimilarDrafts(drafts: ClusterDraft[]) {
  const merged: ClusterDraft[] = [];
  const sorted = drafts.sort((a, b) => b.entries.length - a.entries.length);

  for (const draft of sorted) {
    const repr = representativePhrase(draft);
    let mergedInto: ClusterDraft | undefined;

    for (const existing of merged) {
      const existingRepr = representativePhrase(existing);
      const score = similarity(repr.toLowerCase(), existingRepr.toLowerCase());
      if (score >= SIMILARITY_THRESHOLD) {
        mergedInto = existing;
        break;
      }
    }

    if (mergedInto) {
      mergeDrafts(mergedInto, draft);
    } else {
      merged.push(draft);
    }
  }

  return merged;
}

function topKeywords(phrases: string[], limit = 5) {
  const counts = new Map<string, number>();
  for (const phrase of phrases) {
    phrase
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token && !KEYWORD_STOPWORDS.has(token))
      .forEach((token) => {
        counts.set(token, (counts.get(token) ?? 0) + 1);
      });
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([keyword]) => keyword);
}

function generateIdeaTitle(draft: ClusterDraft, keywords: string[]): string {
  const repr = representativePhrase(draft);
  const mainKeywords = keywords.slice(0, 3);

  // Common automation patterns
  if (mainKeywords.some(kw => ["automate", "automation", "automatic"].includes(kw))) {
    return `Automate ${mainKeywords.filter(kw => !["automate", "automation", "automatic"].includes(kw)).join(" ")} workflows`;
  }

  // Tool/platform patterns
  if (mainKeywords.some(kw => ["tool", "platform", "app", "solution"].includes(kw))) {
    const subject = mainKeywords.filter(kw => !["tool", "platform", "app", "solution"].includes(kw))[0];
    return subject ? `${subject.charAt(0).toUpperCase() + subject.slice(1)} management tool` : "Workflow management tool";
  }

  // Integration patterns
  if (mainKeywords.some(kw => ["integrate", "sync", "connect"].includes(kw))) {
    return `${mainKeywords.filter(kw => !["integrate", "sync", "connect"].includes(kw)).slice(0, 2).join(" and ")} integration`;
  }

  // Specific domain patterns
  if (mainKeywords.includes("invoice")) return "Invoice processing automation";
  if (mainKeywords.includes("email")) return "Email workflow automation";
  if (mainKeywords.includes("sheet") || mainKeywords.includes("spreadsheet")) return "Spreadsheet automation tool";
  if (mainKeywords.includes("thumbnail")) return "Thumbnail generation automation";
  if (mainKeywords.includes("github")) return "GitHub workflow automation";
  if (mainKeywords.includes("jira")) return "Jira task automation";

  // Fallback: try to extract meaningful action + object
  const cleanRepr = repr.replace(/^(i|we|my|our|how to|need to|want to|trying to)\s+/i, "")
                       .replace(/\?+$/, "")
                       .trim();

  if (cleanRepr.length > 3 && cleanRepr.length < 50) {
    return cleanRepr.charAt(0).toUpperCase() + cleanRepr.slice(1);
  }

  // Last resort: use top keywords
  return mainKeywords.length > 0
    ? `${mainKeywords[0].charAt(0).toUpperCase() + mainKeywords[0].slice(1)} automation tool`
    : "Workflow automation tool";
}

function buildClusterPosts(draft: ClusterDraft) {
  const entriesByPost = new Map<string, ClusterEntry[]>();
  for (const entry of draft.entries) {
    const list = entriesByPost.get(entry.post.id) ?? [];
    list.push(entry);
    entriesByPost.set(entry.post.id, list);
  }

  const clusterPosts: ClusterPost[] = [];
  for (const [postId, entries] of entriesByPost.entries()) {
    entries.sort((a, b) => {
      const aPriority = PRIMARY_CUE_IDS.includes(a.phrase.cueId) ? 1 : 0;
      const bPriority = PRIMARY_CUE_IDS.includes(b.phrase.cueId) ? 1 : 0;
      if (aPriority !== bPriority) return bPriority - aPriority;
      return (b.phrase.phrase.length ?? 0) - (a.phrase.phrase.length ?? 0);
    });
    const chosen = entries[0];
    clusterPosts.push({
      id: postId,
      subreddit: chosen.post.subreddit,
      url: chosen.post.url,
      title: chosen.post.title,
      createdUtc: chosen.post.createdUtc,
      upvotes: chosen.post.upvotes,
      comments: chosen.post.comments,
      author: chosen.post.author,
      matchedSnippet: chosen.phrase.snippet,
      problemPhrase: chosen.phrase.phrase,
    });
  }

  return clusterPosts;
}

export function clusterIdeas(params: {
  posts: RedditPost[];
  problems: ProblemPhrase[];
  windowDays: number;
}): IdeaCluster[] {
  const { posts, problems, windowDays } = params;
  if (problems.length === 0) return [];

  const drafts = buildDrafts(posts, problems);
  const mergedDrafts = mergeSimilarDrafts(drafts);
  const now = Date.now();

  const clusters: IdeaCluster[] = [];
  const MIN_CLUSTER_SIZE = 2; // Require at least 2 posts for better validation

  for (const draft of mergedDrafts) {
    const clusterPosts = buildClusterPosts(draft);
    if (clusterPosts.length === 0 || clusterPosts.length < MIN_CLUSTER_SIZE) continue;

    const postScores: number[] = [];
    let upvotesSum = 0;
    let commentsSum = 0;

    for (const clusterPost of clusterPosts) {
      const post = draft.entries.find((entry) => entry.post.id === clusterPost.id)?.post;
      if (!post) continue;

      const patternMatched = draft.entries
        .filter((entry) => entry.post.id === clusterPost.id)
        .some((entry) => PRIMARY_CUE_IDS.includes(entry.phrase.cueId));

      const { postScore } = computePostScore({
        post,
        patternMatched,
        representativePhrase: clusterPost.problemPhrase,
        now,
      });
      postScores.push(postScore);
      upvotesSum += post.upvotes ?? 0;
      commentsSum += post.comments ?? 0;
    }

    if (postScores.length === 0) continue;

    const uniqueSubreddits = new Set(clusterPosts.map((post) => post.subreddit)).size;
    const { ideaScore } = computeIdeaScore({
      postScores,
      uniqueSubreddits,
    });

    const { bins, slope } = computeTrend(clusterPosts, windowDays, now);

    const ideaId = `idea_${hashCanonical(`${draft.canonical}_${windowDays}`)}`;
    const keywords = topKeywords(Array.from(draft.phraseCounts.keys()));
    const title = generateIdeaTitle(draft, keywords);

    clusters.push({
      id: ideaId,
      title,
      canonical: draft.canonical,
      phrases: Array.from(draft.phraseCounts.keys()),
      posts: clusterPosts,
      score: Number(ideaScore.toFixed(2)),
      postsCount: clusterPosts.length,
      subsCount: uniqueSubreddits,
      upvotesSum,
      commentsSum,
      trend: bins,
      topKeywords: keywords,
      sampleSnippet: clusterPosts[0].matchedSnippet,
      trendSlope: slope,
    });
  }

  clusters.sort((a, b) => b.score - a.score);
  return clusters;
}
