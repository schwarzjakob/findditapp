import { HIGHLIGHT_KEYWORDS } from "@/config/patterns";
import type { RedditPost } from "@/lib/types";
import { countPainWords } from "@/lib/problems/extract";

export interface PostScoreInput {
  post: RedditPost;
  patternMatched: boolean;
  representativePhrase: string;
  now?: number;
  tauDays?: number;
}

export function computePostScore({
  post,
  patternMatched,
  representativePhrase,
  now = Date.now(),
  tauDays = 30,
}: PostScoreInput) {
  const createdMs = post.createdUtc * 1000;
  const ageDays = Math.max(0, (now - createdMs) / (1000 * 60 * 60 * 24));
  const recency = Math.exp(-ageDays / tauDays);
  const up = Math.max(0, post.upvotes ?? 0);
  const cm = Math.max(0, post.comments ?? 0);

  let patternBonus = patternMatched ? 1 : 0;
  const phraseLower = representativePhrase.toLowerCase();
  if (patternMatched) {
    for (const keyword of HIGHLIGHT_KEYWORDS) {
      if (phraseLower.includes(keyword)) {
        patternBonus += 0.25; // contributes +0.5 in the final formula
        break;
      }
    }
  }

  const painHits = countPainWords(`${post.title}\n${post.selftext ?? ""}`);
  const painWordsBonus = Math.min(1.2, painHits * 0.3);

  const postScore =
    Math.log1p(up) +
    0.5 * Math.log1p(cm) +
    0.8 * recency +
    2.0 * patternBonus +
    1.0 * painWordsBonus;

  return {
    postScore,
    ageDays,
    recency,
    up,
    cm,
    patternBonus,
    painWordsBonus,
  };
}

export function computeIdeaScore(params: {
  postScores: number[];
  uniqueSubreddits: number;
}) {
  const { postScores, uniqueSubreddits } = params;
  const sumPost = postScores.reduce((acc, score) => acc + score, 0);
  const diversity = Math.min(1.5, 1 + 0.1 * Math.max(0, uniqueSubreddits - 1));
  const postsCount = postScores.length;
  const volume = Math.log1p(postsCount);
  const ideaScore = sumPost * diversity * (0.8 + 0.2 * volume);
  return { ideaScore, sumPost, diversity, volume };
}
