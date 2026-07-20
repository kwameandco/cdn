/*! kw-rowexpand v1.1.0 — accessible row disclosure for table-style lists */
(function () {
  "use strict";

  if (window.kwRowExpand) return; // idempotent: survives double script injection

  var VERSION = "1.1.0";
  var hydrationDone = false;
  var groups = new WeakMap();
  var uid = 0;
  var observer = null;
  var resizeTimer = null;

  /**
   * Webstudio renders via React. Mutating the DOM *structurally* before React
   * has hydrated throws error #418 (hydration mismatch) and can blank the page.
   * Attribute-only changes are safe; inserting/removing nodes is not.
   * Same gate as kw-carousel — poll for React's fiber marker, with a ceiling so
   * a non-React page (or a hydration failure) still boots rather than hanging.
   */
  function whenHydrated(cb) {
    if (hydrationDone || window.kwRowExpandNoHydrationGate) {
      hydrationDone = true;
      cb();
      return;
    }
    var t0 = Date.now();
    (function poll() {
      var b = document.body;
      var ready = b && Object.keys(b).some(function (k) {
        return k.indexOf("__reactFiber$") === 0;
      });
      if (ready || Date.now() - t0 > 8000) {
        hydrationDone = true;
        setTimeout(cb, 100);
      } else {
        setTimeout(poll, 50);
      }
    })();
  }

  function attr(el, name, fallback) {
    var v = el && el.getAttribute(name);
    return v === null || v === undefined || v === "" ? fallback : v;
  }

  function nextId(prefix) {
    uid += 1;
    return "kwre-" + prefix + "-" + uid;
  }

  function lineHeight(el) {
    var cs = getComputedStyle(el);
    var lh = parseFloat(cs.lineHeight); // "normal" parses to NaN
    if (isNaN(lh)) lh = parseFloat(cs.fontSize) * 1.4;
    // Both can be unavailable (no layout engine, detached node). Falling through
    // with NaN makes every `scrollHeight > NaN` comparison false, so the plugin
    // would silently decide nothing overflows and never show "Read more".
    if (isNaN(lh) || lh <= 0) lh = 22.4; // 16px * 1.4
    return lh;
  }

  /* ---------------------------------------------------------------- item */

  function initItem(group, item) {
    if (item.__kwre) return item.__kwre;

    var tagList = item.querySelector("[data-kw-rowexpand-tags]");
    var detail = item.querySelector("[data-kw-rowexpand-detail]");
    var descWrap = item.querySelector("[data-kw-rowexpand-desc]");
    var max = parseInt(attr(group.root, "data-kw-rowexpand-max", "3"), 10);
    if (isNaN(max) || max < 0) max = 3;

    var tags = tagList
      ? Array.prototype.filter.call(tagList.children, function (n) {
          return n.nodeType === 1 && !n.hasAttribute("data-kw-rowexpand-toggle");
        })
      : [];
    var overflow = tags.slice(max);

    // The clamped paragraph, if a description wrapper is present.
    var descP = descWrap ? (descWrap.querySelector(":scope > p") || descWrap.querySelector("p")) : null;

    if (!overflow.length && !detail && !descP) return null;

    var state = {
      item: item,
      group: group,
      tagList: tagList,
      detail: detail,
      descWrap: descWrap,
      descP: descP,
      overflow: overflow,
      expanded: false,
      toggle: null,
      descToggle: null,
      descOverflowing: false
    };

    if (detail && !detail.id) detail.id = nextId("detail");
    if (descWrap && !descWrap.id) descWrap.id = nextId("desc");

    /* --- tag toggle ("+N more") --- */
    var toggle = item.querySelector("[data-kw-rowexpand-toggle]");
    var generated = false;
    if (!toggle && overflow.length && tagList) {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "kw-rowexpand-more";
      toggle.setAttribute("data-kw-rowexpand-toggle", "");
      generated = true;
    }
    if (toggle) {
      prepToggle(toggle, state, detail || descWrap);
      state.toggle = toggle;
      if (generated) tagList.appendChild(toggle);
    }

    /* --- description toggle ("Read more") --- */
    if (descP) {
      var dt = item.querySelector("[data-kw-rowexpand-desc-toggle]");
      if (!dt) {
        dt = document.createElement("button");
        dt.type = "button";
        dt.className = "kw-rowexpand-readmore";
        dt.setAttribute("data-kw-rowexpand-desc-toggle", "");
        dt.hidden = true; // shown only if the text actually overflows
        descWrap.appendChild(dt);
      }
      prepToggle(dt, state, descWrap);
      state.descToggle = dt;
    }

    // Legacy/alternate trigger name kept working.
    var altToggle = item.querySelector("[data-kw-rowexpand-detail-toggle]");
    if (altToggle) {
      prepToggle(altToggle, state, detail || descWrap);
      state.altToggle = altToggle;
    }

    item.__kwre = state;
    applyState(state);
    measure(state);
    return state;
  }

  function prepToggle(el, state, controls) {
    // A real <button> already has role + keyboard behaviour. If an author used
    // something else, give it button semantics rather than silently shipping
    // something a keyboard or screen-reader user cannot operate.
    if (el.tagName !== "BUTTON") {
      el.setAttribute("role", "button");
      if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
          e.preventDefault();
          setExpanded(state.group, state, !state.expanded);
        }
      });
    }
    el.setAttribute("aria-expanded", "false");
    if (controls && controls.id) el.setAttribute("aria-controls", controls.id);
    el.addEventListener("click", function (e) {
      e.preventDefault();
      setExpanded(state.group, state, !state.expanded);
    });
  }

  /* ------------------------------------------------------------- measure */

  /**
   * Decide whether the description actually overflows its clamp. Only then is a
   * "Read more" worth showing — a control that expands nothing is noise, and
   * filter-readmore (which this replaces) got that right.
   */
  function measure(state) {
    var p = state.descP;
    if (!p || !state.descWrap) return;
    if (state.expanded) return;

    var lines = parseInt(attr(state.group.root, "data-kw-rowexpand-lines", "3"), 10);
    if (isNaN(lines) || lines < 1) lines = 3;

    var collapsedPx = lineHeight(p) * lines;
    var overflowing = p.scrollHeight > collapsedPx + 2;
    state.descOverflowing = overflowing;

    if (overflowing) {
      p.style.maxHeight = collapsedPx + "px";
      if (state.descToggle) state.descToggle.hidden = false;
    } else {
      p.style.maxHeight = "";
      if (state.descToggle) state.descToggle.hidden = true;
    }
  }

  /* --------------------------------------------------------------- state */

  function applyState(state) {
    var expanded = state.expanded;

    // `hidden` (not just display:none) keeps collapsed tags out of the
    // accessibility tree and out of tab order — a screen reader should not read
    // content the sighted user cannot see.
    state.overflow.forEach(function (el) {
      if (expanded) el.removeAttribute("hidden");
      else el.setAttribute("hidden", "");
    });

    if (state.detail) {
      if (expanded) state.detail.removeAttribute("hidden");
      else state.detail.setAttribute("hidden", "");
    }

    // Description clamp: class drives the CSS, maxHeight drives the animation.
    if (state.descWrap && state.descP) {
      var p = state.descP;
      if (expanded) {
        state.descWrap.classList.add("kw-rowexpand-open");
        p.style.maxHeight = p.scrollHeight + "px";
        setTimeout(function () {
          if (state.expanded) p.style.maxHeight = "none";
        }, 400);
      } else {
        state.descWrap.classList.remove("kw-rowexpand-open");
        if (state.descOverflowing) {
          var lines = parseInt(attr(state.group.root, "data-kw-rowexpand-lines", "3"), 10);
          if (isNaN(lines) || lines < 1) lines = 3;
          p.style.maxHeight = p.scrollHeight + "px";
          requestAnimationFrame(function () {
            if (!state.expanded) p.style.maxHeight = lineHeight(p) * lines + "px";
          });
        }
      }
    }

    var n = state.overflow.length;
    if (state.toggle) {
      state.toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
      if (!state.toggle.hasAttribute("data-kw-rowexpand-keep-label")) {
        state.toggle.textContent = expanded
          ? attr(state.toggle, "data-label-less", "Show less")
          : n
            ? "+" + n + " more"
            : attr(state.toggle, "data-label-more", "More");
      }
    }
    if (state.descToggle) {
      state.descToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
      if (!state.descToggle.hasAttribute("data-kw-rowexpand-keep-label")) {
        state.descToggle.textContent = expanded
          ? attr(state.descToggle, "data-label-less", "Show less")
          : attr(state.descToggle, "data-label-more", "Read more");
      }
    }
    if (state.altToggle) {
      state.altToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    }

    state.item.setAttribute("data-kw-rowexpand-state", expanded ? "expanded" : "collapsed");
  }

  function setExpanded(group, state, next) {
    // Accordion: only one row open per group.
    if (next && group.single) {
      group.items.forEach(function (other) {
        if (other !== state && other.expanded) {
          other.expanded = false;
          applyState(other);
        }
      });
    }
    state.expanded = next;
    applyState(state);
  }

  /* --------------------------------------------------------------- group */

  function initGroup(root) {
    var existing = groups.get(root);
    if (existing) return existing;
    var group = {
      root: root,
      single: attr(root, "data-kw-rowexpand-single", "true") !== "false",
      items: []
    };
    groups.set(root, group);
    refresh(group);
    return group;
  }

  function refresh(group) {
    var sel = attr(group.root, "data-kw-rowexpand-item-selector", "[data-kw-rowexpand-item]");
    var items = group.root.querySelectorAll(sel);
    group.items = [];
    Array.prototype.forEach.call(items, function (item) {
      var st = initItem(group, item);
      if (st) group.items.push(st);
    });
  }

  function eachGroup(fn) {
    document.querySelectorAll("[data-kw-rowexpand]").forEach(function (root) {
      var g = groups.get(root) || initGroup(root);
      fn(g);
    });
  }

  /* ---------------------------------------------------------------- boot */

  function bootNow() {
    eachGroup(function () {});

    /**
     * kw-filter re-renders rows when filtering or paginating, which drops our
     * listeners and re-shows every collapsed tag. Re-scan on mutation so the
     * page doesn't have to remember to call refresh(). Ignore our own inserts,
     * or we loop.
     */
    if (!observer && typeof MutationObserver === "function") {
      try {
        observer = new MutationObserver(function (muts) {
          for (var i = 0; i < muts.length; i++) {
            var added = muts[i].addedNodes;
            for (var j = 0; j < added.length; j++) {
              var n = added[j];
              if (
                n.nodeType === 1 &&
                !(n.classList &&
                  (n.classList.contains("kw-rowexpand-more") ||
                   n.classList.contains("kw-rowexpand-readmore")))
              ) {
                eachGroup(refresh);
                return;
              }
            }
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
      } catch (e) {}
    }

    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        eachGroup(function (g) {
          g.items.forEach(measure);
        });
      }, 150);
    });
  }

  function boot() {
    whenHydrated(bootNow);
  }

  window.kwRowExpand = {
    version: VERSION,
    boot: boot,
    refresh: function (root) {
      if (root) {
        var g = groups.get(root) || initGroup(root);
        refresh(g);
        return;
      }
      eachGroup(refresh);
    },
    remeasure: function () {
      eachGroup(function (g) {
        g.items.forEach(measure);
      });
    },
    collapseAll: function () {
      eachGroup(function (g) {
        g.items.forEach(function (st) {
          st.expanded = false;
          applyState(st);
        });
      });
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
