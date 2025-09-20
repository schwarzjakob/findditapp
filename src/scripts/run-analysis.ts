#!/usr/bin/env tsx
import "dotenv/config";
import { refreshIdeas } from "@/lib/ideas/service";

const WINDOW_DAYS = 30;

async function runAnalysis() {
  const timestamp = new Date().toISOString();

  console.log(`[${timestamp}] Starting manual analysis...`);

  try {
    if (!process.env.OPENAI_API_KEY) {
      console.log("ERROR: OpenAI API key required for analysis");
      process.exit(1);
    }

    const summary = await refreshIdeas(WINDOW_DAYS, []);
    console.log(`Analysis complete: ${summary.ideas} ideas generated in ${Math.round(summary.durationMs / 1000)}s`);

  } catch (error) {
    console.log(`Analysis failed: ${error.message}`);
    process.exit(1);
  }
}

runAnalysis().catch(error => {
  console.error('Analysis script crashed:', error);
  process.exit(1);
});