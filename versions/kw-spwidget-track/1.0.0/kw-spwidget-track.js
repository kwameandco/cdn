/*! kw-spwidget-track v1.0.0 — https://github.com/kwameandco/clients */
/**
 * kw-spwidget-track v1.0.0
 * Conversion tracking for the SimplePractice appointment widget, for Webflow
 * (and Webstudio / Squarespace / anywhere you can paste a script tag).
 * One script tag, no dependencies. See README.md and instructions.md.
 *
 * The problem it solves:
 *   The SimplePractice widget renders in a cross-origin iframe on clientsecure.me.
 *   The host page's URL never changes when a booking is submitted, so gtag has
 *   nothing to fire on and a "destination" conversion has no destination.
 *
 * How it works — the script plays two roles, from one site-wide tag:
 *   1. On the page carrying the widget, it listens for the iframe's postMessage
 *      ({ scope:"client-portal-iframe-to-origin", action:"appointmentRequested" }),
 *      stores a one-shot token in sessionStorage, and redirects to the thank-you page.
 *   2. On the thank-you page, it consumes that token and fires the conversion
 *      (dataLayer push, GA4 event, Google Ads conversion — whichever are configured).
 *      Because the token is consumed, a refresh or a shared link cannot re-count it.
 *
 *   It reads the raw postMessage rather than SimplePractice's onAppointmentRequest
 *   callback because spWidgetAutoBind() — the stock embed — builds its init() payload
 *   from data-spwidget-* attributes only and never passes callbacks. Listening to the
 *   message works with the stock embed, unmodified.
 *
 * Script-tag options:
 *   data-redirect="/thank-you"        where a booking sends the visitor (default /thank-you)
 *   data-contact-redirect="/path"     where a *contact form* submission goes; unset = ignored
 *   data-delay="0"                    ms to wait before navigating (lets SimplePractice's
 *                                     own confirmation screen show first)
 *   data-replace                      use history.replaceState semantics (Back skips the
 *                                     booking page) instead of a normal navigation
 *   data-no-query                     don't append ?booking=simplepractice&type=… to the URL
 *   data-ga-event="generate_lead"     GA4 event to fire on the thank-you page
 *   data-ads-conversion="AW-123/abc"  Google Ads conversion to fire on the thank-you page
 *   data-datalayer-event="<name>"     dataLayer event name (default kw_sp_booking)
 *   data-no-datalayer                 skip the dataLayer push entirely
 *   data-max-age="300"                seconds a pending token stays valid (default 300)
 *   data-storage-key="<key>"          sessionStorage key (default kw-spwidget-track)
 *   data-debug                        log every widget message and every decision
 *
 * Element options (on the widget button, or any ancestor of it):
 *   data-spt-redirect="/path"         per-button destination, overrides data-redirect.
 *                                     Use for per-clinician or per-service thank-you pages.
 */
