#!/usr/bin/env tsx
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

  console.log(`\n[${timestamp}] === COLLECTING_POSTS ===`);
  console.log(`Processing subreddits: ${subreddits.join(', ')}`);

  try {
    const fetchedPosts = await syncReddit({ windowDays: WINDOW_DAYS, subreddits });

    if (fetchedPosts.length > 0) {
      // Show some stats about the fetched posts
      const avgUpvotes = Math.round(fetchedPosts.reduce((sum, p) => sum + (p.upvotes || 0), 0) / fetchedPosts.length);
      const avgComments = Math.round(fetchedPosts.reduce((sum, p) => sum + (p.comments || 0), 0) / fetchedPosts.length);
      const postsWithText = fetchedPosts.filter(p => p.selftext && p.selftext.length > 50).length;

      console.log(`Collected ${fetchedPosts.length} posts (avg: ${avgUpvotes} upvotes, ${avgComments} comments, ${postsWithText} with detailed text)`);

      upsertPosts(fetchedPosts);
      console.log(`Successfully stored ${fetchedPosts.length} posts in database`);

      // Show sample of best posts
      const topPosts = fetchedPosts
        .filter(p => (p.upvotes || 0) > 5 && p.selftext && p.selftext.length > 50)
        .sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0))
        .slice(0, 2);

      if (topPosts.length > 0) {
        console.log(`Sample high-quality posts:`);
        topPosts.forEach(p => {
          const preview = p.selftext.substring(0, 100).replace(/\n/g, ' ') + '...';
          console.log(`  "${p.title}" (${p.upvotes} ↑) - ${preview}`);
        });
      }

    } else {
      console.log(`No new posts found`);
    }

    // Get total posts in database
    const cutoffUtc = Math.floor(Date.now() / 1000) - WINDOW_DAYS * 24 * 60 * 60;
    const totalPosts = loadPostsSince(cutoffUtc);
    console.log(`Database contains ${totalPosts.length} total posts (${WINDOW_DAYS} day window)`);

  } catch (error) {
    console.log(`Post collection failed: ${error.message}`);
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