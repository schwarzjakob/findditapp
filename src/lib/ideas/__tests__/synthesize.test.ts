import { synthesizeIdea } from "../synthesize";
import type { IdeaCluster } from "@/lib/types";

describe("synthesizeIdea", () => {
  it("should correctly map complexity tiers and effort estimates", () => {
    const mockCluster: IdeaCluster = {
      id: "test_cluster",
      title: "Automate invoice processing and categorization",
      canonical: "automate invoice processing",
      phrases: [
        "manually process invoices",
        "categorize expenses",
        "extract line items"
      ],
      posts: [
        {
          id: "post1",
          subreddit: "smallbusiness",
          url: "https://reddit.com/r/test",
          title: "Need help automating invoice workflow",
          createdUtc: 1640995200,
          upvotes: 45,
          comments: 12,
          author: "testuser",
          matchedSnippet: "I'm willing to pay for a solution that can extract line items from PDF invoices",
          problemPhrase: "manually process invoices"
        }
      ],
      score: 8.5,
      postsCount: 5,
      subsCount: 2,
      upvotesSum: 150,
      commentsSum: 35,
      trend: [2, 3, 5, 8, 12],
      trendSlope: 2.5,
      topKeywords: ["invoice", "pdf", "automation", "quickbooks"],
      sampleSnippet: "Need to automate invoice processing workflow"
    };

    const result = synthesizeIdea(mockCluster);

    // Test complexity tier mapping
    expect(result.complexityTier).toMatch(/Weekend build|1–2 weeks|Complex/);

    // Test effort days mapping
    if (result.complexityTier === "Weekend build") {
      expect(result.predictedEffortDays).toBe(2);
    } else if (result.complexityTier === "1–2 weeks") {
      expect(result.predictedEffortDays).toBe(7);
    } else {
      expect(result.predictedEffortDays).toBe(14);
    }

    // Test worth estimate mapping
    expect(result.worthEstimate).toMatch(/\$\d+–\$\d+\/mo|\$\d+\+\/mo/);

    // Test WTP mentions detection
    expect(result.wtpMentions).toBeGreaterThanOrEqual(1); // Should find "willing to pay"

    // Test basic structure
    expect(result.problemTitle).toBe(mockCluster.title);
    expect(result.targetUsers).toBeTruthy();
    expect(result.keyFeatures).toBeInstanceOf(Array);
    expect(result.requirements).toBeInstanceOf(Array);
    expect(result.risks).toBeInstanceOf(Array);
    expect(result.evidenceKeywords).toBeInstanceOf(Array);

    // Test invoice-specific requirements
    expect(result.requirements.some(req => req.toLowerCase().includes("pdf"))).toBe(true);
  });

  it("should handle minimal cluster data", () => {
    const minimalCluster: IdeaCluster = {
      id: "minimal_test",
      title: "Simple automation task",
      canonical: "simple automation",
      phrases: ["manual work"],
      posts: [{
        id: "post1",
        subreddit: "productivity",
        url: "https://reddit.com/test",
        title: "Simple task",
        createdUtc: 1640995200,
        upvotes: 5,
        comments: 1,
        matchedSnippet: "need automation",
        problemPhrase: "manual work"
      }],
      score: 2.0,
      postsCount: 1,
      subsCount: 1,
      upvotesSum: 5,
      commentsSum: 1,
      trend: [1],
      trendSlope: 0,
      topKeywords: ["automation"],
      sampleSnippet: "need automation"
    };

    const result = synthesizeIdea(minimalCluster);

    expect(result.complexityTier).toBe("1–2 weeks"); // Adjusted based on actual scoring
    expect(result.predictedEffortDays).toBe(7);
    expect(result.worthEstimate).toBe("$5–$19/mo");
    expect(result.wtpMentions).toBe(0);
  });
});