/**
 * kw-announcement v1.2.0
 * See README.md for attribute API and instructions.md for setup.
 *
 * Accepts both attribute schemes:
 *   • Plugin-native:  data-kw-announcement="<id>"        + data-kw-announcement-dismiss
 *   • Breeze legacy:  data-announcement data-announcement-id="<id>" + data-announcement-close
 *
 * Either may be mixed on the same element. The storage key
 * (`kw-announcement-dismissed`) is shared across both schemes.
 */
(function (win, doc) {
  'use strict';

  if (win.kwAnnouncement) return;

  const _cs = doc.currentScript;
  const DEBUG = (_cs?.hasAttribute('data-debug') ?? false) || !!win.kwAnnouncementDebug;

  function log(...a)  { if (DEBUG) console.log('[kw-announcement]', ...a); }
  function warn(...a) { if (DEBUG) console.warn('[kw-announcement]', ...a); }

  /* ── Constants ──────────────────────────────────────────────────────────── */
  const VERSION         = '1.2.0';
  const STORAGE_KEY     = 'kw-announcement-dismissed';
  const SELECTOR        = '[data-kw-announcement], [data-announcement]';
  const DISMISS_SEL     = '[data-kw-announcement-dismiss], [data-announcement-close]';
  const DEFAULT_EXPIRY_DAYS = 30;
  const DAY_MS          = 24 * 60 * 60 * 1000;

  /* ── Banner attribute helpers ───────────────────────────────────────────── */
  // Resolve the dismissal id for a banner from any of the supported attributes.
  function getBannerId(banner) {
    return (
      banner.getAttribute('data-kw-announcement') ||
      banner.getAttribute('data-announcement-id') ||
      banner.getAttribute('data-announcement') ||
      banner.id ||
      ''
    ).trim();
  }

  // Per-banner expiry override; falls back to the 30-day default.
  function getBannerExpiryMs(banner) {
    const raw =
      banner.getAttribute('data-kw-announcement-expiry-days') ??
      banner.getAttribute('data-announcement-expiry-days');
    const n = parseInt(raw, 10);
    return (Number.isFinite(n) && n > 0 ? n : DEFAULT_EXPIRY_DAYS) * DAY_MS;
  }

  function getBannerStart(banner) {
    return parseAttrDate(
      banner.getAttribute('data-kw-announcement-start') ||
      banner.getAttribute('data-announcement-start')
    );
  }

  function getBannerEnd(banner) {
    return parseAttrDate(
      banner.getAttribute('data-kw-announcement-end') ||
      banner.getAttribute('data-announcement-end')
    );
  }

  /* ── Storage helpers ────────────────────────────────────────────────────── */
  // Returns the raw stored array, migrating any legacy plain-string entries to
  // the {id, at} object format introduced in v1.1.0.
  function _loadRaw() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.map(entry =>
        typeof entry === 'string' ? { id: entry, at: Date.now() } : entry
      );
    } catch { return []; }
  }

  // True if `id` has a non-expired dismissal entry, using this banner's expiry window.
  function isDismissed(id, expiryMs) {
    const now = Date.now();
    return _loadRaw().some(e => e.id === id && (now - e.at) < expiryMs);
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

  /* ── Show / hide ────────────────────────────────────────────────────────── */
  // We integrate with Breeze CSS:
  //   .show-announcement [data-announcement] { display: flex; }
  //   [data-global-header] { padding-top: var(--announcement-height); }
  // so we toggle the class on <html> and keep --announcement-height in sync.
  function anyVisibleBanner() {
    return Array.from(doc.querySelectorAll(SELECTOR)).some(b => !b.hidden);
  }

  function updateHtmlState() {
    const visible = anyVisibleBanner();
    const html = doc.documentElement;
    html.classList.toggle('show-announcement', visible);
    if (!visible) {
      html.style.setProperty('--announcement-height', '0px');
    } else {
      // Use the tallest visible banner's height. Run on next frame so layout
      // has settled after we cleared `hidden`.
      requestAnimationFrame(() => {
        let max = 0;
        doc.querySelectorAll(SELECTOR).forEach(b => {
          if (!b.hidden) max = Math.max(max, b.offsetHeight);
        });
        html.style.setProperty('--announcement-height', max + 'px');
      });
    }
  }

  function showBanner(banner) {
    banner.hidden = false;
    banner.removeAttribute('data-hidden');
    updateHtmlState();
  }

  function hideBanner(banner) {
    banner.hidden = true;
    banner.setAttribute('data-hidden', 'true');
    updateHtmlState();
  }

  /* ── Core: initialise a single banner ──────────────────────────────────── */
  const initialized = new WeakSet();

  function initBanner(banner) {
    if (initialized.has(banner)) return;

    const id = getBannerId(banner);
    if (!id) {
      warn('initBanner: missing id on', banner);
      return;
    }

    initialized.add(banner);

    const expiryMs = getBannerExpiryMs(banner);

    if (isDismissed(id, expiryMs)) {
      hideBanner(banner);
      log(`"${id}": previously dismissed (within expiry window) — hiding`);
      return;
    }

    const now   = Date.now();
    const start = getBannerStart(banner);
    const end   = getBannerEnd(banner);

    if (start && now < start.getTime()) {
      hideBanner(banner);
      log(`"${id}": not yet active (starts ${start.toISOString()})`);
      return;
    }
    if (end && now > end.getTime()) {
      hideBanner(banner);
      log(`"${id}": expired (ended ${end.toISOString()})`);
      return;
    }

    showBanner(banner);

    banner.querySelectorAll(DISMISS_SEL).forEach((btn) => {
      btn.addEventListener('click', () => dismissBanner(id, banner));
    });

    log(`"${id}": initialised`);
    banner.dispatchEvent(new CustomEvent('kw-announcement:init', { bubbles: true, detail: { id } }));
  }

  /* ── Dismiss ────────────────────────────────────────────────────────────── */
  function dismissBanner(id, banner) {
    const expiryMs = banner ? getBannerExpiryMs(banner) : DEFAULT_EXPIRY_DAYS * DAY_MS;
    const raw = _loadRaw().filter(e => (Date.now() - e.at) < expiryMs || e.id !== id);
    if (!raw.some(e => e.id === id)) {
      raw.push({ id, at: Date.now() });
      saveDismissed(raw);
    }
    if (banner) hideBanner(banner);
    log(`"${id}": dismissed`);
    if (banner) {
      banner.dispatchEvent(new CustomEvent('kw-announcement:dismissed', { bubbles: true, detail: { id } }));
    }
  }

  /* ── Scan DOM ───────────────────────────────────────────────────────────── */
  function scan() {
    const banners = doc.querySelectorAll(SELECTOR);
    log(`scan: found ${banners.length} banner(s)`);
    banners.forEach(initBanner);
    updateHtmlState();
  }

  /* ── Boot ───────────────────────────────────────────────────────────────── */
  function init() {
    log('init: starting');
    scan();

    new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches?.(SELECTOR)) initBanner(node);
          node.querySelectorAll?.(SELECTOR).forEach(initBanner);
        }
      }
    }).observe(doc.body, { childList: true, subtree: true });

    // Keep --announcement-height accurate if the banner reflows (e.g. font swap).
    win.addEventListener('resize', updateHtmlState);

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

    dismiss(id) {
      const banner = doc.querySelector(
        `[data-kw-announcement="${id}"], [data-announcement-id="${id}"], [data-announcement="${id}"]`
      );
      if (banner) { dismissBanner(id, banner); return; }
      const raw = _loadRaw().filter(e => (Date.now() - e.at) < DEFAULT_EXPIRY_DAYS * DAY_MS);
      if (!raw.some(e => e.id === id)) { raw.push({ id, at: Date.now() }); saveDismissed(raw); }
      log(`"${id}": dismissed (no element found, wrote to storage)`);
    },

    reset(id) {
      if (id) {
        saveDismissed(_loadRaw().filter(e => e.id !== id));
        log(`reset: cleared "${id}"`);
      } else {
        saveDismissed([]);
        log('reset: cleared all dismissed ids');
      }
      doc.querySelectorAll(SELECTOR).forEach((b) => { initialized.delete(b); initBanner(b); });
    },

    scan,
  };

}(window, document));
