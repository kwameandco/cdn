#!/usr/bin/env node
// Builds the tree that cdn.kwameand.co serves. Node 18+, no dependencies.
//
//   node scripts/build-cdn.mjs            snapshot new versions into versions/, then build dist/
//   node scripts/build-cdn.mjs --check    report what would change, write nothing, exit 1 if anything would
//
// Two outputs:
//
//   versions/<plugin>/<version>/<file>   COMMITTED. The immutable archive. A file is written here
//                                        once and never touched again, so every versioned URL keeps
//                                        working for ever even though dist/ is rebuilt from scratch
//                                        on every run. Never delete or edit anything under it.
//   index.json                           COMMITTED, REWRITTEN EVERY RUN (derived from versions/): every
//                                        plugin file, every archived version, and its sha256. What an
//                                        agent or a site's fetch script reads to pin a version.
//   renovate/<plugin>/<file>.json        COMMITTED, REWRITTEN EVERY RUN: the same, one file per plugin
//                                        file, in Renovate's custom-datasource format ({releases:
//                                        [{version, digest}]}). Astro sites self-host plugins pinned in
//                                        their plugins.json; Renovate reads these to open update PRs.
//                                        Banner-less 0.0.0-<hash> versions are left out: a hash has no
//                                        order, so Renovate could "upgrade" to an older file.
//                                        Both live OUTSIDE versions/ because they change; versions/ never does.
//   dist/                                GITIGNORED. What wrangler uploads: versions/ copied as is,
//                                        plus <plugin>/latest/<file> from the current kw-*/ folders,
//                                        plus the _headers file.
//
// Versioning rule (per file, not per plugin: kw-giftshop.js and kw-giftshop.css carry different
// versions):
//   1. Read the first 2,000 characters of the unminified source (kw-x.min.js is versioned from
//      kw-x.js, so a source and its minified build always share a folder).
//   2. Look for the plugin's own name followed by a semver: `kw-filter v1.6.1`, `kw-filter.js v1.6.1`.
//      Both banner styles in use match (`/*! kw-x v1.2.3 */` and the ` * kw-x v1.2.3` docblock).
//      The name anchor stops a stray "v2" in prose, or a dependency's version, from being read.
//   3. No banner: the version is `0.0.0-<first 10 hex of sha256 of the source>`. Still immutable
//      (new content = new folder), still sorts below any real release, and says plainly that the
//      file has no banner yet.
//
// If a version folder already holds a file with different bytes (someone changed the source and
// forgot to bump the banner, or a newer terser minified it differently), the archived copy WINS:
// a versioned URL must never change. latest/ still gets the new bytes. The run prints a GitHub
// Actions warning naming the file, so the missed bump is visible; it does not fail the publish.

import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERSIONS = join(ROOT, 'versions');
const DIST = join(ROOT, 'dist');
const CHECK = process.argv.includes('--check');

const SHORT_CACHE = 'public, max-age=300';
const LONG_CACHE = 'public, max-age=31536000, immutable';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function versionOf(plugin, sourceText) {
  const head = sourceText.slice(0, 2000);
  const re = new RegExp(
    `${escapeRe(plugin)}(?:\\.(?:min\\.)?(?:js|css))?\\s+v(\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?)\\b`,
  );
  const m = head.match(re);
  if (m) return m[1];
  return '0.0.0-' + createHash('sha256').update(sourceText).digest('hex').slice(0, 10);
}

const isDir = (p) => statSync(p).isDirectory();
const plugins = readdirSync(ROOT)
  .filter((n) => /^kw-[a-z0-9-]+$/.test(n) && isDir(join(ROOT, n)))
  .sort();

const warn = (msg) => console.log(`::warning::${msg}`);
let added = 0;
let conflicts = 0;
const latest = []; // [plugin, file]

for (const plugin of plugins) {
  const dir = join(ROOT, plugin);
  const files = readdirSync(dir).filter((f) => /\.(js|css)$/.test(f) && !isDir(join(dir, f))).sort();
  for (const file of files) {
    const bytes = readFileSync(join(dir, file));
    const sourceName = file.replace(/\.min\.(js|css)$/, '.$1');
    const sourcePath = join(dir, sourceName);
    const sourceText = existsSync(sourcePath) ? readFileSync(sourcePath, 'utf8') : bytes.toString('utf8');
    const version = versionOf(plugin, sourceText);
    latest.push([plugin, file]);

    const target = join(VERSIONS, plugin, version, file);
    if (!existsSync(target)) {
      console.log(`${CHECK ? 'would add' : 'add'}: versions/${plugin}/${version}/${file}`);
      if (!CHECK) {
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, bytes);
      }
      added++;
    } else if (!readFileSync(target).equals(bytes)) {
      conflicts++;
      warn(
        `${plugin}/${file} changed but its version is still ${version}. ` +
          `/${plugin}/${version}/${file} keeps the archived copy; /${plugin}/latest/ gets the new one. ` +
          `Bump the banner in kwameandco/clients/plugins/${plugin}/${sourceName}.`,
      );
    }
  }
}

