/*! kw-popup v1.0.0 — https://github.com/kwameandco/clients */
/**
 * kw-popup v1.0.0
 * Scroll-triggered, dismissible promo popup for Webstudio/Webflow.
 * One script tag, no dependencies. See README.md and instructions.md.
 *
 * Behaviour (unchanged from the original breeze promo-popup):
 *   • Shows once the visitor scrolls past a % of the page.
 *   • Consent-gated: waits for a consent decision before arming (breeze cookie banner).
 *   • Remembers dismissal in localStorage and re-shows after N days, or immediately
 *     when the popup's content changes (data-popup-since token).
 *   • Escape closes; focus is moved into the popup and restored on close.
 *
 * Attribute scheme (on the popup wrapper element):
 *   data-popup                     marks the popup (required)
 *   data-popup-id="<id>"           storage key discriminator (default "default")
 *   data-popup-scroll="50"         scroll % that triggers the popup (default 50)
 *   data-popup-days="14"           days before a dismissed popup re-shows (default 14)
 *   data-popup-delay="0"           seconds to wait after the trigger before showing
 *   data-popup-since="<token>"     dismissal-reset token; change it to re-show to
 *                                  everyone who already dismissed (breeze binds this
 *                                  to the Airtable `modified` timestamp)
 *   data-popup-close   (on a child) any element with this attribute closes the popup
 *
 * Script-tag options:
 *   data-debug                     enable console logging
 *   data-consent-key="<key>"       localStorage key that signals a consent decision
 *                                  (default "breeze-consent-v1")
 *   data-no-consent                skip the consent gate entirely
 *   data-storage-key="<key>"       localStorage key for dismissal state
 *                                  (default "breeze-popup-state")
 */
