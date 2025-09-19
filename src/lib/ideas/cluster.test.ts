import { clusterIdeas } from "@/lib/ideas/cluster";
import type { ProblemPhrase, RedditPost } from "@/lib/types";

describe("idea clustering", () => {
  const posts: RedditPost[] = [
    {
      id: "1",
      subreddit: "entrepreneur",
      title: "How do I automate turning meeting notes into Jira tasks?",
      selftext: "",
      url: "https://reddit.com/1",
      createdUtc: Math.floor(Date.now() / 1000),
      upvotes: 100,
      comments: 12,
    },
    {
      id: "2",
      subreddit: "productivity",
      title: "Every week I need to copy paste meeting notes into Jira",
      selftext: "",
      url: "https://reddit.com/2",
      createdUtc: Math.floor(Date.now() / 1000),
      upvotes: 80,
      comments: 6,
    },
  ];

  const problems: ProblemPhrase[] = [
    {
      postId: "1",
      phrase: "Turning meeting notes into jira tasks",
      canonical: "jira_meet_note_task",
      snippet: "How do I automate turning meeting notes into Jira tasks?",
      cueId: "how_do_i",
    },
    {
      postId: "2",
      phrase: "Copy paste meeting notes into jira",
      canonical: "jira_meet_note_task",
      snippet: "Every week I need to copy paste meeting notes into jira",
      cueId: "every_period",
    },
  ];

  it("clusters similar problems into an idea", () => {
    const clusters = clusterIdeas({ posts, problems, windowDays: 30 });
    expect(clusters.length).toBe(1);
    expect(clusters[0].postsCount).toBe(2);
  });
});
