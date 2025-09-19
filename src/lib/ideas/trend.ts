import type { ClusterPost } from "@/lib/types";

export interface TrendResult {
  bins: number[];
  slope: number;
}

export function computeTrend(
  posts: ClusterPost[],
  windowDays: number,
  now = Date.now(),
): TrendResult {
  const weeks = Math.max(1, Math.ceil(windowDays / 7));
  const bins = new Array<number>(weeks).fill(0);
  const msPerDay = 1000 * 60 * 60 * 24;

  for (const post of posts) {
    const ageDays = Math.max(0, (now - post.createdUtc * 1000) / msPerDay);
    if (ageDays > windowDays) continue;
    const binIndex = Math.min(
      weeks - 1,
      weeks - 1 - Math.floor(ageDays / 7),
    );
    bins[binIndex] += 1;
  }

  const xMean = (bins.length - 1) / 2;
  const yMean = bins.reduce((acc, value) => acc + value, 0) / bins.length;
  let numerator = 0;
  let denominator = 0;

  bins.forEach((value, idx) => {
    numerator += (idx - xMean) * (value - yMean);
    denominator += (idx - xMean) * (idx - xMean);
  });

  const slope = denominator === 0 ? 0 : numerator / denominator;

  return { bins, slope };
}
