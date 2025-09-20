import { syncReddit } from '@/lib/reddit/fetcher';
import { extractProblemsWithLLM, type ProblemAnalysis } from '@/lib/problems/extract';
import { clusterSemanticProblems, filterHighQualityClusters, type SemanticCluster } from '@/lib/clustering/semantic';
import { calculateBusinessMetrics, assessQuality, rankOpportunities, filterViableOpportunities } from '@/lib/analysis/business';
import { applyQualityFilters, rankPostsByQuality, deduplicatePosts } from '@/lib/quality/filters';
import { analyzeClusterWithLLM } from '@/lib/llm/openai';
import { loadPostsSince } from '@/lib/storage';
import type { RedditPost, ProblemPhrase } from '@/lib/types';
import { logger } from '@/lib/logger';

export interface EnhancedOpportunity {
  cluster: SemanticCluster;
  analyses: ProblemAnalysis[];
  businessMetrics: ReturnType<typeof calculateBusinessMetrics>;
  qualityAssessment: ReturnType<typeof assessQuality>;
  llmAnalysis: Awaited<ReturnType<typeof analyzeClusterWithLLM>>;
  posts: RedditPost[];
}

export interface PipelineResult {
  opportunities: EnhancedOpportunity[];
  stats: {
    totalPosts: number;
    qualityFiltered: number;
    llmAnalyzed: number;
    clustered: number;
    finalOpportunities: number;
    processingTimeMs: number;
  };
}

