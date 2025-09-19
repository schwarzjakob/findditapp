#!/usr/bin/env tsx
import { ensureIdeas, resolveWindowKey } from "@/lib/ideas/service";
import { DEFAULT_SUBREDDITS } from "@/config/subreddits";
import { logger } from "@/lib/logger";

async function main() {
  const args = process.argv.slice(2);
  const windowArg = args.find(arg => arg.startsWith("--window"));
  const windowValue = windowArg?.split("=")[1] || "30d";
  const { days } = resolveWindowKey(windowValue);

  logger.info({ days }, "=== MANUAL_INGEST ===");

  try {
    const summary = await ensureIdeas({ 
      windowDays: days, 
      force: true, 
      subreddits: DEFAULT_SUBREDDITS 
    });

    if (summary) {
      logger.info({ summary }, "MANUAL_INGEST_COMPLETE");
    } else {
      logger.info({}, "CACHE_HIT_NO_REFRESH_NEEDED");
    }
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, "MANUAL_INGEST_FAILED");
    process.exit(1);
  }
}

main().catch(err => { 
  console.error(err); 
  process.exit(1); 
});
