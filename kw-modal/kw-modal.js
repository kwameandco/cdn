/*! kw-modal v1.0.0 — lightweight accessible dialog for Webstudio (MINDBODY booking) */
(function () {
  "use strict";

  var doc = document;
  var cs = doc.currentScript;

  // Embed loaders. A widget injected after page-load isn't auto-processed, so we
  // re-append the matching loader on open to force it to scan the new widget.
  var LOADERS = [
    {
      sel: ".mindbody-widget",
      id:  "kw-modal-mb-loader",
      src: (cs && cs.getAttribute("data-mbo-src")) || "https://brandedweb.mindbodyonline.com/embed/widget.js"
    },
    {
      sel: "healcode-widget",
      id:  "kw-modal-hc-loader",
      src: (cs && cs.getAttribute("data-hc-src")) || "https://widgets.healcode.com/javascripts/healcode.js"
    }
  ];

  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),iframe,[tabindex]:not([tabindex="-1"])';

  var modal, panel, titleEl, bodyEl, lastTrigger;

  function build() {
    if (modal) return modal;
    modal = doc.createElement("div");
    modal.className = "kw-modal";
    modal.setAttribute("hidden", "");
    modal.innerHTML =
      '<div class="kw-modal__backdrop" data-kw-modal-close></div>' +
      '<div class="kw-modal__panel" role="dialog" aria-modal="true" aria-labelledby="kw-modal-title" tabindex="-1">' +
        '<button type="button" class="kw-modal__close" data-kw-modal-close aria-label="Close">×</button>' +
        '<h2 class="kw-modal__title" id="kw-modal-title"></h2>' +
        '<div class="kw-modal__body"></div>' +
      '</div>';
    doc.body.appendChild(modal);
    panel   = modal.querySelector(".kw-modal__panel");
    titleEl = modal.querySelector(".kw-modal__title");
    bodyEl  = modal.querySelector(".kw-modal__body");
    return modal;
  }

  function lockScroll() {
    var sw = window.innerWidth - doc.documentElement.clientWidth;
    doc.documentElement.style.overflow = "hidden";
    if (sw > 0) doc.documentElement.style.paddingRight = sw + "px";
  }
  function unlockScroll() {
    doc.documentElement.style.overflow = "";
    doc.documentElement.style.paddingRight = "";
  }

  function runEmbeds() {
    LOADERS.forEach(function (l) {
      if (!bodyEl.querySelector(l.sel)) return;
      var old = doc.getElementById(l.id);
      if (old) old.remove();
      var s = doc.createElement("script");
      s.id = l.id;
      s.src = l.src;
      s.async = true;
      doc.body.appendChild(s);
    });
  }

  function parseHTML(html) {
    var t = doc.createElement("template");   // inert parse — scripts won't run
    t.innerHTML = html;
    return t.content.cloneNode(true);
  }

  // Content resolution, in priority order:
  //   1. data-kw-modal-html on the trigger — an HTML string (bind to the MBO Widget
  //      field in Webstudio). Simplest wiring: no extra elements.
  //   2. <template data-kw-modal-content> inside the trigger's [data-kw-modal-item] scope
  //   3. a .mindbody-widget div built from data-widget-id on the trigger
  function contentFor(trigger) {
    var html = trigger.getAttribute("data-kw-modal-html");
    if (html && html.trim()) return parseHTML(html);

    var scope = trigger.closest("[data-kw-modal-item]") || trigger.parentNode || doc;
    var tpl = scope.querySelector && scope.querySelector("template[data-kw-modal-content]");
    if (tpl && "content" in tpl) return tpl.content.cloneNode(true);

    var wid = trigger.getAttribute("data-widget-id");
    if (wid) {
      var w = doc.createElement("div");
      w.className = "mindbody-widget";
      w.setAttribute("data-widget-type", trigger.getAttribute("data-widget-type") || "Appointments");
      w.setAttribute("data-widget-id", wid);
      return w;
    }
    return null;
  }

  function open(trigger) {
    build();
    var content = contentFor(trigger);
    if (!content) console.warn("[kw-modal] no content found for trigger", trigger);

    titleEl.textContent =
      trigger.getAttribute("data-kw-modal-title") ||
      trigger.getAttribute("data-treatment") ||
      "Book";

    bodyEl.textContent = "";
    if (content) bodyEl.appendChild(content);

    lastTrigger = trigger;
    modal.removeAttribute("hidden");
    void modal.offsetWidth;           // reflow so the enter transition runs
    modal.classList.add("is-open");
    lockScroll();
    runEmbeds();

    var closeBtn = panel.querySelector(".kw-modal__close");
    (closeBtn || panel).focus();
    doc.addEventListener("keydown", onKey, true);
  }

  function close() {
    if (!modal || modal.hasAttribute("hidden")) return;
    modal.classList.remove("is-open");
    unlockScroll();
    doc.removeEventListener("keydown", onKey, true);

    var finished = false;
    var done = function () {
      if (finished) return;
      finished = true;
      modal.setAttribute("hidden", "");
      bodyEl.textContent = "";        // unload the widget / iframe
      panel.removeEventListener("transitionend", done);
    };
    panel.addEventListener("transitionend", done);
    setTimeout(done, 300);            // fallback when there's no transition

    if (lastTrigger && typeof lastTrigger.focus === "function") lastTrigger.focus();
  }

  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key !== "Tab") return;
    var f = Array.prototype.filter.call(panel.querySelectorAll(FOCUSABLE), function (el) {
      return el.offsetParent !== null || el === doc.activeElement;
    });
    if (!f.length) { e.preventDefault(); panel.focus(); return; }
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  doc.addEventListener("click", function (e) {
    var node = e.target;
    if (!node || !node.closest) return;
    var opener = node.closest("[data-kw-modal-open]");
    if (opener) { e.preventDefault(); open(opener); return; }
    if (node.closest("[data-kw-modal-close]")) { e.preventDefault(); close(); }
  });

  window.kwModal = { version: "1.0.0", open: open, close: close };
})();
