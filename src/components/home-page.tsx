'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Sparkline } from "@/components/sparkline";
import type { SortOption } from "@/lib/types";

const WINDOW_OPTIONS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "365d", label: "Last year" },
];

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: "top", label: "Top (IdeaScore)" },
  { value: "trending", label: "Trending (slope)" },
  { value: "fresh", label: "Fresh (latest)" },
];

interface IdeaResponse {
  updatedAt: string;
  windowDays: number;
  ideas: IdeaSummary[];
}

export interface IdeaSummary {
  id: string;
  title: string;
  score: number;
  postsCount: number;
  subsCount: number;
  upvotesSum: number;
  commentsSum: number;
  trend: number[];
  trendSlope: number;
  topKeywords: string[];
  sampleSnippet: string;
  examplePostIds: string[];
}

interface IdeaPost {
  id: string;
  subreddit: string;
  url: string;
  title: string;
  createdAt: string;
  upvotes: number;
  comments: number;
  author?: string;
  matchedSnippet: string;
  problemPhrase: string;
}

interface FetchState {
  loading: boolean;
  error?: string;
  ideas: IdeaSummary[];
  windowDays: number;
  updatedAt?: string;
}

const initialFetchState: FetchState = {
  loading: true,
  ideas: [],
  windowDays: 30,
};

function useQueryState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === null || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return { searchParams, setParam };
}

