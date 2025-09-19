import { getDb } from "@/lib/db";
import type { IdeaCluster, ProblemPhrase, RedditPost } from "@/lib/types";

export function upsertPosts(posts: RedditPost[]) {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO posts (id, subreddit, title, selftext, url, created_at, upvotes, comments, author)
     VALUES (@id, @subreddit, @title, @selftext, @url, @created_at, @upvotes, @comments, @author)
     ON CONFLICT(id) DO UPDATE SET
       subreddit = excluded.subreddit,
       title = excluded.title,
       selftext = excluded.selftext,
       url = excluded.url,
       created_at = excluded.created_at,
       upvotes = excluded.upvotes,
       comments = excluded.comments,
       author = excluded.author`
  );

  const insertMany = db.transaction((items: RedditPost[]) => {
    for (const item of items) {
      stmt.run({
        id: item.id,
        subreddit: item.subreddit,
        title: item.title,
        selftext: item.selftext,
        url: item.url,
        created_at: Math.round(item.createdUtc),
        upvotes: item.upvotes,
        comments: item.comments,
        author: item.author ?? null,
      });
    }
  });

  insertMany(posts);
}

export function replaceProblems(problems: ProblemPhrase[]) {
  const db = getDb();
  const deleteStmt = db.prepare(`DELETE FROM problems WHERE post_id = ?`);
  const insertStmt = db.prepare(
    `INSERT INTO problems (post_id, phrase, phrase_canonical, matched_snippet, cue_id)
     VALUES (@post_id, @phrase, @canonical, @snippet, @cue_id)
     ON CONFLICT(post_id, phrase_canonical, cue_id) DO UPDATE SET
       phrase = excluded.phrase,
       matched_snippet = excluded.matched_snippet`
  );

  const grouped = new Map<string, ProblemPhrase[]>();
  for (const problem of problems) {
    const list = grouped.get(problem.postId) ?? [];
    list.push(problem);
    grouped.set(problem.postId, list);
  }

  const replaceMany = db.transaction((items: ProblemPhrase[]) => {
    const seenPosts = new Set<string>();
    for (const problem of items) {
      if (!seenPosts.has(problem.postId)) {
        deleteStmt.run(problem.postId);
        seenPosts.add(problem.postId);
      }
      insertStmt.run({
        post_id: problem.postId,
        phrase: problem.phrase,
        canonical: problem.canonical,
        snippet: problem.snippet,
        cue_id: problem.cueId,
      });
    }
  });

  replaceMany(problems);
}

export interface IdeaRecordRow {
  id: string;
  window_days: number;
  canonical: string;
  title: string;
  score: number;
  posts_count: number;
  subs_count: number;
  upvotes_sum: number;
  comments_sum: number;
  trend_json: string | null;
  trend_slope: number | null;
  top_keywords: string | null;
  sample_snippet: string | null;
  updated_at: number;
}

export function storeIdeas(windowDays: number, clusters: IdeaCluster[]) {
  const db = getDb();
  const selectStmt = db.prepare<{ window: number }>(
    `SELECT id FROM ideas WHERE window_days = ?`
  );
  const deleteIdeaStmt = db.prepare(`DELETE FROM ideas WHERE id = ?`);
  const deleteIdeaPostsStmt = db.prepare(`DELETE FROM idea_posts WHERE idea_id = ?`);
  const insertIdeaStmt = db.prepare(
    `INSERT INTO ideas (
      id, window_days, canonical, title, score, posts_count, subs_count,
      upvotes_sum, comments_sum, trend_json, trend_slope, top_keywords,
      sample_snippet, updated_at
    ) VALUES (
      @id, @window_days, @canonical, @title, @score, @posts_count, @subs_count,
      @upvotes_sum, @comments_sum, @trend_json, @trend_slope, @top_keywords,
      @sample_snippet, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      window_days = excluded.window_days,
      canonical = excluded.canonical,
      title = excluded.title,
      score = excluded.score,
      posts_count = excluded.posts_count,
      subs_count = excluded.subs_count,
      upvotes_sum = excluded.upvotes_sum,
      comments_sum = excluded.comments_sum,
      trend_json = excluded.trend_json,
      trend_slope = excluded.trend_slope,
      top_keywords = excluded.top_keywords,
      sample_snippet = excluded.sample_snippet,
      updated_at = excluded.updated_at`
  );
  const insertIdeaPostStmt = db.prepare(
    `INSERT OR IGNORE INTO idea_posts (idea_id, post_id) VALUES (?, ?)`
  );

  const storeTx = db.transaction((ideas: IdeaCluster[]) => {
    const existing = selectStmt.all(windowDays).map((row) => row.id);
    for (const ideaId of existing) {
      deleteIdeaPostsStmt.run(ideaId);
      deleteIdeaStmt.run(ideaId);
    }

    for (const cluster of ideas) {
      insertIdeaStmt.run({
        id: cluster.id,
        window_days: windowDays,
        canonical: cluster.canonical,
        title: cluster.title,
        score: cluster.score,
        posts_count: cluster.postsCount,
        subs_count: cluster.subsCount,
        upvotes_sum: cluster.upvotesSum,
        comments_sum: cluster.commentsSum,
        trend_json: JSON.stringify(cluster.trend),
        trend_slope: cluster.trendSlope,
        top_keywords: JSON.stringify(cluster.topKeywords),
        sample_snippet: cluster.sampleSnippet,
        updated_at: Date.now(),
      });

      for (const post of cluster.posts) {
        insertIdeaPostStmt.run(cluster.id, post.id);
      }
    }
  });

  storeTx(clusters);
}

export function loadPostsSince(cutoffUtc: number): RedditPost[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM posts WHERE created_at >= ?`)
    .all(Math.round(cutoffUtc));

  return rows.map((row: any) => ({
    id: row.id,
    subreddit: row.subreddit,
    title: row.title,
    selftext: row.selftext ?? "",
    url: row.url,
    createdUtc: Number(row.created_at),
    upvotes: Number(row.upvotes ?? 0),
    comments: Number(row.comments ?? 0),
    author: row.author ?? undefined,
  }));
}

