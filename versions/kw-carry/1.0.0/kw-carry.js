/*! kw-carry v1.0.0 — carry a selection from one page into a form on another */
(function () {
  "use strict";

  if (window.kwCarry) return;   // idempotent: survives double script injection

  var VERSION = "1.0.0";

  /* ------------------------------------------------------------------ config

     Everything is configured from the page, before the script loads:

       <script>
       window.kwCarryConfig = {
         fields: { item: { label: 'Item' } }
       };
       </script>
       <script src="…/kw-carry.min.js"></script>

     Only `fields` is required. Defaults below apply to anything omitted.
     See instructions.md for the full reference. */

  var DEFAULTS = {

    /* WHAT TRAVELS. One entry per value, keyed by its URL parameter name.
       Each entry says how to find the form field it lands in — by `selector`,
       by `name`, or by `label` text (one string or several). `label` is the
       fallback for builders that generate their own ids, which most do.
         fields: { item: { label: ['Item', 'Product'] },
                   size: { name: 'size' },
                   sku:  { selector: '#sku' } }                             */
    fields: null,

    /* WHERE THE VALUES COME FROM on the source page. Same keys as `fields`.
         'title'                         the page's own name: h1 → og:title →
                                         <title> minus og:site_name
         { selector, attr }              read an attribute ('src', 'href',
                                         'data-x'); omit attr for text
         { meta: 'og:image' }            a meta property or name
         function () { return '…' }      anything else
       A key with no source entry is never filled automatically — it can still
       be typed into the link by hand, and it will still be written and
       forwarded. */
    source: { item: 'title' },

    /* FILL: rewrite links that end in a bare `?item=` (or `&size=`) on the
       source page, so nobody types a value into a URL and nothing drifts when
       the page is renamed. Set false if you write your links out in full. */
    fillLinks: true,

    /* FORWARD: once a page has the params in its own URL, put them on every
       internal link, so the selection survives intermediate pages. */
    forward: true,

    /* BANNER: the strip that shows what was carried. false to skip it.
         mount        first match wins; the banner is inserted as its first child
         message      the line under the item name. {item} etc. interpolate
         imageParam   which param holds a thumbnail URL, if any
         clear        'back' | 'strip' (reload without the params) | false     */
    banner: {
      mount: 'main, [role="main"], #page, #content, body',
      message: 'We have kept this with you — it will be filled in on the form.',
      imageParam: 'image',
      clear: 'back',
      clearText: 'Choose something else'
    },

    /* PICKER: replace a field with a dropdown built from a list on the page —
       a gallery, a product grid — so a visitor who arrived with nothing can
       still choose, and one who arrived with something sees it selected.
       false to leave the field alone.
         param    which field this picker drives
         items    selector for the list items
         title    attribute holding the name (or 'text' for textContent)
         image    attribute holding a thumbnail; 'href' is often right
         sub      attribute holding a caption, rendered under the name        */
    picker: false,

    /* Squarespace and some builders append a bracketed tag to page titles —
       "Boy Monk [Another Perspective]". Strip it when matching and displaying.
       ROUND brackets are never stripped: "(BW)" and "(square crop)" are part
       of the name. */
    stripSquareTags: true,

    /* Make a carried field read-only, so the visitor cannot silently edit what
       they picked. It still submits. Set false if they should be able to. */
    lock: true,

    /* Prefix for every class this script writes, so the CSS can be renamed
       without touching the code. */
    classPrefix: 'kw-carry',

    debug: false
  };

  var CFG = merge(DEFAULTS, window.kwCarryConfig || {});
  var PFX = CFG.classPrefix;

  function merge(base, over) {
    var out = {}, k;
    for (k in base) if (has(base, k)) out[k] = base[k];
    for (k in over) {
      if (!has(over, k)) continue;
      /* one level deep is enough: banner and picker are the only objects, and
         a caller who passes banner:{message:…} means "keep the rest" */
      if (isPlain(out[k]) && isPlain(over[k])) out[k] = merge(out[k], over[k]);
      else out[k] = over[k];
    }
    return out;
  }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function isPlain(v) { return !!v && typeof v === 'object' && !(v instanceof Array); }

  function log() {
    if (CFG.debug && window.console) {
      console.log.apply(console, ['[kw-carry]'].concat([].slice.call(arguments)));
    }
  }

  if (!isPlain(CFG.fields)) {
    if (window.console) console.warn('[kw-carry] no `fields` configured — nothing to do');
    return;
  }
  /* Fields have a form input to land in. But not everything that travels does:
     a thumbnail URL is carried and shown in the banner and never goes near the
     form. So two lists — KEYS for writing, CARRY_KEYS for everything the URL
     moves around. */
  var KEYS = Object.keys(CFG.fields);
  var CARRY_KEYS = KEYS.slice();
  (function () {
    var extra = Object.keys(CFG.source || {});
    if (CFG.banner && CFG.banner.imageParam) extra.push(CFG.banner.imageParam);
    for (var i = 0; i < extra.length; i++) {
      if (CARRY_KEYS.indexOf(extra[i]) === -1) CARRY_KEYS.push(extra[i]);
    }
  })();

  /* ------------------------------------------------------------------- urls */

  function param(name, search) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(
      search === undefined ? location.search : search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  }

  function carried() {
    var out = {}, i;
    for (i = 0; i < CARRY_KEYS.length; i++) {
      var v = param(CARRY_KEYS[i]);
      if (v) out[CARRY_KEYS[i]] = v;
    }
    return out;
  }

  function meta(prop) {
    var m = document.querySelector('meta[property="' + prop + '"]')
         || document.querySelector('meta[name="' + prop + '"]');
    return m ? (m.getAttribute('content') || '').trim() : '';
  }

  /* The page's own name, in order of how much it can be trusted. document.title
     is last because it carries the site name — which is removed BY NAME, never
     by splitting on a dash, because plenty of real names contain one
     ("Colors of Time - Leaves", "Eagles Nest Close-up"). */
  function pageTitle() {
    var h = document.querySelector('h1');
    var t = h ? clean(h.textContent) : '';
    if (t) return t;

    t = meta('og:title');
    if (t) return t;

    t = clean(document.title);
    var site = meta('og:site_name');
    if (t && site) {
      var cut = t.lastIndexOf(site);
      if (cut > 0) t = t.slice(0, cut).replace(/[\s–—|\-:]+$/, '').trim();
    }
    return t;
  }

  function clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

  function strip(s) {
    s = clean(s);
    return CFG.stripSquareTags ? s.replace(/\s*\[[^\]]*\]\s*$/, '').trim() : s;
  }

  /* Comparison key: lowercased, accents and apostrophes dropped, everything
     else collapsed to single spaces. Absorbs the punctuation drift you get
     when a caption and a page title are typed in two different places
     ("Punaluu" / "Punalu'u"), without papering over a real misspelling. */
  function norm(s) {
    return String(strip(s)).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[‘’']/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  /* What this page offers for each key, per CFG.source. */
  function offered() {
    var out = {}, i, key, spec, v, el;
    for (i = 0; i < CARRY_KEYS.length; i++) {
      key = CARRY_KEYS[i];
      spec = CFG.source ? CFG.source[key] : null;
      if (!spec) continue;

      if (typeof spec === 'function')      v = spec();
      else if (spec === 'title')           v = pageTitle();
      else if (typeof spec === 'string')   v = clean(text(spec));
      else if (spec.meta)                  v = meta(spec.meta);
      else if (spec.selector) {
        el = document.querySelector(spec.selector);
        v = !el ? '' : spec.attr ? clean(el.getAttribute(spec.attr)) : clean(el.textContent);
      } else v = '';

      if (v) out[key] = v;
    }
    return out;
  }

  function text(sel) {
    var el = document.querySelector(sel);
    return el ? el.textContent : '';
  }

  /* ------------------------------------------------------------------- links

     FILL   a link carrying a bare `?item=` is a marker: the empty value is
            replaced with what this page offers.
     FORWARD if this page already has the params in its own URL, add them to
            internal links that do not mention them.                          */
  function linkPass() {
    if (!CFG.fillLinks && !CFG.forward) return;

    var here = carried();
    var mine = offered();
    var links = document.querySelectorAll('a[href]');

    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (a.getAttribute('data-kw-carry-done')) continue;

      /* getAttribute, not .href — .href is resolved to absolute, and writing
         that back would rewrite the link's own target. target and rel are
         never touched. */
      var href = a.getAttribute('href');
      if (!href || !internal(href)) continue;

      var next = href, touched = false, k, key;

      if (CFG.fillLinks) {
        for (k = 0; k < CARRY_KEYS.length; k++) {
          key = CARRY_KEYS[k];
          if (!mine[key]) continue;
          var bare = new RegExp('([?&]' + key + '=)(&|$)');
          if (!bare.test(next)) continue;
          next = next.replace(bare, '$1' + encodeURIComponent(mine[key]) + '$2');
          touched = true;
        }
      }

      if (CFG.forward) {
        for (k = 0; k < CARRY_KEYS.length; k++) {
          key = CARRY_KEYS[k];
          if (!here[key]) continue;
          if (new RegExp('[?&]' + key + '=').test(next)) continue;
          next += (next.indexOf('?') === -1 ? '?' : '&')
                + key + '=' + encodeURIComponent(here[key]);
          touched = true;
        }
      }

      if (!touched) continue;
      a.setAttribute('href', next);
      a.setAttribute('data-kw-carry-done', '1');
    }
  }

  /* Same-site only. A protocol-relative or absolute URL to another host is
     left alone — forwarding a selection onto a third party's link would leak
     it, and filling one would be rewriting somebody else's URL. */
  function internal(href) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.indexOf('//') === 0) {
      try { return new URL(href, location.href).host === location.host; }
      catch (e) { return false; }
    }
    return href.charAt(0) !== '#';
  }

  /* ------------------------------------------------------------------ fields */

  function findField(spec, scope) {
    var root = scope || document, el, i;

    if (spec.selector) {
      el = root.querySelector(spec.selector);
      if (el) return el;
    }

    if (spec.name) {
      el = root.querySelector('[name="' + spec.name + '"]');
      if (el) return el;
    }

    var wanted = spec.label;
    if (!wanted) return null;
    if (!(wanted instanceof Array)) wanted = [wanted];
    var lower = [];
    for (i = 0; i < wanted.length; i++) lower.push(String(wanted[i]).toLowerCase());

    var labels = root.querySelectorAll('label');
    for (i = 0; i < labels.length; i++) {
      /* asterisks and non-breaking spaces are how builders mark "required" */
      var txt = clean(labels[i].textContent).replace(/[* ]/g, '').trim().toLowerCase();
      if (lower.indexOf(txt) === -1) continue;

      el = labels[i].control;
      if (!el && labels[i].htmlFor) el = document.getElementById(labels[i].htmlFor);
      if (!el) {
        var wrap = labels[i].closest('.form-item, .field, .form-group, p, div');
        if (wrap) el = wrap.querySelector('input, textarea, select');
      }
      if (el) return el;
    }
    return null;
  }

  /* React-backed forms (Squarespace is one) discard a plain `el.value = x` on
     the next render and submit the OLD value. Writing through the prototype's
     setter and dispatching input+change is what makes it stick. Harmless on a
     plain HTML form. */
  function setValue(el, val) {
    var proto = el.tagName === 'SELECT'   ? window.HTMLSelectElement.prototype
              : el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype
              :                             window.HTMLInputElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, val);
    else el.value = val;
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function writeFields() {
    var here = carried(), i, key, el;
    for (i = 0; i < KEYS.length; i++) {
      key = KEYS[i];
      if (!here[key]) continue;
      el = findField(CFG.fields[key]);
      if (!el) { log('no field found for', key); continue; }
      if (el.getAttribute('data-kw-carry-set') === here[key]) continue;

      setValue(el, el.tagName === 'SELECT' ? matchOption(el, here[key]) : strip(here[key]));
      el.setAttribute('data-kw-carry-set', here[key]);
      if (CFG.lock && el.tagName !== 'SELECT') {
        el.readOnly = true;
        el.classList.add(PFX + '-locked');
      }
      log('wrote', key, '→', el.name || el.id || el.tagName);
    }
  }

  /* A <select> can only hold a value it already has. Match on the flattened
     key so punctuation drift between the option and the carried value does not
     silently leave the field empty; if nothing matches, add the option, because
     a dropdown still reading "Choose…" means nothing carried through as far as
     the visitor is concerned. */
  function matchOption(sel, want) {
    var key = norm(want), i, o;
    for (i = 0; i < sel.options.length; i++) {
      o = sel.options[i];
      if (norm(o.textContent) === key || norm(o.value) === key) return o.value;
    }
    o = document.createElement('option');
    o.value = strip(want);
    o.textContent = strip(want);
    sel.appendChild(o);
    log('added a missing option for', want);
    return o.value;
  }

  /* ------------------------------------------------------------------ banner */

  /* Only http(s) and root-relative paths. The value comes out of the URL, so
     treat it as hostile: a data: or javascript: URI has no business in an
     <img src> a visitor can put there. */
  function safeImage(url) {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    if (url.charAt(0) === '/' && url.charAt(1) !== '/') return url;
    return '';
  }

  function fill(tpl, values) {
    return String(tpl).replace(/\{(\w+)\}/g, function (m, k) {
      return values[k] === undefined ? '' : strip(values[k]);
    });
  }

  function banner() {
    var B = CFG.banner;
    if (!B) return;

    var here = carried();
    var primary = here[KEYS[0]];
    if (!primary) return;
    if (document.querySelector('.' + PFX)) return;

    var mount = firstMatch(B.mount);
    if (!mount) { log('banner mount not found:', B.mount); return; }

    var box = document.createElement('div');
    box.className = PFX;

    var img = safeImage(B.imageParam ? here[B.imageParam] : '');
    if (img) {
      var im = document.createElement('img');
      im.src = img;
      im.alt = '';
      box.appendChild(im);
    }

    var body = document.createElement('div');
    var name = document.createElement('b');
    name.textContent = strip(primary);
    body.appendChild(name);

    if (B.message) {
      var msg = document.createElement('span');
      msg.className = PFX + '-msg';
      msg.textContent = fill(B.message, here);
      body.appendChild(msg);
    }
    box.appendChild(body);

    if (B.clear) {
      var a = document.createElement('a');
      a.className = PFX + '-clear';
      a.textContent = B.clearText || 'Clear';
      a.href = stripped();
      /* exempt from the forward pass — it is an internal link without the
         params, which is exactly what forwarding puts back, so without this
         the clear link quietly re-acquires what it exists to drop */
      a.setAttribute('data-kw-carry-done', '1');
      if (B.clear === 'back') {
        a.addEventListener('click', function (e) {
          e.preventDefault();
          history.back();
        });
      }
      box.appendChild(a);
    }

    mount.insertBefore(box, mount.firstChild);
    log('banner shown for', primary, img ? '(with image)' : '(no image)');
  }

  /* Each selector in turn, not as one comma list: querySelector('main, body')
     returns whichever appears FIRST IN THE DOCUMENT — always body — rather than
     the first selector that matches anything. */
  function firstMatch(list) {
    var parts = String(list).split(',');
    for (var i = 0; i < parts.length; i++) {
      var sel = parts[i].trim();
      if (!sel) continue;
      var el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  /* This page's URL with every carried param removed. */
  function stripped() {
    var q = location.search.replace(/^\?/, '').split('&').filter(function (pair) {
      var k = pair.split('=')[0];
      return pair && CARRY_KEYS.indexOf(k) === -1;
    });
    return location.pathname + (q.length ? '?' + q.join('&') : '');
  }

  /* ------------------------------------------------------------------ picker */

  function picker() {
    var P = CFG.picker;
    if (!P || !P.param || !CFG.fields[P.param]) return;

    var input = findField(CFG.fields[P.param]);
    if (!input || input.getAttribute('data-kw-carry-picker')) return;

    var list = items(P);
    if (!list.length) return;

    var sel = document.createElement('select');
    sel.className = PFX + '-select';
    sel.setAttribute('aria-label', P.label || 'Choose');
    sel.appendChild(option('', P.placeholder || 'Choose…'));
    for (var i = 0; i < list.length; i++) sel.appendChild(option(String(i), list[i].title));

    var preview = document.createElement('div');
    preview.className = PFX + '-preview ' + PFX + '-empty';
    preview.textContent = P.emptyText || 'your choice appears here';

    function paint() {
      if (sel.value === '') {
        preview.className = PFX + '-preview ' + PFX + '-empty';
        preview.textContent = P.emptyText || 'your choice appears here';
        setValue(input, '');
        return;
      }
      var it = list[Number(sel.value)];
      preview.className = PFX + '-preview';
      preview.textContent = '';
      var src = safeImage(it.image);
      if (src) {
        var im = document.createElement('img');
        im.src = src;
        im.alt = it.title;
        preview.appendChild(im);
      }
      var d = document.createElement('div');
      var b = document.createElement('b');
      b.textContent = it.title;
      d.appendChild(b);
      if (it.sub) {
        var s = document.createElement('span');
        s.className = PFX + '-sub';
        s.textContent = it.sub;
        d.appendChild(s);
      }
      preview.appendChild(d);
      setValue(input, it.title);
    }
    sel.addEventListener('change', paint);

    input.parentNode.insertBefore(sel, input);
    input.parentNode.insertBefore(preview, input);
    input.classList.add(PFX + '-hidden');
    input.setAttribute('tabindex', '-1');
    input.setAttribute('data-kw-carry-picker', '1');

    var want = param(P.param);
    if (want) {
      var hit = -1, key = norm(want);
      for (var j = 0; j < list.length; j++) {
        if (norm(list[j].title) === key) { hit = j; break; }
      }
      if (hit === -1) {
        list.push({ title: strip(want), image: '', sub: '' });
        hit = list.length - 1;
        sel.appendChild(option(String(hit), list[hit].title));
        log('carried value matched nothing in the list, added it:', want);
      }
      sel.value = String(hit);
      paint();
    }
    log('picker built,', list.length, 'items');
  }

  function option(value, label) {
    var o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    return o;
  }

  function items(P) {
    var out = [], seen = {}, nodes = document.querySelectorAll(P.items);
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var title = strip(P.title === 'text' ? n.textContent : n.getAttribute(P.title));
      if (!title || seen[norm(title)]) continue;
      seen[norm(title)] = 1;
      out.push({
        title: title,
        image: P.image ? attr(n, P.image) : '',
        sub:   P.sub ? clean(stripHtml(attr(n, P.sub))) : ''
      });
    }
    out.sort(function (a, b) { return a.title.localeCompare(b.title); });
    return out;
  }

  /* An attribute on the node, or on the first descendant that has it —
     galleries put the title on a wrapper and the image on a child. Lazy-loaded
     images only get a real `src` once their loader has run, so the data-
     attributes come first: they hold the URL from the start. */
  function attr(node, names) {
    var list = names instanceof Array ? names : [names];
    for (var i = 0; i < list.length; i++) {
      var v = node.getAttribute(list[i]);
      if (v) return v;
      var kid = node.querySelector('[' + list[i] + ']');
      if (kid) {
        v = kid.getAttribute(list[i]);
        if (v) return v;
      }
    }
    return '';
  }

  function stripHtml(s) {
    var d = document.createElement('div');
    d.innerHTML = s || '';          // parsed, never inserted into the page
    return d.textContent || '';
  }

  /* -------------------------------------------------------------------- boot

     Builders inject form and list markup after DOMContentLoaded, and some load
     pages over AJAX without a fresh document. A single pass at load finds
     nothing and dies silently, so: poll briefly, then watch the body. Every
     step is guarded by a data- attribute, so running repeatedly is free. */
  function tick() {
    try {
      linkPass();
      writeFields();
      banner();
      picker();
    } catch (e) {
      if (window.console) console.error('[kw-carry]', e);
    }
  }

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

  /* Console diagnostic. Not gated by debug — it is the thing to run on the
     live page when something does not appear. Walks into an editor preview
     iframe, because a builder's editor renders the site inside one and a
     report from the top frame would find none of the page. */
  window.kwCarryReport = function () {
    var d = document, frames = [].slice.call(document.querySelectorAll('iframe')), i;
    for (i = 0; i < frames.length; i++) {
      try {
        if (frames[i].contentDocument && frames[i].contentDocument.querySelector('form')) {
          d = frames[i].contentDocument; break;
        }
      } catch (e) {}
    }
    console.log('kw-carry', VERSION, '— context:', d === document ? 'top' : 'iframe');
    console.log('carried:', carried(), '· travels:', CARRY_KEYS.join(', '));
    console.log('this page offers:', offered());
    for (i = 0; i < KEYS.length; i++) {
      var el = findField(CFG.fields[KEYS[i]], d);
      console.log('field "' + KEYS[i] + '":', el ? (el.tagName + (el.name ? '[name=' + el.name + ']' : '')) : 'NOT FOUND');
    }
    console.log('forms:', d.querySelectorAll('form').length,
                '· labels:', [].map.call(d.querySelectorAll('form label'), function (l) {
                  return JSON.stringify(clean(l.textContent));
                }).join(', '));
    if (CFG.picker) console.log('picker items:', d.querySelectorAll(CFG.picker.items).length);
  };

  window.kwCarry = {
    version: VERSION,
    config: CFG,
    refresh: tick,
    report: window.kwCarryReport
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
