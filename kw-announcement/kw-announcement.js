/**
 * kw-announcement v1.0.0
 * See README.md for attribute API.
 */
(function (win, doc) {
  'use strict';

  if (win.kwAnnouncement) return;

  const _cs = doc.currentScript;
  const DEBUG = (_cs?.hasAttribute('data-debug') ?? false) || !!win.kwAnnouncementDebug;

  function log(...a)  { if (DEBUG) console.log('[kw-announcement]', ...a); }
  function warn(...a) { if (DEBUG) console.warn('[kw-announcement]', ...a); }

  /* ── Constants ──────────────────────────────────────────────────────────── */
  const VERSION     = '1.0.0';
  const STORAGE_KEY = 'kw-announcement-dismissed';
  const ATTR        = 'data-kw-announcement';

  /* ── Storage helpers ────────────────────────────────────────────────────── */
  function getDismissed() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
  }

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
  const initialized = new WeakSet();

  function initBanner(banner) {
    if (initialized.has(banner)) return;

    const id = banner.getAttribute(ATTR);
    if (!id) {
      warn('initBanner: missing id value on', banner);
      return;
    }

    initialized.add(banner);

    // Already dismissed → hide immediately
    if (getDismissed().includes(id)) {
      banner.hidden = true;
      log(`"${id}": previously dismissed — hiding`);
      return;
    }

    // Scheduled window check
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

    // Wire up dismiss button(s)
    banner.querySelectorAll('[data-kw-announcement-dismiss]').forEach((btn) => {
      btn.addEventListener('click', () => dismissBanner(id, banner));
    });

    log(`"${id}": initialised`);
    banner.dispatchEvent(new CustomEvent('kw-announcement:init', { bubbles: true, detail: { id } }));
  }

  /* ── Dismiss ────────────────────────────────────────────────────────────── */
  function dismissBanner(id, banner) {
    const list = getDismissed();
    if (!list.includes(id)) {
      list.push(id);
      saveDismissed(list);
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

    // Watch for CMS / React-rendered banners added after initial parse
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

    // Programmatically dismiss a banner by id
    dismiss(id) {
      const banner = doc.querySelector(`[${ATTR}="${id}"]`);
      if (banner) { dismissBanner(id, banner); return; }
      // Banner not in DOM yet — write to storage directly so it stays dismissed
      const list = getDismissed();
      if (!list.includes(id)) { list.push(id); saveDismissed(list); }
      log(`"${id}": dismissed (no element found, wrote to storage)`);
    },

    // Clear one id (or all) from dismissed storage and re-scan
    reset(id) {
      if (id) {
        saveDismissed(getDismissed().filter((d) => d !== id));
        log(`reset: cleared "${id}"`);
        // Re-init the banner if it's in the DOM
        const banner = doc.querySelector(`[${ATTR}="${id}"]`);
        if (banner) { initialized.delete(banner); initBanner(banner); }
      } else {
        saveDismissed([]);
        log('reset: cleared all dismissed ids');
        doc.querySelectorAll(`[${ATTR}]`).forEach((b) => { initialized.delete(b); initBanner(b); });
      }
    },

    // Re-scan the page (useful after CMS content loads)
    scan,
  };

}(window, document));
