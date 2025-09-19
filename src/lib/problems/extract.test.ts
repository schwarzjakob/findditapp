import { buildProblemTitle, canonicalizePhrase, countPainWords, extractProblemPhrases } from "@/lib/problems/extract";
import type { RedditPost } from "@/lib/types";

describe("problem extraction", () => {
  const basePost: RedditPost = {
    id: "test",
    subreddit: "test",
    title: "How do I automate turning meeting notes into Jira tasks?",
    selftext: "Every week I have to copy paste notes. It takes me hours.",
    url: "https://reddit.com",
    createdUtc: Date.now() / 1000,
    upvotes: 10,
    comments: 2,
    author: "u/test",
  };

  it("extracts phrases matching configured cues", () => {
    const phrases = extractProblemPhrases(basePost);
    expect(phrases.length).toBeGreaterThan(0);
    expect(phrases[0].phrase.toLowerCase()).toContain("meeting notes");
  });

  it("produces canonical keys with stemming and stopwords removed", () => {
    const canonical = canonicalizePhrase("turning meeting notes into jira tasks");
    const tokens = canonical.split("_");
    expect(tokens).toContain("note");
    expect(tokens).not.toContain("into");
  });

  it("caps pain word bonus count", () => {
    const text = "manual repetitive tedious boring error-prone copy paste takes forever";
    expect(countPainWords(text)).toBeGreaterThanOrEqual(4);
  });

  it("builds readable problem titles", () => {
    const title = buildProblemTitle("turning meeting notes into jira tasks");
    expect(title).toBe("Turning meeting notes into jira tasks");
  });
});
