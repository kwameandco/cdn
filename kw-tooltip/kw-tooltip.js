/** @version 1.1.0
 * kw-tooltip
 *
 * Attributes
 *   [kw-tooltip-trigger]  — the button that opens/closes the tooltip
 *   [kw-tooltip]          — the content panel (sibling of trigger, inside same wrapper)
 *
 * CSS required (one line — prevents flash before script runs):
 *   [kw-tooltip] { display: none; }
 *
 * Style the panel however you like. The script handles positioning and show/hide.
 */
(() => {
  const triggers = Array.from(document.querySelectorAll('[kw-tooltip-trigger]'));
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

    tooltip.style.position = 'fixed';
    tooltip.style.zIndex   = '60';
    tooltip.setAttribute('aria-hidden', 'true');
  });

  const getTooltip = btn => {
    const id = btn.getAttribute('aria-controls');
    return id ? document.getElementById(id) : null;
  };

  const reposition = (btn, tooltip) => {
    const r = btn.getBoundingClientRect();
    tooltip.style.top  = `${r.bottom + 8}px`;
    tooltip.style.left = `${r.left}px`;
    // Nudge left if the panel bleeds off the right edge of the viewport
    requestAnimationFrame(() => {
      const tr = tooltip.getBoundingClientRect();
      if (tr.right > window.innerWidth - 8) {
        tooltip.style.left = `${r.left - (tr.right - (window.innerWidth - 8))}px`;
      }
    });
  };

  const close = btn => {
    const tooltip = getTooltip(btn);
    btn.setAttribute('aria-expanded', 'false');
    if (tooltip) {
      tooltip.style.display = 'none';
      tooltip.setAttribute('aria-hidden', 'true');
    }
  };

  const open = btn => {
    const tooltip = getTooltip(btn);
    btn.setAttribute('aria-expanded', 'true');
    if (tooltip) {
      tooltip.style.display = 'block';
      tooltip.removeAttribute('aria-hidden');
      reposition(btn, tooltip);
    }
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

  document.addEventListener('click', closeAll);

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
