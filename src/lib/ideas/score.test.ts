import { computeIdeaScore, computePostScore } from "@/lib/ideas/score";
import type { RedditPost } from "@/lib/types";

describe("scoring", () => {
  const now = Date.now();

  const makePost = (overrides: Partial<RedditPost> = {}): RedditPost => ({
    id: `post_${Math.random()}`,
    subreddit: "test",
    title: "How do I automate syncing contacts?",
    selftext: "It takes me hours to manually import CSVs",
    url: "https://reddit.com",
    createdUtc: Math.floor((now - 1000 * 60 * 60) / 1000),
    upvotes: 100,
    comments: 20,
    author: "u/test",
    ...overrides,
  });

  it("awards higher scores when pattern matches and includes keywords", () => {
    const base = computePostScore({
      post: makePost(),
      patternMatched: true,
      representativePhrase: "Automate csv imports",
      now,
    }).postScore;

    const noPattern = computePostScore({
      post: makePost(),
      patternMatched: false,
      representativePhrase: "",
      now,
    }).postScore;

    expect(base).toBeGreaterThan(noPattern);
  });

  it("computes idea score with diversity and volume boosts", () => {
    const scores = [1, 1, 1];
    const { ideaScore } = computeIdeaScore({ postScores: scores, uniqueSubreddits: 3 });
    expect(ideaScore).toBeGreaterThan(3);
  });
});
