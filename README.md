# Finddit

Finddit surfaces Reddit-validated AI micro-app ideas by fetching and clustering pain-driven posts from configured subreddits.

## Prerequisites

- Node.js 20+
- pnpm 10 (Corepack ships with Node.js 20, run `corepack enable` once)

## Install & Build Scripts

1. Install dependencies (this project pre-approves the native `better-sqlite3` build via `.npmrc`):

   ```bash
   pnpm install --no-frozen-lockfile
   ```

   If you previously ran `pnpm approve-builds` and a `pnpm-workspace.yaml` with `ignoredBuiltDependencies` was generated, delete that file before reinstalling so the binding compiles.

2. Start the dev server:

   ```bash
   pnpm dev
   ```

   By default, data is stored at `data/finddit.db`. To override the path, export `FINDDIT_DB_PATH`.

3. Production build commands:

   ```bash
   pnpm build
   pnpm start
   ```

4. Run tests:

   ```bash
   pnpm test
   ```

## Running the Enhanced Pipeline

**Quick Start** (with OpenAI API key):
```bash
# Development mode - analyzes 100 posts from last 7 days
pnpm ingest:enhanced

# Production mode - analyzes 500 posts from last 30 days
pnpm ingest:production
```

**Legacy Pipeline** (regex-based, no LLM):
```bash
pnpm ingest
```

**Custom Analysis**:
```bash
# Analyze specific window and post count
tsx src/scripts/enhanced-ingest.ts --window=14 --max-posts=200

# Disable LLM analysis (fallback to regex)
tsx src/scripts/enhanced-ingest.ts --window=7 --no-llm
```

## Seeding Offline Data

Populate the SQLite cache with fixture posts for UI development:

```bash
pnpm seed
```

The seed script reads from `fixtures/sample_posts.json`. Set `FINDDIT_FIXTURE` to use a different JSON payload, and `FINDDIT_WINDOW` (7d|30d|90d|365d) to change the computed window.

## Environment Variables

| Variable | Purpose | Required |
| --- | --- | --- |
| `FINDDIT_DB_PATH` | Override default SQLite file location (`data/finddit.db`). | No |
| `OPENAI_API_KEY` | OpenAI API key for LLM-powered problem analysis and clustering. **Required for enhanced analysis pipeline.** | **Yes** |
| `REDDIT_CLIENT_ID` | Reddit app client ID for authenticated API access. | No |
| `REDDIT_CLIENT_SECRET` | Reddit app client secret. | No |
| `REDDIT_USERNAME` | Reddit account username for script authentication. | No |
| `REDDIT_PASSWORD` | Reddit account password for script authentication. | No |
| `REDDIT_USER_AGENT` | Custom user agent string for Reddit API requests. | No |
| `FINDDIT_WINDOW` | Default time window for seed script. | No |
| `FINDDIT_FIXTURE` | Alternate fixture path for seed script. | No |

### Setup Instructions

1. **OpenAI API Key** (Required for best results):
   - Sign up at [OpenAI Platform](https://platform.openai.com/)
   - Generate an API key
   - Add to your `.env` file: `OPENAI_API_KEY=sk-...`

2. **Reddit API Credentials** (Optional but recommended):
   - Create a Reddit app at [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps)
   - Choose "script" type
   - Add credentials to `.env`:
     ```
     REDDIT_CLIENT_ID=your_client_id
     REDDIT_CLIENT_SECRET=your_client_secret
     REDDIT_USERNAME=your_username
     REDDIT_PASSWORD=your_password
     REDDIT_USER_AGENT=FindditBot/1.0
     ```

3. **Example .env file**:
   ```
   OPENAI_API_KEY=sk-proj-abcd1234...
   REDDIT_CLIENT_ID=abc123
   REDDIT_CLIENT_SECRET=def456
   REDDIT_USERNAME=yourusername
   REDDIT_PASSWORD=yourpassword
   REDDIT_USER_AGENT=FindditBot/1.0 (https://github.com/youruser/finddit)
   ```

**Note**: Without OpenAI API key, the system falls back to regex-based problem detection with significantly reduced accuracy and relevance.

## Troubleshooting

- **`better-sqlite3 native bindings are missing`**: delete any generated `pnpm-workspace.yaml`, then run `pnpm install --no-frozen-lockfile`. The `.npmrc` file already whitelists packages that require build scripts, so the native binary will compile automatically. If installation was interrupted, run `pnpm rebuild better-sqlite3` afterwards.
- **Outdated node_modules**: rerun `pnpm install --no-frozen-lockfile` after pulling new changes.

## Disclaimer

Finddit aggregates public Reddit content for research/ideation and is not affiliated with Reddit. Respect individual subreddit rules and update `src/config/optOut.ts` to exclude communities or authors that request removal.
