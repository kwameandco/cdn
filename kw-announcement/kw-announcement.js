/**
 * kw-announcement v1.1.0
 * See README.md for attribute API and instructions.md for setup.
 */
(function (win, doc) {
  'use strict';

  // Guard against double-initialisation (e.g. script loaded twice).
  if (win.kwAnnouncement) return;

  // currentScript is only accessible synchronously during script execution.
  const _cs = doc.currentScript;
  const DEBUG = (_cs?.hasAttribute('data-debug') ?? false) || !!win.kwAnnouncementDebug;

  function log(...a)  { if (DEBUG) console.log('[kw-announcement]', ...a); }
  function warn(...a) { if (DEBUG) console.warn('[kw-announcement]', ...a); }

  /* ── Constants ──────────────────────────────────────────────────────────── */
  const VERSION     = '1.1.0';
  const STORAGE_KEY = 'kw-announcement-dismissed';
  const ATTR        = 'data-kw-announcement';
  // Dismissed banners re-appear after 30 days so stale announcements never
  // permanently block future content sharing the same ID prefix.
  const EXPIRY_MS   = 30 * 24 * 60 * 60 * 1000;

  /* ── Storage helpers ────────────────────────────────────────────────────── */
  // Returns the raw stored array, migrating any legacy plain-string entries to
  // the {id, at} object format introduced in v1.1.0.
  function _loadRaw() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.map(entry =>
        typeof entry === 'string'
          // Legacy format — treat as dismissed right now so it still hides on
          // first load but will expire in 30 days from the migration moment.
          ? { id: entry, at: Date.now() }
          : entry
      );
    } catch { return []; }
  }

  // Returns the set of IDs that are currently dismissed and not yet expired.
  function getDismissed() {
    const now = Date.now();
    return _loadRaw()
      .filter(e => (now - e.at) < EXPIRY_MS)
      .map(e => e.id);
  }

  // Persists the full object array (with timestamps) to localStorage.
  function saveDismissed(list) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
  }

  /* ── Date helpers ───────────────────────────────────────────────────────── */
  function parseAttrDate(str) {
    if (!str) return null;
    const d = new Date(str.trim());
    return isNaN(d) ? null : d;
  }

  /* ── Core: initialise a single banner ──────────────────────────────────── */
  // WeakSet prevents re-initialising banners that have already been wired up
  // (e.g. when the MutationObserver fires for an element already in the DOM).
  const initialized = new WeakSet();

  function initBanner(banner) {
    if (initialized.has(banner)) return;

    const id = banner.getAttribute(ATTR);
    if (!id) {
      warn('initBanner: missing id value on', banner);
      return;
    }

    initialized.add(banner);

    // Check expiry-aware dismissed list — hide immediately if already dismissed.
    if (getDismissed().includes(id)) {
      banner.hidden = true;
      log(`"${id}": previously dismissed (within expiry window) — hiding`);
      return;
    }

    // Scheduling window: hide the banner if we're outside [start, end].
    const now   = Date.now();
    const start = parseAttrDate(banner.getAttribute('data-kw-announcement-start'));
    const end   = parseAttrDate(banner.getAttribute('data-kw-announcement-end'));

    if (start && now < start.getTime()) {
      banner.hidden = true;
      log(`"${id}": not yet active (starts ${start.toISOString()})`);
      return;
    }
    if (end && now > end.getTime()) {
      banner.hidden = true;
      log(`"${id}": expired (ended ${end.toISOString()})`);
      return;
    }

    banner.hidden = false;

    // Wire dismiss trigger(s) — any descendant with the dismiss attribute.
    banner.querySelectorAll('[data-kw-announcement-dismiss]').forEach((btn) => {
      btn.addEventListener('click', () => dismissBanner(id, banner));
    });

    log(`"${id}": initialised`);
    banner.dispatchEvent(new CustomEvent('kw-announcement:init', { bubbles: true, detail: { id } }));
  }

  /* ── Dismiss ────────────────────────────────────────────────────────────── */
  function dismissBanner(id, banner) {
    // Load current raw list (non-expired entries only) then append this dismissal.
    const raw = _loadRaw().filter(e => (Date.now() - e.at) < EXPIRY_MS);
    if (!raw.some(e => e.id === id)) {
      raw.push({ id, at: Date.now() });
      saveDismissed(raw);
    }
    banner.hidden = true;
    log(`"${id}": dismissed`);
    banner.dispatchEvent(new CustomEvent('kw-announcement:dismissed', { bubbles: true, detail: { id } }));
  }

  /* ── Scan DOM ───────────────────────────────────────────────────────────── */
  function scan() {
    const banners = doc.querySelectorAll(`[${ATTR}]`);
    log(`scan: found ${banners.length} banner(s)`);
    banners.forEach(initBanner);
  }

  /* ── Boot ───────────────────────────────────────────────────────────────── */
  function init() {
    log('init: starting');
    scan();

    // Watch for banners injected after initial parse (CMS / React hydration).
    new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.hasAttribute(ATTR)) initBanner(node);
          node.querySelectorAll(`[${ATTR}]`).forEach(initBanner);
        }
      }
    }).observe(doc.body, { childList: true, subtree: true });

    log('init: complete');
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ── Public API ─────────────────────────────────────────────────────────── */
  win.kwAnnouncement = {
    version: VERSION,

    // Programmatically dismiss a banner by id.
    dismiss(id) {
      const banner = doc.querySelector(`[${ATTR}="${id}"]`);
      if (banner) { dismissBanner(id, banner); return; }
      // Banner not in DOM — write directly to storage so it stays dismissed on next render.
      const raw = _loadRaw().filter(e => (Date.now() - e.at) < EXPIRY_MS);
      if (!raw.some(e => e.id === id)) { raw.push({ id, at: Date.now() }); saveDismissed(raw); }
      log(`"${id}": dismissed (no element found, wrote to storage)`);
    },

    // Clear one id (or all) from dismissed storage and re-show the banner(s).
    reset(id) {
      if (id) {
        saveDismissed(_loadRaw().filter(e => e.id !== id));
        log(`reset: cleared "${id}"`);
        const banner = doc.querySelector(`[${ATTR}="${id}"]`);
        if (banner) { initialized.delete(banner); initBanner(banner); }
      } else {
        saveDismissed([]);
        log('reset: cleared all dismissed ids');
        doc.querySelectorAll(`[${ATTR}]`).forEach((b) => { initialized.delete(b); initBanner(b); });
      }
    },

    // Re-scan the page — useful after CMS content loads.
    scan,
  };

}(window, document));
