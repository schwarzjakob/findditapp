import { PAIN_WORDS, PROBLEM_CUES, KEYWORD_CUES } from "@/config/patterns";
import type { ProblemPhrase, RedditPost } from "@/lib/types";
import { stemTokens } from "@/lib/text/stem";

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "for",
  "nor",
  "so",
  "yet",
  "of",
  "at",
  "by",
  "to",
  "into",
  "on",
  "onto",
  "in",
  "that",
  "this",
  "these",
  "those",
  "with",
  "about",
  "from",
  "up",
  "down",
  "over",
  "under",
  "again",
  "further",
  "then",
  "once",
  "here",
  "there",
  "when",
  "where",
  "why",
  "how",
  "all",
  "any",
  "both",
  "each",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "no",
  "not",
  "only",
  "own",
  "same",
  "than",
  "too",
  "very",
  "can",
  "will",
  "just",
  "need",
  "have",
  "has",
  "had",
  "be",
  "is",
  "am",
  "are",
  "was",
  "were",
  "being",
  "been",
]);

const MAX_WORDS = 12;

const SENTENCE_SPLIT_REGEX = /[.!?\n]+/;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function truncateWords(phrase: string, maxWords = MAX_WORDS) {
  const words = phrase.split(/\s+/).filter(Boolean);
  return words.slice(0, maxWords).join(" ");
}

function capitalizeFirst(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function cleanClause(clause: string) {
  const sanitized = normalizeWhitespace(
    clause
      .replace(/^[^a-z0-9]+/i, "")
      .replace(/[^a-z0-9\s'-]/gi, " ")
      .replace(/^(?:to|that|for|about|with)\s+/i, "")
  );
  return truncateWords(sanitized.toLowerCase());
}

export function canonicalizePhrase(phrase: string) {
  const tokens = phrase
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((token) => token && !STOPWORDS.has(token));

  const stemmed = stemTokens(tokens);
  const unique = Array.from(new Set(stemmed)).sort();
  return unique.join("_");
}

export function buildProblemTitle(raw: string) {
  const trimmed = normalizeWhitespace(raw.toLowerCase());
  return capitalizeFirst(trimmed).slice(0, 80);
}

function dedupePhrases(phrases: ProblemPhrase[]): ProblemPhrase[] {
  const seen = new Set<string>();
  return phrases.filter((phrase) => {
    const key = `${phrase.postId}:${phrase.canonical}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractFromCue(
  sentence: string,
  cueId: string,
  clause?: string,
): ProblemPhrase | null {
  const baseClause = clause ?? sentence;
  const cleaned = cleanClause(baseClause);
  if (!cleaned) return null;
  const canonical = canonicalizePhrase(cleaned);
  if (!canonical) return null;
  return {
    postId: "",
    phrase: buildProblemTitle(cleaned),
    canonical,
    snippet: sentence.trim(),
    cueId,
  };
}

export function extractProblemPhrases(post: RedditPost): ProblemPhrase[] {
  const text = `${post.title}\n${post.selftext ?? ""}`;
  const sentences = text
    .split(SENTENCE_SPLIT_REGEX)
    .map((sentence) => normalizeWhitespace(sentence))
    .filter(Boolean);

  const phrases: ProblemPhrase[] = [];

  for (const sentence of sentences) {
    for (const cue of PROBLEM_CUES) {
      const match = sentence.match(cue.regex);
      if (match) {
        const clause = match.groups?.clause ?? sentence.slice(match.index + match[0].length);
        const phrase = extractFromCue(sentence, cue.id, clause);
        if (phrase) {
          phrase.postId = post.id;
          phrases.push(phrase);
        }
      }
    }

    for (const cue of KEYWORD_CUES) {
      if (cue.regex.test(sentence)) {
        const phrase = extractFromCue(sentence, cue.id, sentence);
        if (phrase) {
          phrase.postId = post.id;
          phrases.push(phrase);
        }
      }
    }
  }

  const unique = dedupePhrases(phrases);
  return unique;
}

export function countPainWords(text: string): number {
  const lowered = text.toLowerCase();
  let hits = 0;
  for (const word of PAIN_WORDS) {
    if (lowered.includes(word)) {
      hits += 1;
    }
  }
  return hits;
}
