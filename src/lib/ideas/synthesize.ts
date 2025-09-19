import type { AppIdeaDetails, IdeaCluster } from "@/lib/types";
import { HIGHLIGHT_KEYWORDS } from "@/config/patterns";
import { countPainWords } from "@/lib/problems/extract";

const COMPLEXITY_POINTS = {
  base: 1,
  integration: 0.6,
  pdf: 0.8,
  email: 0.4,
  web: 0.9,
  realtime: 0.7,
  customModel: 1.2,
  authBilling: 0.8,
  uiHeavy: 0.6,
  accuracyCritical: 0.7,
};

function toTier(score: number) {
  if (score <= 2) return "Weekend build" as const;
  if (score <= 3.5) return "1–2 weeks" as const;
  return "Complex" as const;
}

function toDays(tier: AppIdeaDetails["complexityTier"]) {
  switch (tier) {
    case "Weekend build":
      return 2;
    case "1–2 weeks":
      return 7;
    default:
      return 14;
  }
}

function guessRequirements(title: string, keywords: string[]) {
  const lower = `${title} ${keywords.join(" ")}`.toLowerCase();
  const req = new Set<string>();

  if (lower.includes("jira")) req.add("Jira REST API (issues create/update)");
  if (lower.includes("github")) req.add("GitHub Issues API integration");
  if (lower.includes("slack")) req.add("Slack webhook/App event");
  if (lower.includes("discord")) req.add("Discord bot webhook");
  if (lower.includes("gmail") || lower.includes("email")) req.add("Gmail API or IMAP inbox polling");
  if (lower.match(/sheet|spreadsheet|airtable|csv/)) req.add("CSV import/export or Google Sheets API");
  if (lower.includes("thumbnail") || lower.includes("image")) req.add("Image generation API (Replicate/SDXL)");
  if (lower.includes("invoice") || lower.includes("receipt")) req.add("PDF parsing pipeline (pdfjs + extraction rules)");
  if (lower.includes("notion")) req.add("Notion API integration");
  if (lower.includes("zapier")) req.add("Zapier webhooks / auth token management");
  return Array.from(req);
}

function complexityScore(requirements: string[], cluster: IdeaCluster) {
  let score = COMPLEXITY_POINTS.base;
  score += requirements.length * COMPLEXITY_POINTS.integration;

  const allText = requirements.join(" ").toLowerCase();
  const check = (token: string) => allText.includes(token) || cluster.title.toLowerCase().includes(token);

  if (check("pdf")) score += COMPLEXITY_POINTS.pdf;
  if (check("email")) score += COMPLEXITY_POINTS.email;
  if (check("webhook") || check("web")) score += COMPLEXITY_POINTS.web;
  if (check("realtime") || check("live")) score += COMPLEXITY_POINTS.realtime;
  if (check("model") || check("ml")) score += COMPLEXITY_POINTS.customModel;
  if (check("billing") || check("oauth")) score += COMPLEXITY_POINTS.authBilling;
  if (check("designer") || check("thumbnail") || check("editor")) score += COMPLEXITY_POINTS.uiHeavy;
  if (check("invoice") || check("ledger") || check("finance") || check("medical")) score += COMPLEXITY_POINTS.accuracyCritical;

  return score;
}

function worthBucket(wtpMentions: number, upvotesSum: number) {
  if (wtpMentions >= 8 || upvotesSum > 1500) return "$99+/mo";
  if (wtpMentions >= 5 || upvotesSum > 600) return "$19–$99/mo";
  if (wtpMentions >= 2 || upvotesSum > 250) return "$10–$49/mo";
  return "$5–$19/mo";
}

function monetizationFromWorth(worth: string) {
  switch (worth) {
    case "$99+/mo":
      return "Tiered subscription per workspace (from $129/mo)";
    case "$19–$99/mo":
      return "Subscription per workspace (from $29/mo)";
    case "$10–$49/mo":
      return "Subscription per user (from $14/mo)";
    default:
      return "Starter plan $5/mo or credit bundle";
  }
}