export async function runEnhancedPipeline(options: {
  subreddits?: string[];
  windowDays: number;
  maxPosts?: number;
  enableLLMFiltering?: boolean;
  useExistingOnly?: boolean;
}): Promise<PipelineResult> {
  const startTime = Date.now();
  const { windowDays, maxPosts = 500, enableLLMFiltering = true, useExistingOnly = false } = options;

  logger.info({ windowDays, maxPosts, enableLLMFiltering, useExistingOnly }, 'ENHANCED_PIPELINE_START');

  // Step 1: Get posts (existing or fetch new)
  let rawPosts: RedditPost[];

  if (useExistingOnly) {
    logger.info({}, 'STEP_1_LOADING_EXISTING_POSTS');
    const cutoffUtc = Math.floor(Date.now() / 1000) - windowDays * 24 * 60 * 60;
    rawPosts = loadPostsSince(cutoffUtc);
    logger.info({ loaded: rawPosts.length }, 'EXISTING_POSTS_LOADED');
  } else {
    logger.info({}, 'STEP_1_FETCHING_POSTS');
    rawPosts = await syncReddit({
      subreddits: options.subreddits,
      windowDays
    });
    logger.info({ fetched: rawPosts.length }, 'FETCHED_POSTS');
  }

  // Step 2: Apply quality filters
  logger.info({}, 'STEP_2_QUALITY_FILTERING');
  const { passed: qualityPosts } = applyQualityFilters(rawPosts);
  const rankedPosts = rankPostsByQuality(qualityPosts);
  const deduplicatedPosts = deduplicatePosts(rankedPosts);

  // Limit posts for processing
  const postsToProcess = deduplicatedPosts.slice(0, maxPosts);

  logger.info({
    raw: rawPosts.length,
    afterQuality: qualityPosts.length,
    afterDedup: deduplicatedPosts.length,
    processing: postsToProcess.length
  }, 'QUALITY_FILTERING_COMPLETE');

  // Step 3: LLM Analysis for problem detection
  logger.info({}, 'STEP_3_LLM_ANALYSIS');
  const problemData: Array<{ post: RedditPost, phrases: ProblemPhrase[], analysis: ProblemAnalysis }> = [];

  if (enableLLMFiltering) {
    // Process posts in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < postsToProcess.length; i += batchSize) {
      const batch = postsToProcess.slice(i, i + batchSize);

      const batchPromises = batch.map(async (post) => {
        try {
          const { phrases, analysis } = await extractProblemsWithLLM(post);
          return { post, phrases, analysis };
        } catch (error) {
          logger.error({ postId: post.id, error }, 'LLM_ANALYSIS_FAILED');
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      problemData.push(...batchResults.filter(Boolean) as any[]);

      logger.info({ processed: problemData.length, total: postsToProcess.length }, 'LLM_BATCH_PROGRESS');

      // Rate limiting delay
      if (i + batchSize < postsToProcess.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  } else {
    // Fallback to regex-based extraction if LLM disabled
    const { extractProblemPhrases } = await import('@/lib/problems/extract');
    for (const post of postsToProcess) {
      const phrases = extractProblemPhrases(post);
      if (phrases.length > 0) {
        problemData.push({
          post,
          phrases,
          analysis: {
            isActionableProblem: true,
            confidence: 0.7,
            problemStatement: phrases[0].phrase,
            painIntensity: 5,
            willingness_to_pay_signals: 1,
            technical_feasibility: 5,
            market_demand_signals: 5,
            workflow_clarity: 5,
            rationale: 'Regex-based detection'
          }
        });
      }
    }
  }

  // Filter for actionable problems
  const actionableProblems = problemData.filter(d =>
    d.analysis.isActionableProblem && d.analysis.confidence > 0.5
  );

  logger.info({
    analyzed: problemData.length,
    actionable: actionableProblems.length
  }, 'LLM_ANALYSIS_COMPLETE');

  // Step 4: Semantic clustering
  logger.info({}, 'STEP_4_SEMANTIC_CLUSTERING');

  const allPhrases = actionableProblems.flatMap(d => d.phrases);
  const allPosts = actionableProblems.map(d => d.post);

  const clusteringResult = await clusterSemanticProblems(allPhrases, allPosts, {
    minClusterSize: 3,
    similarityThreshold: 0.7
  });

  const highQualityClusters = filterHighQualityClusters(
    clusteringResult.clusters,
    0.6, // min coherence
    3    // min size
  );

  logger.info({
    clusters: clusteringResult.clusters.length,
    highQuality: highQualityClusters.length,
    noisePoints: clusteringResult.noise_points.length
  }, 'CLUSTERING_COMPLETE');

  // Step 5: Business analysis and opportunity generation
  logger.info({}, 'STEP_5_BUSINESS_ANALYSIS');

  const opportunities: EnhancedOpportunity[] = [];

  for (const cluster of highQualityClusters) {
    try {
      // Get analyses for posts in this cluster
      const clusterPostIds = new Set(cluster.posts.map(p => p.id));
      const clusterAnalyses = problemData
        .filter(d => clusterPostIds.has(d.post.id))
        .map(d => d.analysis);

      if (clusterAnalyses.length === 0) continue;

      // Calculate business metrics
      const businessMetrics = calculateBusinessMetrics(cluster, clusterAnalyses, cluster.posts);

      // Assess quality
      const qualityAssessment = assessQuality(cluster, clusterAnalyses, businessMetrics);

      // Generate LLM analysis for cluster
      const clusterData = {
        title: `Cluster of ${cluster.size} posts`,
        phrases: cluster.phrases.map(p => p.phrase),
        posts: cluster.posts.map(p => ({
          title: p.title,
          content: p.selftext || '',
          subreddit: p.subreddit,
          upvotes: p.upvotes,
          comments: p.comments
        })),
        businessMetrics,
        qualityAssessment
      };

      const llmAnalysis = await analyzeClusterWithLLM(clusterData);

      opportunities.push({
        cluster,
        analyses: clusterAnalyses,
        businessMetrics,
        qualityAssessment,
        llmAnalysis,
        posts: cluster.posts
      });

      logger.info({
        clusterId: cluster.id,
        size: cluster.size,
        quality: qualityAssessment.overall_score,
        recommendation: qualityAssessment.recommendation
      }, 'OPPORTUNITY_ANALYZED');

    } catch (error) {
      logger.error({ clusterId: cluster.id, error }, 'BUSINESS_ANALYSIS_FAILED');
    }
  }

  // Step 6: Ranking and filtering
  logger.info({}, 'STEP_6_RANKING_FILTERING');

  const viableOpportunities = filterViableOpportunities(opportunities);
  const rankedOpportunities = rankOpportunities(viableOpportunities);

  const processingTimeMs = Date.now() - startTime;

  const stats = {
    totalPosts: rawPosts.length,
    qualityFiltered: postsToProcess.length,
    llmAnalyzed: problemData.length,
    clustered: highQualityClusters.length,
    finalOpportunities: rankedOpportunities.length,
    processingTimeMs
  };

  logger.info(stats, 'ENHANCED_PIPELINE_COMPLETE');

  return {
    opportunities: rankedOpportunities,
    stats
  };
}