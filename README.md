# kwameandco/cdn

Public CDN for static scripts and assets, served via jsDelivr.

This repo is **write-only for humans** — plugin files are written by this repo's own workflow, `.github/workflows/publish-plugins.yml`, which reads `kwameandco/clients/plugins/` and minifies from there. You should never need to edit plugin files here by hand.

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

jsDelivr caches `@main` for up to seven days and the publish workflow purges changed files automatically. If a change still isn't showing, purge by hand (best-effort — not every edge honours it):

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

### 1. Create the source in clients

Add your script at `kwameandco/clients/plugins/<script-name>/` — any number of top-level
`.js` and `.css` files. Every one of them is published (source and minified), so keep
non-shipping files in a subfolder or on another extension.

### 2. Merge to clients main, then run the publish workflow

In **this** repo: Actions → *Publish plugins to CDN* → Run workflow. Set `plugin` to the
folder name (or leave `all`), and tick `dry_run` first if you want to see the diff without
pushing. The same run can be started with `gh workflow run publish-plugins.yml` or the GitHub
MCP run-trigger tool. A daily schedule runs it too, so a merge is never stranded for more
than a day.

The workflow minifies with Terser (`--compress --mangle --comments '/^!/'`) and
lightningcss (`--minify`), commits only the files that changed, and purges jsDelivr for
them. It never deletes.

### 3. The secret

`CLIENTS_READ_TOKEN` must exist in **this** repo's settings (Settings → Secrets and
variables → Actions). It is a fine-grained personal access token scoped to
`kwameandco/clients` with **Contents: Read-only**. It is the only credential involved;
pushes to this repo use the workflow's own `GITHUB_TOKEN`.

### 4. Verify

After the run, the file is live at:

```
https://cdn.jsdelivr.net/gh/kwameandco/cdn@main/<script-name>/<script-name>.min.js
```

Read its `/*! … vX.Y.Z */` banner to confirm the version. If `@main` still serves the old
build, it is jsDelivr's edge cache (up to seven days, purges are best-effort) — pin a tag or
commit SHA on any page where that matters.

---

## Commit message format

Automated commits follow this pattern:

```
chore: sync <script-name> 2026-05-08T14:23:01Z
```

The timestamp is UTC ISO 8601 from the moment the workflow ran. This makes it easy to correlate a CDN push with the clients commit it was built from.

---

## Pinning a version

To lock a URL to a specific point in time (e.g. for a production embed you don't want to auto-update):

1. Create a git tag on **this repo** at the current commit: `v1.5.0`, `kw-filter-v1.5.0`, etc.
2. Use the tag in the jsDelivr URL instead of `@main`:

```
https://cdn.jsdelivr.net/gh/kwameandco/cdn@kw-filter-v1.5.0/kw-filter/kw-filter.min.js
```

Tags are immutable and cached permanently by jsDelivr — the URL will never change.