function chooseAudience(title: string, keywords: string[]) {
  const text = `${title} ${keywords.join(" ")}`.toLowerCase();
  if (text.match(/youtube|thumbnail|creator/)) return "YouTube creators & small video teams";
  if (text.match(/invoice|account|bookkeep|receipt/)) return "SMB operators & accountants";
  if (text.match(/jira|github|backlog|sprint/)) return "Product & engineering leads";
  if (text.match(/teacher|classroom|student/)) return "Educators & course teams";
  if (text.match(/freelance|client/)) return "Freelancers & consultants";
  return "Builders & operators dealing with repetitive workflows";
}

function buildKeyFeatures(title: string, keywords: string[]) {
  const features = new Set<string>([
    "Batch automation with guardrails",
    "Preview & manual override",
    "Activity log with undo",
  ]);
  const lower = `${title} ${keywords.join(" ")}`.toLowerCase();
  if (lower.includes("thumbnail") || lower.includes("image")) features.add("Template-based image generation");
  if (lower.includes("invoice")) features.add("Line-item extraction & categorisation");
  if (lower.includes("jira") || lower.includes("github")) features.add("One-click issue creation with labels");
  if (lower.includes("sheet") || lower.includes("csv")) features.add("Spreadsheet import/export sync");
  if (lower.includes("email")) features.add("Inbox watcher for trigger keywords");
  return Array.from(features);
}

export function synthesizeIdea(cluster: IdeaCluster): AppIdeaDetails {
  const keywords = Array.from(new Set([...cluster.topKeywords, ...HIGHLIGHT_KEYWORDS])).slice(0, 15);
  const requirements = guessRequirements(cluster.title, keywords);
  const complexity = complexityScore(requirements, cluster);
  const tier = toTier(complexity);
  const effortDays = toDays(tier);

  const combinedText = `${cluster.title} ${cluster.sampleSnippet ?? ""} ${cluster.phrases.join(" ")} ${cluster.posts
    .map((post) => `${post.title} ${post.matchedSnippet}`)
    .join(" ")}`;
  const wtpMentions = (combinedText.match(/(willing to pay|i'?d pay|pay for|pricing|budget)/gi) || []).length;
  const worthEstimate = worthBucket(wtpMentions, cluster.upvotesSum);
  const monetization = monetizationFromWorth(worthEstimate);
  const targetUsers = chooseAudience(cluster.title, keywords);
  const keyFeatures = buildKeyFeatures(cluster.title, keywords);
  const painIntensity = Math.max(1, countPainWords(combinedText));

  return {
    problemTitle: cluster.title,
    summary: `Users report manual, time-consuming work around "${cluster.title.toLowerCase()}" with ${cluster.postsCount} posts across ${cluster.subsCount} subreddits (Σ upvotes ${cluster.upvotesSum}).`,
    targetUsers,
    jobToBeDone: `When ${cluster.title.toLowerCase()}, I want automation so I can focus on high-value work and avoid errors.`,
    solution: `Opinionated workflow that ${cluster.title.toLowerCase()} with built-in templates, batching, and safe approvals.`,
    keyFeatures,
    requirements: requirements.length
      ? requirements
      : ["CSV import/export", "Basic auth/token store", "Scheduled & on-demand runs"],
    complexityTier: tier,
    predictedEffortDays: effortDays,
    valueProp: `Saves ${painIntensity}-${Math.max(painIntensity + 2, painIntensity * 2)} hours per week and eliminates copy/paste mistakes.`,
    worthEstimate,
    monetization,
    risks: [
      "Respect upstream platform Terms of Service",
      "Handle rate limits and retries for third-party APIs",
      "Ensure outputs are auditable and reversible",
    ],
    wtpMentions,
    evidenceKeywords: keywords.slice(0, 8),
  };
}
