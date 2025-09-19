const SUFFIX_RULES: Array<[RegExp, string]> = [
  [/ies$/i, "y"],
  [/ing$/i, ""],
  [/ings$/i, "ing"],
  [/ed$/i, ""],
  [/ers$/i, "er"],
  [/er$/i, ""],
  [/es$/i, "e"],
  [/s$/i, ""],
];

function stripSuffix(word: string) {
  for (const [pattern, replacement] of SUFFIX_RULES) {
    if (pattern.test(word)) {
      const next = word.replace(pattern, replacement);
      if (next.length >= 3) {
        return next;
      }
    }
  }
  return word;
}

export function stemWord(word: string) {
  const cleaned = word.toLowerCase();
  if (cleaned.length <= 2) return cleaned;
  return stripSuffix(cleaned);
}

export function stemTokens(tokens: string[]) {
  return tokens.map((token) => stemWord(token));
}
