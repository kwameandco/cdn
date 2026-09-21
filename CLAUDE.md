# kwameandco/cdn — Claude instructions

## What this repo is
Public CDN only, served through jsDelivr. The plugin folders (`kw-*/`) are written by **this
repo's own workflow**, `.github/workflows/publish-plugins.yml`, which reads
`kwameandco/clients/plugins/` and minifies from there. Do not create or edit plugin files by
hand — the next publish run overwrites them.

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
purged; nothing is ever deleted here, so a pinned URL can never break.

**Secret it needs:** `CLIENTS_READ_TOKEN` in this repo's Actions secrets — fine-grained PAT,
repository `kwameandco/clients` only, permission Contents: Read-only. Without it the run
fails at checkout and publishes nothing.

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
```
https://cdn.jsdelivr.net/gh/kwameandco/cdn@main/<folder>/<file>
https://cdn.jsdelivr.net/gh/kwameandco/cdn@<tag>/<folder>/<file>
```
`@main` is cached by jsDelivr for up to seven days and purges do not reach every edge
reliably. Where a stale build reads as a broken page, pin.

## Related repos
- `kwameandco/clients` — plugin source (`plugins/`), the per-plugin docs and `USAGE.md`
  inventories. This repo used to be named `webstudio`; older docs may still say so.
