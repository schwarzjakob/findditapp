export type ProblemCueType =
  | "postfix_clause"
  | "question_clause"
  | "contains_keyword"
  | "sentence";

export interface ProblemCue {
  id: string;
  description: string;
  regex: RegExp;
  type: ProblemCueType;
}

export const PROBLEM_CUES: ProblemCue[] = [
  {
    id: "i_wish",
    description: "I wish there was/we had …",
    regex: /\bi wish (?:there was|we had)\b(?<clause>[^.!?\n]{0,160})/i,
    type: "postfix_clause",
  },
  {
    id: "is_there_an_app",
    description: "Is there an app/tool/script …",
    regex: /\bis there (?:an|a) (?:app|tool|script)\b(?<clause>[^.!?\n]{0,160})/i,
    type: "postfix_clause",
  },
  {
    id: "how_do_i",
    description: "How do I automate/speed up/batch …",
    regex:
      /\bhow do i (?:automate|speed up|batch)\b(?<clause>[^.!?\n]{0,160})/i,
    type: "question_clause",
  },
  {
    id: "every_period",
    description: "Every day/week/month I have to …",
    regex:
      /\bevery (?:day|week|month) i (?:have to|need to)\b(?<clause>[^.!?\n]{0,160})/i,
    type: "postfix_clause",
  },
  {
    id: "no_easy_way",
    description: "There's/There is no easy way to …",
    regex: /\bthere(?:'s| is) no easy way to\b(?<clause>[^.!?\n]{0,160})/i,
    type: "postfix_clause",
  },
  {
    id: "takes_forever",
    description: "It takes forever/hours …",
    regex: /\btakes (?:me )?(?:forever|hours) to\b(?<clause>[^.!?\n]{0,160})/i,
    type: "postfix_clause",
  },
  {
    id: "how_do_i_alt",
    description: "How do I automate/speed up/batch ... with trailing question mark",
    regex:
      /\bhow do i (?:automate|speed up|batch) (?<clause>[^?\n]{0,160})\??/i,
    type: "question_clause",
  },
  {
    id: "need_to",
    description: "I need to/I have to …",
    regex: /\bi (?:need to|have to)\b(?<clause>[^.!?\n]{0,160})/i,
    type: "postfix_clause",
  },
  {
    id: "trying_to",
    description: "I'm trying to/Looking for …",
    regex: /\bi'm (?:trying to|looking for)\b(?<clause>[^.!?\n]{0,160})/i,
    type: "postfix_clause",
  },
  {
    id: "looking_for_tool",
    description: "Looking for a tool/app/solution …",
    regex: /\blooking for (?:a |an )?(?:tool|app|solution|way)\b(?<clause>[^.!?\n]{0,160})/i,
    type: "postfix_clause",
  },
  {
    id: "want_to",
    description: "I want to/Would like to …",
    regex: /\bi (?:want to|would like to)\b(?<clause>[^.!?\n]{0,160})/i,
    type: "postfix_clause",
  },
  {
    id: "can_i",
    description: "Can I/Is it possible to …",
    regex: /\b(?:can i|is it possible to)\b(?<clause>[^.!?\n]{0,160})/i,
    type: "question_clause",
  },
  {
    id: "any_way_to",
    description: "Any way to/Is there a way to …",
    regex: /\b(?:any way to|is there a way to)\b(?<clause>[^.!?\n]{0,160})/i,
    type: "question_clause",
  },
  {
    id: "struggling_with",
    description: "Struggling with/Having trouble with …",
    regex: /\b(?:struggling with|having trouble with)\b(?<clause>[^.!?\n]{0,160})/i,
    type: "postfix_clause",
  },
  {
    id: "spending_time",
    description: "Spending too much time/Wasting time …",
    regex: /\b(?:spending too much time|wasting time)\b(?<clause>[^.!?\n]{0,160})/i,
    type: "postfix_clause",
  },
];

export const KEYWORD_CUES: ProblemCue[] = [
  {
    id: "manual",
    description: "Contains manual(ly)",
    regex: /\bmanual(?:ly)?\b/i,
    type: "sentence",
  },
  {
    id: "repetitive",
    description: "Contains repetitive",
    regex: /\brepetitive\b/i,
    type: "sentence",
  },
  {
    id: "copy_paste",
    description: "Contains copy paste",
    regex: /\bcopy(?:-| )paste\b/i,
    type: "sentence",
  },
  {
    id: "spreadsheet_hell",
    description: "Contains spreadsheet hell",
    regex: /\bspreadsheet hell\b/i,
    type: "sentence",
  },
  {
    id: "tedious",
    description: "Contains tedious",
    regex: /\btedious\b/i,
    type: "sentence",
  },
  {
    id: "time_consuming",
    description: "Contains time consuming/time-consuming",
    regex: /\btime[- ]consuming\b/i,
    type: "sentence",
  },
  {
    id: "automate",
    description: "Contains automate/automation",
    regex: /\bautomati?(?:on|e)\b/i,
    type: "sentence",
  },
  {
    id: "inefficient",
    description: "Contains inefficient",
    regex: /\binefficient\b/i,
    type: "sentence",
  },
  {
    id: "pain_point",
    description: "Contains pain point",
    regex: /\bpain point\b/i,
    type: "sentence",
  },
  {
    id: "workflow",
    description: "Contains workflow",
    regex: /\bworkflow\b/i,
    type: "sentence",
  },
  {
    id: "integrate",
    description: "Contains integrate/integration",
    regex: /\bintegrat(?:e|ion)\b/i,
    type: "sentence",
  },
  {
    id: "sync",
    description: "Contains sync/synchronize",
    regex: /\bsync(?:hronize)?\b/i,
    type: "sentence",
  },
  {
    id: "streamline",
    description: "Contains streamline",
    regex: /\bstreamline\b/i,
    type: "sentence",
  },
];

export const PRIMARY_CUE_IDS = PROBLEM_CUES.map((cue) => cue.id);

export const HIGHLIGHT_KEYWORDS = [
  "automate",
  "batch",
  "api",
  "csv",
  "workflow",
  "script",
  "zapier",
  "google sheets",
];

export const PAIN_WORDS = [
  "manual",
  "repetitive",
  "tedious",
  "boring",
  "error-prone",
  "copy paste",
  "takes forever",
];
