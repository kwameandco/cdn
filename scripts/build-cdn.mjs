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

if (CHECK) {
  console.log(`${added} file(s) would be added to versions/, ${conflicts} unbumped change(s).`);
  process.exit(added ? 1 : 0);
}

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
