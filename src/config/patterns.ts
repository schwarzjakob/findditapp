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
