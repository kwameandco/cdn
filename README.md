# kwameandco/cdn

Public CDN for static scripts and assets, served via jsDelivr.

This repo is **write-only for humans** — files are pushed here automatically by GitHub Actions workflows in other repos (primarily `kwameandco/webstudio`). You should never need to edit files here by hand.

---

## CDN URL format

```
https://cdn.jsdelivr.net/gh/kwameandco/cdn@main/<folder>/<file>
```

| Segment | Meaning |
|---|---|
| `kwameandco/cdn` | This repo |
| `@main` | Always serves the latest version on the main branch |
| `@v1.5.0` | Pin to a specific git tag (never changes) |

**Examples**

```
https://cdn.jsdelivr.net/gh/kwameandco/cdn@main/kw-filter/kw-filter.min.js
https://cdn.jsdelivr.net/gh/kwameandco/cdn@main/kw-filter/kw-filter.js
```

### Cache purge

jsDelivr caches `@main` for a few minutes. If a change isn't showing, purge it:

```
https://purge.jsdelivr.net/gh/kwameandco/cdn@main/<folder>/<file>
```

---

## Directory structure

```
cdn/
└── kw-filter/
    ├── kw-filter.js        ← unminified source (for debugging)
    └── kw-filter.min.js    ← minified (use this in production)
```

One folder per plugin or tool. Each folder should contain at minimum a minified file; include the unminified source too so it's inspectable from the browser.

---

## How to add a new script

### 1. Create the source file in webstudio

Add your script at:
```
kwameandco/webstudio/plugins/<script-name>/<script-name>.js
```

### 2. Create a workflow in webstudio

Create `.github/workflows/minify-<script-name>.yml`:

```yaml
name: Minify and publish <script-name>

on:
  push:
    branches:
      - main
    paths:
      - 'plugins/<script-name>/<script-name>.js'
  workflow_dispatch:

concurrency:
  group: minify-<script-name>
  cancel-in-progress: false

jobs:
  minify-and-publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Minify with Terser
        run: |
          npx --yes terser plugins/<script-name>/<script-name>.js \
            --output plugins/<script-name>/<script-name>.min.js \
            --compress \
            --mangle \
            --comments '/^!/'

      - name: Push to public CDN repo
        env:
          CDN_PUSH_TOKEN: ${{ secrets.CDN_PUSH_TOKEN }}
        run: |
          git clone "https://x-access-token:${CDN_PUSH_TOKEN}@github.com/kwameandco/cdn.git" cdn-repo
          mkdir -p cdn-repo/<script-name>
          cp plugins/<script-name>/<script-name>.js     cdn-repo/<script-name>/<script-name>.js
          cp plugins/<script-name>/<script-name>.min.js cdn-repo/<script-name>/<script-name>.min.js
          cd cdn-repo
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add <script-name>/
          if ! git diff --staged --quiet; then
            git commit -m "chore: sync <script-name> $(date -u +%Y-%m-%dT%H:%M:%SZ)"
            git pull --rebase origin main
            git push
          fi
```

Replace every `<script-name>` with your actual script name (e.g. `kw-carousel`).

### 3. Check the CDN_PUSH_TOKEN secret

The `CDN_PUSH_TOKEN` secret must exist in the **webstudio** repo settings (Settings → Secrets and variables → Actions). It is a **fine-grained personal access token** scoped to this repo (`kwameandco/cdn`) with **Contents: Read and Write**.

If the secret already exists for another script, no action needed — it's shared across all workflows.

### 4. Merge and verify

Push your script to `webstudio` main. The workflow runs automatically. After ~2 minutes, the file should be live at:

```
https://cdn.jsdelivr.net/gh/kwameandco/cdn@main/<script-name>/<script-name>.min.js
```

---

## Commit message format

Automated commits follow this pattern:

```
chore: sync <script-name> 2026-05-08T14:23:01Z
```

The timestamp is UTC ISO 8601 from the moment the workflow ran. This makes it easy to correlate a CDN push with the webstudio commit that triggered it.

---

## Pinning a version

To lock a URL to a specific point in time (e.g. for a production embed you don't want to auto-update):

1. Create a git tag on **this repo** at the current commit: `v1.5.0`, `kw-filter-v1.5.0`, etc.
2. Use the tag in the jsDelivr URL instead of `@main`:

```
https://cdn.jsdelivr.net/gh/kwameandco/cdn@kw-filter-v1.5.0/kw-filter/kw-filter.min.js
```

Tags are immutable and cached permanently by jsDelivr — the URL will never change.
