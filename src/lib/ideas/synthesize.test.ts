import { synthesizeIdea } from "@/lib/ideas/synthesize";
import type { IdeaCluster } from "@/lib/types";

describe("synthesizeIdea", () => {
  const cluster: IdeaCluster = {
    id: "idea_test",
    title: "Automate invoice categorization from email PDFs into QuickBooks",
    canonical: "invoice_email_pdf_quickbooks",
    phrases: [
      "categorize invoices automatically",
      "tag receipts for accounting",
    ],
    posts: [
      {
        id: "post1",
        subreddit: "smallbusiness",
        url: "https://reddit.com/r/smallbusiness/post1",
        title: "Manual invoice categorization takes forever",
        createdUtc: Math.floor(Date.now() / 1000),
        upvotes: 120,
        comments: 18,
        matchedSnippet: "I'd pay good money to stop forwarding PDFs",
        problemPhrase: "stop forwarding invoice PDFs",
      },
      {
        id: "post2",
        subreddit: "accounting",
        url: "https://reddit.com/r/accounting/post2",
        title: "Any tool to auto-tag receipts from email?",
        createdUtc: Math.floor(Date.now() / 1000),
        upvotes: 80,
        comments: 12,
        matchedSnippet: "willing to pay $50/month if it syncs to QuickBooks",
        problemPhrase: "auto tag receipts to quickbooks",
      },
    ],
    score: 10,
    postsCount: 2,
    subsCount: 2,
    upvotesSum: 200,
    commentsSum: 30,
    trend: [1, 2, 3],
    trendSlope: 1.2,
    topKeywords: ["invoice", "email", "pdf", "quickbooks", "automate"],
    sampleSnippet: "Manual invoice categorization takes forever",
  };

  it("produces complex tier with realistic effort and worth estimates", () => {
    const details = synthesizeIdea(cluster);
    expect(details.complexityTier).toBe("Complex");
    expect(details.predictedEffortDays).toBeGreaterThanOrEqual(10);
    expect(["$10–$49/mo", "$19–$99/mo", "$99+/mo"].includes(details.worthEstimate)).toBe(true);
    expect(details.requirements.length).toBeGreaterThan(0);
    expect(details.jobToBeDone.length).toBeGreaterThan(10);
    expect(details.wtpMentions).toBeGreaterThan(0);
  });
});
