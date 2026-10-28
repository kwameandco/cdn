/*! kw-brandtext v1.1.0 — colour each part of a brand name the same way everywhere */
(function () {
  "use strict";

  if (window.kwBrandText) return;   // idempotent: survives double script injection

  var VERSION = "1.1.0";

  /* ------------------------------------------------------------------ config

     Set before the script loads. Each term is a list of [segment text, class] pairs, in
     reading order; the classes are styled in the site's own CSS, so the colours stay
     editable there and usable by any other rule:

       <script>
       window.kwBrandTextConfig = {
         terms: [
           [['gallery', 'gk-a'], [' keoki', 'gk-b']],
           [['info@', 'gk-c'], ['gallerykeoki', 'gk-a'], ['.com', 'gk-c']]
         ]
       };
       </script>

     Matching is case-insensitive and keeps the page's own casing. The longest term wins
     where two overlap, so put "info@site.com" and "site.com" both in and each is matched
     whole. A space in a term matches any run of spaces, including the non-breaking spaces
     Squarespace's text editor scatters through copy; ' and ... also match ’ and …. */

  var cfg = window.kwBrandTextConfig || {};
  var TERMS = cfg.terms || [];
  // Navigation and buttons keep their own styling: a brand name in a menu item or on a
  // button is UI, not copy. Builders that render menus/buttons without these tags add
  // their own selectors through `skip`.
  var SKIP_TEXT = "script,style,textarea,input,select,option,noscript,[contenteditable]," +
             "nav,button,[role=navigation],[role=button],[role=menu]" +
             (cfg.skip ? "," + cfg.skip : "");

  if (!TERMS.length) return;

  // Typography is normalised: a term written with ' and ... also matches the curly
  // apostrophe and the single-character ellipsis, whichever the copy happens to use, and
  // a space after an ellipsis is optional ("decorate…Define").
  function pattern(s) {
    return s.toLowerCase().replace(/[‘’]/g, "'").replace(/…/g, "...")
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\\\.\\\.\\\.( *)/g, function (_, sp) { return "(?:\\.\\.\\.|…)" + (sp ? "[\\s\\u00a0]*" : ""); })
      .replace(/'/g, "['‘’]")
      .replace(/ +/g, "[\\s\\u00a0]+");
  }

  // One regex per term with a capture group per segment, so the groups cut a match into
  // its coloured parts however many spaces or which apostrophe it actually contains.
  var terms = TERMS.map(function (t) {
    return {
      segs: t,
      len: t.reduce(function (n, s) { return n + s[0].length; }, 0),
      re: new RegExp("^" + t.map(function (s) { return "(" + pattern(s[0]) + ")"; }).join("") + "$", "i"),
      src: t.map(function (s) { return pattern(s[0]); }).join("")
    };
  }).sort(function (a, b) { return b.len - a.len; });   // longest first: alternation is ordered
  var re = new RegExp(terms.map(function (t) { return t.src; }).join("|"), "gi");

  // Text is matched per block (paragraph, heading, list item, link…), across the inline
  // elements inside it. Squarespace's editor splits copy into <strong>, <em> and coloured
  // <span>s at will — "<strong>GALLERY <em>KEOKI</em></strong>" is one name in two
  // elements — so matching one text node at a time misses most of the site.
  var BLOCK = "p,h1,h2,h3,h4,h5,h6,li,dt,dd,td,th,blockquote,figcaption,label,div,section," +
              "article,header,footer,main,aside,body";

  function piece(node, start, end, cls) {
    if (end < node.nodeValue.length) node.splitText(end);
    var mid = start > 0 ? node.splitText(start) : node;
    var s = document.createElement("span");
    s.className = "kw-bt " + cls;
    mid.parentNode.replaceChild(s, mid);
    s.appendChild(mid);
    // A link's underline is drawn by the link, not the text, so a span cannot remove it.
    // Mark the link and let the CSS decide (a.kw-bt-link { text-decoration: none }).
    var a = s.parentElement.closest("a");
    if (a) a.classList.add("kw-bt-link");
  }

  function scan(nodes) {
    var full = "", at = [];
    nodes.forEach(function (n) { at.push(full.length); full += n.nodeValue; });
    var cuts = [], m;
    re.lastIndex = 0;
    while ((m = re.exec(full))) {
      if (!m[0]) { re.lastIndex++; continue; }
      var term = null, g = null;
      for (var k = 0; k < terms.length && !g; k++) { g = terms[k].re.exec(m[0]); term = terms[k]; }
      if (!g) continue;
      var pos = m.index;
      term.segs.forEach(function (seg, n) {
        cuts.push({ from: pos, to: pos + g[n + 1].length, cls: seg[1] });
        pos += g[n + 1].length;
      });
    }
    if (!cuts.length) return;
    // Map each cut back onto the text nodes it covers. Work from the end of each node so
    // splitting never shifts an offset still to be used.
    var jobs = [];
    cuts.forEach(function (c) {
      nodes.forEach(function (n, i) {
        var s = Math.max(c.from, at[i]), e = Math.min(c.to, at[i] + n.nodeValue.length);
        if (e > s && !locked(n)) jobs.push({ n: n, s: s - at[i], e: e - at[i], cls: c.cls });
      });
    });
    nodes.forEach(function (n) {
      jobs.filter(function (j) { return j.n === n; })
        .sort(function (a, b) { return b.s - a.s; })
        .forEach(function (j) { piece(j.n, j.s, j.e, j.cls); });
    });
  }

  function locked(n) { return !!n.parentElement.closest(".kw-bt"); }

  function run(root) {
    // Text already wrapped is still read (so the words either side of it are not joined
    // into a false match) but never wrapped twice.
    var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    var groups = [], cur = null, n;
    while ((n = tw.nextNode())) {
      var el = n.parentElement;
      if (!el || el.closest(SKIP_TEXT)) continue;
      var b = el.closest(BLOCK) || root;
      if (!cur || cur.block !== b) groups.push(cur = { block: b, nodes: [] });
      cur.nodes.push(n);
    }
    groups.forEach(function (g) {
      if (g.nodes.some(function (x) { return !locked(x); })) scan(g.nodes);
    });
  }

  function start() {
    run(document.body);
    // Lightboxes, galleries and forms are rendered after load.
    var obs = new MutationObserver(function (ms) {
      ms.forEach(function (m) {
        m.addedNodes.forEach(function (a) {
          var el = a.nodeType === 1 ? a : a.parentElement;
          if (!el || !el.isConnected || el.closest(".kw-bt")) return;
          run(el.closest(BLOCK) || el);
        });
      });
      obs.takeRecords();   // drop the records our own wrapping just produced
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  window.kwBrandText = { version: VERSION, run: run };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
