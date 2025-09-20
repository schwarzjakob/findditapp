#!/usr/bin/env tsx

// Load environment variables
import { config } from 'dotenv';
config();

import { runEnhancedPipeline } from '@/lib/pipeline/enhanced';
import { logger } from '@/lib/logger';

async function main() {
  const args = process.argv.slice(2);
  const windowDays = parseInt(args.find(arg => arg.startsWith('--window='))?.split('=')[1] || '7');
  const maxPosts = parseInt(args.find(arg => arg.startsWith('--max-posts='))?.split('=')[1] || '500');
  const enableLLM = !args.includes('--no-llm');
  const useExistingOnly = args.includes('--existing-only');

  logger.info({
    windowDays,
    maxPosts,
    enableLLM,
    useExistingOnly,
    args
  }, 'ENHANCED_INGEST_START');

  try {
    const result = await runEnhancedPipeline({
      windowDays,
      maxPosts,
      enableLLMFiltering: enableLLM,
      useExistingOnly
    });

    logger.info({
      opportunitiesFound: result.opportunities.length,
      stats: result.stats
    }, 'ENHANCED_INGEST_SUCCESS');

    // Log top opportunities
    result.opportunities.slice(0, 5).forEach((opp, i) => {
      logger.info({
        rank: i + 1,
        title: opp.llmAnalysis.title,
        quality: opp.qualityAssessment.overall_score,
        recommendation: opp.qualityAssessment.recommendation,
        clusterSize: opp.cluster.size,
        monetization: opp.businessMetrics.monetization_potential,
        feasibility: opp.businessMetrics.technical_feasibility,
        summary: opp.llmAnalysis.summary
      }, 'TOP_OPPORTUNITY');
    });

  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'ENHANCED_INGEST_FAILED');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}