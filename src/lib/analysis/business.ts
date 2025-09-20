import type { ProblemAnalysis } from '@/lib/llm/openai';
import type { SemanticCluster } from '@/lib/clustering/semantic';
import type { RedditPost } from '@/lib/types';

export interface BusinessMetrics {
  market_demand_score: number; // 1-10
  competition_level: number; // 1-10 (1 = no competition, 10 = saturated)
  monetization_potential: number; // 1-10
  technical_feasibility: number; // 1-10
  time_to_market: number; // days
  revenue_potential: string; // "$1k-5k/mo"
  target_market_size: string; // "SMBs", "Enterprises", "Creators"
  business_model: string[];
  competitive_risks: string[];
  market_timing: 'Too Early' | 'Good' | 'Saturated';
}

export interface QualityGate {
  name: string;
  passed: boolean;
  score: number;
  threshold: number;
  reason: string;
}

export interface QualityAssessment {
  overall_score: number;
  gates: QualityGate[];
  passed: boolean;
  recommendation: 'Build' | 'Validate Further' | 'Skip';
}

// Quality gate thresholds
const QUALITY_GATES = {
  MIN_CLUSTER_SIZE: 5,
  MIN_PAIN_INTENSITY: 6,
  MIN_TECHNICAL_FEASIBILITY: 4,
  MIN_MARKET_DEMAND: 5,
  MAX_COMPETITION: 8,
  MIN_WTP_SIGNALS: 2,
  MIN_COHERENCE: 0.6
};

export function calculateBusinessMetrics(
  cluster: SemanticCluster,
  analyses: ProblemAnalysis[],
  posts: RedditPost[]
): BusinessMetrics {
  // Calculate aggregated metrics from LLM analyses
  const avgPainIntensity = analyses.reduce((sum, a) => sum + a.painIntensity, 0) / analyses.length;
  const avgTechnicalFeasibility = analyses.reduce((sum, a) => sum + a.technical_feasibility, 0) / analyses.length;
  const avgMarketDemand = analyses.reduce((sum, a) => sum + a.market_demand_signals, 0) / analyses.length;
  const totalWtpSignals = analyses.reduce((sum, a) => sum + a.willingness_to_pay_signals, 0);

  // Market demand scoring (engagement + frequency + pain intensity)
  const totalEngagement = posts.reduce((sum, p) => sum + (p.upvotes || 0) + (p.comments || 0), 0);
  const avgEngagement = totalEngagement / posts.length;
  const marketDemandScore = Math.min(10, Math.round(
    (avgMarketDemand * 0.4) +
    (avgPainIntensity * 0.3) +
    (Math.min(5, Math.log(avgEngagement + 1)) * 0.3)
  ));

  // Competition level (inverse of uniqueness)
  const uniqueSubreddits = new Set(posts.map(p => p.subreddit)).size;
  const competitionLevel = Math.max(1, 10 - Math.min(9, uniqueSubreddits * 1.5));

  // Monetization potential
  const monetizationPotential = Math.min(10, Math.round(
    (totalWtpSignals * 2) +
    (avgPainIntensity * 0.8) +
    (avgTechnicalFeasibility * 0.2)
  ));

  // Time to market estimate
  const timeToMarket = avgTechnicalFeasibility >= 8 ? 7 : // Weekend project
                      avgTechnicalFeasibility >= 6 ? 21 : // 1-3 weeks
                      avgTechnicalFeasibility >= 4 ? 60 : // 2 months
                      120; // Complex project

  // Revenue potential estimation
  const revenueMultiplier = totalWtpSignals >= 10 ? 'high' :
                           totalWtpSignals >= 5 ? 'medium' : 'low';

  const revenuePotential = timeToMarket <= 7 ?
    (revenueMultiplier === 'high' ? '$2k-8k/mo' : revenueMultiplier === 'medium' ? '$500-3k/mo' : '$100-1k/mo') :
    timeToMarket <= 30 ?
    (revenueMultiplier === 'high' ? '$5k-20k/mo' : revenueMultiplier === 'medium' ? '$2k-10k/mo' : '$500-3k/mo') :
    (revenueMultiplier === 'high' ? '$10k-50k/mo' : revenueMultiplier === 'medium' ? '$5k-20k/mo' : '$1k-8k/mo');

  // Target market identification
  const hasEnterpriseSignals = analyses.some(a =>
    a.problemStatement.toLowerCase().includes('team') ||
    a.problemStatement.toLowerCase().includes('company') ||
    a.problemStatement.toLowerCase().includes('business')
  );

  const targetMarketSize = hasEnterpriseSignals ? 'SMBs & Enterprises' :
                          marketDemandScore >= 7 ? 'Creators & Freelancers' :
                          'Individual Users';

  // Business model suggestions
  const businessModel: string[] = [];
  if (totalWtpSignals >= 5) businessModel.push('SaaS Subscription');
  if (avgTechnicalFeasibility >= 7) businessModel.push('One-time Purchase');
  if (timeToMarket <= 14) businessModel.push('Freemium');
  if (hasEnterpriseSignals) businessModel.push('Enterprise License');
  if (businessModel.length === 0) businessModel.push('Ad-supported');

  // Competitive risks
  const competitiveRisks: string[] = [];
  if (competitionLevel >= 7) competitiveRisks.push('High competition from existing tools');
  if (avgTechnicalFeasibility >= 8) competitiveRisks.push('Easy for competitors to replicate');
  if (timeToMarket >= 60) competitiveRisks.push('Long development time increases risk');
  if (uniqueSubreddits <= 2) competitiveRisks.push('Narrow market niche');

  // Market timing assessment
  const marketTiming: BusinessMetrics['market_timing'] =
    competitionLevel <= 3 ? 'Too Early' :
    competitionLevel <= 6 ? 'Good' :
    'Saturated';

  return {
    market_demand_score: marketDemandScore,
    competition_level: competitionLevel,
    monetization_potential: monetizationPotential,
    technical_feasibility: Math.round(avgTechnicalFeasibility),
    time_to_market: timeToMarket,
    revenue_potential: revenuePotential,
    target_market_size: targetMarketSize,
    business_model: businessModel,
    competitive_risks: competitiveRisks,
    market_timing: marketTiming
  };
}

