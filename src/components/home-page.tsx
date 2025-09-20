'use client';

import {
  ArrowRight,
  BarChart3,
  MessageCircle,
  RefreshCcw,
  Rocket,
  Search,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Sparkline } from '@/components/sparkline';
import type { SortOption } from '@/lib/types';

const WINDOW_OPTIONS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '365d', label: 'Last year' },
];

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: 'top', label: 'Top (IdeaScore)' },
  { value: 'trending', label: 'Trending (slope)' },
  { value: 'fresh', label: 'Fresh (latest)' },
];

const HOW_IT_WORKS = [
  {
    title: 'Aggregate',
    body: "Pulls pain language from builder-heavy subreddits without touching Reddit's client APIs.",
    icon: Search,
    accent: 'primary',
  },
  {
    title: 'Quantify',
    body: 'Scores by engagement, recency, and willingness-to-pay signals so ideas are stacked by impact.',
    icon: BarChart3,
    accent: 'secondary',
  },
  {
    title: 'Decide & build',
    body: 'Feasibility hints surface weekend builds vs deep projects so you can ship faster.',
    icon: Rocket,
    accent: 'success',
  },
];

const VALUE_PROPS = [
  {
    title: 'Stop guessing',
    body: 'Build what people are literally asking for in public.',
    icon: Sparkles,
  },
  {
    title: 'Scope with confidence',
    body: 'See posts, keywords, subreddits, and engagement before writing a line of code.',
    icon: Users,
  },
  {
    title: 'Faster to revenue',
    body: 'Chase pains that mention budget, tedium, and urgency – not vanity headlines.',
    icon: TrendingUp,
  },
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
  complexityTier?: string;
  predictedEffortDays?: number;
  worthEstimate?: string;
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

interface AppIdeaDetails {
  problemTitle: string;
  summary: string;
  targetUsers: string;
  jobToBeDone: string;
  solution: string;
  keyFeatures: string[];
  requirements: string[];
  complexityTier: string;
  predictedEffortDays: number;
  valueProp: string;
  worthEstimate: string;
  monetization: string;
  risks: string[];
  wtpMentions: number;
  evidenceKeywords: string[];
}

interface IdeaWithDetails {
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
  complexityTier?: string;
  predictedEffortDays?: number;
  worthEstimate?: string;
  canonical: string;
  updatedAt: number;
  details: AppIdeaDetails | null;
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
      if (!value) {
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
  const [windowKey, setWindowKey] = useState<string>(searchParams.get('window') ?? '30d');
  const [sort, setSort] = useState<SortOption>((searchParams.get('sort') as SortOption) ?? 'top');
  const [filter, setFilter] = useState(searchParams.get('q') ?? '');
  const [forceRefreshToken, setForceRefreshToken] = useState(0);
  const [fetchState, setFetchState] = useState<FetchState>(initialFetchState);
  const [postsCache, setPostsCache] = useState<Record<string, IdeaPost[]>>({});
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState<string | undefined>();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalIdea, setModalIdea] = useState<IdeaSummary | null>(null);
  const [ideaDetailsCache, setIdeaDetailsCache] = useState<Record<string, IdeaWithDetails>>({});
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | undefined>();

  useEffect(() => {
    const paramsWindow = searchParams.get('window');
    if (paramsWindow && paramsWindow !== windowKey) {
      setWindowKey(paramsWindow);
    }
    const paramsSort = searchParams.get('sort');
    if (paramsSort && paramsSort !== sort) {
      setSort(paramsSort as SortOption);
    }
    const paramsFilter = searchParams.get('q') ?? '';
    if (paramsFilter !== filter) {
      setFilter(paramsFilter);
    }
  }, [filter, searchParams, sort, windowKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadIdeas() {
      setFetchState((prev) => ({ ...prev, loading: true, error: undefined }));
      try {
        const params = new URLSearchParams();
        if (windowKey) params.set('window', windowKey);
        if (sort) params.set('sort', sort);
        if (filter) params.set('q', filter);
        if (forceRefreshToken > 0) params.set('refresh', 'true');

        const response = await fetch(`/api/ideas?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Failed to load ideas (${response.status})`);
        }
        const json = (await response.json()) as IdeaResponse;
        if (cancelled) return;
        setFetchState({
          loading: false,
          error: undefined,
          ideas: json.ideas,
          windowDays: json.windowDays,
          updatedAt: json.updatedAt,
        });
      } catch (error) {
        if (cancelled) return;
        setFetchState((prev) => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }));
      }
    }

    loadIdeas();
    return () => {
      cancelled = true;
    };
  }, [filter, forceRefreshToken, sort, windowKey]);

  useEffect(() => {
    if (windowKey) setParam('window', windowKey);
    setParam('sort', sort);
    setParam('q', filter ? filter : null);
  }, [filter, setParam, sort, windowKey]);


  const topIdea = useMemo(() => fetchState.ideas[0] ?? null, [fetchState.ideas]);

  const handleSelectIdea = useCallback(
    async (idea: IdeaSummary) => {
      setModalIdea(idea);
      setModalOpen(true);

      // Fetch posts
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
          setPostsError(error instanceof Error ? error.message : 'Unable to load posts');
        } finally {
          setPostsLoading(false);
        }
      }

      // Fetch detailed idea analysis
      if (!ideaDetailsCache[idea.id]) {
        setDetailsLoading(true);
        setDetailsError(undefined);
        try {
          const res = await fetch(`/api/ideas/${idea.id}`);
          if (!res.ok) {
            throw new Error(`Failed to load idea details (${res.status})`);
          }
          const json = (await res.json()) as IdeaWithDetails;
          setIdeaDetailsCache((prev) => ({ ...prev, [idea.id]: json }));
        } catch (error) {
          setDetailsError(error instanceof Error ? error.message : 'Unable to load idea details');
        } finally {
          setDetailsLoading(false);
        }
      }
    },
    [postsCache, ideaDetailsCache],
  );

  const handleRefresh = useCallback(() => {
    setForceRefreshToken((token) => token + 1);
  }, []);

  const handleCopyCsv = useCallback(async (idea: IdeaSummary) => {
    try {
      const res = await fetch(`/api/ideas/${idea.id}/posts?format=csv`);
      if (!res.ok) throw new Error('Failed to export CSV');
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      window.alert('CSV copied to clipboard');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to copy CSV');
    }
  }, []);

  const handleDownloadCsv = useCallback((idea: IdeaSummary) => {
    const url = `/api/ideas/${idea.id}/posts?format=csv`;
    const link = document.createElement('a');
    link.href = url;
    link.download = `${idea.id}.csv`;
    link.click();
  }, []);

  const handleOpenAll = useCallback(
    (idea: IdeaSummary) => {
      const posts = postsCache[idea.id];
      if (!posts || posts.length === 0) return;
      posts.slice(0, 5).forEach((post) => {
        window.open(post.url, '_blank', 'noopener,noreferrer');
      });
    },
    [postsCache],
  );

  const postsForModal = modalIdea ? postsCache[modalIdea.id] ?? [] : [];
  const ideaDetails = modalIdea ? ideaDetailsCache[modalIdea.id] ?? null : null;
  const isLoading = fetchState.loading;
  const hasIdeas = fetchState.ideas.length > 0;


  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="text-lg font-semibold text-gradient"
          >
            Finddit
          </button>

          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <button
              type="button"
              className="transition-colors hover:text-foreground"
              onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
            >
              How it works
            </button>
            <button
              type="button"
              className="transition-colors hover:text-foreground"
              onClick={() => document.getElementById('ideas')?.scrollIntoView({ behavior: 'smooth' })}
            >
              Live ideas
            </button>
            <button
              type="button"
              className="transition-colors hover:text-foreground"
              onClick={() => document.getElementById('value')?.scrollIntoView({ behavior: 'smooth' })}
            >
              Why Finddit
            </button>
          </nav>

          <button
            type="button"
            className="hidden items-center gap-2 rounded-full bg-[hsl(var(--primary))] px-5 py-2 text-sm font-medium text-white shadow-md transition-transform duration-150 hover:-translate-y-0.5 hover:bg-[hsl(var(--primary-hover))] md:inline-flex"
            onClick={() => document.getElementById('ideas')?.scrollIntoView({ behavior: 'smooth' })}
          >
            Explore ideas
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-16">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl border border bg-gradient-to-br from-[hsl(var(--primary)/0.08)] via-background to-[hsl(var(--secondary)/0.08)] px-6 py-14 shadow-xl md:px-10">
          <div className="grid gap-10 lg:grid-cols-[1.1fr,0.9fr]">
            <div className="space-y-8">
              <span className="inline-flex items-center gap-2 rounded-full border border bg-white/40 px-4 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--primary))]" /> Reddit-validated micro-app pains
              </span>

              <div className="space-y-4">
                <h1 className="text-4xl font-semibold leading-tight md:text-5xl lg:text-6xl">
                  Build the right <span className="text-gradient">tiny AI app</span>
                </h1>
                <p className="max-w-xl text-lg text-muted-foreground">
                  Finddit scans Reddit’s hive mind and clusters the problems people beg to have fixed. Pick a validated pain, scope it in minutes, and ship what the market already wants.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-full bg-[hsl(var(--primary))] px-5 py-3 text-sm font-medium text-white shadow-md transition-transform duration-150 hover:-translate-y-0.5 hover:bg-[hsl(var(--primary-hover))]"
                  onClick={handleRefresh}
                >
                  Refresh live data
                  <RefreshCcw className="ml-2 h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-full border border bg-white px-5 py-3 text-sm font-medium text-foreground shadow-md transition-transform duration-150 hover:-translate-y-0.5 hover:bg-muted"
                  onClick={() => document.getElementById('ideas')?.scrollIntoView({ behavior: 'smooth' })}
                >
                  Browse ideas
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-2 rounded-full bg-white/60 px-3 py-1">
                  <TrendingUp className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
                  {fetchState.ideas.length.toLocaleString()} ideas tracked
                </span>
                <span className="flex items-center gap-2 rounded-full bg-white/60 px-3 py-1">
                  <MessageCircle className="h-3.5 w-3.5 text-[hsl(var(--secondary))]" />
                  {fetchState.windowDays}-day window
                </span>
                <span className="flex items-center gap-2 rounded-full bg-white/60 px-3 py-1">
                  Not affiliated with Reddit
                </span>
              </div>
            </div>

            <div className="relative">
              <div className="card-elevated h-full rounded-3xl bg-white/95 p-6 shadow-xl">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 rounded-full bg-[hsl(var(--success)/0.15)] px-3 py-1 font-medium text-[hsl(var(--success))]">
                    <TrendingUp className="h-3.5 w-3.5" /> Top signal
                  </span>
                  <span>IdeaScore {topIdea ? topIdea.score.toFixed(1) : '—'}</span>
                </div>

                <div className="mt-4 space-y-2">
                  <h3 className="text-lg font-semibold text-foreground line-clamp-2">
                    {topIdea ? topIdea.title : 'Waiting for fresh Reddit signals'}
                  </h3>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {topIdea?.sampleSnippet ?? 'Hit refresh to pull live threads from builder-heavy subreddits.'}
                  </p>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
                  <Metric label="Posts" value={topIdea ? topIdea.postsCount : '—'} />
                  <Metric label="Subreddits" value={topIdea ? topIdea.subsCount : '—'} />
                  <Metric label="Σ Upvotes" value={topIdea ? topIdea.upvotesSum.toLocaleString() : '—'} />
                  <Metric
                    label="Trend slope"
                    value={topIdea ? `${topIdea.trendSlope >= 0 ? '+' : ''}${topIdea.trendSlope.toFixed(2)}` : '—'}
                    accent={topIdea && topIdea.trendSlope >= 0 ? 'text-[hsl(var(--success))]' : 'text-red-500'}
                  />
                </div>

                <div className="mt-6 flex items-center justify-between rounded-xl border border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
                  <span>Weekly trend</span>
                  <Sparkline values={topIdea?.trend ?? []} className="h-8 w-28 text-[hsl(var(--primary))]" />
                </div>
                
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="mt-24">
          <div className="text-center">
            <h2 className="text-3xl font-semibold md:text-4xl">How Finddit works</h2>
            <p className="mt-3 text-lg text-muted-foreground">
              Three passes to turn noisy Reddit chatter into a ranked build sheet.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {HOW_IT_WORKS.map((step) => (
              <div key={step.title} className="rounded-2xl border border bg-white p-6 shadow-md">
                <div
                  className={`mb-6 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--${step.accent})/0.12)] text-[hsl(var(--${step.accent}))]`}
                >
                  <step.icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Controls */}
        <section id="ideas" className="mt-24">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-3xl font-semibold md:text-4xl">Live Reddit-sourced ideas</h2>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                Clustered problem statements with supporting posts, refreshed automatically every few hours.
              </p>
            </div>
          </div>

          <div className="mt-10 grid gap-5 rounded-2xl border border bg-white p-6 shadow-lg md:grid-cols-[1fr,0.6fr,0.6fr,auto] md:items-end">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="filter">
                Filter ideas
              </label>
              <input
                id="filter"
                type="search"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="e.g. automate invoices"
                className="h-11 rounded-xl border border bg-muted/60 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="window">
                Time window
              </label>
              <select
                id="window"
                value={windowKey}
                onChange={(event) => setWindowKey(event.target.value)}
                className="h-11 rounded-xl border border bg-muted/60 px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]"
              >
                {WINDOW_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="sort">
                Sort by
              </label>
              <select
                id="sort"
                value={sort}
                onChange={(event) => setSort(event.target.value as SortOption)}
                className="h-11 rounded-xl border border bg-muted/60 px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="inline-flex items-center justify-center rounded-xl bg-[hsl(var(--primary))] px-5 py-3 font-medium text-white shadow-md transition-transform duration-150 hover:-translate-y-0.5 hover:bg-[hsl(var(--primary-hover))]"
              onClick={handleRefresh}
            >
              Refresh data
              <RefreshCcw className="ml-2 h-4 w-4" />
            </button>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-1">
            {isLoading
              ? Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="rounded-2xl border border bg-muted/50 p-6 shadow animate-pulse">
                    <div className="h-5 w-40 rounded bg-muted" />
                    <div className="mt-3 h-4 rounded bg-muted" />
                    <div className="mt-2 h-4 w-5/6 rounded bg-muted" />
                    <div className="mt-6 flex gap-2">
                      <div className="h-6 w-20 rounded-full bg-muted" />
                      <div className="h-6 w-16 rounded-full bg-muted" />
                    </div>
                  </div>
                ))
              : fetchState.error
              ? [
                  <div key="error" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-600 shadow">
                    {fetchState.error}
                  </div>,
                ]
              : hasIdeas
              ? fetchState.ideas.map((idea) => (
                  <button
                    key={idea.id}
                    type="button"
                    onClick={() => handleSelectIdea(idea)}
                    className="rounded-2xl border border bg-white p-6 text-left shadow transition-transform duration-150 hover:-translate-y-1 hover:shadow-lg"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-foreground">{idea.title}</h3>
                        <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                          {idea.sampleSnippet || 'Theme extracted from cluster.'}
                        </p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <span className="inline-flex items-center justify-center rounded-full bg-[hsl(var(--primary)/0.12)] px-3 py-1 font-medium text-[hsl(var(--primary))]">
                          Score {idea.score.toFixed(1)}
                        </span>
                        <div
                          className={`mt-2 text-sm font-semibold ${
                            idea.trendSlope >= 0 ? 'text-[hsl(var(--success))]' : 'text-red-500'
                          }`}
                        >
                          {idea.trendSlope >= 0 ? '+' : ''}
                          {idea.trendSlope.toFixed(2)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <Tag label={`Posts ${idea.postsCount}`} />
                      <Tag label={`Subreddits ${idea.subsCount}`} />
                      <Tag label={`Σ Upvotes ${idea.upvotesSum.toLocaleString()}`} />
                      <Tag label={`Σ Comments ${idea.commentsSum.toLocaleString()}`} />
                      {idea.complexityTier && (
                        <Tag
                          label={`${idea.complexityTier}`}
                          className="bg-blue-100 text-blue-800"
                        />
                      )}
                      {idea.predictedEffortDays && (
                        <Tag
                          label={`${idea.predictedEffortDays} days`}
                          className="bg-green-100 text-green-800"
                        />
                      )}
                      {idea.worthEstimate && (
                        <Tag
                          label={idea.worthEstimate}
                          className="bg-purple-100 text-purple-800"
                        />
                      )}
                    </div>

                    {idea.topKeywords.length ? (
                      <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {idea.topKeywords.slice(0, 6).map((keyword) => (
                          <Tag key={keyword} label={keyword} className="capitalize" />
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-6 flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <span>Trend</span>
                        <Sparkline values={idea.trend} className="h-8 w-24 text-[hsl(var(--primary))]" />
                      </div>
                      <span className="font-medium text-[hsl(var(--primary))]">
                        View posts
                      </span>
                    </div>
                  </button>
                ))
              : [
                  <div key="empty" className="rounded-2xl border border bg-muted/50 p-10 text-center text-sm text-muted-foreground">
                    No ideas found. Try expanding the window, clearing the search, or refreshing data.
                  </div>,
                ]}
          </div>

          {/* Modal for posts */}
          {modalOpen && modalIdea && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
                {/* Modal Header */}
                <div className="border-b bg-white p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--secondary)/0.1)] px-3 py-1 text-xs font-medium text-[hsl(var(--secondary))]">
                        Live insight
                      </span>
                      <h2 className="mt-3 text-2xl font-semibold text-foreground">{modalIdea.title}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {modalIdea.postsCount} posts · {modalIdea.subsCount} subreddits
                      </p>
                    </div>
                    <button
                      onClick={() => setModalOpen(false)}
                      className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                    <OutlineButton onClick={() => handleDownloadCsv(modalIdea)}>Download CSV</OutlineButton>
                    <OutlineButton onClick={() => handleCopyCsv(modalIdea)}>Copy CSV</OutlineButton>
                    <OutlineButton onClick={() => handleOpenAll(modalIdea)}>Open top posts</OutlineButton>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <MetricCard label="Σ Upvotes" value={modalIdea.upvotesSum.toLocaleString()} />
                    <MetricCard label="Σ Comments" value={modalIdea.commentsSum.toLocaleString()} />
                  </div>
                </div>

                {/* Modal Content */}
                <div className="max-h-[70vh] overflow-y-auto">
                  {/* App Idea Analysis Section */}
                  {detailsLoading ? (
                    <div className="p-6 text-center text-sm text-muted-foreground">Loading app idea analysis…</div>
                  ) : detailsError ? (
                    <div className="p-6">
                      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                        {detailsError}
                      </div>
                    </div>
                  ) : ideaDetails?.details ? (
                    <div className="border-b bg-gradient-to-r from-blue-50 to-purple-50 p-6">
                      <div className="space-y-6">
                        {/* Jobs to be Done & Solution */}
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="rounded-xl border bg-white p-4">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Jobs to be Done</h3>
                            <p className="mt-2 text-sm text-foreground">{ideaDetails.details.jobToBeDone}</p>
                          </div>
                          <div className="rounded-xl border bg-white p-4">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Solution</h3>
                            <p className="mt-2 text-sm text-foreground">{ideaDetails.details.solution}</p>
                          </div>
                        </div>

                        {/* Target Users & Value Prop */}
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="rounded-xl border bg-white p-4">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Target Users</h3>
                            <p className="mt-2 text-sm text-foreground">{ideaDetails.details.targetUsers}</p>
                          </div>
                          <div className="rounded-xl border bg-white p-4">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Value Proposition</h3>
                            <p className="mt-2 text-sm text-foreground">{ideaDetails.details.valueProp}</p>
                          </div>
                        </div>

                        {/* Business Metrics */}
                        <div className="grid gap-4 md:grid-cols-3">
                          <div className="rounded-xl border bg-white p-4 text-center">
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Complexity</h3>
                            <p className="mt-1 text-lg font-bold text-blue-600">{ideaDetails.details.complexityTier}</p>
                            <p className="text-xs text-muted-foreground">{ideaDetails.details.predictedEffortDays} days</p>
                          </div>
                          <div className="rounded-xl border bg-white p-4 text-center">
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Worth Estimate</h3>
                            <p className="mt-1 text-lg font-bold text-green-600">{ideaDetails.details.worthEstimate}</p>
                            <p className="text-xs text-muted-foreground">{ideaDetails.details.wtpMentions} WTP mentions</p>
                          </div>
                          <div className="rounded-xl border bg-white p-4 text-center">
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Monetization</h3>
                            <p className="mt-1 text-sm font-medium text-purple-600">{ideaDetails.details.monetization}</p>
                          </div>
                        </div>

                        {/* Key Features */}
                        <div className="rounded-xl border bg-white p-4">
                          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Key Features</h3>
                          <div className="mt-3 grid gap-2 md:grid-cols-2">
                            {ideaDetails.details.keyFeatures.map((feature, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-sm">
                                <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                                {feature}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Technical Requirements */}
                        <div className="rounded-xl border bg-white p-4">
                          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Technical Requirements</h3>
                          <div className="mt-3 grid gap-2 md:grid-cols-2">
                            {ideaDetails.details.requirements.map((req, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-sm">
                                <div className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                                {req}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Risks */}
                        <div className="rounded-xl border bg-white p-4">
                          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Key Risks</h3>
                          <div className="mt-3 space-y-2">
                            {ideaDetails.details.risks.map((risk, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-sm">
                                <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
                                {risk}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* Supporting Posts Section */}
                  <div className="p-6">
                    <h3 className="text-lg font-semibold text-foreground mb-4">Supporting Evidence</h3>
                    <div className="space-y-4">
                      {postsLoading ? (
                        <div className="text-center text-sm text-muted-foreground">Loading supporting posts…</div>
                      ) : postsError ? (
                        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                          {postsError}
                        </div>
                      ) : postsForModal.length === 0 ? (
                        <div className="rounded-2xl border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
                          No posts found for this cluster.
                        </div>
                      ) : (
                        postsForModal.map((post) => (
                          <article key={post.id} className="rounded-2xl border bg-white p-5 shadow-sm transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-md">
                            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-2 rounded-full bg-[hsl(var(--primary)/0.12)] px-3 py-1 font-medium text-[hsl(var(--primary))]">
                                r/{post.subreddit}
                              </span>
                              <span>
                                {new Date(post.createdAt).toLocaleDateString()} · ▲{post.upvotes} · 💬{post.comments}
                              </span>
                            </div>
                            <a
                              href={post.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-3 block text-sm font-semibold text-[hsl(var(--primary))] hover:underline"
                            >
                              {post.title}
                            </a>
                            <p className="mt-2 text-sm text-muted-foreground">
                              {post.matchedSnippet || post.problemPhrase}
                            </p>
                          </article>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Value props */}
        <section id="value" className="mt-24">
          <div className="text-center">
            <h2 className="text-3xl font-semibold md:text-4xl">Why builders use Finddit</h2>
            <p className="mt-3 text-muted-foreground">
              A build sheet of problems, not headlines – with receipts from Reddit.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {VALUE_PROPS.map((value) => (
              <div key={value.title} className="rounded-2xl border border bg-white p-6 shadow-md">
                <value.icon className="h-8 w-8 text-[hsl(var(--primary))]" />
                <h3 className="mt-4 text-lg font-semibold text-foreground">{value.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{value.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border bg-muted/30">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <span className="text-gradient text-lg font-semibold">Finddit</span>
          <div className="flex flex-wrap items-center gap-4">
            <span>© {new Date().getFullYear()} Finddit. Not affiliated with Reddit.</span>
            {fetchState.updatedAt ? <span>Last updated {new Date(fetchState.updatedAt).toLocaleString()}</span> : null}
          </div>
        </div>
      </footer>
    </div>
  );
}


function Metric({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-xl border border bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${accent ?? 'text-foreground'}`}>{value}</p>
    </div>
  );
}

function Tag({ label, className }: { label: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs ${className ?? ''}`}>
      {label}
    </span>
  );
}

function OutlineButton({ children, ...props }: React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className="inline-flex items-center justify-center rounded-full border border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
      {...props}
    >
      {children}
    </button>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border bg-muted/40 p-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}
