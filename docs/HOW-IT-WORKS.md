# How the CDN works

Plain-English guide for a developer new to this repo. If Claude were unavailable tomorrow, this plus
`README.md`, `CLAUDE.md` and `CLOUDFLARE.md` should be enough to run and fix it.
Last updated 2026-11-03. Update it in the same commit as any change to how something is built,
deployed, configured or edited.

## What it is

The Kwame & Co. plugin shelf. The studio writes small browser scripts and stylesheets (`kw-filter`,
`kw-carousel`, `kw-tooltip` and so on) that client sites use. This public repo holds the finished,
minified copies and serves them from `https://cdn.kwameand.co` (our own domain on Cloudflare). jsDelivr
(`cdn.jsdelivr.net/gh/kwameandco/cdn`) still serves the same files as a fallback until every client
site has moved. Astro sites do not load from any CDN: they download a pinned file at build time and serve
it themselves (`index.json` and `renovate/` exist for that).

It is a publishing pipeline, not an application. The plugin **source** is not here: it lives in
`kwameandco/clients` under `plugins/`.

## How it is built, and where things live

- `kw-*/` - one folder per plugin: source and `.min.` copies, **written by the workflow, never by hand**.
- `versions/<plugin>/<version>/<file>` - the permanent archive. A file is written once and never changed
  or deleted, so every old versioned URL keeps working. **Never edit or delete anything in it.**
- `index.json` and `renovate/` - derived lists (every file, version, sha256) rewritten on every run.
  Site fetch scripts and Renovate point at these paths; do not move or rename them.
- `scripts/build-cdn.mjs` - archives new versions, builds `dist/` (git-ignored) and the `_headers` file.
  Header at the top of the file explains each output.
- `src/not-found.js` and `wrangler.jsonc` - the tiny Worker (`kwameandco-cdn`) that answers 404s;
  everything else is static files. Logs and traces are deliberately off (privacy).
- `.github/workflows/publish-plugins.yml` - the pipeline: pull plugin source from `clients`, minify
  (terser for JS, lightningcss for CSS), commit, purge jsDelivr, archive, deploy to Cloudflare.
- `CLOUDFLARE.md` - one-time Cloudflare setup. `CLAUDE.md` - rules for working here.

Why this lives in a public repo and not in `clients`: GitHub Actions minutes are metered on private
repos only and shared across the account; on public repos they are free. When another private repo used
up the month, the old publish silently failed for six weeks (2026-09-21).

URL shapes: `https://cdn.kwameand.co/<plugin>/<version>/<file>` (cached a year) and
`.../<plugin>/latest/<file>` (cached 5 minutes). Embeds on client sites use the versioned form.
The version is read from the banner in the source (`/*! kw-filter v1.6.1 */`); no banner gives a
`0.0.0-<hash>` version.

## Run it locally and deploy it

PowerShell 5.1 / VS Code terminal. The repo folder on Kwame's machine: TBC - ask Kwame. Use
`cd "C:\Users\Main\Local Sites\<folder>"` with the real folder.

```powershell
node scripts\build-cdn.mjs --check
node scripts\build-cdn.mjs
npx wrangler dev
```

`--check` writes nothing and says what would change. The second line builds `dist\`. The third serves it
locally (Node 18 or newer, wrangler as pinned in the workflow); in a second window try
`curl.exe -I http://localhost:8787/kw-filter/latest/kw-filter.min.js`.

To publish a plugin, do not edit this repo. Merge the plugin's change to `kwameandco/clients` `main`
(bump the banner version in the source), then on GitHub open `kwameandco/cdn` → **Actions** →
**Publish plugins to CDN** → **Run workflow**, set `plugin` to the folder name (or `all`), and optionally
tick `dry_run` first. Success: the run turns green, a "chore: sync" commit appears, and
`https://cdn.kwameand.co/<plugin>/<version>/<file>` returns the file. A daily schedule runs it too;
GitHub stops scheduled runs after 60 days without a commit here, and a manual run restarts them.

## How content is edited

You do not edit files here. Plugin files are edited in `kwameandco/clients` under `plugins/<name>/`, then
published by the workflow. A file changed without a banner bump keeps its archived copy; only `latest`
changes and the run shows a warning. Fix by bumping the banner in `clients`.

## Outside accounts, services and secrets

Names only.

| Service | Used for | Secret names | Owner |
|---|---|---|---|
| GitHub `kwameandco/cdn` (public) | Source, Actions, archive | none | Kwame & Co. |
| `CLIENTS_READ_TOKEN` (repo secret) | Read-only access to `kwameandco/clients` `plugins/` | `CLIENTS_READ_TOKEN` (fine-grained token, Contents: read, that repo only) | Kwame; expiry date: TBC - ask Kwame |
| Cloudflare | Hosts `cdn.kwameand.co` | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (repo secrets) | Kwame & Co.; whether the secrets are set yet: TBC - ask Kwame |
| jsDelivr | Fallback only | none | Third party, no DPA (being retired) |

The Processors table (Cloudflare, jsDelivr, GitHub) is in `README.md`.

## What breaks and how to fix it

- Workflow fails at checkout: `CLIENTS_READ_TOKEN` expired or missing. Make a new token and update the secret.
- Workflow says "Missing secrets" and skips the deploy: Cloudflare secrets not set. Follow `CLOUDFLARE.md`. jsDelivr still publishes.
- A plugin change is not live: no banner bump, or the workflow has not run yet. Check the run's warnings.
- jsDelivr serves an old build: its purge is unreliable. Pin a tag or commit, or use `cdn.kwameand.co`.
- `build-cdn.mjs --check` fails: `index.json` or `renovate/` is out of date; rerun the build (do not hand-edit).
- `wrangler dev` refuses to start: `compatibility_date` is newer than the pinned wrangler supports.
- A `versions/` file was deleted by mistake: restore it from git history at once. A missing file is a broken page on a client site.

## Depends on AI or MCP

| What | Why | Without AI |
|---|---|---|
| Starting the workflow from a Claude session (GitHub MCP run-trigger) | Convenience | Actions tab → Run workflow, or `gh workflow run publish-plugins.yml` |
| Checking which version is live | Convenience | Fetch the `.min.js` and read the `/*! ... vX.Y.Z */` banner |

The pipeline itself (minify, archive, deploy) is scripted and needs no AI or MCP.
