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

## Seeding Offline Data

Populate the SQLite cache with fixture posts for UI development:

```bash
pnpm seed
```

The seed script reads from `fixtures/sample_posts.json`. Set `FINDDIT_FIXTURE` to use a different JSON payload, and `FINDDIT_WINDOW` (7d|30d|90d|365d) to change the computed window.

## Environment Variables

| Variable | Purpose |
| --- | --- |
| `FINDDIT_DB_PATH` | Override default SQLite file location (`data/finddit.db`). |
| `REDDIT_CLIENT_ID` etc. | Optional. Provide full Reddit script credentials (ID, SECRET, USERNAME, PASSWORD, USER_AGENT) to use OAuth via snoowrap. Without them, the app falls back to Reddit's public JSON endpoints server-side. |
| `FINDDIT_WINDOW` | Default time window for seed script. |
| `FINDDIT_FIXTURE` | Alternate fixture path for seed script. |

## Troubleshooting

- **`better-sqlite3 native bindings are missing`**: delete any generated `pnpm-workspace.yaml`, then run `pnpm install --no-frozen-lockfile`. The `.npmrc` file already whitelists packages that require build scripts, so the native binary will compile automatically. If installation was interrupted, run `pnpm rebuild better-sqlite3` afterwards.
- **Outdated node_modules**: rerun `pnpm install --no-frozen-lockfile` after pulling new changes.

## Disclaimer

Finddit aggregates public Reddit content for research/ideation and is not affiliated with Reddit. Respect individual subreddit rules and update `src/config/optOut.ts` to exclude communities or authors that request removal.
