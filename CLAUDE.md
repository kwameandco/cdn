# kwameandco/cdn — Claude instructions

## What this repo is
Public CDN only, served two ways: **`https://cdn.kwameand.co`** (our own domain, a Cloudflare
Worker with static assets; the one to use from 2026-11-03) and jsDelivr (the fallback, until the
last site has moved: `kwameandco/clients` → `tasks/open/44`). The plugin folders (`kw-*/`) are
written by **this repo's own workflow**, `.github/workflows/publish-plugins.yml`, which reads
`kwameandco/clients/plugins/` and minifies from there. Do not create or edit plugin files by
hand — the next publish run overwrites them.

**`versions/` is the immutable archive behind `cdn.kwameand.co`.** `scripts/build-cdn.mjs`
copies each file into `versions/<plugin>/<version>/` the first time that version is seen and
never touches it again; the deploy uploads the whole archive every time, so every versioned URL
keeps working. **Never delete, edit or rewrite anything under `versions/`** — a removed file is a
broken page on a client site. `dist/` is the gitignored build output.

## cdn.kwameand.co
- URLs: `https://cdn.kwameand.co/<plugin>/<version>/<file>` (cached a year, `immutable`),
  `https://cdn.kwameand.co/<plugin>/<major>/<file>` (the **major-version channel**, cached 5 minutes,
  decided 2026-11-03) and `https://cdn.kwameand.co/<plugin>/latest/<file>` (cached 5 minutes).
  **Embeds on client sites (Webflow, Webstudio, Squarespace) use the channel, e.g. `/kw-filter/1/kw-filter.min.js`.**
  Pin an exact version only when a site must not move. `latest` is for testing, never a client page.
  Breaking changes are a new major in the banner, so sites never break silently; a new major never
  moves an old channel.
- Channels: `scripts/build-cdn.mjs` copies, per file, the newest archived release of each major (>= 1,
  real `x.y.z` only: no `0.0.0-<hash>`, no prereleases, no `0.x`) into `dist/<plugin>/<major>/`, and
  writes the mapping to `index.json` (`channels`). Source is `versions/`, which is never written to.
  Each channel needs its own `_headers` rule (a `/:plugin/:major/*` placeholder would also hit version
  folders and drop their immutable cache); the build errors past 90 rules. SRI cannot be used on a
  channel URL. If a release is bad, republish the fix as a higher patch: the archive is append-only.
- Version = the semver after the plugin's name in the first 2,000 characters of the unminified
  source (`/*! kw-filter v1.6.1 */` or ` * kw-filter v1.6.1`), per file — a plugin's JS and CSS
  can differ. No banner: `0.0.0-<10 hex of sha256 of the source>`. The `.min.*` file takes its
  source's version. Full rule at the top of `scripts/build-cdn.mjs`.
- A changed file whose banner was not bumped: the archived copy wins, `latest` gets the new one,
  and the run shows a `::warning::`. The fix is a banner bump in `clients`, never an edit here.
- Headers come from `dist/_headers` (written by the build script). `src/not-found.js` runs only
  for misses, so a 404 is `no-store` rather than inheriting the year-long cache.
- Privacy: no logs, traces or observability (`wrangler.jsonc`), no cookies. Cloudflare is a
  processor under its DPA; keep it that way. Do not turn logging on to debug — use
  `npx wrangler dev` locally.
