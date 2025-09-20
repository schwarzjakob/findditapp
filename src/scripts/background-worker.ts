#!/usr/bin/env tsx
import "dotenv/config";
import { DEFAULT_SUBREDDITS } from "@/config/subreddits";
import { syncReddit } from "@/lib/reddit/fetcher";
import { upsertPosts, loadPostsSince } from "@/lib/storage";
import { refreshIdeas } from "@/lib/ideas/service";

const COLLECT_INTERVAL_MS = 60 * 1000; // 1 minute
const SUBREDDITS_PER_RUN = 3; // Small batch to handle rate limits
const WINDOW_DAYS = 30;

let currentSubredditIndex = 0;

function getNextSubreddits(): string[] {
  const subreddits = DEFAULT_SUBREDDITS.slice(
    currentSubredditIndex,
    currentSubredditIndex + SUBREDDITS_PER_RUN
  );

  currentSubredditIndex += SUBREDDITS_PER_RUN;
  if (currentSubredditIndex >= DEFAULT_SUBREDDITS.length) {
    currentSubredditIndex = 0; // Reset to beginning
  }

  return subreddits;
}

async function collectPosts() {
  const timestamp = new Date().toISOString();
  const subreddits = getNextSubreddits();

  console.log(`\n[${timestamp}] Collecting posts from: ${subreddits.join(', ')}`);

  try {
    // Get current count before fetching
    const cutoffUtc = Math.floor(Date.now() / 1000) - WINDOW_DAYS * 24 * 60 * 60;
    const beforeCount = loadPostsSince(cutoffUtc).length;

    const fetchedPosts = await syncReddit({ windowDays: WINDOW_DAYS, subreddits });
    console.log(`Filtering posts`);

    if (fetchedPosts.length > 0) {
      upsertPosts(fetchedPosts);

      // Get count after storing to see how many were actually new
      const afterCount = loadPostsSince(cutoffUtc).length;
      const newPosts = afterCount - beforeCount;

      console.log(`Processed ${fetchedPosts.length} posts, ${newPosts} were new`);
      console.log(`Database: ${afterCount} total posts`);
    } else {
      console.log(`No posts found`);
      console.log(`Database: ${beforeCount} total posts`);
    }

  } catch (error) {
    console.log(`Collection failed: ${error.message}`);
  }
}

async function runAnalysis() {
  const timestamp = new Date().toISOString();

  console.log(`\n[${timestamp}] === RUNNING_ANALYSIS ===`);

  try {
    const summary = await refreshIdeas(WINDOW_DAYS, []);
    console.log(`Analysis complete: ${summary.ideas} ideas generated in ${Math.round(summary.durationMs / 1000)}s`);
  } catch (error) {
    console.log(`Analysis failed: ${error.message}`);
  }
}

async function workerLoop() {
  console.log("Background worker started - collecting posts every minute");

  const shouldRunAnalysis = process.env.ENABLE_OPENAI_ANALYSIS === 'true';
  console.log(`OpenAI analysis: ${shouldRunAnalysis ? 'ENABLED' : 'DISABLED'}`);

  let analysisCounter = 0;

  while (true) {
    try {
      // Always collect posts
      await collectPosts();

      // Run analysis every 10 minutes (10 collection cycles) if enabled
      analysisCounter++;
      if (shouldRunAnalysis && analysisCounter >= 10) {
        await runAnalysis();
        analysisCounter = 0;
      }

    } catch (error) {
      console.log(`Worker error: ${error.message}`);
    }

    // Wait 1 minute before next collection
    await new Promise(resolve => setTimeout(resolve, COLLECT_INTERVAL_MS));
  }
}

// Start the worker
workerLoop().catch(error => {
  console.error('Worker crashed:', error);
  process.exit(1);
});