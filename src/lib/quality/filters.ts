import type { RedditPost } from '@/lib/types';

export interface QualityFilters {
  minUpvotes: number;
  minComments: number;
  minContentLength: number;
  maxAge: number; // hours
  excludePatterns: RegExp[];
  requiredPatterns: RegExp[];
}

export const DEFAULT_QUALITY_FILTERS: QualityFilters = {
  minUpvotes: 2,
  minComments: 1,
  minContentLength: 50,
  maxAge: 24 * 30, // 30 days
  excludePatterns: [
    // Announcements and promotional content
    /\b(launched|announcing|proud to|excited to share|just released)\b/i,
    /\b(check out|shameless plug|self promotion)\b/i,

    // Gratitude and celebration posts
    /\b(thank you|thanks|grateful|appreciate|congrat)/i,

    // Recruiting and team building
    /\b(hiring|looking for team|cofounder|join us|we're hiring)\b/i,

    // General discussions without specific problems
    /\b(what do you think|opinion|thoughts|unpopular opinion|debate)\b/i,
    /\b(shower thought|random thought|discussion)\b/i,

    // Meta posts about Reddit/subreddit
    /\b(meta|reddit|subreddit|mods|moderator)\b/i,

    // Off-topic personal posts
    /\b(rant|vent|personal|relationship|family|health)\b/i,

    // Pure questions without context
    /^(what|who|when|where|why|how)\s+\w+\s*\??\s*$/i,
  ],
  requiredPatterns: [
    // At least one workflow-related term
    /\b(automate|automation|tool|app|solution|script|workflow|process|integration|sync|convert|export|import|batch|manual|repetitive|tedious|streamline|optimize|efficient)\b/i,
  ]
};

export function applyQualityFilters(
  posts: RedditPost[],
  filters: QualityFilters = DEFAULT_QUALITY_FILTERS
): { passed: RedditPost[], failed: RedditPost[], reasons: Map<string, string> } {
  const passed: RedditPost[] = [];
  const failed: RedditPost[] = [];
  const reasons = new Map<string, string>();

  const now = Date.now() / 1000; // Convert to seconds

  for (const post of posts) {
    let failReason = '';

    // Check minimum engagement
    if (post.upvotes < filters.minUpvotes) {
      failReason = `Low upvotes: ${post.upvotes} < ${filters.minUpvotes}`;
    } else if (post.comments < filters.minComments) {
      failReason = `Low comments: ${post.comments} < ${filters.minComments}`;
    }

    // Check content length
    const contentLength = (post.title + ' ' + (post.selftext || '')).length;
    if (contentLength < filters.minContentLength) {
      failReason = `Short content: ${contentLength} < ${filters.minContentLength}`;
    }

    // Check age
    const ageHours = (now - post.createdUtc) / 3600;
    if (ageHours > filters.maxAge) {
      failReason = `Too old: ${Math.round(ageHours)}h > ${filters.maxAge}h`;
    }

    // Check exclude patterns
    const fullText = `${post.title} ${post.selftext || ''}`;
    for (const pattern of filters.excludePatterns) {
      if (pattern.test(fullText)) {
        failReason = `Excluded by pattern: ${pattern.source}`;
        break;
      }
    }

    // Check required patterns
    if (!failReason) {
      const hasRequired = filters.requiredPatterns.some(pattern => pattern.test(fullText));
      if (!hasRequired) {
        failReason = 'Missing required workflow patterns';
      }
    }

    if (failReason) {
      failed.push(post);
      reasons.set(post.id, failReason);
    } else {
      passed.push(post);
    }
  }

  return { passed, failed, reasons };
}

export function calculateEngagementScore(post: RedditPost): number {
  // Weighted engagement score considering both upvotes and comments
  const upvoteWeight = 1;
  const commentWeight = 3; // Comments indicate more engagement

  return (post.upvotes * upvoteWeight) + (post.comments * commentWeight);
}

export function isHighQualityAuthor(author: string | undefined): boolean {
  if (!author) return false;

  // Simple heuristics for quality authors
  // Real implementation would check account age, karma, etc.

  // Avoid obvious throwaway accounts
  if (/throwaway|temp|burner/i.test(author)) return false;

  // Avoid accounts with too many numbers (often bots)
  const numberCount = (author.match(/\d/g) || []).length;
  if (numberCount > author.length / 2) return false;

  // Prefer accounts that look like real usernames
  if (author.length < 3 || author.length > 20) return false;

  return true;
}

export function detectSpam(post: RedditPost): boolean {
  const fullText = `${post.title} ${post.selftext || ''}`;

  // Common spam indicators
  const spamPatterns = [
    /\b(click here|visit now|limited time|act now|special offer)\b/i,
    /\b(100% free|guaranteed|risk free|no obligation)\b/i,
    /\$\d+.*?(earn|make|profit|income).*?(daily|weekly|monthly)/i,
    /(bit\.ly|tinyurl|goo\.gl)\/\w+/i, // Shortened URLs
    /(.)\1{4,}/, // Repeated characters
  ];

  return spamPatterns.some(pattern => pattern.test(fullText));
}

export function rankPostsByQuality(posts: RedditPost[]): RedditPost[] {
  return posts.sort((a, b) => {
    // Primary: Engagement score
    const aEngagement = calculateEngagementScore(a);
    const bEngagement = calculateEngagementScore(b);

    if (aEngagement !== bEngagement) {
      return bEngagement - aEngagement;
    }

    // Secondary: Content length (longer posts tend to have more detail)
    const aLength = (a.title + ' ' + (a.selftext || '')).length;
    const bLength = (b.title + ' ' + (b.selftext || '')).length;

    if (aLength !== bLength) {
      return bLength - aLength;
    }

    // Tertiary: Recency
    return b.createdUtc - a.createdUtc;
  });
}

export function deduplicatePosts(posts: RedditPost[]): RedditPost[] {
  const seen = new Set<string>();
  const deduped: RedditPost[] = [];

  for (const post of posts) {
    // Create a simple similarity key based on title
    const key = post.title.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .sort()
      .slice(0, 5) // Use first 5 significant words
      .join(' ');

    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(post);
    }
  }

  return deduped;
}