- Deploy: the workflow's last step, `npx wrangler deploy` (pinned version), using the secrets
  `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Missing secrets = a notice and a skip,
  never a failure. One-time setup, click by click: `CLOUDFLARE.md`.
- Local check: `node scripts/build-cdn.mjs`, then `npx wrangler dev` and `curl -I` a path.
  `compatibility_date` must not be newer than the pinned wrangler's workerd supports.

## index.json and renovate/ (self-hosting on Astro sites, 2026-11-03)
Astro sites self-host plugins: their `plugins.json` pins `<plugin>/<file>` + version + sha256, and a
build-time script downloads `versions/<plugin>/<version>/<file>` from raw.githubusercontent.com
(`kwameandco/site-starter` → `docs/PLUGINS.md`). `index.json` (all files, versions, sha256) and
`renovate/<plugin>/<file>.json` (Renovate custom-datasource feeds) are **derived**: build-cdn.mjs
rewrites them from `versions/` on every run and the workflow commits them. Never hand-edit them,
and never rename or move `renovate/` or `versions/`: every site's Renovate config and fetch script
point at those paths in this public repo.

## Why the workflow lives here and not in clients (2026-09-21)
GitHub Actions minutes are metered on **private** repos only, pooled per account. Another
private repo's CI spent the whole month's allowance in August and September, and every
workflow in `clients` (private) then failed in four seconds with no runner and no logs — the
CDN went unpublished for six weeks. This repo is public, so standard `ubuntu-latest` runners
are free and unmetered. Keep it that way: no larger runners (they are billed on public repos
too), and no move back to `clients`.

## Merge policy
Merge directly to main. No PRs, no branches needed.

## Publishing a plugin
Merge the plugin work to `clients` main, then run **Publish plugins to CDN** (Actions tab →
Run workflow, or the GitHub MCP run-trigger tool, or `gh workflow run publish-plugins.yml`).
Inputs: `plugin` (a folder name, default `all`) and `dry_run` (build and show the diff, push
nothing). A daily schedule also runs it as a safety net. Only changed files are committed and
purged; nothing is ever deleted here, so a pinned URL can never break. The same run archives new
versions into `versions/` and deploys `cdn.kwameand.co`.

**Secret it needs:** `CLIENTS_READ_TOKEN` in this repo's Actions secrets — fine-grained PAT,
repository `kwameandco/clients` only, permission Contents: Read-only. Without it the run
fails at checkout and publishes nothing.

## Studio rules (restated from kwameandco/clients)

This repo has no site of its own, so only the rules that apply here are restated. The rest live in
`kwameandco/clients/CLAUDE.md`; where they disagree, that file wins.

1. **Deterministic first: spend AI only where it earns it.** A step done twice by AI becomes a
   script or a check (propose it, log it in the `clients` task inbox). No model call in a build or
   a scheduled job when a rule would do. Cheaper surface first: `grep`, then a local script, then
   MCP. Full rule: clients `CLAUDE.md` → *Deterministic first*.
2. **Written for humans.** Read `docs/HOW-IT-WORKS.md` before changing how anything works, and
   update it in the same commit as any change to how something is built, deployed, configured or
   edited. Full rule: clients `CLAUDE.md` → *Written for humans*.

## Your job here
- Checking what version of a script is live (fetch the `.min.js`, read the `/*! … vX.Y.Z */`
  banner)
- Running or debugging the publish workflow (its logs are in **this** repo's Actions tab now)
- Creating a git tag to pin a CDN URL

## If a file is missing or wrong
The source of truth is `kwameandco/clients/plugins/<name>/`. Fix it there, merge, run the
publish workflow. Do not patch files in this repo directly.

## Creating a version tag
To pin a CDN URL (e.g. after a stable release):
```
git tag kw-filter-v1.5.0
git push origin kw-filter-v1.5.0
```
Use the format `<script-name>-v<semver>` so tags stay namespaced per script. Prefer a tag over
a bare commit SHA in loader embeds: both are immutable on jsDelivr, but a tag says what it is.

## CDN URL format
Our own (use this):
```
https://cdn.kwameand.co/<folder>/<major>/<file>      default for client embeds, 5-minute cache
https://cdn.kwameand.co/<folder>/<version>/<file>    exact pin, immutable
https://cdn.kwameand.co/<folder>/latest/<file>
```
jsDelivr (fallback only; it sends visitor IPs to a third party we have no DPA with):
```
https://cdn.jsdelivr.net/gh/kwameandco/cdn@main/<folder>/<file>
https://cdn.jsdelivr.net/gh/kwameandco/cdn@<tag>/<folder>/<file>
```
`@main` is cached by jsDelivr for up to seven days and purges do not reach every edge
reliably. Where a stale build reads as a broken page, pin.

## Related repos
- `kwameandco/clients` — plugin source (`plugins/`), the per-plugin docs and `USAGE.md`
  inventories. This repo used to be named `webstudio`; older docs may still say so.