export function assessQuality(
  cluster: SemanticCluster,
  analyses: ProblemAnalysis[],
  businessMetrics: BusinessMetrics
): QualityAssessment {
  const gates: QualityGate[] = [];

  // Gate 1: Minimum cluster size
  gates.push({
    name: 'Cluster Size',
    passed: cluster.size >= QUALITY_GATES.MIN_CLUSTER_SIZE,
    score: cluster.size,
    threshold: QUALITY_GATES.MIN_CLUSTER_SIZE,
    reason: cluster.size >= QUALITY_GATES.MIN_CLUSTER_SIZE ?
      'Sufficient validation across multiple posts' :
      'Too few posts for validation'
  });

  // Gate 2: Pain intensity
  const avgPainIntensity = analyses.reduce((sum, a) => sum + a.painIntensity, 0) / analyses.length;
  gates.push({
    name: 'Pain Intensity',
    passed: avgPainIntensity >= QUALITY_GATES.MIN_PAIN_INTENSITY,
    score: avgPainIntensity,
    threshold: QUALITY_GATES.MIN_PAIN_INTENSITY,
    reason: avgPainIntensity >= QUALITY_GATES.MIN_PAIN_INTENSITY ?
      'High pain signals indicate strong demand' :
      'Low pain intensity may indicate weak demand'
  });

  // Gate 3: Technical feasibility
  gates.push({
    name: 'Technical Feasibility',
    passed: businessMetrics.technical_feasibility >= QUALITY_GATES.MIN_TECHNICAL_FEASIBILITY,
    score: businessMetrics.technical_feasibility,
    threshold: QUALITY_GATES.MIN_TECHNICAL_FEASIBILITY,
    reason: businessMetrics.technical_feasibility >= QUALITY_GATES.MIN_TECHNICAL_FEASIBILITY ?
      'Technically feasible to build' :
      'Too complex for initial validation'
  });

  // Gate 4: Market demand
  gates.push({
    name: 'Market Demand',
    passed: businessMetrics.market_demand_score >= QUALITY_GATES.MIN_MARKET_DEMAND,
    score: businessMetrics.market_demand_score,
    threshold: QUALITY_GATES.MIN_MARKET_DEMAND,
    reason: businessMetrics.market_demand_score >= QUALITY_GATES.MIN_MARKET_DEMAND ?
      'Strong market demand signals' :
      'Weak market demand indicators'
  });

  // Gate 5: Competition level
  gates.push({
    name: 'Competition Level',
    passed: businessMetrics.competition_level <= QUALITY_GATES.MAX_COMPETITION,
    score: 11 - businessMetrics.competition_level, // Invert for scoring
    threshold: 11 - QUALITY_GATES.MAX_COMPETITION,
    reason: businessMetrics.competition_level <= QUALITY_GATES.MAX_COMPETITION ?
      'Reasonable competition level' :
      'Market may be oversaturated'
  });

  // Gate 6: Willingness to pay
  const totalWtpSignals = analyses.reduce((sum, a) => sum + a.willingness_to_pay_signals, 0);
  gates.push({
    name: 'Willingness to Pay',
    passed: totalWtpSignals >= QUALITY_GATES.MIN_WTP_SIGNALS,
    score: totalWtpSignals,
    threshold: QUALITY_GATES.MIN_WTP_SIGNALS,
    reason: totalWtpSignals >= QUALITY_GATES.MIN_WTP_SIGNALS ?
      'Clear monetization signals' :
      'Limited willingness to pay indicators'
  });

  // Gate 7: Cluster coherence
  gates.push({
    name: 'Problem Coherence',
    passed: cluster.coherence_score >= QUALITY_GATES.MIN_COHERENCE,
    score: cluster.coherence_score,
    threshold: QUALITY_GATES.MIN_COHERENCE,
    reason: cluster.coherence_score >= QUALITY_GATES.MIN_COHERENCE ?
      'Well-defined, coherent problem' :
      'Problem definition too vague or scattered'
  });

  // Calculate overall score
  const passedGates = gates.filter(g => g.passed).length;
  const overallScore = (passedGates / gates.length) * 100;

  // Determine recommendation
  const recommendation: QualityAssessment['recommendation'] =
    passedGates >= 6 ? 'Build' :
    passedGates >= 4 ? 'Validate Further' :
    'Skip';

  return {
    overall_score: Math.round(overallScore),
    gates,
    passed: passedGates >= 5, // Need to pass at least 5/7 gates
    recommendation
  };
}

