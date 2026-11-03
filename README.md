# kwameandco/cdn

Public CDN for the `kw-*` plugins, served from **`https://cdn.kwameand.co`** (our own domain:
a Cloudflare Worker with static assets) and, as a fallback until every site has moved, from
jsDelivr.

## cdn.kwameand.co

```
https://cdn.kwameand.co/<plugin>/<major>/<file>      cached for 5 minutes, newest release of that major (the default)
https://cdn.kwameand.co/<plugin>/<version>/<file>    cached for a year, never changes (pin)
https://cdn.kwameand.co/<plugin>/latest/<file>       cached for 5 minutes, follows the newest build (testing only)
```

**Which one goes in an embed.** Client embeds on Webflow, Webstudio and Squarespace use the
**major-version channel**, for example `https://cdn.kwameand.co/kw-filter/1/kw-filter.min.js`
(decided 2026-11-03). Fixes and features inside `1.x.y` reach every site within about five minutes
with no per-site edit. A breaking change is released as `2.0.0`, which appears at `/2/` and never
moves `/1/`, so no site changes behaviour unless someone edits its embed on purpose. **Pin an exact
version** (`/kw-filter/1.6.1/...`) only when a site must not move at all; the cost is that every
update to that site is a manual edit. `/latest/` is for testing on a staging page, never on a client
page. Channels and `latest` need no purge: they are just a short cache. Versioned paths need none
either.

**Channel rules.** A channel `/<plugin>/<major>/<file>` serves the newest archived release of that
file whose major number is `<major>`, decided per file (a plugin's JS and CSS can be on different
releases). Only real release banners count: a banner-less `0.0.0-<hash>` file, a prerelease such as
`1.7.0-beta.1`, and any `0.x.y` release get no channel (`0.x` promises no compatibility). A new major
never moves an older channel. So **a breaking change must bump the major in the banner**; if it
ships as a minor, every site on that channel breaks at once. A bad non-breaking release also reaches
every site at once; the rollback is to republish the previous code as a new, higher patch (the archive
is append-only, so the bad version stays at its own URL). Because the file behind a channel moves,
**SRI (`integrity=`) cannot be used on a channel URL**; it still works on a pinned version. What a
channel serves right now is in [`index.json`](./index.json) (`channels` on each file).

**Versions.** Each file's version is read from its own banner, the semver after the plugin name
near the top of the unminified source (`/*! kw-filter v1.6.1 */`). The JS and CSS of one plugin
can carry different versions, and a `.min.*` file shares its source's. A file with no banner gets
`0.0.0-<hash>` from its contents, so it is still immutable. To see what exists, browse
[`versions/`](./versions).

**How old versions survive.** `scripts/build-cdn.mjs` copies each file into the committed
`versions/<plugin>/<version>/` folder the first time that version appears, and never overwrites
it. Each deploy uploads that whole archive plus a fresh `latest/` and the channel copies (made into
`dist/` from the archive, never written into `versions/`), so no version ever disappears.
If a file changes without a banner bump, the archived copy is kept, `latest` gets the change and
the workflow run shows a warning: bump the banner in `kwameandco/clients`.

**Headers.** Every file: `Access-Control-Allow-Origin: *`, `X-Content-Type-Options: nosniff`,
`Cross-Origin-Resource-Policy: cross-origin`, `X-Robots-Tag: noindex`, no cookies. `Cache-Control` is
a year and `immutable` for versioned paths, `max-age=300` for `latest` and for each channel (the
build writes one `_headers` rule per channel, such as `/kw-filter/1/*`, because a wildcard like
`/:plugin/:major/*` would also match version folders; the build fails past 90 rules, Cloudflare's
limit being 100). A missing file
is a `404` with `Cache-Control: no-store`.

**Deploy.** The publish workflow's last step runs `npx wrangler deploy`, using the repo secrets
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Without them it skips with a notice and the
jsDelivr publish is unaffected. One-time setup: [`CLOUDFLARE.md`](./CLOUDFLARE.md).

### Self-hosted on Astro sites: `index.json` and `renovate/`

Astro sites do not load plugins from any CDN. Each one pins plugin files in its own
`plugins.json`, downloads them **at build time** from
`https://raw.githubusercontent.com/kwameandco/cdn/main/versions/<plugin>/<version>/<file>`, checks
each file's sha256, and serves it from its own domain. A visitor's browser never talks to us,
GitHub or jsDelivr, so there is no CDN processor at all. How a site does it:
`kwameandco/site-starter` → `docs/PLUGINS.md`.

Two derived outputs here make that work. `scripts/build-cdn.mjs` rewrites both from `versions/`
on every run (they live outside `versions/` because they change; `versions/` never does):

- **`index.json`**: every plugin file, every archived version, its sha256, the newest banner
  version (`latest`) and the `channels` map (major number to the release it serves). Read it to pin
  a file by hand or to see what `/1/` serves.
- **`renovate/<plugin>/<file>.json`**: one per plugin file, in Renovate's
  [custom datasource](https://docs.renovatebot.com/modules/datasource/custom/) format
  (`{"releases": [{"version", "digest"}]}`, the digest being the sha256). A site's Renovate reads
  these and opens a PR that bumps version **and** sha256 together. Banner-less `0.0.0-<hash>`
  versions are left out, since a hash has no order: give a plugin a banner to get update PRs.

`node scripts/build-cdn.mjs --check` also fails if either is out of date.

### Processors

| Vendor | Personal data | Where | Transfer basis | DPA |
|---|---|---|---|---|
| Cloudflare (cdn.kwameand.co) | Visitor IP and request headers, in transit only. Worker logs, traces and observability are off, so we store none. | Global edge network | EU SCCs and UK addendum in Cloudflare's DPA; Cloudflare is also certified under the EU-US Data Privacy Framework | https://www.cloudflare.com/cloudflare-customer-dpa/ |
| jsDelivr (fallback, being retired) | Visitor IP on every page load | Global (multi-CDN) | None in place | None. This is why we are moving off it. |
| GitHub | None of visitors'. Hosts this repo's source. | US | n/a for visitor data | n/a |

Whether a cross-origin request to our own Cloudflare-hosted CDN needs consent is each client's
call to confirm (`kwameandco/clients` → `tasks/open/44`). We think it does not, because
Cloudflare is our processor under contract.

---

## jsDelivr (fallback)

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
├── kw-filter/
│   ├── kw-filter.js        ← unminified source (for debugging)
│   └── kw-filter.min.js    ← minified (use this in production)
├── versions/               ← immutable archive for cdn.kwameand.co; never edit or delete
│   └── kw-filter/1.6.1/kw-filter.min.js
├── scripts/build-cdn.mjs   ← archives new versions, builds dist/ (gitignored) + _headers
├── src/not-found.js        ← the only Worker code: an uncacheable 404 for misses
├── wrangler.jsonc          ← the kwameandco-cdn Worker, custom domain cdn.kwameand.co
└── CLOUDFLARE.md           ← one-time setup: API token, secrets, domain, checks
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
