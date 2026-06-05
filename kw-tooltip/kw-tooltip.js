/** @version 1.0.0
 * kw-tooltip
 *
 * Attributes
 *   [kw-tooltip-trigger]  — the button that opens/closes the tooltip
 *   [kw-tooltip]          — the content panel (sibling of trigger, inside same wrapper)
 *
 * CSS required:
 *   [kw-tooltip][aria-hidden="true"] { display: none; }
 *
 * Optional override for the default button label (set on the button element):
 *   aria-label="More information"
 */
(() => {
  const triggers = Array.from(document.querySelectorAll('[kw-tooltip-trigger]'));
  if (!triggers.length) return;

  // Wire up IDs and ARIA relationships on init
  triggers.forEach((btn, i) => {
    const tooltip = btn.parentElement?.querySelector('[kw-tooltip]');
    if (!tooltip) return;

    if (!tooltip.id) tooltip.id = `kw-tooltip-${i}`;

    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', tooltip.id);

    // Fallback label for icon-only buttons (override with aria-label on the element)
    if (!btn.getAttribute('aria-label') && !btn.getAttribute('aria-labelledby')) {
      btn.setAttribute('aria-label', 'More information');
    }

    tooltip.setAttribute('aria-hidden', 'true');
  });

  const getTooltip = btn => {
    const id = btn.getAttribute('aria-controls');
    return id ? document.getElementById(id) : null;
  };

  const close = btn => {
    btn.setAttribute('aria-expanded', 'false');
    getTooltip(btn)?.setAttribute('aria-hidden', 'true');
  };

  const open = btn => {
    btn.setAttribute('aria-expanded', 'true');
    getTooltip(btn)?.removeAttribute('aria-hidden');
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
})();
