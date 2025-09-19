export interface RedditPost {
  id: string;
  subreddit: string;
  title: string;
  selftext: string;
  url: string;
  createdUtc: number; // seconds
  upvotes: number;
  comments: number;
  author?: string;
}

export interface ProblemPhrase {
  postId: string;
  phrase: string;
  canonical: string;
  snippet: string;
  cueId: string;
}

export interface IdeaCluster {
  id: string;
  title: string;
  canonical: string;
  phrases: string[];
  posts: ClusterPost[];
  score: number;
  postsCount: number;
  subsCount: number;
  upvotesSum: number;
  commentsSum: number;
  trend: number[];
  trendSlope: number;
  topKeywords: string[];
  sampleSnippet: string;
}

export interface ClusterPost {
  id: string;
  subreddit: string;
  url: string;
  title: string;
  createdUtc: number;
  upvotes: number;
  comments: number;
  author?: string;
  matchedSnippet: string;
  problemPhrase: string;
}

export type SortOption = "top" | "trending" | "fresh";

export interface AppIdeaDetails {
  problemTitle: string;
  summary: string;
  targetUsers: string;
  jobToBeDone: string;
  solution: string;
  keyFeatures: string[];
  requirements: string[];
  complexityTier: "Weekend build" | "1–2 weeks" | "Complex";
  predictedEffortDays: number;
  valueProp: string;
  worthEstimate: string;
  monetization: string;
  risks: string[];
  wtpMentions: number;
  evidenceKeywords: string[];
}
