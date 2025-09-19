import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILENAME = process.env.FINDDIT_DB_PATH
  ? path.resolve(process.env.FINDDIT_DB_PATH)
  : path.join(DATA_DIR, "finddit.db");

let singleton: Database.Database | undefined;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  subreddit TEXT,
  title TEXT,
  selftext TEXT,
  url TEXT,
  created_at INTEGER,
  upvotes INTEGER,
  comments INTEGER,
  author TEXT
);
CREATE TABLE IF NOT EXISTS problems (
  post_id TEXT,
  phrase TEXT,
  phrase_canonical TEXT,
  matched_snippet TEXT,
  cue_id TEXT,
  PRIMARY KEY (post_id, phrase_canonical, cue_id),
  FOREIGN KEY(post_id) REFERENCES posts(id)
);
CREATE TABLE IF NOT EXISTS ideas (
  id TEXT PRIMARY KEY,
  window_days INTEGER,
  canonical TEXT,
  title TEXT,
  score REAL,
  posts_count INTEGER,
  subs_count INTEGER,
  upvotes_sum INTEGER,
  comments_sum INTEGER,
  trend_json TEXT,
  trend_slope REAL,
  top_keywords TEXT,
  sample_snippet TEXT,
  updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS idea_posts (
  idea_id TEXT,
  post_id TEXT,
  PRIMARY KEY (idea_id, post_id),
  FOREIGN KEY(idea_id) REFERENCES ideas(id),
  FOREIGN KEY(post_id) REFERENCES posts(id)
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function initSchema(db: Database.Database) {
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  ensureColumn(db, "posts", "author", "TEXT");
  ensureColumn(db, "ideas", "canonical", "TEXT");
  ensureColumn(db, "ideas", "trend_json", "TEXT");
  ensureColumn(db, "ideas", "trend_slope", "REAL");
  ensureColumn(db, "ideas", "top_keywords", "TEXT");
  ensureColumn(db, "ideas", "sample_snippet", "TEXT");
  ensureColumn(db, "ideas", "details_json", "TEXT");
  ensureColumn(db, "ideas", "wtp_mentions", "INTEGER");
  ensureColumn(db, "ideas", "complexity_tier", "TEXT");
  ensureColumn(db, "ideas", "effort_days", "INTEGER");
  ensureColumn(db, "ideas", "worth_estimate", "TEXT");
}

function ensureColumn(
  db: Database.Database,
  table: string,
  column: string,
  type: string,
) {
  const info = db
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>;
  const hasColumn = info.some((row) => row.name === column);
  if (!hasColumn) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
  }
}

export function getDb(): Database.Database {
  if (!singleton) {
    ensureDataDir();
    try {
      singleton = new Database(DB_FILENAME);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Could not locate the bindings file")
      ) {
        const hint =
          "better-sqlite3 native bindings are missing. Remove pnpm-workspace.yaml if it exists, then run \"pnpm install --no-frozen-lockfile\" (or \"pnpm install\" on a fresh clone) so the build runs automatically. If installation was interrupted, run \"pnpm rebuild better-sqlite3\" afterwards.";
        const wrapped = new Error(hint, { cause: error });
        throw wrapped;
      }
      throw error;
    }
    initSchema(singleton);
  }
  return singleton;
}

export function getMeta(key: string): string | undefined {
  const db = getDb();
  const row = db
    .prepare<{ key: string }>("SELECT value FROM meta WHERE key = ?")
    .get(key);
  return row?.value;
}

export function setMeta(key: string, value: string) {
  const db = getDb();
  db.prepare("REPLACE INTO meta (key, value) VALUES (?, ?)").run(key, value);
}

export function clearTable(table: string) {
  const db = getDb();
  db.prepare(`DELETE FROM ${table}`).run();
}
