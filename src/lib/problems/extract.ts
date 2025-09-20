import type { ProblemPhrase, RedditPost } from "@/lib/types";
import OpenAI from "openai";

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

  const unique = Array.from(new Set(tokens)).sort();
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
  // Legacy regex extraction removed - now only using OpenAI
  return [];
}


function extractJsonSegment(content: string | null | undefined): string {
  if (!content) {
    throw new Error('Empty response from OpenAI');
  }
  const trimmed = content.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const withoutFence = fencedMatch ? fencedMatch[1] : trimmed;
  const firstBrace = withoutFence.indexOf('{');
  const lastBrace = withoutFence.lastIndexOf('}');
  const candidate = firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace
    ? withoutFence.slice(firstBrace, lastBrace + 1)
    : withoutFence;
  const jsonText = candidate.trim();
  if (!jsonText) {
    throw new Error('No JSON object found in OpenAI response');
  }
  return jsonText;
}

function parseJsonResponse(content: string | null | undefined) {
  const jsonText = extractJsonSegment(content);
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    const snippet = jsonText.slice(0, 200);
    throw new Error(`Invalid JSON from OpenAI: ${snippet}`);
  }
}

export async function extractProblemsWithLLM(post: RedditPost): Promise<{ phrases: ProblemPhrase[], analysis: any }> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const text = `${post.title}\n${post.selftext ?? ""}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "Analyze this Reddit post and determine if it contains an actionable business problem. Respond with JSON: {\"isActionableProblem\": boolean, \"problemStatement\": string, \"confidence\": number}"
      },
      {
        role: "user",
        content: text
      }
    ],
    temperature: 0.3
  });

  const result = parseJsonResponse(completion.choices[0].message?.content);
  const phrases: ProblemPhrase[] = [];

  if (result.isActionableProblem && result.confidence > 0.5) {
    const problemPhrase: ProblemPhrase = {
      postId: post.id,
      phrase: result.problemStatement,
      canonical: canonicalizePhrase(result.problemStatement),
      snippet: post.title,
      cueId: 'llm_detected'
    };
    phrases.push(problemPhrase);
  }

  return { phrases, analysis: result };
}

const PAIN_WORDS = [
  'problem',
  'issue',
  'difficult',
  'hard',
  'struggle',
  'pain',
  'annoying',
  'frustrating',
];

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function countPainWords(text: string): number {
  if (!text) return 0;
  const lower = text.toLowerCase();
  let hits = 0;
  for (const word of PAIN_WORDS) {
    const regex = new RegExp(`\\b${escapeRegex(word)}\\b`, 'gi');
    hits += lower.match(regex)?.length ?? 0;
  }
  return hits;
}
