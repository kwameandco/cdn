# kwameandco/cdn — Claude instructions

## What this repo is
Public CDN only. Files here are pushed automatically by GitHub Actions workflows in `kwameandco/webstudio`. Do not create or edit files manually.

## Merge policy
Merge directly to main. No PRs, no branches needed.

## Your job here
This repo is mostly read-only from your perspective. Typical reasons you'd be here:
- Checking what version of a script is currently live
- Creating a git tag to pin a CDN URL
- Debugging a missing or stale file (check the webstudio Actions tab, not this repo)

## If a file is missing or wrong
The source of truth is `kwameandco/webstudio/plugins/<name>/<name>.js`. Fix it there — the workflow will push here automatically. Do not patch files in this repo directly.

## Creating a version tag
To pin a CDN URL (e.g. after a stable release):
```
git tag kw-filter-v1.5.0
git push origin kw-filter-v1.5.0
```
Use the format `<script-name>-v<semver>` so tags stay namespaced per script.

## CDN URL format
```
https://cdn.jsdelivr.net/gh/kwameandco/cdn@main/<folder>/<file>
https://cdn.jsdelivr.net/gh/kwameandco/cdn@<tag>/<folder>/<file>
```

## Related repos
- `kwameandco/webstudio` — source code and workflows that push here
