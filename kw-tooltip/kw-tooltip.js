/*! kw-tooltip v1.3.0 | kwameandco */
/**
 * kw-tooltip
 *
 * Attributes
 *   [kw-tooltip-trigger]  — the button that opens/closes the tooltip
 *   [kw-tooltip]          — the content panel (sibling of trigger, inside same wrapper)
 *
 * CSS required (one line — prevents flash before script runs):
 *   [kw-tooltip] { display: none; }
 *
 * Style the panel however you like (a copy of your filter .dropdown styles works).
 * The script owns display/visibility/opacity/position via inline styles, so it
 * does NOT matter what your class sets for those — inline wins over the class.
 *
 * Verify the live version in console:  window.kwTooltip.version
 */
(() => {
  const triggers = Array.from(document.querySelectorAll('[kw-tooltip-trigger]'));
  window.kwTooltip = { version: '1.3.0', count: triggers.length };
  if (!triggers.length) return;

  triggers.forEach((btn, i) => {
    const tooltip = btn.parentElement?.querySelector('[kw-tooltip]');
    if (!tooltip) return;

    if (!tooltip.id) tooltip.id = `kw-tooltip-${i}`;
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', tooltip.id);

    if (!btn.getAttribute('aria-label') && !btn.getAttribute('aria-labelledby')) {
      btn.setAttribute('aria-label', 'More information');
    }

    // Teleport to <body> so no ancestor overflow / transform / backdrop-filter
    // can clip it or trap position:fixed.
    document.body.appendChild(tooltip);
    tooltip.style.position = 'fixed';
    tooltip.style.zIndex   = '9999';
    hide(tooltip);
  });

  function hide(tooltip) {
    // Inline styles override whatever the styling class sets for these props.
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

  const getTooltip = btn => {
    const id = btn.getAttribute('aria-controls');
    return id ? document.getElementById(id) : null;
  };

  const reposition = (btn, tooltip) => {
    const r = btn.getBoundingClientRect();
    tooltip.style.top  = `${r.bottom + 8}px`;
    tooltip.style.left = `${r.left}px`;
    // Nudge left if the panel bleeds off the right edge of the viewport.
    requestAnimationFrame(() => {
      const tr = tooltip.getBoundingClientRect();
      if (tr.right > window.innerWidth - 8) {
        tooltip.style.left = `${Math.max(8, r.left - (tr.right - (window.innerWidth - 8)))}px`;
      }
    });
  };

  const close = btn => {
    btn.setAttribute('aria-expanded', 'false');
    const tooltip = getTooltip(btn);
    if (tooltip) hide(tooltip);
  };

  const open = btn => {
    btn.setAttribute('aria-expanded', 'true');
    const tooltip = getTooltip(btn);
    if (tooltip) { show(tooltip); reposition(btn, tooltip); }
  };

  const closeAll = () => triggers.forEach(close);

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

  // Close on outside click only — clicks on a trigger or inside a panel are ignored.
  document.addEventListener('click', e => {
    if (e.target.closest('[kw-tooltip-trigger]')) return;
    if (e.target.closest('[kw-tooltip]')) return;
    closeAll();
  });

  ['scroll', 'resize'].forEach(evt => {
    window.addEventListener(evt, () => {
      triggers.forEach(btn => {
        if (btn.getAttribute('aria-expanded') === 'true') {
          const tooltip = getTooltip(btn);
          if (tooltip) reposition(btn, tooltip);
        }
      });
    }, { passive: true, capture: true });
  });
})();
