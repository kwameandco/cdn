/*! kw-giftshop v1.9.1 — artwork carry + enquiry-form dropdown for Squarespace gift shops */
(function () {
  "use strict";

  if (window.kwGiftshop) return;   // idempotent: survives double script injection

  var VERSION = "1.9.1";

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
  var GIFT_PATH = CFG.giftPath || '/gift-shop';
  /* Words, as the client uses them (K, 2026-10-07):
       media   — the gift product type: Prints on Metal, Acrylic Blocks, Art Cards…
       format  — the shape: square, standard, panoramic…
       artwork — one individual piece.
     Visitor-facing text follows that. */
  var UNAVAILABLE_TEXT = CFG.unavailableText || 'This artwork is not available in this media.';
  var OTHER_MEDIA_TEXT = CFG.otherMediaText || CFG.otherFormatsText || 'See other media';
  var CHECK_AVAILABILITY = CFG.checkAvailability !== false;
  /* false (default since 2026-10-07, pre-launch): an artwork missing from a
     gallery reads as "not available" even while other images there are still
     untitled, and a logged-in viewer is told why (ADMIN_TEXT). Set true after
     launch if titling is ever incomplete on a live page. */
  var REQUIRE_ALL_TITLED = CFG.requireAllTitled === true;
  var ADMIN_TEXT = CFG.adminText || 'This image is not available or does not have a title in the gallery. Please add one so the plugin can match to it.';
  /* Pages that only say whether the carried artwork is in them: no form,
     no lightbox button. Matched against the page's own gallery titles. */
  var FEATURE_PAGES = CFG.featurePages || {
    '6ac3d002fec1ae3e7da220e7': { yes: 'This artwork is featured in Elemental.',
                                  no:  'This artwork is not featured in Elemental.' },
    '6ac3c86a84dc597b3cb527d5': { yes: 'This artwork is featured in Aspen Grove - Colors of Time.',
                                  no:  'This artwork is not featured in Aspen Grove - Colors of Time.' }
  };
  /* Gift pages that keep the lightbox button and the form, but show no carry
     banner and do not pre-fill from a carried artwork (Greeting Cards — K,
     "leave blank", 2026-10-07). */
  var QUIET_PAGES = CFG.quietPages || ['6ac3c22296f0bf2d7998d606'];

  /* WHERE each feature runs, by Squarespace 7.0 collection id (each gift page
     is its own collection; body carries "collection-<id>"). Ids change if a
     page is deleted and recreated — the feature then silently stops there.

     giftPages — the format pages with a gallery of artworks to choose from:
       Prints on Metal, Acrylic Blocks, Art Cards (K, 2026-10-05) and Greeting
       Cards (gallery at the top of the page, K, 2026-10-06). The carry banner,
       the Artwork dropdown, the lightbox "Choose this artwork" button and the
       optional image swaps run here and nowhere else. Elemental Book and
       Colors of Time are deliberately NOT in it: nothing to choose on them.
     indexPages — the Gifts index: carry banner only (text, no thumbnail).
     maxArtworks — how many artworks one enquiry may carry, per page id.
       Default 1. Art Cards may become 3 ("3 for $50"): set
       maxArtworks: { '6ac3d16be1ae290e6efbf27b': 3 } in the footer config.
     heroSlideshowPages — pages whose main image is a SLIDESHOW gallery block
       (Prints on Metal, Acrylic Blocks — K, 2026-10-07). Its images are
       product shots, not artworks, so they are left out of the artwork list.
       (The v1.3 hoverSwap / lightboxSwap / carrySwap main-image swaps were
       removed in v1.6.0 at K's request; those keys are now ignored.)
     openFormOnChoose — after "Choose this artwork", close the lightbox and
       open the enquiry form. Default true.
     clickImageToChoose — clicking the photograph in the lightbox does the
       same as the button (as in the mock-up). Default true.
     chooseTip — the small line under the button. "" hides it. */
  var GIFT_PAGES = CFG.giftPages || ['6ac3adbacbdca4526632eca7', '6ab17aabd75f9017140d0910', '6ac3d16be1ae290e6efbf27b', '6ac3c22296f0bf2d7998d606'];
  var INDEX_PAGES = CFG.indexPages || ['6ab1613d15aeae1a003fa8ba'];
  /* Fine Art Cards: up to 3 (K, 2026-10-07). A "Number of Cards" dropdown in the
     form, when there is one, overrides this — see maxArt(). */
  var MAX_ART = CFG.maxArtworks || { '6ac3d16be1ae290e6efbf27b': 3 };
  var COUNT_LABELS = CFG.countLabels || ['number of cards'];
  var HERO_PAGES = CFG.heroSlideshowPages || ['6ac3adbacbdca4526632eca7', '6ab17aabd75f9017140d0910'];
  var OPEN_FORM = CFG.openFormOnChoose !== false;
  var CLICK_IMAGE = CFG.clickImageToChoose !== false;
  var CHOOSE_TIP = typeof CFG.chooseTip === 'string' ? CFG.chooseTip : 'or click the photograph itself';
  /* Second line of the empty Artwork preview (K, 2026-10-07). "" hides it. */
  var EMPTY_HINT = typeof CFG.emptyHint === 'string' ? CFG.emptyHint
    : 'You can preview photographs and select from the thumbnail gallery at the bottom of the page.';
  /* Size by format (K, 2026-10-07 — Acrylic Blocks). An artwork's FORMAT is the
     first of these words found in its gallery description (else its title); the
     Size dropdown's options carry the same word in their labels. Choosing an
     artwork leaves only its format's sizes: several (Standard) → the dropdown
     shows just those; exactly one (Panoramic, Square) → it is selected and the
     dropdown is replaced by a line saying so. No format found → every size,
     unchanged. Longest word first, so a "Vertical Panoramic" added later wins
     over "Panoramic". */
  var FORMATS = (CFG.formats || ['Standard', 'Panoramic', 'Square']).slice()
    .sort(function (x, y) { return y.length - x.length; });
  var FORMAT_PAGES = CFG.formatPages || GIFT_PAGES;
  var SIZE_LABELS = CFG.sizeLabels || ['size'];
  var CHOOSE_TEXT = CFG.chooseText || 'Choose this artwork';
  var CHOSEN_TEXT = CFG.chosenText || 'Chosen \u2713';

  function pageId(ids) {
    var b = document.body;
    if (!b) return '';
    for (var i = 0; i < ids.length; i++) if (b.classList.contains('collection-' + ids[i])) return ids[i];
    return '';
  }
  function onGiftPage() { return !!pageId(GIFT_PAGES); }
  function onIndexPage() { return !!pageId(INDEX_PAGES); }
  function onQuietPage() { return !!pageId(QUIET_PAGES); }
  function featureMsgs() {
    var id = pageId(Object.keys(FEATURE_PAGES));
    return id ? FEATURE_PAGES[id] : null;
  }

  /* "Only in the dashboard": Code Injection does not run in the editor, so
     the closest thing is the live/preview page viewed while logged in.
     Squarespace puts the signed-in account on Static.SQUARESPACE_CONTEXT;
     a visitor has none. adminHints: true forces it (testing, or if that
     property ever moves). Not verified on this site — kwReport() prints it. */
  function isAdmin() {
    if (CFG.adminHints === true) return true;
    try {
      var c = window.Static && window.Static.SQUARESPACE_CONTEXT;
      return !!(c && c.authenticatedAccount);
    } catch (e) { return false; }
  }
  /* How many artworks one enquiry may carry. The form's "Number of Cards"
     dropdown wins once it exists ("1 Fine Art Card" → 1, "3 Fine Art Cards" →
     3); before the form has been opened, the page's maxArtworks. */
  function countSelect() {
    return onGiftPage() ? selectFor(document, COUNT_LABELS) : null;
  }
  function maxArt() {
    var cs = countSelect();
    if (cs) {
      var m = parseInt(cs.value, 10);
      if (m > 0) return m;
    }
    var id = pageId(GIFT_PAGES);
    var n = id ? parseInt(MAX_ART[id], 10) : 1;
    return n > 1 ? n : 1;
  }

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

  /* The carried artwork's IMAGE travels in the link as &img=<CDN url>, so a
     page with no gallery holding it (the Gifts index) can still show it in
     the banner. Only Squarespace's own image hosts are accepted — the value
     comes from a URL anyone can type. Stored without its ?format= query. */
  function cleanImg(u) {
    if (!u) return '';
    try {
      var x = new URL(u, location.href);
      if (!/(^|\.)(squarespace-cdn\.com|squarespace\.com)$/.test(x.hostname)) return '';
      return x.origin + x.pathname;
    } catch (e) { return ''; }
  }

  /* This artwork page's own image, for &img=: og:image (Squarespace sets it to
     the post's image), else the first image block on the page. */
  function pageImage() {
    var u = cleanImg(meta('meta[property="og:image"]'));
    if (u) return u;
    var im = document.querySelector('.Main-content .sqs-block-image img, .Main-content img[data-image]');
    return im ? cleanImg(im.getAttribute('data-image') || im.getAttribute('data-src') || im.getAttribute('src')) : '';
  }

  function setUrlParams(o) {
    try {
      var u = new URL(location.href);
      for (var k in o) {
        if (o[k]) u.searchParams.set(k, o[k]);
        else u.searchParams.delete(k);
      }
      history.replaceState(history.state, '', u.toString());
    } catch (e) {}
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
  /* PATCH, not design (K, 2026-10-05). The "Learn More" artwork pages are blog
     posts, and many of their gift-shop links were typed as the full address —
     https://gallery-keoki.squarespace.com/gift-shop — with no ?art=. Fixing
     them by hand is the right answer and is not happening before launch, so on
     a blog POST (not the blog list) any link to the gift-shop page with no
     query string is rewritten to the bare-marker form, GIFT_PATH + "?art=",
     and the FILL step below then stamps the artwork title into it.

     Matched on the path, not the host: the same links will read gallerykeoki.com
     once the domain moves, and a relative "/gift-shop" is the same mistake.
     Only links to THIS site are touched (same host, or a host on the
     squarespace.com / gallerykeoki.com domains), and only when the link has
     no ?query and no #hash of its own — a link someone has already set up is
     left alone. Delete this function once the posts are fixed. */
  /* Scoped to the "Learn More Pages" blog by its collection id (K, 2026-10-05):
     every post in it carries body.collection-5e31132afdec1a2aeae00a18, which is
     narrower than "any blog". The list page shares the id, so view-list is
     excluded — its h1 is the blog's name, which would be stamped in as the
     artwork. Collection ids change if the blog is deleted and recreated; the
     patch then silently does nothing. */
  var BLOG_ID = CFG.blogCollection || '5e31132afdec1a2aeae00a18';

  function isBlogPost() {
    var b = document.body;
    return !!b && b.classList.contains('collection-' + BLOG_ID) && !b.classList.contains('view-list');
  }

  function giftLinkPatch() {
    if (!isBlogPost()) return;
    var links = document.querySelectorAll('a[href*="' + GIFT_PATH + '"]:not([data-kw-patched])');
    for (var i = 0; i < links.length; i++) {
      var a = links[i], raw = a.getAttribute('href'), u;
      try { u = new URL(raw, location.href); } catch (e) { continue; }
      var ours = u.host === location.host || /(^|\.)(squarespace\.com|gallerykeoki\.com)$/.test(u.hostname);
      if (!ours || u.search || u.hash) continue;
      if (u.pathname.replace(/\/+$/, '') !== GIFT_PATH) continue;
      a.setAttribute('href', GIFT_PATH + '?art=');
      a.setAttribute('data-kw-patched', raw);
      log('blog link patched:', raw);
    }
  }

  function linkPass() {
    giftLinkPatch();
    var here = param('art');
    var herePic = cleanImg(param('img'));
    var mine = pageTitle();
    var pic = '';

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
        if (!pic) pic = pageImage();
        href = href.replace(/([?&]art=)(&|$)/, '$1' + encodeURIComponent(mine) + '$2');
        if (pic && !/[?&]img=/.test(href)) href += '&img=' + encodeURIComponent(pic);
        a.setAttribute('href', href);
        a.setAttribute('data-kw-stamped', '1');
        continue;
      }

      if (!here || href.indexOf('art=') !== -1) continue;
      href += (href.indexOf('?') === -1 ? '?' : '&') + 'art=' + encodeURIComponent(here);
      if (herePic) href += '&img=' + encodeURIComponent(herePic);
      a.setAttribute('href', href);
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

  /* ONE list of chosen artworks for the page. Everything reads from it:
     the banner, every enhanced form, the lightbox buttons. It starts from
     ?art= (one title) and grows when the visitor presses "Choose this
     artwork" in the lightbox. Up to maxArt() entries; with 1 a new choice
     replaces the old one. */
  var CHOSEN = null;
  var FORMS = [];   /* sync() of every enhanced form, so a choice made in the
                       lightbox reaches a form that is already on the page */

  function findArt(list, title) {
    var k = norm(title);
    for (var i = 0; i < list.length; i++) if (norm(list[i].title) === k) return list[i];
    return null;
  }

  function chosen() {
    if (CHOSEN === null) {
      var a = onQuietPage() ? '' : strip(param('art'));
      CHOSEN = a ? [a] : [];
    }
    return CHOSEN;
  }

  function isChosen(title) {
    var k = norm(title), c = chosen();
    for (var i = 0; i < c.length; i++) if (norm(c[i]) === k) return true;
    return false;
  }

  /* Returns false when the list is already full (multi-pick pages). */
  function choose(title) {
    title = strip(title);
    if (!title) return false;
    var c = chosen(), max = maxArt();
    if (isChosen(title)) return true;
    if (max === 1) c.length = 0;
    else if (c.length >= max) return false;
    c.push(title);

    /* Keep the URL in step (first choice only — ?art= carries one title) so a
       refresh or a shared link keeps it. replaceState: no new history entry,
       so "Choose a different artwork" (history.back) still leaves the page. */
    var list = artworks(), first = findArt(list, c[0]);
    setUrlParams({ art: c[0], img: first ? first.full : '' });

    for (var i = 0; i < FORMS.length; i++) FORMS[i]();
    refreshBanner(list);
    log('chosen:', c.join(' | '));
    return true;
  }

  /* Markup matches .carry in mockups/gift-shop-flow.html — the treatment the
     client has already seen. The thumbnail only appears where a gallery on
     this page holds the artwork, so the gift-shop index gets the text form
     and a product page gets the picture. Gift pages and the index get the
     carry; Elemental and Colors of Time get featured / not featured
     (FEATURE_PAGES); Greeting Cards gets nothing (QUIET_PAGES). */
  function refreshBanner(list) {
    var old = document.querySelector('.kw-carry');
    if (old) old.parentNode.removeChild(old);
    banner(list);
  }

  /* Is the carried artwork in this page's gallery?
       'yes'     — the gallery holds it
       'no'      — the gallery exists and does not (see REQUIRE_ALL_TITLED)
       'unknown' — no gallery found, or the check is off
     'unknown' behaves as before: the title is carried into the form as
     typed. Matching is norm() — "&" vs "and" is a different title, so titles
     must be spelled the same on the artwork page and in every gallery. */
  var UNAVAILABLE = '';   /* the carried title, once it has been ruled out */
  function availability(list, title) {
    if (findArt(list, title)) return 'yes';
    if (!CHECK_AVAILABILITY || !GALLERY.total) return 'unknown';
    if (REQUIRE_ALL_TITLED && GALLERY.untitled) return 'unknown';
    return 'no';
  }

  function carryTarget() {
    return (onGiftPage() && !onQuietPage()) || !!featureMsgs();
  }

  /* Run on every tick for the ARRIVAL carry only (?art= in the URL). The
     gallery can render after the form, and in pieces, so a 'no' is undone
     if the artwork turns up later — unless the visitor has chosen since. */
  function checkCarried(list) {
    if (!carryTarget()) return;
    var a = strip(param('art')), c = chosen();
    if (!a) return;
    var hit = findArt(list, a);
    if (UNAVAILABLE) {
      if (!hit || c.length) return;
      UNAVAILABLE = '';
      c.push(hit.title);
      for (var k = 0; k < FORMS.length; k++) FORMS[k]();
      refreshBanner(list);
      return;
    }
    if (c.length !== 1 || norm(c[0]) !== norm(a)) return;
    if (hit) {
      /* Matched: use the gallery's own spelling, so the enquiry email reads
         "Radiance", not whatever casing or punctuation the link carried. */
      if (c[0] !== hit.title) {
        c[0] = hit.title;
        for (var j = 0; j < FORMS.length; j++) FORMS[j]();
        refreshBanner(list);
      }
      return;
    }
    if (availability(list, a) !== 'no') return;
    UNAVAILABLE = a;
    c.length = 0;
    for (var i = 0; i < FORMS.length; i++) FORMS[i]();
    refreshBanner(list);
    log('carried artwork is not in this gallery:', a);
  }

  function bannerHost() {
    /* A Code Block holding <div id="kw-carry-slot"></div> wins (K, 2026-10-06
       — on the Gifts index it sits between the intro text and the product
       grid). Without one, the top of the page content. */
    var slot = document.getElementById('kw-carry-slot');
    return { slot: slot, host: slot || document.querySelector('.Main .Main-content .sqs-layout') };
  }

  /* A message banner: the artwork, a line of text, optionally a link to the
     other media (carry kept) and, for a logged-in viewer, why it said "no". */
  function notice(title, text, thumb, opts) {
    var h = bannerHost();
    if (!h.host) return;
    var carried = cleanImg(param('img'));
    var d = document.createElement('div');
    d.className = 'kw-carry ' + (opts.cls || '');
    thumb = thumb || (carried ? carried + '?format=300w' : '');
    if (thumb) {
      var im = document.createElement('img');
      im.src = thumb;
      im.alt = '';
      d.appendChild(im);
    }
    var t = document.createElement('div');
    if (title) {
      var b = document.createElement('b');
      b.textContent = title;
      t.appendChild(b);
    }
    if (text) {
      var msg = document.createElement('span');
      msg.className = 'kw-carry-msg';
      msg.textContent = text;
      t.appendChild(msg);
    }
    if (opts.admin) {
      var an = document.createElement('span');
      an.className = 'kw-admin-note';
      an.textContent = ADMIN_TEXT + (GALLERY.total
        ? ' (' + GALLERY.untitled + ' of ' + GALLERY.total + ' images here have no title.)'
        : ' (No gallery found on this page.)');
      t.appendChild(an);
    }
    d.appendChild(t);
    if (opts.link) {
      /* A real link, forwarding the carry, so the Gifts index keeps showing
         the artwork and every media reached from it gets it too. */
      var go = document.createElement('a');
      go.className = 'kw-other-media';
      go.href = GIFT_PATH + '?art=' + encodeURIComponent(title) +
                (carried ? '&img=' + encodeURIComponent(carried) : '');
      go.textContent = OTHER_MEDIA_TEXT;
      d.appendChild(go);
    }
    if (h.slot) h.slot.appendChild(d);
    else h.host.insertBefore(d, h.host.firstChild);
  }

  function banner(list) {
    if (onQuietPage()) return;
    var fm = featureMsgs();
    if (!onGiftPage() && !onIndexPage() && !fm) return;
    if (document.querySelector('.kw-carry')) return;
    var c = chosen();
    if (!c.length && UNAVAILABLE) {
      notice(UNAVAILABLE, fm ? fm.no : UNAVAILABLE_TEXT, '',
             { cls: 'kw-unavailable', link: true, admin: isAdmin() });
      return;
    }
    if (fm) {
      /* Feature pages say yes or no; nothing else. 'unknown' (no gallery
         found) says nothing to visitors and explains itself to an admin. */
      if (!c.length) return;
      var f = findArt(list, c[0]);
      if (f) notice(f.title, fm.yes, f.thumb, { cls: 'kw-featured' });
      else if (isAdmin()) notice(c[0], '', '', { cls: 'kw-unavailable', admin: true });
      return;
    }
    if (!c.length) return;
    var hs = bannerHost(), slot = hs.slot, host = hs.host;
    if (!host) return;

    /* Thumbnail: this page's gallery first, else the image carried in &img=
       (the Gifts index has no gallery). */
    var hit = findArt(list, c[0]), thumb = hit ? hit.thumb : '';
    if (!thumb) {
      var carried = cleanImg(param('img'));
      if (carried) thumb = carried + '?format=300w';
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
    b.textContent = c.join(', ');
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

    if (slot) slot.appendChild(d);
    else host.insertBefore(d, host.firstChild);
    log('carry banner:', c.join(' | '), thumb ? '(with thumbnail)' : '(no gallery here)');
  }

  /* Gallery titles live in different places per gallery design. A grid
     gallery puts them on the anchor as data-title/data-description; a
     STACKED gallery (references/gallery-block-world-adventure.md, the only
     live capture) has no data-title at all — the title is the .meta-title in
     the .meta sibling after the .image-wrapper, else the img alt. Reading
     data-title alone returned an empty list on a stacked gallery, and an
     empty list meant the form was never enhanced, so ?art= never reached it. */
  function isFilename(t) { return /\.(jpe?g|png|gif|webp|tiff?)$/i.test(t) || /_\d{3,}$/.test(t); }

  function itemMeta(im) {
    var a = im.closest('[data-title]');
    if (a && a.getAttribute('data-title').trim()) {
      return { title: a.getAttribute('data-title').trim(), desc: a.getAttribute('data-description') || '' };
    }
    var w = im.closest('.image-wrapper') || im.closest('.slide') || im.parentNode;
    var m = w.querySelector('.meta, .slide-meta');
    if (!m) { var n = w.nextElementSibling; if (n && n.classList.contains('meta')) m = n; }
    /* .slide-meta p.title / p.description: the autocolumns gallery design,
       which the gift pages use. */
    var mt = m && m.querySelector('.meta-title, .title');
    var md = m && m.querySelector('.meta-description, .description');
    var t = (mt && mt.textContent.trim()) || (im.getAttribute('alt') || '').trim();
    return { title: isFilename(t) ? '' : t, desc: md ? md.innerHTML : '' };
  }

  /* The hero slideshow on Prints on Metal / Acrylic Blocks: 7.0's Slideshow
     gallery design renders as .sqs-gallery-design-stacked (slides
     .sqs-gallery-design-stacked-slide — K's DevTools, 2026-10-07). Not to be
     confused with the Stacked *block* design (.image-wrapper), which the
     artwork galleries elsewhere use. */
  function isHeroSlide(im) {
    return !!pageId(HERO_PAGES) &&
           !!im.closest('.sqs-gallery-design-stacked, .sqs-gallery-design-stacked-slide');
  }

  var GALLERY = { total: 0, untitled: 0 };
  function artworks() {
    var out = [], seen = {}, total = 0, untitled = 0;
    var imgs = document.querySelectorAll('.sqs-block-gallery img[data-image], .sqs-block-gallery img[data-src], .sqs-gallery img[data-image], .sqs-gallery img[data-src]');
    for (var i = 0; i < imgs.length; i++) {
      var im = imgs[i];
      if (im.closest('noscript, .sqs-lightbox-slide')) continue;
      if (isHeroSlide(im)) continue;
      var meta = itemMeta(im);
      var t = meta.title;
      total++;
      if (!t) untitled++;
      var key = t.toLowerCase();
      if (!t || seen[key]) continue;
      seen[key] = 1;
      var tmp = document.createElement('div');
      tmp.innerHTML = meta.desc;
      var sub = (tmp.textContent || '').replace(/\s+/g, ' ').trim();
      /* data-image/data-src are the stable CDN base on every gallery image
         (confirmed: references/gallery-block-world-adventure.md) — src is
         only populated once Squarespace's lazy-loader has actually run. */
      var src = im.getAttribute('data-image') || im.getAttribute('data-src') || im.getAttribute('src') || '';
      var full = src.split('?')[0];
      out.push({ title: t, sub: sub, thumb: full + '?format=300w', full: full,
                 dims: im.getAttribute('data-image-dimensions') || '' });
    }
    out.sort(function (x, y) { return x.title.localeCompare(y.title); });
    GALLERY = { total: total, untitled: untitled };
    return out;
  }

  /* A label's own text. Squarespace's current form markup puts the required
     marker INSIDE the label — <span class="description required">(required)</span>
     — so textContent read "Artwork(required)" and matched nothing: the Artwork
     field was never found and the carry never reached the form (K's DOM sample,
     2026-10-07). The marker elements are dropped, and a literal "(required)" /
     "(optional)" or "*" too, for the older markup. */
  function labelText(label) {
    var c = label.cloneNode(true);
    var junk = c.querySelectorAll('.description, .required, .optional');
    for (var j = 0; j < junk.length; j++) junk[j].parentNode.removeChild(junk[j]);
    return (c.textContent || '').replace(/\((required|optional)\)/gi, '')
      .replace(/[*\u00a0]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function selectFor(scope, names) {
    var labels = scope.querySelectorAll('label');
    for (var i = 0; i < labels.length; i++) {
      var txt = labelText(labels[i]);
      if (names.indexOf(txt) === -1) continue;
      var el = labels[i].control;
      if (!el && labels[i].htmlFor) el = document.getElementById(labels[i].htmlFor);
      if (!el) {
        var wrap = labels[i].closest('.form-item, .field');
        if (wrap) el = wrap.querySelector('select');
      }
      if (el && el.tagName === 'SELECT') return el;
    }
    return null;
  }

  function formatIn(text) {
    for (var i = 0; i < FORMATS.length; i++) {
      var w = FORMATS[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp('(^|[^a-z])' + w + '([^a-z]|$)', 'i').test(text || '')) return FORMATS[i];
    }
    return '';
  }

  /* One Size dropdown per format, labelled "<Format> Sizes" (or "Size"):
     "Standard Sizes", "Panoramic Sizes", "Square Size" (K, 2026-10-07). */
  function formatFields(scope) {
    var out = [], labels = scope.querySelectorAll('label');
    for (var i = 0; i < labels.length; i++) {
      var txt = labelText(labels[i]);
      if (!/(^| )sizes?$/.test(txt)) continue;
      var f = formatIn(txt);
      if (!f) continue;
      var el = labels[i].control || (labels[i].htmlFor && document.getElementById(labels[i].htmlFor));
      if (!el || el.tagName !== 'SELECT') {
        var w = labels[i].closest('.form-item, .field');
        el = w && w.querySelector('select');
      }
      if (el) out.push({ fmt: f, sel: el, item: el.closest('.form-item, .field') || el, note: null });
    }
    return out;
  }

  function inputFor(scope, names) {
    var labels = scope.querySelectorAll('label');
    for (var i = 0; i < labels.length; i++) {
      var txt = labelText(labels[i]);
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

  /* The Artwork field becomes N dropdowns ("slots"), N = maxArt(): one on
     most pages, up to 3 on Art Cards if that is switched on. Each slot lists
     this page's gallery artworks; the chosen titles are written into the real
     (visually hidden) Text field joined with "; ", so the notification email
     reads "Artwork: Holden's Line; Infinity". The preview under the slots
     shows each choice with its thumbnail.

     Slots and the shared CHOSEN list stay in step both ways: a dropdown change
     rewrites CHOSEN, and a lightbox choice calls sync() to repaint the slots. */
  function enhance(scope, list) {
    var lock = inputFor(scope, LOCK_LABELS);
    if (lock && !lock.getAttribute('data-kw-ready')) {
      lock.readOnly = true;
      lock.classList.add('kw-lock');
      lock.setAttribute('data-kw-ready', '1');
    }

    /* With a "Number of Cards" dropdown, each Artwork field — "Artwork",
       "Artwork 2", "Artwork 3" (Squarespace follow-up fields, rendered when
       3 cards is picked) — gets its own picker, bound to that place in the
       chosen list. Without one, the single Artwork field carries every slot
       (maxArtworks), joined with "; ". */
    var count = selectFor(scope, COUNT_LABELS);
    bindCount(count);
    var ins = artInputs(scope);
    for (var k = 0; k < ins.length; k++) {
      if (!ins[k].input.getAttribute('data-kw-ready')) enhanceArt(scope, ins[k].input, list, count ? ins[k].idx : null);
    }
  }

  /* Number of Cards ↔ chosen list. Opening the form with more artworks chosen
     than the dropdown allows (picked in the lightbox) raises it to the smallest
     option that fits, which makes Squarespace render Artwork 2 / 3. Lowering it
     drops the extra artworks. */
  function bindCount(count) {
    if (!count || count.getAttribute('data-kw-count')) return;
    count.setAttribute('data-kw-count', '1');
    var c = chosen();
    if (c.length > (parseInt(count.value, 10) || 1)) {
      var best = null;
      for (var o = 0; o < count.options.length; o++) {
        var v = parseInt(count.options[o].value, 10);
        if (v >= c.length && (!best || v < parseInt(best.value, 10))) best = count.options[o];
      }
      if (best) setField(count, best.value);
    }
    count.addEventListener('change', function () {
      var m = parseInt(count.value, 10) || 1, cc = chosen();
      if (cc.length <= m) return;
      cc.length = m;
      for (var i = 0; i < FORMS.length; i++) FORMS[i]();
      refreshBanner(artworks());
    });
  }

  function artInputs(scope) {
    var out = [], labels = scope.querySelectorAll('label');
    for (var i = 0; i < labels.length; i++) {
      var m = /^(.*?)(?: (\d+))?$/.exec(labelText(labels[i]));
      if (ART_LABELS.indexOf(m[1]) === -1) continue;
      var el = labels[i].control || (labels[i].htmlFor && document.getElementById(labels[i].htmlFor));
      if (!el) {
        var w = labels[i].closest('.form-item, .field');
        el = w && w.querySelector('input[type="text"], input:not([type]), textarea');
      }
      if (el && el.tagName !== 'SELECT') out.push({ input: el, idx: m[2] ? parseInt(m[2], 10) - 1 : 0 });
    }
    return out;
  }

  function enhanceArt(scope, input, list, idx) {
    var max = idx === null ? maxArt() : 1;
    var doSizes = idx === null || idx === 0;   /* size fields: once per form */
    list = list.slice();
    var slots = [];

    function indexOf(title) {
      var k = norm(title);
      for (var j = 0; j < list.length; j++) if (norm(list[j].title) === k) return j;
      /* An artwork can legitimately not be in this format's gallery, and a
         title can be genuinely misspelled. Writing the value into the hidden
         input alone was wrong: the dropdown still read "Choose an artwork…",
         so from the visitor's side nothing had carried through. Add it as a
         real option instead — what is attached is what is shown. */
      list.push({ title: strip(title), sub: '', thumb: '' });
      for (var s = 0; s < slots.length; s++) addOption(slots[s], list.length - 1);
      log('artwork matched no gallery title, added as an option:', title);
      return list.length - 1;
    }

    function addOption(sel, i) {
      var o = document.createElement('option');
      o.value = String(i);
      o.textContent = list[i].title;
      sel.appendChild(o);
    }

    for (var n = 0; n < max; n++) {
      var sel = document.createElement('select');
      sel.className = 'field-element kw-art';   /*! field-element: the template styles it */
      sel.setAttribute('aria-label', idx ? 'Artwork ' + (idx + 1) : max > 1 ? 'Artwork ' + (n + 1) : 'Artwork');
      sel.innerHTML = '<option value="">' + (n === 0 ? 'Choose an artwork…' : 'Add another artwork (optional)…') + '</option>';
      for (var i = 0; i < list.length; i++) addOption(sel, i);
      sel.addEventListener('change', fromSlots);
      slots.push(sel);
      input.parentNode.insertBefore(sel, input);
    }

    var pick = document.createElement('div');
    input.parentNode.insertBefore(pick, input);
    input.classList.add('kw-hide');
    input.setAttribute('tabindex', '-1');
    input.setAttribute('data-kw-ready', '1');

    /* Size by format — see FORMATS. Only on FORMAT_PAGES, only with a Size
       dropdown. Options are hidden, never removed (the form is React-managed). */
    var fields = doSizes && pageId(FORMAT_PAGES) ? formatFields(scope) : [];
    var size = doSizes && !fields.length && pageId(FORMAT_PAGES) ? selectFor(scope, SIZE_LABELS) : null;
    var sizeItem = size && (size.closest('.form-item, .field') || size);
    var sizeNote = null;

    function realOptions(sel) {
      var out = [];
      for (var o = 0; o < sel.options.length; o++) if (!sel.options[o].disabled) out.push(sel.options[o]);
      return out;
    }
    function placeholderOf(sel) {
      for (var o = 0; o < sel.options.length; o++) if (sel.options[o].disabled) return sel.options[o].value;
      return '';
    }
    function hasSize(sel) {
      var cur = sel.options[sel.selectedIndex];
      return !!cur && !cur.disabled && cur.value !== '';
    }

    /* Per-format dropdowns: the artwork's format decides which one shows. One
       size in it → selected for the visitor, dropdown replaced by a "Size: …"
       line. Several (Standard) → that dropdown alone. No artwork, or one with no
       format word → every dropdown, as built. A hidden dropdown is reset to its
       placeholder, so a size picked for a previous artwork is not sent. */
    function showFields(titles) {
      var want = {}, n = 0;
      for (var t = 0; t < titles.length; t++) {
        var a = list[indexOf(titles[t])];
        var f = formatIn(a.sub) || formatIn(a.title);
        if (!f) { n = 0; break; }
        if (!want[f]) { want[f] = 1; n++; }
      }
      for (var i = 0; i < fields.length; i++) {
        var fd = fields[i], on = !n || !!want[fd.fmt], opts = realOptions(fd.sel);
        if (on && n && opts.length === 1) {
          if (fd.sel.value !== opts[0].value) setField(fd.sel, opts[0].value);
          fd.item.style.display = 'none';
          if (!fd.note) {
            fd.note = document.createElement('div');
            fd.note.className = 'kw-size-auto';
            fd.item.parentNode.insertBefore(fd.note, fd.item.nextSibling);
          }
          fd.note.textContent = 'Size: ' + opts[0].textContent.trim();
          fd.note.style.display = '';
          continue;
        }
        fd.item.style.display = on ? '' : 'none';
        if (fd.note) fd.note.style.display = 'none';
        if (!on && hasSize(fd.sel)) setField(fd.sel, placeholderOf(fd.sel));
      }
    }

    /* Make the size dropdowns NOT required in Squarespace — a hidden required
       field would block every submission. This guard asks for a size instead:
       at least one showing dropdown must have one. Capture phase, so it runs
       before Squarespace's own submit handling. */
    function sizeGuard(e) {
      if (e.type === 'click' && !(e.target.closest && e.target.closest('button[type="submit"], input[type="submit"]'))) return;
      var shown = [], ok = false;
      for (var i = 0; i < fields.length; i++) {
        var fd = fields[i];
        if (fd.note && fd.note.style.display !== 'none') ok = true;
        else if (fd.item.style.display !== 'none') { shown.push(fd.sel); if (hasSize(fd.sel)) ok = true; }
      }
      if (ok || !shown.length) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      shown[0].setCustomValidity('Please choose a size.');
      shown[0].reportValidity();
    }
    if (fields.length) {
      scope.addEventListener('submit', sizeGuard, true);
      scope.addEventListener('click', sizeGuard, true);
      for (var g = 0; g < fields.length; g++) {
        fields[g].sel.addEventListener('change', function () { this.setCustomValidity(''); });
      }
    }

    function showSizes(titles) {
      if (fields.length) return showFields(titles);
      if (!size) return;
      var want = {}, n = 0;
      for (var t = 0; t < titles.length; t++) {
        var a = list[indexOf(titles[t])];
        var f = formatIn(a.sub) || formatIn(a.title);
        if (!f) { n = 0; break; }        /* one artwork with no format: show everything */
        if (!want[f]) { want[f] = 1; n++; }
      }
      var kept = [];
      for (var o = 0; o < size.options.length; o++) {
        var opt = size.options[o], of = formatIn(opt.textContent);
        var keep = !n || !of || !!want[of];   /* placeholder / unlabelled options stay */
        opt.hidden = !keep;
        opt.disabled = !keep && opt.value !== '';
        if (keep && of) kept.push(opt);
      }
      if (n && kept.length === 1) {
        if (size.value !== kept[0].value) setField(size, kept[0].value);
        sizeItem.style.display = 'none';
        if (!sizeNote) {
          sizeNote = document.createElement('div');
          sizeNote.className = 'kw-size-auto';
          sizeItem.parentNode.insertBefore(sizeNote, sizeItem.nextSibling);
        }
        sizeNote.textContent = 'Size: ' + kept[0].textContent.trim();
        sizeNote.style.display = '';
        return;
      }
      sizeItem.style.display = '';
      if (sizeNote) sizeNote.style.display = 'none';
      var cur = size.options[size.selectedIndex];
      if (cur && cur.hidden) setField(size, '');
    }

    function paint(titles) {
      setField(input, titles.join('; '));
      if (doSizes) showSizes(idx === null ? titles : chosen().slice());
      pick.innerHTML = '';
      if (!titles.length) {
        pick.className = 'kw-pick kw-empty';
        pick.textContent = max > 1 ? 'the artworks you choose appear here' : 'the artwork you choose appears here';
        if (EMPTY_HINT && !idx) {
          var hint = document.createElement('span');
          hint.className = 'kw-empty-hint';
          hint.textContent = EMPTY_HINT;
          pick.appendChild(hint);
        }
        return;
      }
      pick.className = 'kw-picks';
      for (var t = 0; t < titles.length; t++) {
        var a = list[indexOf(titles[t])];
        var row = document.createElement('div');
        row.className = 'kw-pick';
        if (a.thumb) {
          var im = document.createElement('img');
          im.src = a.thumb;
          im.alt = a.title;
          row.appendChild(im);
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
        row.appendChild(d);
        pick.appendChild(row);
      }
    }

    /* dropdowns → CHOSEN */
    function fromSlots() {
      if (idx !== null) return fromSlot();
      var c = chosen(), seen = {};
      c.length = 0;
      for (var s = 0; s < slots.length; s++) {
        if (slots[s].value === '') continue;
        var t = list[Number(slots[s].value)].title, k = norm(t);
        if (seen[k]) { slots[s].value = ''; continue; }   /* same artwork twice: drop the repeat */
        seen[k] = 1;
        c.push(t);
      }
      sync();
      if (c.length) UNAVAILABLE = '';
      refreshBanner(list);
    }

    /* One field's picker → its place in CHOSEN (per-field mode). The list
       stays packed: clearing Artwork 2 moves Artwork 3 up. Every form re-syncs,
       since the others' places may have moved. An artwork already in another
       place is refused. */
    function fromSlot() {
      var c = chosen(), v = slots[0].value;
      if (v === '') {
        if (idx < c.length) c.splice(idx, 1);
      } else {
        var t = list[Number(v)].title;
        for (var j = 0; j < c.length; j++) {
          if (j !== idx && norm(c[j]) === norm(t)) { sync(); return; }
        }
        if (idx < c.length) c[idx] = t; else c.push(t);
      }
      for (var i = 0; i < FORMS.length; i++) FORMS[i]();
      if (c.length) UNAVAILABLE = '';
      refreshBanner(list);
    }

    /* CHOSEN → dropdowns */
    function sync() {
      var c = idx === null ? chosen().slice(0, max) : (chosen()[idx] ? [chosen()[idx]] : []);
      for (var s = 0; s < slots.length; s++) {
        slots[s].value = s < c.length ? String(indexOf(c[s])) : '';
      }
      paint(c);
    }

    FORMS.push(sync);
    sync();
    log('form enhanced,', list.length, 'artworks,', idx === null ? max + ' slot(s)' : 'field ' + (idx + 1));
  }

  /* "Choose this artwork" in Squarespace's own gallery lightbox (7.0:
     .sqs-lightbox-slide > .sqs-lightbox-padder > img + .sqs-lightbox-meta).
     The lightbox is built when it opens, so this runs from tick() like the
     rest. A slide whose image has no title or description gets NO
     .sqs-lightbox-meta from Squarespace — then we add our own, lined up
     under the image on each pass (Squarespace positions the image inline
     and re-lays it out on resize). The title is the meta's h1, else the
     image's alt, which Squarespace fills from the gallery title. */
  function lightboxButtons() {
    if (!onGiftPage()) return;
    var slides = document.querySelectorAll('.sqs-lightbox-slide');
    for (var i = 0; i < slides.length; i++) {
      var slide = slides[i];
      var pad = slide.querySelector('.sqs-lightbox-padder');
      var img = pad && pad.querySelector('img');
      if (!img) continue;
      var meta = pad.querySelector('.sqs-lightbox-meta');
      var h = meta && meta.querySelector('h1');
      var title = strip(((h && h.textContent) || img.getAttribute('alt') || '').replace(/\s+/g, ' ').trim());
      if (!title || isFilename(title)) continue;   /* untitled slide: no button */
      /* v1.6.0 also skipped any photo that appears in the hero slideshow. The
         hero slideshows show the same artworks as the gallery, so that removed
         every button on Prints on Metal and Acrylic Blocks (K, 2026-10-09).
         The hero's images are still kept out of the artwork list by position
         (isHeroSlide), which is harmless when they duplicate the gallery. */

      if (!meta) {
        meta = document.createElement('div');
        meta.className = 'sqs-lightbox-meta kw-meta';
        pad.appendChild(meta);
      }
      if (meta.classList.contains('kw-meta') && img.offsetWidth) {
        meta.style.left = img.offsetLeft + 'px';
        meta.style.right = Math.max(0, pad.clientWidth - img.offsetLeft - img.offsetWidth) + 'px';
      }

      var btn = meta.querySelector('.kw-choose');
      if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'kw-choose';
        btn.setAttribute('data-kw-title', title);
        /* The lightbox listens for clicks to advance/close; keep ours to ourselves. */
        ['mousedown', 'mouseup', 'touchstart', 'touchend'].forEach(function (ev) {
          btn.addEventListener(ev, function (e) { e.stopPropagation(); });
        });
        btn.addEventListener('click', onChoose);
        meta.appendChild(btn);
        if (CHOOSE_TIP) {
          var tip = document.createElement('div');
          tip.className = 'kw-choose-tip';
          tip.textContent = CHOOSE_TIP;
          meta.appendChild(tip);
        }
        if (CLICK_IMAGE) img.classList.add('kw-clickable');
      }
      if (!img.getAttribute('data-kw-title')) img.setAttribute('data-kw-title', title);
      var on = isChosen(title);
      var want = on ? CHOSEN_TEXT : CHOOSE_TEXT;
      if (btn.textContent !== want) btn.textContent = want;
      btn.classList.toggle('kw-is-chosen', on);
    }
  }

  /* Clicking the photograph itself chooses it (mock-up behaviour). Captured
     at the document so it runs BEFORE Squarespace's own lightbox handler,
     which would otherwise step to the next slide. */
  function onImageClick(e) {
    if (!CLICK_IMAGE || !onGiftPage()) return;
    var img = e.target && e.target.closest && e.target.closest('.sqs-lightbox-slide img[data-kw-title]');
    if (!img) return;
    var slide = img.closest('.sqs-lightbox-slide');
    var btn = slide && slide.querySelector('.kw-choose');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    if (e.type === 'click') btn.click();
  }

  function onChoose(e) {
    e.preventDefault();
    e.stopPropagation();
    var btn = e.currentTarget;
    var title = btn.getAttribute('data-kw-title');
    if (!choose(title)) {
      btn.textContent = 'You can choose up to ' + maxArt();
      setTimeout(lightboxButtons, 1600);
      return;
    }
    lightboxButtons();
    if (!OPEN_FORM) return;
    /* Close the gallery lightbox, then open the enquiry form. Multi-pick
       pages stay in the lightbox until the list is full, so the visitor can
       keep choosing. */
    if (maxArt() > 1 && chosen().length < maxArt()) return;
    var x = document.querySelector('.sqs-lightbox-close, .yui3-lightbox2 .sqs-lightbox-close');
    if (x) x.click();
    else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, which: 27, bubbles: true }));
    setTimeout(function () {
      var f = document.querySelector('.Main-content button.lightbox-handle, .Main-content .sqs-block-form button');
      if (f) f.click();
      else {
        var form = document.querySelector('.Main-content form');
        if (form) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 350);
  }

  /* Once per page: the lightbox photo-click listeners. */
  var bound = false;
  function bindPage() {
    if (!onGiftPage() || bound) return;
    bound = true;
    document.addEventListener('click', onImageClick, true);
    document.addEventListener('mousedown', onImageClick, true);
    document.addEventListener('mouseup', onImageClick, true);
  }

  function tick() {
    linkPass();
    var list = artworks();
    checkCarried(list);
    banner(list);
    if (!onGiftPage()) return;
    bindPage();
    lightboxButtons();
    /* No early return on an empty gallery list: a carried ?art= must still
       reach the form (enhance() adds an unmatched title as its own option). */
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
    console.log('gallery artworks found:', JSON.stringify(artworks().map(function (a) { return a.title; })));
    console.log('forms:', d.querySelectorAll('form').length);
    var want = param('art');
    console.log('?art=', want || '(none)');
    if (want) {
      var titles = artworks().map(function (a) { return a.title; });
      var ok = titles.filter(function (t) { return norm(t) === norm(want); });
      console.log('matches a gallery title:', ok.length ? 'yes — ' + ok[0] : 'NO (passed through as typed)');
    }
    console.log('gift page:', onGiftPage() ? pageId(GIFT_PAGES) + ' (max ' + maxArt() + ')' : onIndexPage() ? 'index' : 'no');
    console.log('chosen:', JSON.stringify(chosen()));
    console.log('gallery images:', GALLERY.total, '— untitled:', GALLERY.untitled,
      REQUIRE_ALL_TITLED && GALLERY.untitled ? '(availability check OFF until every image is titled)' : '(availability check on)');
    if (param('art')) console.log('carried artwork on this page:', UNAVAILABLE ? 'no' : availability(artworks(), param('art')));
    console.log('page role:', onQuietPage() ? 'quiet (no carry)' : featureMsgs() ? 'feature (featured / not featured)' : onGiftPage() ? 'gift' : onIndexPage() ? 'index' : 'none',
      '— admin hints:', isAdmin() ? 'ON (signed in)' : 'off');
    console.log('this page resolves its title as:', JSON.stringify(pageTitle()));
    console.log('labels:', [].map.call(d.querySelectorAll('form label'),
      function (l) { return JSON.stringify(l.textContent.trim()); }).join(', '));
  };

  window.kwGiftshop = { version: VERSION };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