export function loadProblemsForPosts(postIds: string[]): ProblemPhrase[] {
  if (postIds.length === 0) return [];
  const db = getDb();
  const placeholders = postIds.map(() => "?").join(",");
  const stmt = db.prepare(
    `SELECT post_id, phrase, phrase_canonical, matched_snippet, cue_id
     FROM problems
     WHERE post_id IN (${placeholders})`
  );
  const rows = stmt.all(...postIds);
  return rows.map((row: any) => ({
    postId: row.post_id,
    phrase: row.phrase,
    canonical: row.phrase_canonical,
    snippet: row.matched_snippet,
    cueId: row.cue_id,
  }));
}

export function loadIdeas(windowDays: number): IdeaRecordRow[] {
  const db = getDb();
  return db
    .prepare<IdeaRecordRow>(
      `SELECT * FROM ideas WHERE window_days = ? ORDER BY score DESC`
    )
    .all(windowDays) as IdeaRecordRow[];
}

export function loadIdeaPosts(ideaId: string) {
  const db = getDb();
  const ideaRow = db
    .prepare(`SELECT canonical FROM ideas WHERE id = ? LIMIT 1`)
    .get(ideaId) as { canonical?: string } | undefined;
  const canonical = ideaRow?.canonical;
  const rows = db
    .prepare(
      `SELECT p.id, p.subreddit, p.title, p.selftext, p.url, p.created_at, p.upvotes, p.comments,
              p.author, pr.phrase, pr.matched_snippet, pr.phrase_canonical
       FROM idea_posts ip
       JOIN ideas i ON i.id = ip.idea_id
       JOIN posts p ON p.id = ip.post_id
       LEFT JOIN problems pr ON pr.post_id = p.id
       WHERE ip.idea_id = ?`
    )
    .all(ideaId);

  const byPost = new Map<string, any>();
  for (const row of rows as any[]) {
    const existing = byPost.get(row.id);
    const candidateMatchesCanonical =
      canonical && row.phrase_canonical === canonical && row.phrase;
    if (!existing) {
      byPost.set(row.id, {
        id: row.id,
        subreddit: row.subreddit,
        title: row.title,
        selftext: row.selftext ?? "",
        url: row.url,
        createdUtc: Number(row.created_at),
        upvotes: Number(row.upvotes ?? 0),
        comments: Number(row.comments ?? 0),
        author: row.author ?? null,
        phrase: row.phrase ?? null,
        snippet: row.matched_snippet ?? null,
        canonicalMatch: candidateMatchesCanonical ? true : false,
      });
      continue;
    }

    if (!existing.canonicalMatch && candidateMatchesCanonical) {
      existing.phrase = row.phrase;
      existing.snippet = row.matched_snippet;
      existing.canonicalMatch = true;
      byPost.set(row.id, existing);
    } else if (!existing.phrase && row.phrase) {
      existing.phrase = row.phrase;
      existing.snippet = row.matched_snippet;
    }
  }

  return Array.from(byPost.values()).map((row) => ({
    id: row.id,
    subreddit: row.subreddit,
    title: row.title,
    selftext: row.selftext,
    url: row.url,
    createdUtc: row.createdUtc,
    upvotes: row.upvotes,
    comments: row.comments,
    author: row.author,
    phrase: row.phrase,
    snippet: row.snippet,
  }));
}

export function loadIdeaPostIds(ideaId: string, limit = 3): string[] {
  const db = getDb();
  const stmt = db.prepare(
    `SELECT post_id FROM idea_posts WHERE idea_id = ? ORDER BY rowid LIMIT ?`
  );
  const rows = stmt.all(ideaId, limit);
  return rows.map((row: any) => row.post_id);
}
