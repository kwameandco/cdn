/*! kw-tooltip v2.0.1 | kwameandco */
/**
 * kw-tooltip — click-to-toggle tooltip/popover for Webstudio CMS cards.
 *
 * Positioned with Floating UI (@floating-ui/dom) — the same library kw-filter
 * uses for its dropdowns. If kw-filter already loaded it, we reuse it; otherwise
 * we load it once from the CDN.
 *
 * Attributes
 *   [kw-tooltip-trigger]  — the button that toggles the panel
 *   [kw-tooltip]          — the content panel (sibling of the trigger)
 *
 * CSS required (one line — prevents a flash before JS runs):
 *   [kw-tooltip] { display: none; }
 *
 * Style the panel freely (background, border, padding, radius — a copy of your
 * filter .dropdown styles works great). The script owns positioning, show/hide,
 * and a sensible responsive width, so you don't fight the cascade.
 *
 * Verify the live version in console:  window.kwTooltip.version
 */
(() => {
  const FUI_URL = 'https://cdn.jsdelivr.net/npm/@floating-ui/dom@1.4.4/+esm';
  const triggers = Array.from(document.querySelectorAll('[kw-tooltip-trigger]'));
  window.kwTooltip = { version: '2.0.1', count: triggers.length };
  if (!triggers.length) return;

  // ── Floating UI loader (reuses kw-filter's instance if present) ───────────
  function loadFloatingUI() {
    if (window.FloatingUIDOM) return;
    const s = document.createElement('script');
    s.type = 'module';
    s.textContent =
      `import*as F from'${FUI_URL}';window.FloatingUIDOM=F;` +
      `window.dispatchEvent(new CustomEvent('kw-tooltip:fui-ready'));`;
    document.head.appendChild(s);
  }
  loadFloatingUI();

  // ── Show / hide (inline styles override whatever the styling class sets) ──
  function hide(tooltip) {
    tooltip.style.display    = 'none';
    tooltip.style.visibility = 'hidden';
    tooltip.style.opacity    = '0';
    tooltip.setAttribute('aria-hidden', 'true');
  }
  function show(tooltip) {
    tooltip.style.display    = 'block';
    tooltip.style.visibility = 'visible';
    tooltip.style.opacity    = '1';
    tooltip.removeAttribute('aria-hidden');
  }

  // ── Init: wire ARIA, teleport panel to <body>, set responsive defaults ────
  triggers.forEach((btn, i) => {
    const tooltip = btn.parentElement?.querySelector('[kw-tooltip]');
    if (!tooltip) return;

    if (!tooltip.id) tooltip.id = `kw-tooltip-${i}`;
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', tooltip.id);
    if (!btn.getAttribute('aria-label') && !btn.getAttribute('aria-labelledby')) {
      btn.setAttribute('aria-label', 'More information');
    }

    // Teleport out of the card so ancestor overflow:clip / backdrop-filter /
    // transform can't clip the panel or trap its positioning.
    document.body.appendChild(tooltip);
    tooltip.setAttribute('role', 'tooltip');
    Object.assign(tooltip.style, {
      position:   'fixed',
      zIndex:     '9999',
      margin:     '0',
      width:      'max-content',                       // hug content, don't span the viewport
      maxWidth:   'min(320px, calc(100vw - 16px))',    // stay responsive on small screens
      transition: 'none',                              // kill any CSS slide/fade from .dropdown
      animation:  'none',
    });
    hide(tooltip);
  });

  const getTooltip = btn => {
    const id = btn.getAttribute('aria-controls');
    return id ? document.getElementById(id) : null;
  };

  // ── Positioning via Floating UI ───────────────────────────────────────────
  function position(btn, tooltip) {
    const F = window.FloatingUIDOM;
    if (!F?.computePosition) return; // not ready yet — fui-ready handler repositions
    const { computePosition, offset, flip, shift } = F;
    computePosition(btn, tooltip, {
      placement: 'bottom',
      strategy: 'fixed',
      middleware: [
        offset(8),
        flip({ fallbackPlacements: ['top', 'bottom-start', 'top-start'] }),
        shift({ padding: 8 }),
      ],
    }).then(({ x, y }) => {
      tooltip.style.left = `${x}px`;
      tooltip.style.top  = `${y}px`;
    });
  }

  const close = btn => {
    btn.setAttribute('aria-expanded', 'false');
    const tooltip = getTooltip(btn);
    if (tooltip) hide(tooltip);
  };
  const open = btn => {
    btn.setAttribute('aria-expanded', 'true');
    const tooltip = getTooltip(btn);
    if (tooltip) { show(tooltip); position(btn, tooltip); }
  };
  const closeAll = () => triggers.forEach(close);

  // ── Events ────────────────────────────────────────────────────────────────
  triggers.forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = btn.getAttribute('aria-expanded') === 'true';
      closeAll();
      if (!isOpen) open(btn);
    });
    btn.addEventListener('keydown', e => {
      if (e.key === 'Escape') { close(btn); btn.focus(); }
    });
    getTooltip(btn)?.addEventListener('keydown', e => {
      if (e.key === 'Escape') { close(btn); btn.focus(); }
    });
  });

  // Close on outside click; clicks on a trigger or inside a panel are ignored.
  document.addEventListener('click', e => {
    if (e.target.closest('[kw-tooltip-trigger]')) return;
    if (e.target.closest('[kw-tooltip]')) return;
    closeAll();
  });

  // Keep open panels glued to their trigger while scrolling/resizing.
  const repositionOpen = () => triggers.forEach(btn => {
    if (btn.getAttribute('aria-expanded') === 'true') {
      const t = getTooltip(btn);
      if (t) position(btn, t);
    }
  });
  ['scroll', 'resize'].forEach(evt =>
    window.addEventListener(evt, repositionOpen, { passive: true, capture: true })
  );

  // Reposition once Floating UI finishes loading (covers a click before it's ready).
  window.addEventListener('kw-tooltip:fui-ready', repositionOpen, { once: true });
})();
