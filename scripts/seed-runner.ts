#!/usr/bin/env tsx
import fs from "node:fs";
import path from "node:path";

import { DEFAULT_WINDOW_KEY, ensureIdeas, listIdeas, resolveWindowKey } from "@/lib/ideas/service";
import { clusterIdeas } from "@/lib/ideas/cluster";
import { extractProblemPhrases } from "@/lib/problems/extract";
import { setMeta } from "@/lib/db";
import { storeIdeas, upsertPosts, replaceProblems } from "@/lib/storage";
import type { RedditPost } from "@/lib/types";

async function main() {
  const fixturePath = process.env.FINDDIT_FIXTURE ?? path.join(process.cwd(), "fixtures", "sample_posts.json");
  if (!fs.existsSync(fixturePath)) {
    console.error(`Fixture not found: ${fixturePath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(fixturePath, "utf-8");
  const posts = JSON.parse(raw) as RedditPost[];
  if (!Array.isArray(posts)) {
    console.error("Fixture must be an array of posts");
    process.exit(1);
  }

  upsertPosts(posts);
  const problems = posts.flatMap((post) => extractProblemPhrases(post));
  replaceProblems(problems);

  const { days } = resolveWindowKey(process.env.FINDDIT_WINDOW ?? DEFAULT_WINDOW_KEY);
  const clusters = clusterIdeas({ posts, problems, windowDays: days });
  storeIdeas(days, clusters);
  setMeta(`ideas_cache_ts:${days}`, String(Date.now()));

  await ensureIdeas({ windowDays: days, force: false });

  const seededIdeas = listIdeas(days);
  console.log(`Seeded ${seededIdeas.length} ideas for ${days} day window.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
