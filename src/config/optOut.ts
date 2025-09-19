export const OPT_OUT_SUBREDDITS: string[] = [];
export const OPT_OUT_AUTHORS: string[] = [];

export function isOptedOut(subreddit: string, author?: string | null) {
  if (OPT_OUT_SUBREDDITS.includes(subreddit.toLowerCase())) {
    return true;
  }
  if (author) {
    const normalized = author.replace(/^u\//i, "").toLowerCase();
    return OPT_OUT_AUTHORS.includes(normalized);
  }
  return false;
}
