/**
 * kw-filter v1.5.0
 * See README.md for attribute API. See instructions.md for setup.
 */
(function (win, doc) {
  'use strict';

  if (win.kwFilter) return;

  /* ── Bootstrap config ───────────────────────────────────────────────────── */
  // Capture currentScript synchronously — only available during execution.
  const _cs = doc.currentScript;

  // data-features="dropdowns chips url-params sort-lists" (space or comma separated).
  // Absent = all features on (backwards-compatible). Present = only listed features run.
  const _fs     = _cs?.getAttribute('data-features') ?? null;
  const FEATURES = _fs !== null
    ? new Set(_fs.split(/[\s,]+/).map(s => s.trim().toLowerCase()).filter(Boolean))
    : null;

  // data-debug on the script tag — or set window.kwFilterDebug=true before the script loads.
  const DEBUG = (_cs?.hasAttribute('data-debug') ?? false) || !!win.kwFilterDebug;

  function feat(name) { return !FEATURES || FEATURES.has(name); }
  function log(...a)  { if (DEBUG) console.log('[kw-filter]', ...a); }
  function warn(...a) { if (DEBUG) console.warn('[kw-filter]', ...a); }

  /* ── Constants ──────────────────────────────────────────────────────────── */
  const VERSION = '1.5.0';
  const NP = 'data-kw-filter-';
  const LP = 'sift-';

  /* ── Attribute helpers ──────────────────────────────────────────────────── */
  function ga(el, suf) {
    const v = el.getAttribute(NP + suf);
    return v !== null ? v : el.getAttribute(LP + suf);
  }
  function ha(el, suf) {
    return el.hasAttribute(NP + suf) || el.hasAttribute(LP + suf);
  }
  function asel(suf, val) {
    const eq = val !== undefined ? `="${val}"` : '';
    return `[${NP}${suf}${eq}],[${LP}${suf}${eq}]`;
  }
  function qa(root, suf, val) {
    return Array.from(root.querySelectorAll(asel(suf, val)));
  }
  function q1(root, suf, val) {
    return root.querySelector(asel(suf, val));
  }

  /* ── Date parsing ───────────────────────────────────────────────────────── */
  function parseDate(str) {
    if (!str) return null;
    str = str.trim();
    let m;
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) { const d = new Date(str); return isNaN(d) ? null : d; }
    m = str.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
    if (m) { const d = new Date(`${m[2]} ${m[1]}, ${m[3]}`); return isNaN(d) ? null : d; }
    m = str.match(/^[A-Za-z]+\s+\d{1,2},\s*\d{4}/);
    if (m) { const d = new Date(str); return isNaN(d) ? null : d; }
    m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) { const d = new Date(`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`); return isNaN(d) ? null : d; }
    m = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (m) { const d = new Date(`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`); return isNaN(d) ? null : d; }
    return null;
  }

  /* ── Matchers ───────────────────────────────────────────────────────────── */
  const matchers = {
    text(iv, fv)  { if (!fv) return true; return iv.toLowerCase().includes(fv.toLowerCase().trim()); },
    select(iv, fv){ if (!fv) return true; return iv.toLowerCase() === fv.toLowerCase(); },
    checkbox(iv, fvs) {
      if (!fvs || !fvs.length) return true;
      const parts = iv.split(',').map(v => v.trim().toLowerCase());
      return fvs.some(fv => parts.includes(fv.toLowerCase()));
    },
    // toggle: passes when tag value is truthy (non-empty, not "false"/"0"/"no")
    toggle(iv) {
      const v = iv.toLowerCase().trim();
      return v !== '' && v !== 'false' && v !== '0' && v !== 'no';
    },
    // radio reuses matchers.select (exact match)
    // range handled inline in runFilter (needs separate min + max)
  };

  /* ── Tag value helper ──────────────────────────────────────────────────── */
  // For <ul>/<ol> tags (e.g. sift-checkbox-tag on a list of teacher names),
  // join <li> children with commas so the comma-split matcher works correctly.
  function getTagValue(el) {
    if (el.matches('ul, ol')) {
      return Array.from(el.querySelectorAll(':scope > li'))
        .map(li => li.textContent.trim())
        .filter(Boolean)
        .join(',');
    }
    return el.textContent.trim();
  }

  /* ── Style injection ────────────────────────────────────────────────────── */
  function injectStyles() {
    if (doc.getElementById('kw-filter-styles')) return;
    const s = doc.createElement('style');
    s.id = 'kw-filter-styles';
    s.textContent = [
      '[data-kw-filter-pill]{display:inline-flex;align-items:center;gap:.3em;padding:.25em .65em;',
      'background:#f3f4f6;border:1px solid #d1d5db;border-radius:999px;cursor:pointer;',
      'font-size:.875rem;line-height:1.5;font-family:inherit;color:inherit;',
      'appearance:none;-webkit-appearance:none;margin:.2em}',
      '[data-kw-filter-pill]:hover{background:#e5e7eb;border-color:#9ca3af}',
      '[data-kw-filter-pill-label]{pointer-events:none}',
      '[data-kw-filter-pill-remove]{pointer-events:none;margin-left:.2em;opacity:.55;font-size:1.1em;line-height:1}',
    ].join('');
    doc.head.appendChild(s);
  }

  /* ── Floating UI loader ─────────────────────────────────────────────────── */
  function loadFloatingUI() {
    if (win.FloatingUIDOM) { log('FloatingUI already present on window'); return; }
    log('injecting FloatingUI module script from CDN');
    const s = doc.createElement('script');
    s.type = 'module';
    s.textContent =
      "import*as F from'https://cdn.jsdelivr.net/npm/@floating-ui/dom@1.4.4/+esm';" +
      "window.FloatingUIDOM=F;" +
      "window.dispatchEvent(new CustomEvent('kw-filter:floatingui-ready'));";
    win.addEventListener('kw-filter:floatingui-ready', () => {
      log('FloatingUI ready — re-positioning any open dropdowns');
      doc.querySelectorAll('.filter-group.open').forEach((g) => g._kwUpdatePos?.());
    }, { once: true });
    doc.head.appendChild(s);
  }

  /* ── Dropdown UI (filter-group / chips) ─────────────────────────────────── */
  let _dropdownListenersBound = false;

  function sortFilterLists(root) {
    const lists = root.querySelectorAll(asel('checkboxes'));
    log(`sortFilterLists: sorting ${lists.length} list(s)`);
    lists.forEach((list) => {
      [...list.children]
        .sort((a, b) => a.textContent.trim().localeCompare(b.textContent.trim(), undefined, { sensitivity: 'base' }))
        .forEach((el) => list.appendChild(el));
    });
  }

  function renderChips() {
    const chipBar = doc.getElementById('chips');
    if (!chipBar) { log('renderChips: #chips element not found, skipping'); return; }

    let tpl = chipBar.querySelector('.chip[data-chip-template]');
    if (!tpl) {
      tpl = chipBar.querySelector('.chip');
      if (!tpl) { warn('renderChips: no .chip template found inside #chips — chips will not render'); return; }
      tpl.setAttribute('data-chip-template', '');
      tpl.style.display = 'none';
    }

    chipBar.querySelectorAll('.chip:not([data-chip-template])').forEach((n) => n.remove());

    let count = 0;
    doc.querySelectorAll('.filter-group').forEach((group) => {
      const key = (group.getAttribute('data-filter-box') || '').trim();
      if (!key) {
        warn('renderChips: .filter-group is missing data-filter-box, chips will not render for this group', group);
        return;
      }
      group.querySelectorAll(asel('checkboxes') + ' input[type="checkbox"]:checked').forEach((cb) => {
        const chip = tpl.cloneNode(true);
        chip.removeAttribute('data-chip-template');
        chip.setAttribute('data-kw-chip', ''); // marks as plugin-generated (not React dummy)
        chip.style.display = '';
        chip.classList.add(key);

        const x = chip.querySelector('.x');
        chip.textContent = cb.value;
        if (x) chip.appendChild(x);

        const remove = (ev) => {
          ev?.stopPropagation?.();
          cb.checked = false;
          cb.dispatchEvent(new Event('input',  { bubbles: true }));
          cb.dispatchEvent(new Event('change', { bubbles: true }));
          chip.remove();
        };
        chip.addEventListener('click', remove);
        x?.addEventListener('click', remove);
        chipBar.appendChild(chip);
        count++;
      });
    });
    log(`renderChips: rendered ${count} chip(s)`);
    updateDropdownCounts();
  }

  function updateDropdownCounts() {
    doc.querySelectorAll('.filter-group').forEach((group) => {
      const btn = group.querySelector('.filter-trigger');
      if (!btn) return;
      const n = group.querySelectorAll(asel('checkboxes') + ' input[type="checkbox"]:checked').length;
      if (n > 0) {
        btn.setAttribute('data-kw-count', n);
        group.classList.add('gradient-border');
        // If the trigger contains a [data-kw-count-display] element, write the number into it.
        const display = btn.querySelector('[data-kw-count-display]');
        if (display) display.textContent = n;
      } else {
        btn.removeAttribute('data-kw-count');
        group.classList.remove('gradient-border');
        const display = btn.querySelector('[data-kw-count-display]');
        if (display) display.textContent = '';
      }
    });
  }

  function initDropdownGroup(group) {
    if (group.dataset.uiInit === 'true') {
      log('initDropdownGroup: already initialised, skipping', group);
      return;
    }
    group.dataset.uiInit = 'true';

    const btn = group.querySelector('.filter-trigger');
    if (!btn) {
      warn('initDropdownGroup: no .filter-trigger found inside .filter-group — dropdown will not work', group);
      return;
    }

    const dd = group.querySelector('.dropdown');
    if (!dd) {
      warn('initDropdownGroup: no .dropdown found inside .filter-group — dropdown will not work', group);
      return;
    }

    // Support the checkboxes wrapper being the .dropdown itself OR a descendant.
    const list = dd.matches(asel('checkboxes')) ? dd : dd.querySelector(asel('checkboxes'));
    if (!list) {
      warn('initDropdownGroup: no [sift-checkboxes]/[data-kw-filter-checkboxes] found inside .dropdown — dropdown will not work', dd);
      return;
    }

    if (DEBUG) {
      const pos = getComputedStyle(dd).position;
      if (pos === 'static') warn(`initDropdownGroup: .dropdown has position:static — dropdown will not float above content. Set position:absolute or position:fixed on .dropdown in canvas CSS.`);
      else log(`initDropdownGroup: .dropdown current position:"${pos}"`);
    }

    log('initDropdownGroup: initialising', group);

    // Abort any previous controller for the same data-filter-box so stale
    // doc-level listeners from React-replaced elements don't accumulate.
    const boxKey = group.getAttribute('data-filter-box');
    if (boxKey && win._kwGroupAcs?.[boxKey]) {
      win._kwGroupAcs[boxKey].abort();
      log(`initDropdownGroup: aborted stale controller for data-filter-box="${boxKey}"`);
    }

    const ac  = new AbortController();
    const sig = { signal: ac.signal };
    group._kwAc = ac;
    (win._kwGroupAcs ??= {})[boxKey] = ac;

    // Capture the CSS-computed display so open() restores it (e.g. 'flex', 'grid').
    // Do NOT force position — leave that to canvas CSS to avoid breaking transform ancestors.
    const _ddDisplay = getComputedStyle(dd).display;
    dd.style.zIndex     = '60';
    dd.style.display    = 'none';
    dd.style.opacity    = '0';
    dd.style.visibility = 'hidden';

    const updatePos = () => {
      const F = win.FloatingUIDOM;
      if (!F?.computePosition) {
        log('updatePos: FloatingUI not ready yet — will retry when ready');
        return;
      }
      const { computePosition, offset, flip, shift } = F;
      // Use the element's CSS-controlled position strategy.
      const posType = getComputedStyle(dd).position;
      const strategy = (posType === 'fixed') ? 'fixed' : 'absolute';
      computePosition(btn, dd, {
        placement: 'bottom-start',
        strategy,
        middleware: [offset(6), flip(), shift({ padding: 8 })],
      }).then(({ x, y }) => {
        dd.style.left = `${x}px`;
        dd.style.top  = `${y}px`;
        log(`updatePos: positioned at x=${x} y=${y}`);
      });
    };

    // Expose so the FloatingUI-ready listener can re-position open dropdowns.
    group._kwUpdatePos = updatePos;

    const close = () => {
      if (!group.classList.contains('open')) return; // already closed, no-op
      group.classList.remove('open');
      dd.style.display    = 'none';
      dd.style.opacity    = '0';
      dd.style.visibility = 'hidden';
      btn.setAttribute('aria-expanded', 'false');
      log('dropdown: closed');
    };

    // Store close on the element so open() in OTHER groups can call it directly
    // without dispatching a synthetic click (which would bubble and re-close this group).
    group._kwClose = close;

    const open = () => {
      doc.querySelectorAll('.filter-group.open').forEach((g) => {
        if (g !== group) g._kwClose?.();
      });
      group.classList.add('open');
      dd.style.display    = _ddDisplay || 'block'; // restore CSS-original display ('flex', 'grid', etc.)
      dd.style.opacity    = '1';
      dd.style.visibility = 'visible';
      btn.setAttribute('aria-expanded', 'true');
      log('dropdown: opened, calling updatePos');
      updatePos();
    };

    btn.addEventListener('click', () => {
      log(`trigger clicked — currently open: ${group.classList.contains('open')}`);
      group.classList.contains('open') ? close() : open();
    });

    doc.addEventListener('click', (e) => {
      // Explicitly skip when the click is on the trigger button (or a child of it).
      // Do NOT rely on e.stopPropagation() — the host page may have capture listeners.
      if (btn.contains(e.target)) {
        log('doc click: on trigger — skipping (handled by btn listener)');
        return;
      }
      if (!group.contains(e.target)) {
        log('doc click: outside group — closing');
        close();
      }
    }, sig);

    ['resize', 'scroll'].forEach((evt) => {
      win.addEventListener(evt, () => {
        if (group.classList.contains('open')) updatePos();
      }, { passive: true, capture: true, signal: ac.signal });
    });

    // Note: no per-group list change listener here.
    // renderChips is handled by the global delegate in bindDropdownGlobalListeners.

    dd.querySelector('.filter-search')?.addEventListener('input', (e) => {
      const q = (e.target.value || '').toLowerCase().trim();
      list.querySelectorAll('.pill').forEach((p) => {
        p.style.display = p.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });

    if (feat('chips')) updateDropdownCounts();
    log('initDropdownGroup: done');
  }

  function bindDropdownGlobalListeners() {
    if (_dropdownListenersBound) return;
    _dropdownListenersBound = true;
    log('bindDropdownGlobalListeners: binding global checkbox change + reset listeners');

    doc.addEventListener('change', (e) => {
      if (!(e.target instanceof HTMLInputElement)) return;
      if (e.target.type !== 'checkbox') return;
      if (!e.target.closest(asel('checkboxes'))) return;
      renderChips();
    });

    doc.addEventListener('click', (e) => {
      const resetBtn = e.target instanceof Element ? e.target.closest(asel('reset', 'true')) : null;
      if (!resetBtn) return;
      requestAnimationFrame(renderChips);
    });
  }

  function initDropdownUI(root) {
    const doDropdowns = feat('dropdowns');
    const doChips     = feat('chips');
    log(`initDropdownUI: dropdowns=${doDropdowns}, chips=${doChips}`);

    if (!doDropdowns && !doChips) {
      log('initDropdownUI: both dropdowns and chips features off — skipping');
      return;
    }

    if (doChips) {
      const chipBar = doc.getElementById('chips');
      if (!chipBar) { log('initDropdownUI: #chips not found in document'); }
      const chipTpl = chipBar?.querySelector('.chip') ?? null;
      if (chipTpl && !chipTpl.hasAttribute('data-chip-template')) {
        chipTpl.setAttribute('data-chip-template', '');
        chipTpl.style.display = 'none';
      }
      bindDropdownGlobalListeners();
      renderChips();

      // Watch #chips for React re-adding dummy chips after renderChips cleaned them.
      if (chipBar) {
        const chipsMo = new MutationObserver(() => {
          // If chips were added that aren't ours (no data-kw-chip), clean them up.
          const dirty = chipBar.querySelectorAll('.chip:not([data-chip-template]):not([data-kw-chip])');
          if (dirty.length) {
            log(`chips MutationObserver: ${dirty.length} unexpected chip(s) added (likely React re-render) — re-running renderChips`);
            renderChips();
          }
        });
        chipsMo.observe(chipBar, { childList: true });
      }
    }

    if (doDropdowns) {
      const groups = root.querySelectorAll('.filter-group');
      log(`initDropdownUI: found ${groups.length} .filter-group element(s)`);
      if (groups.length === 0) {
        warn('initDropdownUI: dropdowns feature is on but no .filter-group elements found in document');
      }
      groups.forEach(initDropdownGroup);
    }
  }

  /* ── URL helpers ────────────────────────────────────────────────────────── */
  function paramKey(listId, group) {
    return listId ? `${listId}.${group}` : group;
  }

  function syncURL(state, listId) {
    const p = new URLSearchParams(win.location.search);
    for (const [group, value] of Object.entries(state)) {
      const key = paramKey(listId, group);
      if (value === null || value === undefined || value === '' ||
          (Array.isArray(value) && !value.length)) {
        p.delete(key);
      } else if (Array.isArray(value)) {
        p.set(key, value.map(encodeURIComponent).join(','));
      } else {
        p.set(key, encodeURIComponent(String(value)));
      }
    }
    const qs = p.toString();
    win.history.pushState({}, '', win.location.pathname + (qs ? '?' + qs : '') + win.location.hash);
  }

  function readURL(filterGroups, listId) {
    const p = new URLSearchParams(win.location.search);
    const state = {};
    for (const { group, type } of filterGroups) {
      const raw = p.get(paramKey(listId, group));
      if (raw !== null) {
        // checkbox and range are stored as comma-separated arrays; everything else is a plain string
        state[group] = (type === 'checkbox' || type === 'range')
          ? raw.split(',').map(decodeURIComponent)
          : decodeURIComponent(raw);
      }
    }
    return state;
  }

  /* ── Initialized wrappers registry ─────────────────────────────────────── */
  const initialized = new WeakSet();

  /* ── Core: initialise a single list wrapper ─────────────────────────────── */
  function initWrapper(wrapper) {
    if (initialized.has(wrapper)) return;
    initialized.add(wrapper);

    log('initWrapper: initialising', wrapper);

    const listId       = ga(wrapper, 'list-id') || null;
    const itemsToShow  = parseInt(ga(wrapper, 'items-to-show') || '6', 10);
    const loadMoreStep = parseInt(ga(wrapper, 'load-more') || '6', 10);

    // Abort stale listeners if React replaces the wrapper element and re-triggers initWrapper.
    const wrapperKey = listId || wrapper.className || null;
    if (wrapperKey && win._kwWrapperAcs?.[wrapperKey]) {
      win._kwWrapperAcs[wrapperKey].abort();
      log(`initWrapper: aborted stale controller for wrapper "${wrapperKey}"`);
    }
    const ac    = new AbortController();
    const evOpt = { signal: ac.signal };
    if (wrapperKey) (win._kwWrapperAcs ??= {})[wrapperKey] = ac;

    const originalOrder = Array.from(wrapper.children).filter(el => !ha(el, 'no-results') && !ha(el, 'ignore'));
    let visibleCount = itemsToShow;
    let currentSort  = null;

    const parent = wrapper.parentElement || doc.body;

    function scopedState(suf, val) {
      return qa(doc, suf, val).filter(el => {
        const p = el.closest(asel('list', 'true'));
        return !p || p === wrapper;
      });
    }

    // Controls discovery
    const searchInputs  = qa(doc, 'search');
    const selectEls     = qa(doc, 'select');
    const cbWrappers    = qa(doc, 'checkboxes');
    const radioWrappers = qa(doc, 'radio');
    const rangeWrappers = qa(doc, 'range');
    const toggleInputs  = qa(doc, 'toggle');
    const sortSelects   = qa(doc, 'sort', 'true');
    const countEls      = scopedState('count');
    const resetBtns     = scopedState('reset', 'true');
    const loadMoreBtns  = scopedState('load-more-button');
    const pillsConts    = scopedState('pills');

    log(`initWrapper: controls — search:${searchInputs.length} select:${selectEls.length} checkboxes:${cbWrappers.length} radio:${radioWrappers.length} range:${rangeWrappers.length} toggle:${toggleInputs.length} sort:${sortSelects.length} | items:${originalOrder.length}`);

    if (originalOrder.length === 0) {
      warn('initWrapper: no filterable items found inside wrapper — check data-kw-filter-list="true" is on the correct element', wrapper);
    }

    const filterGroups = [
      ...searchInputs.map(el  => ({ group: ga(el,  'search'),     type: 'text'     })),
      ...selectEls.map(el     => ({ group: ga(el,  'select'),     type: 'select'   })),
      ...cbWrappers.map(el    => ({ group: ga(el,  'checkboxes'), type: 'checkbox' })),
      ...radioWrappers.map(el => ({ group: ga(el,  'radio'),      type: 'radio'    })),
      ...rangeWrappers.map(el => ({ group: ga(el,  'range'),      type: 'range'    })),
      ...toggleInputs.map(el  => ({ group: ga(el,  'toggle'),     type: 'toggle'   })),
    ];
    if (sortSelects.length) filterGroups.push({ group: 'sort', type: 'sort' });

    const knownGroups = new Set(filterGroups.map(fg => fg.group));

    // ── applyState ────────────────────────────────────────────────────────
    function applyState(state) {
      for (const [group, value] of Object.entries(state)) {
        if (group === 'sort') {
          for (const ss of sortSelects) ss.value = value || '';
          currentSort = value || null;
          continue;
        }
        const scalar = Array.isArray(value) ? (value[0] || '') : (value || '');

        for (const inp of searchInputs) {
          if (ga(inp, 'search') === group) inp.value = scalar;
        }
        for (const sel of selectEls) {
          if (ga(sel, 'select') === group) sel.value = scalar;
        }
        for (const cbw of cbWrappers) {
          if (ga(cbw, 'checkboxes') === group) {
            const vals = Array.isArray(value) ? value : (value ? [value] : []);
            for (const cb of cbw.querySelectorAll('input[type="checkbox"]')) {
              const desired = vals.includes(cb.value);
              if (cb.checked !== desired) {
                cb.checked = desired;
                // Dispatch change so React-controlled inputs update their virtual DOM state,
                // preventing React from resetting the checkbox on its next re-render.
                cb.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }
          }
        }
        for (const rbw of radioWrappers) {
          if (ga(rbw, 'radio') === group) {
            for (const rb of rbw.querySelectorAll('input[type="radio"]')) {
              rb.checked = rb.value === scalar;
            }
          }
        }
        for (const rng of rangeWrappers) {
          if (ga(rng, 'range') !== group) continue;
          const [min = '', max = ''] = Array.isArray(value) ? value : [];
          const minEl = rng.querySelector(asel('range-min'));
          const maxEl = rng.querySelector(asel('range-max'));
          if (minEl) minEl.value = min;
          if (maxEl) maxEl.value = max;
        }
        for (const tog of toggleInputs) {
          if (ga(tog, 'toggle') === group) tog.checked = !!scalar;
        }
      }
    }

    // ── getState ──────────────────────────────────────────────────────────
    function getState() {
      const s = {};
      for (const inp of searchInputs) s[ga(inp, 'search')]     = inp.value || '';
      for (const sel of selectEls)    s[ga(sel, 'select')]     = sel.value || '';
      for (const cbw of cbWrappers) {
        s[ga(cbw, 'checkboxes')] = Array.from(cbw.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
      }
      for (const rbw of radioWrappers) {
        s[ga(rbw, 'radio')] = rbw.querySelector('input[type="radio"]:checked')?.value || '';
      }
      for (const rng of rangeWrappers) {
        const min = rng.querySelector(asel('range-min'))?.value || '';
        const max = rng.querySelector(asel('range-max'))?.value || '';
        s[ga(rng, 'range')] = (min || max) ? [min, max] : [];
      }
      for (const tog of toggleInputs) s[ga(tog, 'toggle')] = tog.checked ? 'true' : '';
      if (currentSort) s.sort = currentSort;
      return s;
    }

    // ── doSort ────────────────────────────────────────────────────────────
    function doSort(sortVal) {
      if (!sortVal) {
        for (const item of originalOrder) wrapper.appendChild(item);
        return;
      }
      let dir = 'asc', by = 'alphabetical';
      for (const ss of sortSelects) {
        for (const opt of ss.options) {
          if (opt.value === sortVal) {
            dir = ga(opt, 'sort-direction') || 'asc';
            by  = ga(opt, 'sort-by')        || 'alphabetical';
            break;
          }
        }
      }
      const sorted = originalOrder.slice().sort((a, b) => {
        if (by === 'date') {
          const da = parseDate(q1(a, 'sort-tag-date')?.textContent?.trim() || '');
          const db = parseDate(q1(b, 'sort-tag-date')?.textContent?.trim() || '');
          if (!da) return 1; if (!db) return -1;
          return dir === 'asc' ? da - db : db - da;
        }
        if (by === 'numerical') {
          const na = parseFloat((q1(a, 'sort-tag-numerical')?.textContent?.trim() || '0').replace(/[\s,]/g, '')) || 0;
          const nb = parseFloat((q1(b, 'sort-tag-numerical')?.textContent?.trim() || '0').replace(/[\s,]/g, '')) || 0;
          return dir === 'asc' ? na - nb : nb - na;
        }
        const sa = q1(a, 'sort-tag-alphabetical')?.textContent?.trim() || '';
        const sb = q1(b, 'sort-tag-alphabetical')?.textContent?.trim() || '';
        const c = sa.localeCompare(sb, 'en');
        return dir === 'asc' ? c : -c;
      });
      for (const item of sorted) wrapper.appendChild(item);
    }

    // ── renderPills ───────────────────────────────────────────────────────
    function renderPills(pillState) {
      for (const pc of pillsConts) {
        pc.innerHTML = '';
        for (const [group, value] of Object.entries(pillState)) {
          const vals = Array.isArray(value) ? value : (value ? [value] : []);
          for (const v of vals) {
            if (!v) continue;
            const btn = doc.createElement('button');
            btn.type = 'button';
            btn.setAttribute('data-kw-filter-pill', '');
            btn.dataset.group = group;
            btn.dataset.value = v;
            const lbl = doc.createElement('span');
            lbl.setAttribute('data-kw-filter-pill-label', '');
            lbl.textContent = v;
            const rm = doc.createElement('span');
            rm.setAttribute('data-kw-filter-pill-remove', '');
            rm.textContent = '×';
            btn.appendChild(lbl);
            btn.appendChild(rm);
            pc.appendChild(btn);
          }
        }
      }
    }

    // ── runFilter ─────────────────────────────────────────────────────────
    function runFilter() {
      wrapper.setAttribute(NP + 'state', 'filtering');
      wrapper.dispatchEvent(new CustomEvent('kw-filter:before-filter', { bubbles: true }));

      const items   = Array.from(wrapper.children).filter(el => !ha(el, 'no-results') && !ha(el, 'ignore'));
      // Ignored items are always visible regardless of filter state.
      Array.from(wrapper.children).filter(el => ha(el, 'ignore')).forEach(el => { el.style.display = ''; });
      const matched = [];

      for (const item of items) {
        let ok = true;

        // Text search
        for (const inp of searchInputs) {
          if (!ok) break;
          const fv = inp.value;
          if (!fv) continue;
          const tagEl = item.querySelector(asel('search-tag', ga(inp, 'search')));
          if (!tagEl) continue;
          if (!matchers.text(getTagValue(tagEl), fv)) ok = false;
        }

        // Single-select
        for (const sel of selectEls) {
          if (!ok) break;
          const fv = sel.value;
          if (!fv) continue;
          const tagEl = item.querySelector(asel('select-tag', ga(sel, 'select')));
          if (!tagEl) continue;
          if (!matchers.select(getTagValue(tagEl), fv)) ok = false;
        }

        // Checkbox group
        for (const cbw of cbWrappers) {
          if (!ok) break;
          const fvs = Array.from(cbw.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
          if (!fvs.length) continue;
          const tagEl = item.querySelector(asel('checkbox-tag', ga(cbw, 'checkboxes')));
          if (!tagEl) continue;
          if (!matchers.checkbox(getTagValue(tagEl), fvs)) ok = false;
        }

        // Radio group
        for (const rbw of radioWrappers) {
          if (!ok) break;
          const fv = rbw.querySelector('input[type="radio"]:checked')?.value || '';
          if (!fv) continue;
          const tagEl = item.querySelector(asel('radio-tag', ga(rbw, 'radio')));
          if (!tagEl) continue;
          if (!matchers.select(getTagValue(tagEl), fv)) ok = false;
        }

        // Range
        for (const rng of rangeWrappers) {
          if (!ok) break;
          const minEl = rng.querySelector(asel('range-min'));
          const maxEl = rng.querySelector(asel('range-max'));
          const minV  = parseFloat(minEl?.value || '');
          const maxV  = parseFloat(maxEl?.value || '');
          if (isNaN(minV) && isNaN(maxV)) continue;
          const tagEl = item.querySelector(asel('range-tag', ga(rng, 'range')));
          if (!tagEl) continue;
          const n = parseFloat(getTagValue(tagEl).replace(/[^0-9.\-]/g, ''));
          if (isNaN(n)) { ok = false; continue; }
          if (!isNaN(minV) && n < minV) ok = false;
          if (!isNaN(maxV) && n > maxV) ok = false;
        }

        // Toggle
        for (const tog of toggleInputs) {
          if (!ok) break;
          if (!tog.checked) continue;
          const tagEl = item.querySelector(asel('toggle-tag', ga(tog, 'toggle')));
          if (!tagEl) continue;
          if (!matchers.toggle(getTagValue(tagEl))) ok = false;
        }

        if (ok) matched.push(item);
      }

      for (const item of items) {
        item.removeAttribute(NP + 'active');
        item.style.display = 'none';
      }
      const showCount = Math.min(visibleCount, matched.length);
      for (let i = 0; i < showCount; i++) {
        matched[i].setAttribute(NP + 'active', '');
        matched[i].style.display = '';
      }

      wrapper.toggleAttribute(NP + 'empty', matched.length === 0);

      // Standard count elements ([data-kw-filter-count] / [sift-count])
      for (const el of qa(doc, 'count')) {
        const lw = el.closest(asel('list', 'true'));
        if (lw && lw !== wrapper) continue;
        el.textContent = ga(el, 'count') === 'total' ? originalOrder.length : matched.length;
      }
      // Legacy Sift filtered-items counter — shows "all" when unfiltered, number when filtered.
      for (const el of doc.querySelectorAll('[sift-filtered-items]')) {
        const lw = el.closest(asel('list', 'true'));
        if (lw && lw !== wrapper) continue;
        el.textContent = matched.length === originalOrder.length ? 'all' : matched.length;
      }
      for (const btn of loadMoreBtns) {
        btn.hidden = visibleCount >= matched.length;
      }
      updateDropdownCounts();

      // Build pill state
      const pillState = {};
      for (const inp of searchInputs) {
        if (inp.value) pillState[ga(inp, 'search')] = inp.value;
      }
      for (const sel of selectEls) {
        if (sel.value) pillState[ga(sel, 'select')] = sel.value;
      }
      for (const cbw of cbWrappers) {
        const vals = Array.from(cbw.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
        if (vals.length) pillState[ga(cbw, 'checkboxes')] = vals;
      }
      for (const rbw of radioWrappers) {
        const v = rbw.querySelector('input[type="radio"]:checked')?.value || '';
        if (v) pillState[ga(rbw, 'radio')] = v;
      }
      for (const rng of rangeWrappers) {
        const min = rng.querySelector(asel('range-min'))?.value || '';
        const max = rng.querySelector(asel('range-max'))?.value || '';
        if (min || max) {
          pillState[ga(rng, 'range')] = min && max ? `${min}–${max}` : min ? `≥${min}` : `≤${max}`;
        }
      }
      for (const tog of toggleInputs) {
        if (tog.checked) pillState[ga(tog, 'toggle')] = ga(tog, 'toggle');
      }
      renderPills(pillState);

      log(`runFilter: ${matched.length}/${originalOrder.length} matched`);

      wrapper.setAttribute(NP + 'state', 'ready');
      wrapper.dispatchEvent(new CustomEvent('kw-filter:after-filter', {
        bubbles: true,
        detail: { matchCount: matched.length, totalCount: originalOrder.length },
      }));
    }

    // ── URL sync ──────────────────────────────────────────────────────────
    let debTimer = null;
    function scheduleSync() {
      if (!feat('url-params')) return;
      clearTimeout(debTimer);
      debTimer = setTimeout(() => { log('syncURL', getState()); syncURL(getState(), listId); }, 200);
    }

    // ── resetAll ──────────────────────────────────────────────────────────
    function resetAll() {
      log('resetAll');
      for (const inp of searchInputs)   inp.value = '';
      for (const sel of selectEls)      sel.selectedIndex = 0;
      for (const cbw of cbWrappers) {
        for (const cb of cbw.querySelectorAll('input[type="checkbox"]')) cb.checked = false;
      }
      for (const rbw of radioWrappers) {
        for (const rb of rbw.querySelectorAll('input[type="radio"]')) rb.checked = false;
      }
      for (const rng of rangeWrappers) {
        for (const inp of rng.querySelectorAll('input')) inp.value = '';
      }
      for (const tog of toggleInputs) tog.checked = false;
      for (const ss of sortSelects)   ss.selectedIndex = 0;
      currentSort  = null;
      visibleCount = itemsToShow;
      doSort(null);
      if (feat('url-params')) {
        const clearState = {};
        for (const fg of filterGroups) clearState[fg.group] = null;
        syncURL(clearState, listId);
      }
      wrapper.dispatchEvent(new CustomEvent('kw-filter:reset', { bubbles: true }));
      runFilter();
    }

    // ── Event bindings ────────────────────────────────────────────────────
    for (const inp of searchInputs) {
      inp.addEventListener('input', () => { visibleCount = itemsToShow; runFilter(); scheduleSync(); }, evOpt);
    }
    for (const sel of selectEls) {
      sel.addEventListener('change', () => { visibleCount = itemsToShow; runFilter(); scheduleSync(); }, evOpt);
    }
    for (const cbw of cbWrappers) {
      cbw.addEventListener('change', e => {
        if (e.target?.type === 'checkbox') { visibleCount = itemsToShow; runFilter(); scheduleSync(); }
      }, evOpt);
    }
    for (const rbw of radioWrappers) {
      rbw.addEventListener('change', e => {
        if (e.target?.type === 'radio') { visibleCount = itemsToShow; runFilter(); scheduleSync(); }
      }, evOpt);
    }
    for (const rng of rangeWrappers) {
      rng.addEventListener('input', () => { visibleCount = itemsToShow; runFilter(); scheduleSync(); }, evOpt);
    }
    for (const tog of toggleInputs) {
      tog.addEventListener('change', () => { visibleCount = itemsToShow; runFilter(); scheduleSync(); }, evOpt);
    }
    for (const ss of sortSelects) {
      ss.addEventListener('change', () => {
        currentSort = ss.value || null;
        doSort(currentSort);
        visibleCount = itemsToShow;
        runFilter();
        scheduleSync();
      }, evOpt);
    }
    doc.body.addEventListener('click', e => {
      if (!e.target.closest(asel('reset', 'true'))) return;
      const lw = e.target.closest(asel('list', 'true'));
      if (lw && lw !== wrapper) return;
      resetAll();
    }, evOpt);
    for (const btn of loadMoreBtns) {
      btn.addEventListener('click', () => { visibleCount += loadMoreStep; runFilter(); }, evOpt);
    }

    // Pill click — scoped to groups owned by this list
    doc.body.addEventListener('click', e => {
      const pill = e.target.closest('[data-kw-filter-pill]');
      if (!pill) return;
      const { group, value } = pill.dataset;
      if (!knownGroups.has(group)) return;
      log(`pill clicked: group="${group}" value="${value}"`);

      for (const inp of searchInputs) {
        if (ga(inp, 'search') === group) inp.value = '';
      }
      for (const sel of selectEls) {
        if (ga(sel, 'select') === group && sel.value === value) sel.value = '';
      }
      for (const cbw of cbWrappers) {
        if (ga(cbw, 'checkboxes') === group) {
          for (const cb of cbw.querySelectorAll('input[type="checkbox"]')) {
            if (cb.value === value) cb.checked = false;
          }
        }
      }
      for (const rbw of radioWrappers) {
        if (ga(rbw, 'radio') === group) {
          for (const rb of rbw.querySelectorAll('input[type="radio"]')) rb.checked = false;
        }
      }
      for (const rng of rangeWrappers) {
        if (ga(rng, 'range') === group) {
          for (const inp of rng.querySelectorAll('input')) inp.value = '';
        }
      }
      for (const tog of toggleInputs) {
        if (ga(tog, 'toggle') === group) tog.checked = false;
      }
      visibleCount = itemsToShow;
      runFilter();
      scheduleSync();
    }, evOpt);

    if (feat('url-params')) {
      win.addEventListener('popstate', () => {
        log('popstate: restoring URL state');
        const urlState = readURL(filterGroups, listId);
        applyState(urlState);
        doSort(currentSort);
        visibleCount = itemsToShow;
        runFilter();
      }, evOpt);
    }

    // ── Bootstrap ─────────────────────────────────────────────────────────
    if (feat('url-params')) {
      const urlState = readURL(filterGroups, listId);
      log('bootstrap: URL state', urlState);
      applyState(urlState);
    }
    if (currentSort) doSort(currentSort);
    runFilter();

    wrapper.dispatchEvent(new CustomEvent('kw-filter:init', { bubbles: true }));

    wrapper.kwFilter = {
      refresh()    { runFilter(); },
      getState,
      setState(obj){ applyState(obj); if (currentSort) doSort(currentSort); runFilter(); scheduleSync(); },
    };

    return () => { ac.abort(); delete wrapper.kwFilter; };
  }

  /* ── MutationObserver ───────────────────────────────────────────────────── */
  function observeDOM() {
    const mo = new MutationObserver(mutations => {
      for (const m of mutations) {
        if (m.type === 'attributes') {
          // Attribute was set on an existing element — check if it became a list wrapper.
          const node = m.target;
          if (ha(node, 'list') && ga(node, 'list') === 'true') initWrapper(node);
          if (node.getAttribute('sift-cms-items') === 'true') initWrapper(node);
          continue;
        }
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          // New list wrapper (standard or legacy sift-cms-items)
          if (ha(node, 'list') && ga(node, 'list') === 'true') initWrapper(node);
          if (node.getAttribute('sift-cms-items') === 'true') initWrapper(node);
          for (const el of qa(node, 'list', 'true')) initWrapper(el);
          for (const el of node.querySelectorAll('[sift-cms-items="true"]')) initWrapper(el);
          // New dropdown group (React/Webstudio may replace these during hydration)
          if (feat('dropdowns') && node.classList?.contains('filter-group')) initDropdownGroup(node);
          if (feat('dropdowns')) {
            for (const fg of node.querySelectorAll('.filter-group')) initDropdownGroup(fg);
          }
        }
      }
    });
    mo.observe(doc.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-kw-filter-list', 'sift-list', 'sift-cms-items'],
    });
  }

  /* ── Boot ───────────────────────────────────────────────────────────────── */
  function scanWrappers() {
    const found = qa(doc, 'list', 'true');
    // Also pick up legacy Sift CMS list wrapper (sift-cms-items="true").
    const legacy = Array.from(doc.querySelectorAll('[sift-cms-items="true"]'))
      .filter(el => !found.includes(el));
    const all = [...found, ...legacy];
    log(`scanWrappers: found ${all.length} list wrapper(s) (${found.length} standard, ${legacy.length} legacy sift-cms-items)`);
    for (const el of all) initWrapper(el);
    return all.length;
  }

  function init() {
    log('init: starting — features:', FEATURES ? [...FEATURES].join(', ') : 'all');
    injectStyles();
    if (feat('dropdowns'))  loadFloatingUI();
    if (feat('sort-lists')) sortFilterLists(doc);

    const found = scanWrappers();
    if (found === 0) {
      warn('init: no list wrappers found yet — scheduling retries (list may be rendered by React/Healcode asynchronously)');
      // Retry at increasing delays to handle async rendering (React hydration, Healcode, etc.)
      [200, 500, 1000, 2000, 5000].forEach(ms => setTimeout(() => {
        const n = scanWrappers();
        if (n > 0) log(`init retry (${ms}ms): found ${n} wrapper(s) — filter engine started`);
      }, ms));
    }

    initDropdownUI(doc);
    observeDOM();
    log('init: complete');
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ── Public API ─────────────────────────────────────────────────────────── */
  win.kwFilter = {
    version: VERSION,
    registerMatcher(name, fn) { matchers[name] = fn; },
  };

}(window, document));
