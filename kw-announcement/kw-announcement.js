(function () {
  const bar = document.querySelector('[data-announcement]');
  if (!bar) return;
  const viewport = bar.querySelector('[data-announcement-viewport]');
  if (!viewport) return;

  const id = bar.getAttribute('data-announcement-id') || 'default';
  const expiryDays = parseInt(bar.getAttribute('data-announcement-expiry-days'), 10) || 30;
  const KEY = 'announcementState';
  const EXPIRY = expiryDays * 24 * 60 * 60 * 1000;
  const AUTOPLAY_DELAY = 6000;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let currentIndex = 0;
  let timer = null;
  let initialised = false;

  function getItems() {
    return Array.from(viewport.querySelectorAll('[data-announcement-item]'));
  }
  function applyState(items) {
    items.forEach((item, i) => {
      if (i === currentIndex) item.setAttribute('data-active', 'true');
      else item.removeAttribute('data-active');
    });
  }
  function stopAutoplay() { if (timer) clearInterval(timer); timer = null; }
  function startAutoplay(items) {
    if (prefersReducedMotion || items.length <= 1) return;
    stopAutoplay();
    timer = setInterval(() => {
      currentIndex = (currentIndex + 1) % items.length;
      applyState(items);
    }, AUTOPLAY_DELAY);
  }
  function next() {
    const items = getItems();
    if (items.length <= 1) return;
    currentIndex = (currentIndex + 1) % items.length;
    applyState(items);
  }
  function prev() {
    const items = getItems();
    if (items.length <= 1) return;
    currentIndex = (currentIndex - 1 + items.length) % items.length;
    applyState(items);
  }

  function init() {
    const items = getItems();
    if (!items.length) return false;
    if (!initialised) {
      initialised = true;
      bar.querySelector('[data-announcement-next]')?.addEventListener('click', () => { stopAutoplay(); next(); });
      bar.querySelector('[data-announcement-prev]')?.addEventListener('click', () => { stopAutoplay(); prev(); });
      bar.querySelector('[data-announcement-close]')?.addEventListener('click', () => {
        localStorage.setItem(KEY, JSON.stringify({ id: id, dismissedAt: Date.now() }));
        bar.setAttribute('data-hidden', 'true');
        document.documentElement.classList.remove('show-announcement');
        document.documentElement.style.setProperty('--announcement-height', '0px');
        stopAutoplay();
      });
    }
    currentIndex = Math.min(currentIndex, items.length - 1);
    applyState(items);
    startAutoplay(items);
    return true;
  }

  if (!init()) {
    const observer = new MutationObserver(() => { if (init()) observer.disconnect(); });
    observer.observe(viewport, { childList: true, subtree: true });
  }
})();