// ---- index.json and renovate/ feeds, derived from versions/ (plus what would be added in --check) ----

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const isBannerVersion = (v) => SEMVER.test(v) && !v.startsWith('0.0.0-');
function compareSemver(a, b) {
  const [, a1, a2, a3, ap] = a.match(SEMVER);
  const [, b1, b2, b3, bp] = b.match(SEMVER);
  for (const [x, y] of [[a1, b1], [a2, b2], [a3, b3]]) if (+x !== +y) return +x - +y;
  if (ap === bp) return 0;
  if (!ap) return 1; // a release sorts above its prereleases
  if (!bp) return -1;
  return ap < bp ? -1 : 1;
}
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function buildIndex() {
  const index = {}; // plugin -> file -> version -> sha256
  if (existsSync(VERSIONS)) {
    for (const plugin of readdirSync(VERSIONS).filter((n) => isDir(join(VERSIONS, n))).sort()) {
      for (const version of readdirSync(join(VERSIONS, plugin)).filter((n) => isDir(join(VERSIONS, plugin, n)))) {
        for (const file of readdirSync(join(VERSIONS, plugin, version)).sort()) {
          ((index[plugin] ??= {})[file] ??= {})[version] = sha256(readFileSync(join(VERSIONS, plugin, version, file)));
        }
      }
    }
  }
  const out = {}; // relative path -> text
  const plugins = {};
  for (const plugin of Object.keys(index).sort()) {
    plugins[plugin] = {};
    for (const file of Object.keys(index[plugin]).sort()) {
      const all = index[plugin][file];
      const banner = Object.keys(all).filter(isBannerVersion).sort(compareSemver);
      const versions = {};
      for (const v of [...banner, ...Object.keys(all).filter((v) => !isBannerVersion(v)).sort()]) versions[v] = all[v];
      plugins[plugin][file] = { latest: banner.at(-1) ?? null, versions };
      out[`renovate/${plugin}/${file}.json`] =
        JSON.stringify(
          {
            sourceUrl: 'https://github.com/kwameandco/cdn',
            homepage: `https://github.com/kwameandco/cdn/tree/main/versions/${plugin}`,
            releases: banner.map((version) => ({ version, digest: all[version] })),
          },
          null,
          2,
        ) + '\n';
    }
  }
  out['index.json'] =
    JSON.stringify(
      {
        about:
          'Every archived kw-* plugin file and its sha256, derived from versions/ by scripts/build-cdn.mjs. ' +
          'File URL: https://raw.githubusercontent.com/kwameandco/cdn/main/versions/<plugin>/<version>/<file> ' +
          '(build time) or https://cdn.kwameand.co/<plugin>/<version>/<file>. "latest" ignores banner-less 0.0.0-<hash> versions.',
        plugins,
      },
      null,
      2,
    ) + '\n';
  return out;
}

function writeIndex() {
  const out = buildIndex();
  let stale = 0;
  const wanted = new Set(Object.keys(out));
  // Remove feeds whose file no longer exists in versions/ (cannot happen while versions/ is append-only,
  // but keeps renovate/ an exact function of versions/).
  if (existsSync(join(ROOT, 'renovate'))) {
    for (const p of readdirSync(join(ROOT, 'renovate'), { recursive: true })) {
      const rel = `renovate/${p}`.replace(/\\/g, '/');
      if (!isDir(join(ROOT, rel)) && !wanted.has(rel)) {
        stale++;
        if (!CHECK) rmSync(join(ROOT, rel));
      }
    }
  }
  for (const [rel, text] of Object.entries(out)) {
    const target = join(ROOT, rel);
    if (existsSync(target) && readFileSync(target, 'utf8') === text) continue;
    stale++;
    if (!CHECK) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, text);
    }
  }
  return stale;
}

if (CHECK) {
  // In --check, versions/ has not been written, so the index is checked against the archive as it is.
  const stale = writeIndex();
  console.log(
    `${added} file(s) would be added to versions/, ${conflicts} unbumped change(s), ` +
      `${stale} index/feed file(s) out of date.`,
  );
  process.exit(added || stale ? 1 : 0);
}

const staleIndex = writeIndex();
console.log(`index.json and renovate/: ${staleIndex} file(s) written.`);

// dist/ from scratch: the archive, then latest/, then _headers.
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
if (existsSync(VERSIONS)) cpSync(VERSIONS, DIST, { recursive: true });
for (const [plugin, file] of latest) {
  const target = join(DIST, plugin, 'latest', file);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(join(ROOT, plugin, file), target);
}

// Header rules. Every matching rule applies and repeated headers are comma-joined, so the latest/
// rule detaches the long Cache-Control before setting the short one. Two path rules only, so the
// 100-rule limit never comes into it however many versions pile up. Content-Type is Cloudflare's
// own (text/javascript, text/css), from the extension.
writeFileSync(
  join(DIST, '_headers'),
  [
    '/*',
    `  Cache-Control: ${LONG_CACHE}`,
    '  Access-Control-Allow-Origin: *',
    '  X-Content-Type-Options: nosniff',
    '  Cross-Origin-Resource-Policy: cross-origin',
    '  X-Robots-Tag: noindex',
    '',
    '/:plugin/latest/*',
    '  ! Cache-Control',
    `  Cache-Control: ${SHORT_CACHE}`,
    '',
  ].join('\n'),
);

const count = (d) => readdirSync(d, { recursive: true }).filter((p) => !isDir(join(d, p))).length;
console.log(
  `dist/ built: ${plugins.length} plugins, ${latest.length} latest files, ` +
    `${existsSync(VERSIONS) ? count(VERSIONS) : 0} archived files; ${added} newly archived, ${conflicts} unbumped change(s).`,
);