export function HomePage() {
  const { searchParams, setParam } = useQueryState();
  const [windowKey, setWindowKey] = useState<string>(
    searchParams.get("window") ?? "30d",
  );
  const [sort, setSort] = useState<SortOption>(
    (searchParams.get("sort") as SortOption) ?? "top",
  );
  const [filter, setFilter] = useState(searchParams.get("q") ?? "");
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(
    searchParams.get("idea") ?? null,
  );
  const [forceRefreshToken, setForceRefreshToken] = useState(0);
  const [fetchState, setFetchState] = useState<FetchState>(initialFetchState);
  const [postsCache, setPostsCache] = useState<Record<string, IdeaPost[]>>({});
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState<string | undefined>();

  useEffect(() => {
    const incomingWindow = searchParams.get("window");
    if (incomingWindow && incomingWindow !== windowKey) {
      setWindowKey(incomingWindow);
    }
    const incomingSort = searchParams.get("sort");
    if (incomingSort && incomingSort !== sort) {
      setSort(incomingSort as SortOption);
    }
    const incomingQuery = searchParams.get("q") ?? "";
    if (incomingQuery !== filter) {
      setFilter(incomingQuery);
    }
    const incomingIdea = searchParams.get("idea");
    if (incomingIdea !== selectedIdeaId) {
      setSelectedIdeaId(incomingIdea);
    }
  }, [filter, searchParams, selectedIdeaId, sort, windowKey]);

  useEffect(() => {
    let cancel = false;
    async function loadIdeas() {
      setFetchState((prev) => ({ ...prev, loading: true, error: undefined }));
      try {
        const params = new URLSearchParams();
        if (windowKey) params.set("window", windowKey);
        if (sort) params.set("sort", sort);
        if (filter) params.set("q", filter);
        if (forceRefreshToken > 0) params.set("refresh", "true");
        const res = await fetch(`/api/ideas?${params.toString()}`);
        if (!res.ok) {
          throw new Error(`Failed to load ideas (${res.status})`);
        }
        const json = (await res.json()) as IdeaResponse;
        if (cancel) return;
        setFetchState({
          loading: false,
          error: undefined,
          ideas: json.ideas,
          windowDays: json.windowDays,
          updatedAt: json.updatedAt,
        });
      } catch (error) {
        if (cancel) return;
        setFetchState((prev) => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : "Unknown error",
        }));
      }
    }

    loadIdeas();

    return () => {
      cancel = true;
    };
  }, [filter, forceRefreshToken, sort, windowKey]);

  useEffect(() => {
    if (windowKey) setParam("window", windowKey);
    setParam("sort", sort);
    setParam("q", filter ? filter : null);
    setParam("idea", selectedIdeaId);
  }, [filter, selectedIdeaId, setParam, sort, windowKey]);

  const selectedIdea = useMemo(
    () => fetchState.ideas.find((idea) => idea.id === selectedIdeaId) ?? null,
    [fetchState.ideas, selectedIdeaId],
  );

  const handleSelectIdea = useCallback(
    async (idea: IdeaSummary) => {
      setSelectedIdeaId((prev) => (prev === idea.id ? null : idea.id));
      if (!postsCache[idea.id]) {
        setPostsLoading(true);
        setPostsError(undefined);
        try {
          const res = await fetch(`/api/ideas/${idea.id}/posts`);
          if (!res.ok) {
            throw new Error(`Failed to load posts (${res.status})`);
          }
          const json = (await res.json()) as IdeaPost[];
          setPostsCache((prev) => ({ ...prev, [idea.id]: json }));
        } catch (error) {
          setPostsError(error instanceof Error ? error.message : "Unknown error");
        } finally {
          setPostsLoading(false);
        }
      }
    },
    [postsCache],
  );

  const handleRefresh = useCallback(() => {
    setForceRefreshToken((token) => token + 1);
  }, []);

  const handleCopyCsv = useCallback(
    async (idea: IdeaSummary) => {
      try {
        const res = await fetch(`/api/ideas/${idea.id}/posts?format=csv`);
        if (!res.ok) throw new Error("Failed to download CSV");
        const text = await res.text();
        await navigator.clipboard.writeText(text);
        alert("Copied CSV to clipboard");
      } catch (error) {
        alert(error instanceof Error ? error.message : "Unable to copy CSV");
      }
    },
    [],
  );

  const handleDownloadCsv = useCallback((idea: IdeaSummary) => {
    const url = `/api/ideas/${idea.id}/posts?format=csv`;
    const link = document.createElement("a");
    link.href = url;
    link.download = `${idea.id}.csv`;
    link.click();
  }, []);

  const handleOpenAll = useCallback((idea: IdeaSummary) => {
    const posts = postsCache[idea.id];
    if (!posts || posts.length === 0) return;
    posts.slice(0, 5).forEach((post) => {
      window.open(post.url, "_blank", "noopener,noreferrer");
    });
  }, [postsCache]);

  const ideaCards = fetchState.ideas.map((idea) => (
    <article
      key={idea.id}
      onClick={() => handleSelectIdea(idea)}
      className={`rounded-xl border border-slate-200 bg-white shadow-sm transition transform p-5 cursor-pointer hover:-translate-y-0.5 hover:shadow ${
        idea.id === selectedIdeaId ? "border-indigo-500" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{idea.title}</h3>
          <p className="mt-2 text-sm text-slate-600">
            {idea.sampleSnippet || "Theme extracted from cluster"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
            <span
              className="rounded-full bg-slate-100 px-3 py-1"
              title={`IdeaScore ${idea.score.toFixed(1)} · ${idea.postsCount} posts · ${idea.subsCount} subreddits · ${idea.upvotesSum} upvotes · ${idea.commentsSum} comments`}
            >
              Score: <span className="font-medium text-slate-900">{idea.score.toFixed(1)}</span>
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1">
              Posts: {idea.postsCount}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1">
              Subs: {idea.subsCount}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1">
              Σ Upvotes: {idea.upvotesSum}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1">
              Σ Comments: {idea.commentsSum}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {idea.topKeywords.map((keyword) => (
              <span
                key={keyword}
                className="rounded bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700"
              >
                {keyword}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-right text-xs text-slate-500">
            Trend slope
            <div className={`text-sm font-semibold ${idea.trendSlope >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {idea.trendSlope >= 0 ? "+" : ""}
              {idea.trendSlope.toFixed(2)}
            </div>
          </div>
          <Sparkline values={idea.trend} className="text-indigo-500" />
        </div>
      </div>
    </article>
  ));

  const postsForSelected = selectedIdeaId ? postsCache[selectedIdeaId] ?? [] : [];

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Finddit — Reddit-validated AI micro-app ideas
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Not affiliated with Reddit. Aggregates public posts in aggregate for research/ideation.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              Window
              <select
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                value={windowKey}
                onChange={(event) => setWindowKey(event.target.value)}
              >
                {WINDOW_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              Sort
              <select
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                value={sort}
                onChange={(event) => setSort(event.target.value as SortOption)}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <input
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter ideas and posts"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={handleRefresh}
              className="rounded-md border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
            >
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-6 lg:flex-row">
        <section className="flex-1 space-y-4 overflow-y-auto pb-12">
          {fetchState.loading ? (
            <div className="text-sm text-slate-500">Loading ideas…</div>
          ) : fetchState.error ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {fetchState.error}
            </div>
          ) : fetchState.ideas.length === 0 ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
              No ideas found. Try expanding the window, changing filters, or refreshing.
            </div>
          ) : (
            ideaCards
          )}
        </section>

        <aside
          className={`lg:w-[360px] lg:flex-shrink-0 lg:border-l lg:border-slate-200 lg:pl-6 ${
            selectedIdea ? "block" : "hidden lg:block"
          }`}
        >
          {selectedIdea ? (
            <div className="sticky top-24 space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">{selectedIdea.title}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {selectedIdea.postsCount} posts across {selectedIdea.subsCount} subreddits
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => handleDownloadCsv(selectedIdea)}
                    className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Download CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyCsv(selectedIdea)}
                    className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Copy CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenAll(selectedIdea)}
                    className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Open top posts
                  </button>
                </div>
              </div>

              <div className="max-h-[60vh] space-y-3 overflow-y-auto">
                {postsLoading ? (
                  <div className="text-sm text-slate-500">Loading posts…</div>
                ) : postsError ? (
                  <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    {postsError}
                  </div>
                ) : postsForSelected.length === 0 ? (
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    No posts found for this idea.
                  </div>
                ) : (
                  postsForSelected.map((post) => (
                    <div
                      key={post.id}
                      className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                    >
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span className="font-medium text-indigo-600">r/{post.subreddit}</span>
                        <span>
                          {new Date(post.createdAt).toLocaleDateString()} · ▲{post.upvotes} · 💬
                          {post.comments}
                        </span>
                      </div>
                      <a
                        href={post.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 block text-sm font-semibold text-slate-900 hover:text-indigo-600"
                      >
                        {post.title}
                      </a>
                      <p className="mt-2 text-sm text-slate-600">
                        {post.matchedSnippet || post.problemPhrase}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="hidden text-sm text-slate-500 lg:block">
              Select an idea on the left to see supporting posts.
            </div>
          )}
        </aside>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-2 px-6 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Data refreshed every 6h or on demand. Respect subreddit rules; add communities to the opt-out list in src/config/optOut.ts if needed.
          </span>
          {fetchState.updatedAt ? (
            <span>Last updated {new Date(fetchState.updatedAt).toLocaleString()}</span>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
