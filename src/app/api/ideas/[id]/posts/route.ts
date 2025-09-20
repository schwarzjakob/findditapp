import "server-only";

export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { getIdeaDetails } from "@/lib/ideas/service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: ideaId } = await params;
  if (!ideaId) {
    return NextResponse.json({ error: "Missing idea id" }, { status: 400 });
  }

  const idea = getIdeaDetails(ideaId);
  if (!idea) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const posts = idea.posts.map((post) => ({
    id: post.id,
    subreddit: post.subreddit,
    title: post.title,
    url: post.url,
    createdAt: new Date(post.createdUtc > 1e12 ? post.createdUtc : post.createdUtc * 1000).toISOString(),
    upvotes: post.upvotes ?? 0,
    comments: post.comments ?? 0,
    author: post.author ?? undefined,
    matchedSnippet: post.matchedSnippet,
    problemPhrase: post.problemPhrase,
  }));

  const { searchParams } = new URL(request.url);

  const format = searchParams.get("format");

  if (format === "csv") {
    const header = [
      "id",
      "subreddit",
      "title",
      "url",
      "createdAt",
      "upvotes",
      "comments",
      "author",
      "matchedSnippet",
      "problemPhrase",
    ];
    const lines = posts.map((post) =>
      header
        .map((key) => {
          const value = (post as Record<string, unknown>)[key];
          const text = value === undefined || value === null ? "" : String(value);
          if (text.includes(",") || text.includes("\"")) {
            return `"${text.replace(/\"/g, '""')}"`;
          }
          return text;
        })
        .join(","),
    );
    const csv = [header.join(","), ...lines].join("\n");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${ideaId}.csv"`,
      },
    });
  }

  return NextResponse.json(posts);
}
