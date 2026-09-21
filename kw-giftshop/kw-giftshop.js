/*! kw-giftshop v1.0.0 — artwork carry + enquiry-form dropdown for Squarespace gift shops */
(function () {
  "use strict";

  if (window.kwGiftshop) return;   // idempotent: survives double script injection

  var VERSION = "1.0.0";

  /* Config is read from the page, so the wording and the field labels stay
     editable in the Code Injection box without republishing to the CDN:

       <script>window.kwGiftshopConfig = { carryText: "…" };</script>
       <script src="…/kw-giftshop.min.js"></script>

     The labels are how fields are found — by label text, never by the
     generated ids, which change whenever the form is rebuilt. */
  var CFG = window.kwGiftshopConfig || {};
  var ART_LABELS  = CFG.artLabels  || ['artwork', 'which artwork?', 'which artwork'];
  var LOCK_LABELS = CFG.lockLabels || ['product', 'product line'];
  var CARRY_TEXT  = CFG.carryText  || 'We have kept this one with you — it will be filled in on the enquiry form.';
  var DEBUG = CFG.debug === true;
  var DEBUG = false;   //! set true to trace on the live page

  function log() {
    if (DEBUG && window.console) console.log.apply(console, ['[kw]'].concat([].slice.call(arguments)));
  }

  function setField(el, val) {
    var proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype
              : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
              : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  }

  function meta(sel) {
    var m = document.querySelector(sel);
    return m ? (m.getAttribute('content') || '').trim() : '';
  }

  /* What this page is about, in order of how much we trust it.

     Most of the artwork pages have no h1 at all, so the h1 is the best answer
     rather than the usual one. og:title on a Squarespace collection item is
     the item's own title with nothing appended, which makes it the reliable
     fallback. document.title is last because it carries the site name: we
     strip it using og:site_name rather than splitting on a dash, because
     several artworks have a dash in their name — "Colors of Time - Leaves",
     "Eagles Nest Close-up" — and splitting would silently truncate them. */
  function pageTitle() {
    var h = document.querySelector('h1');
    var t = h ? (h.textContent || '').replace(/\s+/g, ' ').trim() : '';
    if (t) return t;

    t = meta('meta[property="og:title"]');
    if (t) return t;

    t = (document.title || '').replace(/\s+/g, ' ').trim();
    var site = meta('meta[property="og:site_name"]');
    if (t && site) {
      var cut = t.lastIndexOf(site);
      if (cut > 0) t = t.slice(0, cut).replace(/[\s\u2013\u2014|\-:]+$/, '').trim();
    }
    return t;
  }

  /* Two jobs, no page detection and no list of URLs.

     FILL: a link ending in a bare "?art=" is the artwork page's gift-shop
     button. The empty value is the marker, filled from pageTitle() below, so
     nobody types an artwork name into a URL and nothing drifts when a title
     is edited.

     FORWARD: if this page already has ?art= in its own URL, put it on every
     internal link, so the artwork is not dropped between the gift-shop index
     and a product page. */
  function linkPass() {
    var here = param('art');
    var mine = pageTitle();

    var links = document.querySelectorAll('a[href^="/"]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (a.getAttribute('data-kw-stamped')) continue;
      /* getAttribute, not .href — .href resolves to absolute, which would
         rewrite the link's own target. target and rel are never touched. */
      var href = a.getAttribute('href');
      if (!href) continue;

      if (/[?&]art=(&|$)/.test(href)) {
        if (!mine) continue;
        a.setAttribute('href', href.replace(/([?&]art=)(&|$)/, '$1' + encodeURIComponent(mine) + '$2'));
        a.setAttribute('data-kw-stamped', '1');
        continue;
      }

      if (!here || href.indexOf('art=') !== -1) continue;
      a.setAttribute('href', href + (href.indexOf('?') === -1 ? '?' : '&') + 'art=' + encodeURIComponent(here));
      a.setAttribute('data-kw-stamped', '1');
    }
  }

  /* The gallery caption and the artwork page's title are typed in two
     different places, so they drift in punctuation and case rather than in
     substance — the spreadsheets already hold "Punaluu" vs "Punalu'u",
     "Eagles Nest Close-up" vs "Eagle's Nest Close-Up", "Travis In The Books"
     vs "Travis in the Books". Comparing on a flattened key absorbs all of
     that. It does not fix a real misspelling, which is what the pass-through
     below is for. */
  /* A page title is "<artwork> [<portfolio>]" — "Boy Monk [Another Perspective]"
     — while the gallery caption is just "Boy Monk". Square brackets are a
     category tag, so they come off. ROUND brackets do NOT: "Radiance (square
     crop)" and "Radiance (35mm crop)" are two different pieces, as are
     "Holden's Line" and "Holden's Line (BW)". */
  function strip(s) {
    return String(s).replace(/\s*\[[^\]]*\]\s*$/, '').trim();
  }

  function norm(s) {
    return String(strip(s)).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u2018\u2019']/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  /* Markup matches .carry in mockups/gift-shop-flow.html — the treatment the
     client has already seen. The thumbnail only appears where a gallery on
     this page holds the artwork, so the gift-shop index gets the text form
     and a product page gets the picture. */
  function banner(list) {
    var art = strip(param('art'));
    if (!art || document.querySelector('.kw-carry')) return;
    var host = document.querySelector('.Main .Main-content .sqs-layout');
    if (!host) return;

    var thumb = '', key = norm(art), i;
    for (i = 0; i < list.length; i++) {
      if (norm(list[i].title) === key) { thumb = list[i].thumb; break; }
    }

    var d = document.createElement('div');
    d.className = 'kw-carry';

    if (thumb) {
      var im = document.createElement('img');
      im.src = thumb;
      im.alt = '';
      d.appendChild(im);
    }

    var t = document.createElement('div');
    var b = document.createElement('b');
    b.textContent = art;
    t.appendChild(b);
    var msg = document.createElement('span');
    msg.className = 'kw-carry-msg';
    msg.textContent = CARRY_TEXT;
    t.appendChild(msg);
    d.appendChild(t);

    var clear = document.createElement('a');
    clear.href = location.pathname;   /* fallback only — click below goes back instead */
    clear.textContent = 'Choose a different artwork';
    clear.addEventListener('click', function (e) {
      e.preventDefault();
      history.back();
    });
    d.appendChild(clear);

    host.insertBefore(d, host.firstChild);
    log('carry banner:', art, thumb ? '(with thumbnail)' : '(no gallery here)');
  }

  function artworks() {
    var out = [], seen = {};
    var nodes = document.querySelectorAll('.sqs-block-gallery [data-title], .sqs-gallery [data-title], a[data-title]');
    for (var i = 0; i < nodes.length; i++) {
      var a = nodes[i];
      var t = (a.getAttribute('data-title') || '').trim();
      var key = t.toLowerCase();
      if (!t || seen[key]) continue;
      seen[key] = 1;
      var tmp = document.createElement('div');
      tmp.innerHTML = a.getAttribute('data-description') || '';
      var sub = (tmp.textContent || '').replace(/\s+/g, ' ').trim();
      /* data-image/data-src are the stable CDN base on every gallery image
         (confirmed: references/gallery-block-world-adventure.md) — src is
         only populated once Squarespace's lazy-loader has actually run, so
         checking it first was returning nothing for any image not yet
         on-screen. href is the last resort: on a grid/lightbox anchor it IS
         the full-res CDN url (references/live-page-capture-2026-09-11.md). */
      var im = a.querySelector('img');
      var src = (im && (im.getAttribute('data-image') || im.getAttribute('data-src') || im.getAttribute('src')))
             || a.getAttribute('data-image') || a.getAttribute('href') || '';
      out.push({ title: t, sub: sub, thumb: src.split('?')[0] + '?format=300w' });
    }
    out.sort(function (x, y) { return x.title.localeCompare(y.title); });
    return out;
  }

  function inputFor(scope, names) {
    var labels = scope.querySelectorAll('label');
    for (var i = 0; i < labels.length; i++) {
      var txt = (labels[i].textContent || '').replace(/[*\u00a0]/g, '').trim().toLowerCase();
      if (names.indexOf(txt) === -1) continue;
      var el = labels[i].control;
      if (!el && labels[i].htmlFor) el = document.getElementById(labels[i].htmlFor);
      if (!el) {
        var wrap = labels[i].closest('.form-item, .field');
        if (wrap) el = wrap.querySelector('input[type="text"], input:not([type]), textarea');
      }
      if (el && el.tagName !== 'SELECT') return el;
    }
    return null;
  }

  function enhance(scope, list) {
    var lock = inputFor(scope, LOCK_LABELS);
    if (lock && !lock.getAttribute('data-kw-ready')) {
      lock.readOnly = true;
      lock.classList.add('kw-lock');
      lock.setAttribute('data-kw-ready', '1');
    }

    var input = inputFor(scope, ART_LABELS);
    if (!input || input.getAttribute('data-kw-ready')) return;

    var sel = document.createElement('select');
    sel.className = 'field-element kw-art';   /*! field-element: the template styles it */
    sel.setAttribute('aria-label', 'Artwork');
    sel.innerHTML = '<option value="">Choose an artwork…</option>';
    for (var i = 0; i < list.length; i++) {
      var o = document.createElement('option');
      o.value = String(i);
      o.textContent = list[i].title;
      sel.appendChild(o);
    }

    var pick = document.createElement('div');
    pick.className = 'kw-pick kw-empty';
    pick.textContent = 'the artwork you choose appears here';

    function paint() {
      if (sel.value === '') {
        pick.className = 'kw-pick kw-empty';
        pick.textContent = 'the artwork you choose appears here';
        setField(input, '');
        return;
      }
      var a = list[Number(sel.value)];
      pick.className = 'kw-pick';
      pick.innerHTML = '';
      if (a.thumb) {
        var im = document.createElement('img');
        im.src = a.thumb;
        im.alt = a.title;
        pick.appendChild(im);
      }
      var d = document.createElement('div');
      var bb = document.createElement('b');
      bb.textContent = a.title;
      d.appendChild(bb);
      if (a.sub) {
        var sb = document.createElement('span');
        sb.className = 'kw-sub';
        sb.textContent = a.sub;
        d.appendChild(sb);
      }
      pick.appendChild(d);
      setField(input, a.title);
    }
    sel.addEventListener('change', paint);

    input.parentNode.insertBefore(sel, input);
    input.parentNode.insertBefore(pick, input);
    input.classList.add('kw-hide');
    input.setAttribute('tabindex', '-1');
    input.setAttribute('data-kw-ready', '1');

    /* the artwork the visitor arrived with, matched case-insensitively
       because the gallery title and the artwork page's h1 are typed by hand
       in two different places */
    var want = param('art');
    if (want) {
      var hit = -1, key = norm(want);
      for (var j = 0; j < list.length; j++) {
        if (norm(list[j].title) === key) { hit = j; break; }
      }
      if (hit === -1) {
        /* An artwork can legitimately not be in this format's gallery, and a
           title can be genuinely misspelled. Writing the value into the hidden
           input alone was wrong: the dropdown still read "Choose an artwork…",
           so from the visitor's side nothing had carried through. Add it as a
           real option instead — what is attached is what is shown. */
        list = list.concat([{ title: strip(want), sub: '', thumb: '' }]);
        hit = list.length - 1;
        var extra = document.createElement('option');
        extra.value = String(hit);
        extra.textContent = list[hit].title;
        sel.appendChild(extra);
        log('?art= matched no gallery title, added as an option:', want);
      }
      sel.value = String(hit);
      paint();
    }
    log('form enhanced,', list.length, 'artworks');
  }

  function tick() {
    linkPass();
    var list = artworks();
    banner(list);
    if (!list.length) return;
    var forms = document.querySelectorAll('form');
    for (var i = 0; i < forms.length; i++) enhance(forms[i], list);
  }

  /* Squarespace 7.0 injects block content AFTER DOMContentLoaded, and the
     Brine family (Hunter is one) loads pages over AJAX. A single pass at load
     runs before the gallery and the React form exist, finds nothing, and dies
     silently. Hence: poll for 20s, and watch the body. Every step is guarded
     by data-kw-ready, so running many times is free. */
  function boot() {
    tick();
    var started = Date.now();
    var iv = setInterval(function () {
      tick();
      if (Date.now() - started > 20000) clearInterval(iv);
    }, 400);
    if (window.MutationObserver) {
      new MutationObserver(tick).observe(document.body, { childList: true, subtree: true });
    }
  }

  /* Console diagnostic. Not gated by DEBUG: it is the thing to run on the live
     page when something does not appear. The Squarespace editor renders the
     site in an iframe, so a report run from the top frame sees editor chrome
     and returns zero of everything — this finds the frame holding the page. */
  window.kwReport = function () {
    var d = document, f = [].slice.call(document.querySelectorAll('iframe')), i;
    for (i = 0; i < f.length; i++) {
      try { if (f[i].contentDocument && f[i].contentDocument.querySelector('.sqs-block')) { d = f[i].contentDocument; break; } }
      catch (e) {}
    }
    console.log('context:', d === document ? 'top' : 'iframe');
    console.log('markdown blocks:', d.querySelectorAll('.sqs-block-markdown').length);
    console.log('gallery items:', d.querySelectorAll('[data-title]').length);
    console.log('forms:', d.querySelectorAll('form').length);
    var want = param('art');
    console.log('?art=', want || '(none)');
    if (want) {
      var titles = [].map.call(d.querySelectorAll('[data-title]'), function (n) { return n.getAttribute('data-title'); });
      var ok = titles.filter(function (t) { return norm(t) === norm(want); });
      console.log('matches a gallery title:', ok.length ? 'yes — ' + ok[0] : 'NO (passed through as typed)');
    }
    console.log('this page resolves its title as:', JSON.stringify(pageTitle()));
    console.log('labels:', [].map.call(d.querySelectorAll('form label'),
      function (l) { return JSON.stringify(l.textContent.trim()); }).join(', '));
  };

  window.kwGiftshop = { version: VERSION };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
