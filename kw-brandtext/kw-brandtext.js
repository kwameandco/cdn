/*! kw-brandtext v1.0.0 — colour each part of a brand name the same way everywhere */
(function () {
  "use strict";

  if (window.kwBrandText) return;   // idempotent: survives double script injection

  var VERSION = "1.0.0";

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
  var SKIP = "script,style,textarea,input,select,option,noscript,[contenteditable],.kw-bt" +
             (cfg.skip ? "," + cfg.skip : "");

  if (!TERMS.length) return;

  // Segment boundaries are decided by the term, not the match: the match can be longer
  // than the term when a space was matched by several spaces or an &nbsp; run.
  // Typography is normalised too: a term written with ' and ... also matches the curly
  // apostrophe and the single-character ellipsis, whichever the copy happens to use.
  function key(s) {
    return s.toLowerCase().replace(/[\s\u00a0]+/g, " ")
      .replace(/[\u2018\u2019]/g, "'").replace(/\u2026/g, "...");
  }
  function pattern(s) {
    return key(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\\\.\\\.\\\./g, "(?:\\.\\.\\.|\u2026)")
      .replace(/'/g, "['\u2018\u2019]")
      .replace(/ +/g, "[\\s\\u00a0]+");
  }

  var map = {};
  TERMS.forEach(function (t) {
    map[key(t.map(function (s) { return s[0]; }).join(""))] = t;
  });
  var src = Object.keys(map)
    .sort(function (a, b) { return b.length - a.length; })   // longest first: alternation is ordered
    .map(pattern).join("|");
  var re = new RegExp(src, "gi");
  var test = new RegExp(src, "i");

  // Cut the matched text into the term's segments. Each segment takes as many characters
  // of the match as it has once spaces are counted as runs, so "Gallery&nbsp;&nbsp;Keoki"
  // still splits after "Gallery".
  function build(m) {
    var term = map[key(m)];
    var w = document.createElement("span");
    w.className = "kw-bt";
    var i = 0;
    term.forEach(function (seg, n) {
      var want = key(seg[0]), got = "";
      var j = i;
      while (j < m.length && key(got) !== want) got += m[j++];
      // swallow the rest of a space run so the next segment starts on a letter
      while (n < term.length - 1 && /[\s\u00a0]/.test(want.slice(-1)) && /[\s\u00a0]/.test(m[j] || "")) got += m[j++];
      var s = document.createElement("span");
      s.className = seg[1];
      s.textContent = got;
      w.appendChild(s);
      i = j;
    });
    if (i < m.length) w.lastChild.textContent += m.slice(i);
    return w;
  }

  function wrap(node) {
    var t = node.nodeValue, f = document.createDocumentFragment(), last = 0;
    t.replace(re, function (m, off) {
      f.appendChild(document.createTextNode(t.slice(last, off)));
      f.appendChild(build(m));
      last = off + m.length;
      return m;
    });
    f.appendChild(document.createTextNode(t.slice(last)));
    node.parentNode.replaceChild(f, node);
  }

  function run(root) {
    var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false), hits = [], n;
    while ((n = tw.nextNode())) {
      if (n.parentElement && test.test(n.nodeValue) && !n.parentElement.closest(SKIP)) hits.push(n);
    }
    hits.forEach(wrap);
  }

  function start() {
    run(document.body);
    // Lightboxes, galleries and forms are rendered after load. Our own insertions are
    // skipped: they sit inside .kw-bt, and the text either side of them no longer matches.
    new MutationObserver(function (ms) {
      ms.forEach(function (m) {
        m.addedNodes.forEach(function (a) {
          if (a.nodeType === 3 && a.parentElement && !a.parentElement.closest(SKIP)) run(a.parentElement);
          else if (a.nodeType === 1 && !a.closest(".kw-bt")) run(a);
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  window.kwBrandText = { version: VERSION, run: run };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