(function (win, doc) {
  'use strict';

  if (win.kwPopup) return;

  const _cs = doc.currentScript;
  const DEBUG = (_cs?.hasAttribute('data-debug') ?? false) || !!win.kwPopupDebug;
  function log(...a)  { if (DEBUG) console.log('[kw-popup]', ...a); }
  function warn(...a) { if (DEBUG) console.warn('[kw-popup]', ...a); }

  /* ── Constants ──────────────────────────────────────────────────────────── */
  const VERSION     = '1.0.0';
  const SELECTOR    = '[data-popup]';
  const CLOSE_SEL   = '[data-popup-close]';
  const DAY_MS      = 24 * 60 * 60 * 1000;
  const YEAR_MS     = 365 * DAY_MS;

  const CONSENT_KEY = _cs?.getAttribute('data-consent-key') || 'breeze-consent-v1';
  const STORAGE_KEY = _cs?.getAttribute('data-storage-key') || 'breeze-popup-state';
  const SKIP_CONSENT = _cs?.hasAttribute('data-no-consent') ?? false;

  /* ── Storage helpers (shape: { [id]: { dismissedAt, since } }) ──────────── */
  function readState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
  }
  function writeState(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
  }

  /* ── Per-popup attribute helpers ────────────────────────────────────────── */
  function popupId(popup)     { return popup.getAttribute('data-popup-id') || 'default'; }
  function popupSince(popup)  { return popup.getAttribute('data-popup-since') || ''; }
  function popupThreshold(p)  { return parseInt(p.getAttribute('data-popup-scroll'), 10) || 50; }
  function popupReshowMs(p)   {
    const d = parseInt(p.getAttribute('data-popup-days'), 10);
    return (Number.isFinite(d) && d > 0 ? d : 14) * DAY_MS;
  }
  function popupDelayMs(p) {
    const n = parseInt(p.getAttribute('data-popup-delay'), 10);
    return (Number.isFinite(n) && n > 0 ? n : 0) * 1000;
  }

  // True if this popup is allowed to show right now (not within its dismissal window).
  function eligible(popup) {
    const entry = readState()[popupId(popup)];
    if (!entry) return true;
    if (entry.since !== popupSince(popup)) return true;   // content changed → re-show
    return (Date.now() - entry.dismissedAt) > popupReshowMs(popup);
  }

  /* ── Core: manage a single popup ────────────────────────────────────────── */
  const managed = new WeakSet();

  function initPopup(popup) {
    if (managed.has(popup)) return;
    managed.add(popup);

    const id = popupId(popup);
    let shown = false;
    let returnFocus = null;

    function show() {
      if (shown) return;
      shown = true;
      returnFocus = doc.activeElement;
      popup.setAttribute('data-state', 'visible');
      popup.setAttribute('aria-hidden', 'false');
      (popup.querySelector('.popup__close') || popup.querySelector(CLOSE_SEL))?.focus();
      teardown();
      log(`"${id}": shown`);
      popup.dispatchEvent(new CustomEvent('kw-popup:show', { bubbles: true, detail: { id } }));
    }

    function dismiss() {
      const s = readState();
      s[id] = { dismissedAt: Date.now(), since: popupSince(popup) };
      const cutoff = Date.now() - YEAR_MS;   // prune ancient entries
      Object.keys(s).forEach(k => { if (s[k].dismissedAt < cutoff) delete s[k]; });
      writeState(s);
      popup.setAttribute('data-state', 'hidden');
      popup.setAttribute('aria-hidden', 'true');
      teardown();
      returnFocus?.focus();
      log(`"${id}": dismissed`);
      popup.dispatchEvent(new CustomEvent('kw-popup:dismissed', { bubbles: true, detail: { id } }));
    }

    const threshold = popupThreshold(popup);
    const delayMs   = popupDelayMs(popup);

    function onScroll() {
      if (shown) return;
      const scrolled = win.scrollY + win.innerHeight;
      const pct = (scrolled / doc.documentElement.scrollHeight) * 100;
      if (pct >= threshold) {
        if (delayMs > 0) setTimeout(show, delayMs); else show();
      }
    }
    function onKeydown(e) {
      if (e.key === 'Escape' && popup.getAttribute('data-state') === 'visible') dismiss();
    }
    function teardown() {
      win.removeEventListener('scroll', onScroll);
    }

    popup.querySelectorAll(CLOSE_SEL).forEach(btn => btn.addEventListener('click', dismiss));
    doc.addEventListener('keydown', onKeydown);

    function arm() {
      if (!eligible(popup)) { log(`"${id}": suppressed (within dismissal window)`); return; }
      win.addEventListener('scroll', onScroll, { passive: true });
      onScroll();   // in case the page is already scrolled past the threshold
      log(`"${id}": armed (threshold ${threshold}%)`);
    }

    // Expose per-popup controls for the public API / events.
    popup.__kwPopup = { show, dismiss, arm };

    if (SKIP_CONSENT || hasConsentDecision()) {
      arm();
    } else {
      const iv = setInterval(() => {
        if (hasConsentDecision()) { clearInterval(iv); arm(); }
      }, 500);
      setTimeout(() => { clearInterval(iv); arm(); }, 2000);   // fail-open after 2s
    }
  }

  function hasConsentDecision() {
    try { return !!localStorage.getItem(CONSENT_KEY); } catch { return false; }
  }

  /* ── Scan / boot ────────────────────────────────────────────────────────── */
  function scan() {
    const popups = doc.querySelectorAll(SELECTOR);
    log(`scan: found ${popups.length} popup(s)`);
    popups.forEach(initPopup);
  }

  function init() {
    log('init: starting');
    scan();
    new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches?.(SELECTOR)) initPopup(node);
          node.querySelectorAll?.(SELECTOR).forEach(initPopup);
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
  function findPopup(id) {
    return Array.from(doc.querySelectorAll(SELECTOR))
      .find(p => popupId(p) === id) || null;
  }

  win.kwPopup = {
    version: VERSION,

    // Force-show a popup now (ignores scroll/eligibility). Handy in the Designer.
    show(id) {
      const p = id ? findPopup(id) : doc.querySelector(SELECTOR);
      if (p?.__kwPopup) p.__kwPopup.show(); else warn(`show: no popup "${id ?? ''}"`);
    },

    // Programmatically dismiss.
    dismiss(id) {
      const p = id ? findPopup(id) : doc.querySelector(SELECTOR);
      if (p?.__kwPopup) p.__kwPopup.dismiss(); else warn(`dismiss: no popup "${id ?? ''}"`);
    },

    // Clear dismissal state and re-arm. Omit id to clear everything.
    reset(id) {
      if (id) {
        const s = readState(); delete s[id]; writeState(s);
        log(`reset: cleared "${id}"`);
      } else {
        writeState({});
        log('reset: cleared all dismissal state');
      }
      doc.querySelectorAll(SELECTOR).forEach(p => {
        p.setAttribute('data-state', 'hidden');
        p.__kwPopup?.arm();
      });
    },

    scan,
  };

}(window, document));
