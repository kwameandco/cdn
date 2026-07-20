/*! kw-rowexpand v1.0.0 — accessible row disclosure for table-style lists */
(function () {
  "use strict";

  if (window.kwRowExpand) return; // idempotent: survives double script injection

  var VERSION = "1.0.0";
  var hydrationDone = false;
  var groups = new WeakMap();
  var uid = 0;

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
    var v = el.getAttribute(name);
    return v === null || v === "" ? fallback : v;
  }

  function nextId(prefix) {
    uid += 1;
    return "kwre-" + prefix + "-" + uid;
  }

  /* ---------------------------------------------------------------- item */

  function initItem(group, item) {
    if (item.__kwre) return item.__kwre;

    var tagList = item.querySelector("[data-kw-rowexpand-tags]");
    var detail = item.querySelector("[data-kw-rowexpand-detail]");
    var max = parseInt(attr(group.root, "data-kw-rowexpand-max", "3"), 10);
    if (isNaN(max) || max < 0) max = 3;

    // Tag children: element children of the tag list (li/a/span — we don't care which).
    var tags = tagList ? Array.prototype.filter.call(tagList.children, function (n) {
      return n.nodeType === 1;
    }) : [];
    var overflow = tags.slice(max);

    // Nothing to disclose: no overflowing tags AND no detail region.
    if (!overflow.length && !detail) return null;

    var state = {
      item: item,
      tagList: tagList,
      detail: detail,
      overflow: overflow,
      expanded: false,
      toggle: null
    };

    if (detail && !detail.id) detail.id = nextId("detail");

    // Build the toggle. An explicit [data-kw-rowexpand-toggle] wins so authors can
    // place it themselves; otherwise we append one to the tag list.
    var toggle = item.querySelector("[data-kw-rowexpand-toggle]");
    var generated = false;
    if (!toggle && overflow.length) {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "kw-rowexpand-more";
      toggle.setAttribute("data-kw-rowexpand-toggle", "");
      generated = true;
    }

    if (toggle) {
      // <button> already has the right role/keyboard behaviour. If an author used a
      // non-button element, give it button semantics rather than silently shipping
      // something a keyboard or screen-reader user cannot operate.
      if (toggle.tagName !== "BUTTON") {
        toggle.setAttribute("role", "button");
        if (!toggle.hasAttribute("tabindex")) toggle.setAttribute("tabindex", "0");
        toggle.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
            e.preventDefault();
            setExpanded(group, state, !state.expanded, true);
          }
        });
      }
      toggle.setAttribute("aria-expanded", "false");
      if (detail) toggle.setAttribute("aria-controls", detail.id);
      toggle.addEventListener("click", function (e) {
        e.preventDefault();
        setExpanded(group, state, !state.expanded, true);
      });
      state.toggle = toggle;
      if (generated) tagList.appendChild(toggle);
    }

    // A second, optional trigger on the description side, so clicking either the
    // "+N more" or the description toggle opens both — the bidirectional behaviour.
    var detailToggle = item.querySelector("[data-kw-rowexpand-detail-toggle]");
    if (detailToggle) {
      if (detailToggle.tagName !== "BUTTON") {
        detailToggle.setAttribute("role", "button");
        if (!detailToggle.hasAttribute("tabindex")) detailToggle.setAttribute("tabindex", "0");
      }
      detailToggle.setAttribute("aria-expanded", "false");
      if (detail) detailToggle.setAttribute("aria-controls", detail.id);
      detailToggle.addEventListener("click", function (e) {
        e.preventDefault();
        setExpanded(group, state, !state.expanded, true);
      });
      state.detailToggle = detailToggle;
    }

    item.__kwre = state;
    applyState(state); // collapse to the initial state
    return state;
  }

  /* --------------------------------------------------------------- state */

  function applyState(state) {
    var expanded = state.expanded;

    // `hidden` (not just display:none) keeps collapsed tags out of the
    // accessibility tree and out of tab order — a screen reader should not read
    // rows the sighted user cannot see.
    state.overflow.forEach(function (el) {
      if (expanded) el.removeAttribute("hidden");
      else el.setAttribute("hidden", "");
    });

    if (state.detail) {
      if (expanded) state.detail.removeAttribute("hidden");
      else state.detail.setAttribute("hidden", "");
    }

    if (state.toggle) {
      state.toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
      if (!state.toggle.hasAttribute("data-kw-rowexpand-keep-label")) {
        var n = state.overflow.length;
        state.toggle.textContent = expanded
          ? (attr(state.toggle, "data-label-less", "Show less"))
          : (n ? "+" + n + " more" : attr(state.toggle, "data-label-more", "More"));
      }
    }
    if (state.detailToggle) {
      state.detailToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    }

    state.item.setAttribute("data-kw-rowexpand-state", expanded ? "expanded" : "collapsed");
  }

  function setExpanded(group, state, next, userInitiated) {
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

    if (userInitiated && next && state.detail) {
      // Announce the newly revealed region without stealing focus from the toggle
      // (moving focus on every expand is disorienting for keyboard users).
      state.detail.setAttribute("tabindex", "-1");
    }
  }

  /* --------------------------------------------------------------- group */

  function initGroup(root) {
    if (groups.get(root)) return groups.get(root);
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
    var sel = attr(group.root, "data-kw-rowexpand-item", "[data-kw-rowexpand-item]");
    var items = group.root.querySelectorAll(sel);
    group.items = [];
    Array.prototype.forEach.call(items, function (item) {
      var st = initItem(group, item);
      if (st) group.items.push(st);
    });
  }

  /* ---------------------------------------------------------------- boot */

  function bootNow() {
    document.querySelectorAll("[data-kw-rowexpand]").forEach(function (root) {
      initGroup(root);
    });
  }

  function boot() {
    whenHydrated(bootNow);
  }

  window.kwRowExpand = {
    version: VERSION,
    boot: boot,
    /**
     * Re-scan after the list changes. kw-filter re-renders rows when filtering,
     * which drops our listeners and re-shows every tag — call this afterwards.
     */
    refresh: function (root) {
      if (root) {
        var g = groups.get(root) || initGroup(root);
        refresh(g);
        return;
      }
      document.querySelectorAll("[data-kw-rowexpand]").forEach(function (r) {
        var g = groups.get(r) || initGroup(r);
        refresh(g);
      });
    },
    collapseAll: function (root) {
      var g = root && groups.get(root);
      var list = g ? [g] : [];
      if (!g) {
        document.querySelectorAll("[data-kw-rowexpand]").forEach(function (r) {
          var gg = groups.get(r);
          if (gg) list.push(gg);
        });
      }
      list.forEach(function (grp) {
        grp.items.forEach(function (st) {
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
