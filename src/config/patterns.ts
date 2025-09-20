export const HIGHLIGHT_KEYWORDS = [
  "problem",
  "issue",
  "difficult",
  "hard",
  "struggle",
  "pain",
  "annoying",
  "frustrating",
] as const;

export type HighlightKeyword = (typeof HIGHLIGHT_KEYWORDS)[number];