export function rankOpportunities(
  opportunities: Array<{
    cluster: SemanticCluster;
    analyses: ProblemAnalysis[];
    businessMetrics: BusinessMetrics;
    qualityAssessment: QualityAssessment;
  }>
): typeof opportunities {
  return opportunities.sort((a, b) => {
    // Primary: Quality score
    if (a.qualityAssessment.overall_score !== b.qualityAssessment.overall_score) {
      return b.qualityAssessment.overall_score - a.qualityAssessment.overall_score;
    }

    // Secondary: Business potential (monetization * market demand)
    const aPotential = a.businessMetrics.monetization_potential * a.businessMetrics.market_demand_score;
    const bPotential = b.businessMetrics.monetization_potential * b.businessMetrics.market_demand_score;

    if (aPotential !== bPotential) {
      return bPotential - aPotential;
    }

    // Tertiary: Technical feasibility (easier to build = higher priority)
    if (a.businessMetrics.technical_feasibility !== b.businessMetrics.technical_feasibility) {
      return b.businessMetrics.technical_feasibility - a.businessMetrics.technical_feasibility;
    }

    // Final: Cluster size
    return b.cluster.size - a.cluster.size;
  });
}

export function filterViableOpportunities(
  opportunities: Array<{
    qualityAssessment: QualityAssessment;
  }>
): typeof opportunities {
  return opportunities.filter(opp =>
    opp.qualityAssessment.passed &&
    opp.qualityAssessment.recommendation !== 'Skip'
  );
}