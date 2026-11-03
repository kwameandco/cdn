/*! kw-mosaic v1.0.1 — justified-rows gallery layout for Squarespace gallery blocks */
(function (global, doc) {
  'use strict';

  var VERSION = '1.0.1';

  /* Squarespace's own image-width steps. Anything else gets rounded up by the CDN
     anyway, so asking for one of these avoids a pointless re-encode. */
  var STEPS = [100, 300, 500, 750, 1000, 1500, 2500];

  var DEFAULTS = {
    selector:    '.sqs-block-gallery',
    rowHeight:   340,      // px. ABSOLUTE, not a fraction of the container — see layout().
    gap:         14,       // px between tiles and rows
    pairs:       true,     // allow two stacked landscapes to share one slot beside a portrait
    maxTileVh:   0.72,     // a single very tall image is capped at this share of the viewport
    captions:    true,     // hover title + caption, built from the block's own data
    hideUntilReady: true,  // no flash of Squarespace's grid (needs the script in the HEAD)
    revealAfter: 2000,     // ms — if we never run, show the native gallery rather than nothing
    only:        null,     // array of collection ids, or a function(block) => boolean
    perBlock:    null,     // { '#block-abc123': { rowHeight: 420 } }
    onError:     null
  };

  /* ---------------------------------------------------------------- utilities */

  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  function step(w) {
    for (var i = 0; i < STEPS.length; i++) if (STEPS[i] >= w) return STEPS[i];
    return 2500;
  }

  /* Squarespace serves any width from the same asset via ?format=Nw. */
  function sized(url, w) {
    if (!url) return url;
    var base = url.split('?')[0];
    return base + '?format=' + step(Math.ceil(w)) + 'w';
  }

  function warn(msg, err, opts) {
    if (global.console && console.warn) console.warn('[kw-mosaic] ' + msg, err || '');
    if (opts && typeof opts.onError === 'function') { try { opts.onError(msg, err); } catch (e) {} }
  }

  /* ------------------------------------------------------------------ reading */

  /* Everything the engine needs is already in the block. The anchor carries the
     full-size href, the title and the caption HTML; the img carries the exact
     source dimensions and the client's focal point.

     We deliberately do NOT fetch ?format=json. It would add a request, a failure
     mode, and a 401 on any password-protected (pre-launch) site — for data the
     DOM already has. */
  function collect(block) {
    var items = [];
    each(block.querySelectorAll('.slide, .image-wrapper'), function (slide) {
      var img = slide.querySelector('img[data-image-dimensions]');
      if (!img) return;

      var dims = (img.getAttribute('data-image-dimensions') || '').split('x');
      var w = parseInt(dims[0], 10), h = parseInt(dims[1], 10);
      if (!(w > 0) || !(h > 0)) return;

      /* The anchor is Squarespace's own lightbox opener. We MOVE it rather than
         rebuild it, so every listener the lightbox plugin bound on page load
         survives — moving a node in the DOM keeps its listeners, recreating it
         does not. This is what makes the click-through work for free. */
      var anchor = slide.querySelector('a.image-slide-anchor') || slide.querySelector('a');

      items.push({
        el:     anchor || slide,
        isLink: !!anchor,
        img:    img,
        src:    img.getAttribute('data-image') || img.getAttribute('data-src') || img.src,
        w: w, h: h, ar: w / h,
        title:  (anchor && anchor.getAttribute('data-title')) ||
                (slide.parentNode && textOf(slide.parentNode.querySelector('.meta-title'))) ||
                img.getAttribute('alt') || '',
        caption: (anchor && anchor.getAttribute('data-description')) || '',
        focal:  img.getAttribute('data-image-focal-point') || '0.5,0.5'
      });
    });
    return items;
  }

  function textOf(el) { return el ? (el.textContent || '').trim() : ''; }

  /* Strip the caption HTML down to its first line of text, for the hover label.
     The block's data-description is rich text and can contain links. */
  function captionText(html) {
    if (!html) return '';
    var d = doc.createElement('div');
    d.innerHTML = html;
    var p = d.querySelector('p');
    var t = (p ? p.textContent : d.textContent) || '';
    return t.replace(/\s*More…?\s*$/i, '').replace(/\s+/g, ' ').trim();
  }

  /* ------------------------------------------------------------------- layout */

  /* A unit is one image, or two stacked in a single slot. Stacking at a common
     width makes the heights add, so the effective ratio is the reciprocal sum. */
  function buildUnits(items, pairs) {
    var units = [], i = 0;
    while (i < items.length) {
      var a = items[i];
      if (pairs && a.ar < 1 && items[i + 1] && items[i + 2] &&
          items[i + 1].ar >= 1.2 && items[i + 2].ar >= 1.2) {
        units.push({ items: [a], ar: a.ar });
        var b = items[i + 1], c = items[i + 2];
        units.push({ items: [b, c], ar: 1 / (1 / b.ar + 1 / c.ar), stacked: true });
        i += 3;
      } else {
        units.push({ items: [a], ar: a.ar });
        i++;
      }
    }
    return units;
  }

  /* Justified rows. Walk the units in the client's order, accumulate until the
     row would render below the target height, then scale that row to fill the
     width exactly.

     targetH MUST be absolute pixels. Expressed as a fraction of containerW it
     cancels out of the comparison below, and every viewport then packs the same
     number of images per row — a phone gets desktop's three-up, shrunk to
     thumbnails. Capping at 90% of the container stops a narrow column demanding
     a row taller than it is wide. */
  function layout(units, containerW, targetH, gap, maxTile) {
    var rows = [], row = [], sum = 0;
    targetH = Math.min(targetH, containerW * 0.9);

    function flush(isLast) {
      if (!row.length) return;
      var gaps = gap * (row.length - 1);

      /* Solve the row exactly. A plain unit is `ar * H` wide; a stacked one is
         `k * (H - gap)`, because the two images share the width but the gap
         between them eats into the height. Summing:

             H * Σar  -  gap * Σar(stacked)  =  W - gap*(n-1)

         Ignoring that second term is what leaves a stacked row a percent or two
         short of the container. */
      var stackedAr = 0;
      row.forEach(function (u) { if (u.stacked) stackedAr += u.ar; });
      var h = (containerW - gaps + gap * stackedAr) / sum;

      if (isLast) h = Math.min(h, targetH * 1.35);   // don't inflate a short final row
      h = Math.min(h, maxTile);
      rows.push({ h: h, units: row.slice() });
      row = []; sum = 0;
    }

    units.forEach(function (u) {
      row.push(u); sum += u.ar;
      if ((containerW - gap * (row.length - 1)) / sum <= targetH) flush(false);
    });
    flush(true);
    return rows;
  }

  /* ----------------------------------------------------------------- rendering */

  function place(item, w, h, opts) {
    var el = item.el;
    el.className = (el.className || '').replace(/\bcontent-fit\b/g, '') + ' kw-mosaic__tile';
    el.style.cssText = 'position:relative;display:block;overflow:hidden;width:' + w +
                       'px;height:' + h + 'px;';

    var img = item.img;
    var need = w * Math.min(global.devicePixelRatio || 1, 2);
    var want = sized(item.src, need);
    if (img.getAttribute('src') !== want) img.setAttribute('src', want);
    img.removeAttribute('data-load');
    img.style.cssText = 'position:static;width:100%;height:100%;object-fit:cover;' +
                        'object-position:' + item.focal.split(',').map(function (n) {
                          return (parseFloat(n) * 100) + '%';
                        }).join(' ') + ';';
    if (item.title) img.setAttribute('alt', item.title);

    if (opts.captions && item.title && !el.querySelector('.kw-mosaic__cap')) {
      var cap = doc.createElement('span');
      cap.className = 'kw-mosaic__cap' + (h < 110 ? ' kw-mosaic__cap--small' : '');
      var b = doc.createElement('b'); b.textContent = item.title; cap.appendChild(b);
      var sub = captionText(item.caption);
      if (sub) { var s = doc.createElement('span'); s.textContent = sub; cap.appendChild(s); }
      el.appendChild(cap);
    }
    return el;
  }

  function render(host, rows, opts) {
    var frag = doc.createDocumentFragment();
    rows.forEach(function (r) {
      var row = doc.createElement('div');
      row.className = 'kw-mosaic__row';
      row.style.cssText = 'display:flex;justify-content:center;gap:' + opts.gap +
                          'px;margin-bottom:' + opts.gap + 'px;';
      r.units.forEach(function (u) {
        if (u.stacked) {
          var inner = r.h - opts.gap;
          var h1 = inner * (1 / u.items[0].ar) / (1 / u.items[0].ar + 1 / u.items[1].ar);
          var w  = h1 * u.items[0].ar;
          var box = doc.createElement('div');
          box.className = 'kw-mosaic__stack';
          box.style.cssText = 'display:flex;flex-direction:column;gap:' + opts.gap +
                              'px;width:' + w + 'px;height:' + r.h + 'px;';
          box.appendChild(place(u.items[0], w, h1, opts));
          box.appendChild(place(u.items[1], w, inner - h1, opts));
          row.appendChild(box);
        } else {
          row.appendChild(place(u.items[0], u.ar * r.h, r.h, opts));
        }
      });
      frag.appendChild(row);
    });
    host.innerHTML = '';
    host.appendChild(frag);
  }

  /* ----------------------------------------------------------------- enhancing */

  function enhance(block, opts, registry) {
    var snapshot = block.innerHTML;          // fail-open: put it back if anything throws
    try {
      var items = collect(block);
      if (items.length < 2) return false;    // nothing worth laying out

      /* Take the block out of Squarespace's hands. Its gallery JS keys on these
         class names and re-applies inline styles on every resize; drop them and
         it stops matching, so we are not fighting it frame by frame. */
      each(block.querySelectorAll('.sqs-gallery, .sqs-gallery-container'), function (n) {
        n.className = n.className
          .replace(/sqs-gallery-design-[\w-]+/g, '')
          .replace(/sqs-gallery-block-[\w-]+/g, '');
      });

      var host = block.querySelector('.sqs-gallery') || block;
      host.classList.add('kw-mosaic');
      host.style.cssText = 'display:block;position:static;height:auto;';

      var draw = function () {
        var W = host.clientWidth || block.clientWidth;
        if (!(W > 0)) return;
        var rows = layout(buildUnits(items, opts.pairs), W, opts.rowHeight, opts.gap,
                          global.innerHeight * opts.maxTileVh);
        render(host, rows, opts);
      };

      draw();
      block.setAttribute('data-kw-mosaic-ready', '');
      if (registry) registry.push(draw);     // so redraw() has something to call

      var t;
      global.addEventListener('resize', function () {
        clearTimeout(t);
        t = setTimeout(function () { try { draw(); } catch (e) { warn('redraw failed', e, opts); } }, 120);
      });
      return true;

    } catch (err) {
      block.innerHTML = snapshot;            // leave the native gallery exactly as it was
      warn('could not enhance ' + (block.id || 'a gallery block') +
           ' — left the native layout in place', err, opts);
      return false;
    }
  }

  function wanted(block, opts) {
    if (!opts.only) return true;
    if (typeof opts.only === 'function') return !!opts.only(block);
    var id = (doc.body.id || '').replace(/^collection-/, '');
    return opts.only.indexOf(id) > -1 || opts.only.indexOf(block.id) > -1;
  }

  /* ---------------------------------------------------------------------- init */

  function kwMosaic(userOpts) {
    var opts = {};
    for (var k in DEFAULTS) if (DEFAULTS.hasOwnProperty(k)) opts[k] = DEFAULTS[k];
    for (var j in (userOpts || {})) if (userOpts.hasOwnProperty(j)) opts[j] = userOpts[j];

    /* Hide the native grid before it paints, and reveal whatever we end up with.
       Only works if this script is in the HEAD injection; from the footer the
       native gallery has already painted and you will see it swap. */
    var hider;
    if (opts.hideUntilReady && !doc.getElementById('kw-mosaic-hide')) {
      hider = doc.createElement('style');
      hider.id = 'kw-mosaic-hide';
      hider.textContent = opts.selector + '{visibility:hidden}';
      (doc.head || doc.documentElement).appendChild(hider);
      /* A visitor must never get a blank page because a script failed. */
      global.setTimeout(reveal, opts.revealAfter);
    }
    function reveal() { if (hider && hider.parentNode) hider.parentNode.removeChild(hider); }

    var drawers = [];

    function run() {
      try {
        each(doc.querySelectorAll(opts.selector), function (block) {
          if (block.hasAttribute('data-kw-mosaic-ready')) return;
          if (!wanted(block, opts)) return;
          var o = opts;
          if (opts.perBlock && block.id && opts.perBlock['#' + block.id]) {
            o = {}; for (var k in opts) o[k] = opts[k];
            var over = opts.perBlock['#' + block.id];
            for (var j in over) o[j] = over[j];
          }
          enhance(block, o, drawers);
        });
      } catch (e) {
        warn('init failed', e, opts);
      }
      reveal();
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', run);
    else run();

    /* redraw() re-lays out the blocks already enhanced, and picks up any that
       have appeared since. run() alone would do only the second half — it skips
       anything already marked ready — so the drawers are called explicitly. */
    function redraw() {
      drawers.forEach(function (d) {
        try { d(); } catch (e) { warn('redraw failed', e, opts); }
      });
      run();
    }

    return { redraw: redraw, version: VERSION };
  }

  kwMosaic.version = VERSION;
  global.kwMosaic = kwMosaic;
})(window, document);
