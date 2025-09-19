function bigrams(text: string) {
  const cleaned = text.toLowerCase();
  const grams: string[] = [];
  for (let i = 0; i < cleaned.length - 1; i += 1) {
    grams.push(cleaned.slice(i, i + 2));
  }
  return grams;
}

export function diceCoefficient(a: string, b: string) {
  if (!a.length || !b.length) return 0;
  if (a === b) return 1;
  const aBigrams = bigrams(a);
  const bBigrams = bigrams(b);
  if (!aBigrams.length || !bBigrams.length) return 0;
  const bCounts = new Map<string, number>();
  for (const gram of bBigrams) {
    bCounts.set(gram, (bCounts.get(gram) ?? 0) + 1);
  }
  let overlap = 0;
  for (const gram of aBigrams) {
    const count = bCounts.get(gram) ?? 0;
    if (count > 0) {
      overlap += 1;
      bCounts.set(gram, count - 1);
    }
  }
  return (2 * overlap) / (aBigrams.length + bBigrams.length);
}

export function jaroDistance(a: string, b: string) {
  if (a === b) return 1;
  const aLen = a.length;
  const bLen = b.length;
  if (!aLen || !bLen) return 0;
  const matchDistance = Math.floor(Math.max(aLen, bLen) / 2) - 1;

  const aMatches = new Array<boolean>(aLen).fill(false);
  const bMatches = new Array<boolean>(bLen).fill(false);

  let matches = 0;
  for (let i = 0; i < aLen; i += 1) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, bLen);
    for (let j = start; j < end; j += 1) {
      if (bMatches[j]) continue;
      if (a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches += 1;
      break;
    }
  }
  if (!matches) return 0;

  let transpositions = 0;
  let j = 0;
  for (let i = 0; i < aLen; i += 1) {
    if (!aMatches[i]) continue;
    while (!bMatches[j]) {
      j += 1;
    }
    if (a[i] !== b[j]) {
      transpositions += 1;
    }
    j += 1;
  }

  const m = matches;
  const t = transpositions / 2;
  return (
    (m / aLen + m / bLen + (m - t) / m) /
    3
  );
}

export function jaroWinklerDistance(a: string, b: string, prefixScale = 0.1) {
  const jaro = jaroDistance(a, b);
  const prefixLimit = 4;
  let prefix = 0;
  for (let i = 0; i < Math.min(a.length, b.length, prefixLimit); i += 1) {
    if (a[i] === b[i]) {
      prefix += 1;
    } else {
      break;
    }
  }
  return jaro + prefix * prefixScale * (1 - jaro);
}