(function (win, doc) {
  'use strict';

  if (win.kwSpwidgetTrack) return;

  const VERSION = '1.0.0';

  /* ── Script tag + config ────────────────────────────────────────────────── */
  // currentScript is null in module/deferred edge cases and when a site builder
  // re-injects the tag, so fall back to finding ourselves by src.
  const _cs = doc.currentScript || doc.querySelector('script[src*="kw-spwidget-track"]');
  const attr = (n, fallback) => _cs?.getAttribute(n) ?? fallback;
  const flag = (n) => _cs?.hasAttribute(n) ?? false;
  const int = (n, fallback) => {
    const v = parseInt(attr(n, ''), 10);
    return Number.isFinite(v) && v >= 0 ? v : fallback;
  };

  const CONFIG = {
    redirect:        attr('data-redirect', '/thank-you'),
    contactRedirect: attr('data-contact-redirect', null),
    delay:           int('data-delay', 0),
    replace:         flag('data-replace'),
    appendQuery:     !flag('data-no-query'),
    gaEvent:         attr('data-ga-event', null),
    adsConversion:   attr('data-ads-conversion', null),
    dataLayerEvent:  flag('data-no-datalayer') ? null : attr('data-datalayer-event', 'kw_sp_booking'),
    maxAgeMs:        int('data-max-age', 300) * 1000,
    storageKey:      attr('data-storage-key', 'kw-spwidget-track'),
    debug:           flag('data-debug') || !!win.kwSpwidgetTrackDebug
  };

  function log(...a)  { if (CONFIG.debug) console.log('[kw-spwidget-track]', ...a); }
  function warn(...a) { if (CONFIG.debug) console.warn('[kw-spwidget-track]', ...a); }

  // If neither lookup found the tag, every data-* option was silently ignored and the
  // defaults are in force. Warn loudly — this is not a debug-only condition, because
  // "it redirects to /thank-you and nothing I configured applies" is baffling otherwise.
  if (!_cs) {
    console.warn('[kw-spwidget-track] could not locate its own <script> tag — all data-* ' +
                 'options ignored, running on defaults. Check the tag src contains ' +
                 '"kw-spwidget-track" if you renamed or inlined the file.');
  }

  /* ── Constants ──────────────────────────────────────────────────────────── */
  // Deliberately stricter than the allow-list inside integration-1.0.js, which also
  // permits localhost and "*-clientsecure.me" dev hosts. Without an origin check, any
  // third-party iframe on the page could fake a conversion by posting this shape.
  const TRUSTED_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*(clientsecure\.me|clientsite\.me)$/i;
  const SCOPE          = 'client-portal-iframe-to-origin';
  const BOOKING        = 'appointmentRequested';
  const CONTACT        = 'contactFormSubmitted';
  // Set, not an object literal: a bare object inherits Object.prototype, so a lookup
  // for an action named e.g. "constructor" would come back truthy and silence its log.
  const NOISY          = new Set(['height', 'scrollTop']); // fire constantly; never logged
  const TRIGGER_SEL    = '[data-spwidget-autobind], [data-spt-redirect]';

  let handled = false;      // one redirect per page view
  let lastTrigger = null;   // the button that opened the widget

  /* ── Role 1: the page carrying the widget ───────────────────────────────── */

  // Capture phase, delegated: SimplePractice's own handler is an inline onclick on the
  // element and calls stopImmediatePropagation(), so a capture listener on document is
  // the only place that reliably sees the click first.
  doc.addEventListener('click', function (e) {
    const el = e.target?.closest?.(TRIGGER_SEL);
    if (el) { lastTrigger = el; log('widget opened from', el); }
  }, true);

  function destinationFor(action) {
    const override = lastTrigger?.closest('[data-spt-redirect]')?.getAttribute('data-spt-redirect');
    if (override) return override;
    return action === CONTACT ? CONFIG.contactRedirect : CONFIG.redirect;
  }

  function urlFor(dest, action) {
    if (!CONFIG.appendQuery) return dest;
    const type = action === CONTACT ? 'contact' : 'appointment';
    const [path, hash] = [dest.split('#')[0], dest.split('#')[1]];
    const sep = path.indexOf('?') > -1 ? '&' : '?';
    return path + sep + 'booking=simplepractice&type=' + type + (hash ? '#' + hash : '');
  }

  function stash(action) {
    try {
      win.sessionStorage.setItem(CONFIG.storageKey, JSON.stringify({ action, at: Date.now(), v: VERSION }));
      return true;
    } catch (e) {
      warn('sessionStorage unavailable — the conversion will not fire on the destination page', e);
      return false;
    }
  }

  function navigate(url) {
    if (CONFIG.replace) win.location.replace(url);
    else win.location.assign(url);
  }

  function onBooking(action, params) {
    const dest = destinationFor(action);
    if (!dest) { log('no destination configured for', action, '— ignoring'); return; }
    if (handled) { log('already handled — ignoring duplicate', action); return; }
    handled = true;

    const url = urlFor(dest, action);
    const detail = { action, type: action === CONTACT ? 'contact' : 'appointment', url, params: params || null };

    emit('kw-spwidget-track:booking', detail, win.kwSpwidgetTrackOnBooking);

    // Stash immediately before navigating, not before the delay — if the visitor
    // wanders off during the delay we don't want a stale token firing later.
    win.setTimeout(function () {
      stash(action);
      log('redirecting to', url);
      navigate(url);
    }, CONFIG.delay);
  }

  win.addEventListener('message', function (event) {
    if (!TRUSTED_ORIGIN.test(event.origin)) return;

    const data = event.data;
    if (!data || typeof data !== 'object' || data.scope !== SCOPE) return;
    if (!NOISY.has(data.action)) log('message:', data.action, data.params || null);

    if (data.action === BOOKING || data.action === CONTACT) onBooking(data.action, data.params);
  }, false);

  /* ── Role 2: the thank-you page ─────────────────────────────────────────── */

  function consumeToken() {
    let raw = null;
    try {
      raw = win.sessionStorage.getItem(CONFIG.storageKey);
      // Remove first, fire second: a fast refresh must not find it again.
      if (raw) win.sessionStorage.removeItem(CONFIG.storageKey);
    } catch { return null; }
    if (!raw) return null;

    let rec;
    try { rec = JSON.parse(raw); } catch { return null; }
    if (!rec || typeof rec.at !== 'number') return null;
    if (Date.now() - rec.at > CONFIG.maxAgeMs) { log('stale token discarded'); return null; }
    return rec;
  }

  // gtag is normally defined synchronously by the base tag in <head>, but it can be
  // late (async loader) or absent (blocked, consent denied). Poll, then give up quietly.
  function whenGtag(cb, timeoutMs) {
    const start = Date.now();
    (function poll() {
      if (typeof win.gtag === 'function') {
        try { cb(win.gtag); } catch (e) { warn('gtag call threw', e); }
        return;
      }
      if (Date.now() - start >= (timeoutMs || 5000)) {
        warn('gtag never became available — GA4/Ads conversion not sent (the redirect still worked)');
        return;
      }
      win.setTimeout(poll, 100);
    })();
  }

  function emit(name, detail, hook) {
    try { doc.dispatchEvent(new CustomEvent(name, { detail })); } catch (e) { warn(e); }
    if (typeof hook === 'function') { try { hook(detail); } catch (e) { warn('hook threw', e); } }
  }

  function fireConversion(rec) {
    const detail = {
      action: rec.action,
      type: rec.action === CONTACT ? 'contact' : 'appointment',
      source: 'simplepractice_widget'
    };
    log('firing conversion', detail);

    if (CONFIG.dataLayerEvent) {
      win.dataLayer = win.dataLayer || [];
      win.dataLayer.push(Object.assign({ event: CONFIG.dataLayerEvent }, detail));
      log('dataLayer push:', CONFIG.dataLayerEvent);
    }

    if (CONFIG.gaEvent || CONFIG.adsConversion) {
      whenGtag(function (gtag) {
        if (CONFIG.gaEvent) {
          gtag('event', CONFIG.gaEvent, { method: detail.source, sp_type: detail.type });
          log('gtag event:', CONFIG.gaEvent);
        }
        if (CONFIG.adsConversion) {
          gtag('event', 'conversion', { send_to: CONFIG.adsConversion });
          log('gtag Ads conversion:', CONFIG.adsConversion);
        }
      });
    }

    emit('kw-spwidget-track:conversion', detail, win.kwSpwidgetTrackOnConversion);
  }

  const pending = consumeToken();
  if (pending) fireConversion(pending);

  /* ── Public API ─────────────────────────────────────────────────────────── */
  win.kwSpwidgetTrack = {
    version: VERSION,
    config: CONFIG,
    pendingConsumed: !!pending,
    destinationFor,
    /** Turn debug logging on/off at runtime, without editing the script tag. */
    debug(on) { CONFIG.debug = on !== false; return CONFIG.debug; },
    /**
     * Dry-run the whole flow without making a real appointment: redirects and fires
     * the configured tags exactly as a genuine booking would. Use this to verify the
     * wiring, then do ONE real test booking to confirm the message name.
     */
    simulate(action) { onBooking(action === 'contact' ? CONTACT : BOOKING, { simulated: true }); }
  };

  log('v' + VERSION + ' ready', CONFIG);
})(window, document);
