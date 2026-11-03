/* kw-carousel.js
   Webstudio-native carousel/grid controller. One script tag, no build step,
   no hard dependencies. Works together with kw-carousel.css.

   Forked from breeze/carousel/kw-carousel.js (2026-07-14 snapshot) as the
   starting point for a shared plugin — not yet wired to any live site.
   See README.md.

   BP breakpoints:
     wide    ≥ 1280px — grid mode, uses data-carousel-slides-wide
     desktop ≥  992px — grid mode, uses data-carousel-slides-desktop
     tablet  ≥  768px — slider mode, uses data-carousel-slides-tablet
     mobile  <  768px — slider mode, uses data-carousel-slides-mobile

   NOTE: Webstudio's generated CSS uses @media (max-width: 1280px) to apply
   slider/flex styles (inclusive of exactly 1280px). Our CSS overrides the
   track display with [data-carousel-mode="grid"] [data-carousel-track]
   (higher specificity), and resets slide width with width:auto so the
   1fr grid columns size correctly at 1280px.
*/
(() => {
  'use strict';

  if (window.__kwCarouselInit) return;
  window.__kwCarouselInit = true;

  const BP = { wide: 1280, desktop: 992, tablet: 768 };
  const instances = new WeakMap();

  const attr = (el, k, f = null) => el.getAttribute(k) ?? f;
  const num = (el, k, f) => {
    const v = parseInt(attr(el, k, f), 10);
    return Number.isFinite(v) ? v : f;
  };
  const bool = (el, k) => el.hasAttribute(k) && attr(el, k) !== 'false';

  function getSlidesPerView(root) {
    const w = window.innerWidth;
    if (w >= BP.wide) return num(root, 'data-carousel-slides-wide', num(root, 'data-carousel-slides-desktop', 4));
    if (w >= BP.desktop) return num(root, 'data-carousel-slides-desktop', 4);
    if (w >= BP.tablet) return num(root, 'data-carousel-slides-tablet', 2);
    return num(root, 'data-carousel-slides-mobile', 1);
  }

  const isAlwaysSlider = (root) => bool(root, 'data-carousel-always-slider');
  const isGridMode = (root) => {
    if (isAlwaysSlider(root)) return false;
    if (window.innerWidth < BP.desktop) return false;
    // Grid only while every slide fits in a single row. Once the slide count
    // exceeds the per-view limit (e.g. more than data-carousel-slides-desktop
    // slides), fall back to slider mode so slides scroll instead of wrapping.
    if (getSlideCount(root) > getSlidesPerView(root)) return false;
    return true;
  };
  const isLooping = (root) => bool(root, 'data-loop');

  function setButtonState(btn, disabled) {
    if (!btn) return;
    btn.toggleAttribute('data-disabled', disabled);
    btn.disabled = disabled;
    btn.setAttribute('aria-disabled', String(disabled));
  }

  const getGap = (root) => attr(root, 'data-carousel-gap', 'var(--gap-s, 1rem)');

  function getPeek(root) {
    const mobile = window.innerWidth < BP.tablet;
    if (!mobile) return '0rem';
    return bool(root, 'data-carousel-peek') ? attr(root, 'data-carousel-peek-size', '2rem') : '0rem';
  }

  function getSnapMode(root) {
    const spv = getSlidesPerView(root);
    const peek = getPeek(root);
    const hasPeek = peek && peek !== '0rem' && peek !== '0';
    return (spv === 1 && hasPeek) ? 'center' : 'start';
  }

  const getTrack = (root) => root.querySelector('[data-carousel-track]');
  const getSlides = (track) => Array.from(track.querySelectorAll('[data-slide]'));
  const getControls = (root) => ({
    prev: root.querySelector('[data-carousel-prev]'),
    next: root.querySelector('[data-carousel-next]'),
    dotsContainer: root.querySelector('[data-carousel-dots-container]')
  });

  const getSlideCount = (root) => {
    const track = getTrack(root);
    return track ? getSlides(track).length : 0;
  };

  function shufflePending(root) {
    const track = getTrack(root);
    if (!track) return false;
    const shuffleRoot = root.closest('[data-shuffle="true"]');
    if (!shuffleRoot) return false;
    const targetSel = shuffleRoot.getAttribute('data-shuffle-target');
    const target = targetSel ? shuffleRoot.querySelector(targetSel) : shuffleRoot;
    if (target !== track) return false;
    return track.getAttribute('data-shuffled') !== 'true';
  }

  const getMaxScroll = (track) => Math.max(0, track.scrollWidth - track.clientWidth);
  const clampScroll = (track, left) => Math.max(0, Math.min(left, getMaxScroll(track)));

  function preflightMode(root) {
    if (root._carouselPreflighted) return;

    const w = window.innerWidth;
    const alwaysSlider = bool(root, 'data-carousel-always-slider');

    let spv;
    if (w >= BP.wide) spv = num(root, 'data-carousel-slides-wide', num(root, 'data-carousel-slides-desktop', 4));
    else if (w >= BP.desktop) spv = num(root, 'data-carousel-slides-desktop', 4);
    else if (w >= BP.tablet) spv = num(root, 'data-carousel-slides-tablet', 2);
    else spv = num(root, 'data-carousel-slides-mobile', 1);

    // Mirror isGridMode(): grid only on desktop+ when slides fit one row.
    // (Slides may not exist yet for CMS-bound carousels; count 0 stays grid
    // and applyVars re-evaluates once rows are injected.)
    const slideCount = root.querySelectorAll('[data-slide]').length;
    const isGrid = !alwaysSlider && w >= BP.desktop && slideCount <= spv;

    const hasPeek = bool(root, 'data-carousel-peek') && w < BP.tablet;
    const snap = (spv === 1 && hasPeek) ? 'center' : 'start';

    root.setAttribute('data-carousel-mode', isGrid ? 'grid' : 'slider');
    root.setAttribute('data-carousel-snap', snap);
    root.style.setProperty('--_snap', snap);

    const track = root.querySelector('[data-carousel-track]');
    if (track) track.style.setProperty('--_spv', String(spv));

    root._carouselPreflighted = true;
  }

  function preflightAll() {
    document.querySelectorAll('[data-carousel]').forEach(preflightMode);
  }

  function getOffsetForSlide(track, slide, snapMode) {
    const tr = track.getBoundingClientRect();
    const sr = slide.getBoundingClientRect();
    const delta = sr.left - tr.left;
    if (snapMode === 'center') {
      return clampScroll(track, track.scrollLeft + delta - (track.clientWidth / 2) + (sr.width / 2));
    }
    return clampScroll(track, track.scrollLeft + delta);
  }

  function getCurrentIndex(state) {
    const { track, slides, snapMode } = state;
    const tr = track.getBoundingClientRect();
    const ref = snapMode === 'center' ? tr.left + track.clientWidth / 2 : tr.left;

    let closest = 0, minDist = Infinity;
    slides.forEach((slide, i) => {
      const sr = slide.getBoundingClientRect();
      const slideRef = snapMode === 'center' ? sr.left + sr.width / 2 : sr.left;
      const d = Math.abs(ref - slideRef);
      if (d < minDist) { minDist = d; closest = i; }
    });
    return closest;
  }

  function scrollToIndex(state, index, behavior = 'smooth') {
    const { track, slides, snapMode } = state;
    const target = slides[index];
    if (!target) return;
    const left = getOffsetForSlide(track, target, snapMode);
    track.scrollTo({ left, behavior });
  }

  function ensureAria(root, track, slides) {
    root.setAttribute('aria-roledescription', 'carousel');
    track.setAttribute('aria-roledescription', 'carousel');
    slides.forEach((slide, i) => {
      slide.setAttribute('role', 'group');
      slide.setAttribute('aria-roledescription', 'slide');
      slide.setAttribute('aria-label', `${i + 1} of ${slides.length}`);
    });
  }

  function applyVars(state) {
    const { root, track } = state;
    const next = {
      spv: String(getSlidesPerView(root)),
      gap: getGap(root),
      peek: getPeek(root),
      mode: isGridMode(root) ? 'grid' : 'slider',
      snap: getSnapMode(root)
    };
    const prev = root._carouselVars || {};
    const changed = prev.spv !== next.spv || prev.gap !== next.gap || prev.peek !== next.peek || prev.mode !== next.mode || prev.snap !== next.snap;
    if (!changed) return false;

    track.style.setProperty('--_spv', next.spv);
    track.style.setProperty('--_gap', next.gap);
    root.style.setProperty('--_peek', next.peek);
    root.style.setProperty('--_snap', next.snap);
    root.setAttribute('data-carousel-mode', next.mode);
    root.setAttribute('data-carousel-snap', next.snap);
    root._carouselVars = next;
    state.snapMode = next.snap;
    return true;
  }

  function clearDots(state) {
    if (!state.dotsContainer) return;
    state.dotsContainer.innerHTML = '';
    state.dots = [];
  }

  function buildDots(state) {
    const { root, slides, dotsContainer } = state;
    clearDots(state);

    if (isAlwaysSlider(root) && getSlidesPerView(root) > 1) {
      if (dotsContainer) dotsContainer.hidden = true;
      return;
    }

    if (!dotsContainer) return;
    if (!bool(root, 'data-carousel-dots')) {
      dotsContainer.hidden = true;
      return;
    }

    dotsContainer.hidden = isGridMode(root);
    dotsContainer.setAttribute('role', 'tablist');
    dotsContainer.setAttribute('aria-label', 'Slides');

    state.dots = slides.map((_, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-carousel-dot', '');
      btn.setAttribute('role', 'tab');
      btn.setAttribute('data-carousel-dot-index', String(i));
      btn.setAttribute('aria-label', `Go to slide ${i + 1} of ${slides.length}`);
      btn.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
      dotsContainer.appendChild(btn);
      return btn;
    });
  }

  function updateDots(state) {
    if (isAlwaysSlider(state.root) && getSlidesPerView(state.root) > 1) return;
    if (!state.dots?.length) return;

    const { root, dotsContainer } = state;
    const active = isGridMode(root) ? 0 : getCurrentIndex(state);

    state.dots.forEach((dot, i) => {
      const on = i === active;
      dot.setAttribute('aria-selected', on ? 'true' : 'false');
      dot.toggleAttribute('data-active', on);
    });

    if (dotsContainer) dotsContainer.hidden = isGridMode(root);
  }

  function updateButtons(state) {
    const { root, track, prev, next, slides } = state;
    if (!prev && !next) return;

    if (isGridMode(root) || slides.length <= 1) {
      setButtonState(prev, true);
      setButtonState(next, true);
      return;
    }
    if (isLooping(root)) {
      setButtonState(prev, false);
      setButtonState(next, false);
      return;
    }
    const max = getMaxScroll(track);
    setButtonState(prev, track.scrollLeft <= 1);
    setButtonState(next, track.scrollLeft >= max - 1);
  }

  function sync(state) {
    if (!state.track || !state.slides.length) return;
    applyVars(state);
    updateButtons(state);
    updateDots(state);
  }

  function resetScroll(state) {
    const { root, track, slides } = state;
    if (isGridMode(root) || !slides.length) return;
    track.scrollLeft = 0;
  }

  function refreshRefs(state) {
    const { root } = state;
    const track = getTrack(root);
    if (!track) return false;
    const slides = getSlides(track);
    if (!slides.length) return false;
    const c = getControls(root);

    state.track = track;
    state.slides = slides;
    state.prev = c.prev;
    state.next = c.next;
    state.dotsContainer = c.dotsContainer;

    ensureAria(root, track, slides);
    return true;
  }

  function handlePrev(state) {
    const { root, track, slides } = state;
    if (isGridMode(root) || slides.length <= 1) return;

    const spv = getSlidesPerView(root);
    const lastNavigable = Math.max(0, slides.length - spv);
    const atStart = track.scrollLeft <= 1;

    if (isLooping(root) && atStart) {
      scrollToIndex(state, lastNavigable);
      return;
    }
    if (!isLooping(root) && atStart) return;

    const current = getCurrentIndex(state);
    scrollToIndex(state, Math.max(0, current - 1));
  }

  function handleNext(state) {
    const { root, slides } = state;
    if (isGridMode(root) || slides.length <= 1) return;

    const spv = getSlidesPerView(root);
    const lastNavigable = Math.max(0, slides.length - spv);
    const current = getCurrentIndex(state);

    if (isLooping(root) && current >= lastNavigable) {
      scrollToIndex(state, 0);
      return;
    }
    if (!isLooping(root) && current >= lastNavigable) return;

    scrollToIndex(state, Math.min(lastNavigable, current + 1));
  }

  function setupDrag(state) {
    const { root, track } = state;
    const DRAG_THRESHOLD = 5;

    const d = { active: false, pointerId: null, startX: 0, startScroll: 0, moved: false };
    state._drag = d;

    state.onPointerDown = (e) => {
      if (e.pointerType === 'touch') return;
      if (isGridMode(root)) return;
      if (e.button !== 0) return;
      if (e.target.closest('[data-carousel-prev],[data-carousel-next],[data-carousel-dot]')) return;
      d.active = true;
      d.moved = false;
      d.startX = e.clientX;
      d.startScroll = track.scrollLeft;
      d.pointerId = e.pointerId;
      try { track.setPointerCapture(e.pointerId); } catch (_) {}
      track.setAttribute('data-dragging', 'true');
    };

    state.onPointerMove = (e) => {
      if (!d.active || e.pointerId !== d.pointerId) return;
      const dx = e.clientX - d.startX;
      if (Math.abs(dx) > DRAG_THRESHOLD) d.moved = true;
      track.scrollLeft = d.startScroll - dx;
    };

    state.onPointerEnd = (e) => {
      if (!d.active) return;
      if (e && e.pointerId !== d.pointerId) return;
      try { track.releasePointerCapture(d.pointerId); } catch (_) {}
      track.removeAttribute('data-dragging');
      const wasMoved = d.moved;
      d.active = false;
      d.pointerId = null;
      if (wasMoved) {
        scrollToIndex(state, getCurrentIndex(state));
      }
    };

    state.onDragClickCapture = (e) => {
      if (d.moved) {
        e.preventDefault();
        e.stopPropagation();
        d.moved = false;
      }
    };

    state.onDragStart = (e) => {
      if (isGridMode(root)) return;
      e.preventDefault();
    };

    track.addEventListener('pointerdown', state.onPointerDown);
    track.addEventListener('pointermove', state.onPointerMove);
    track.addEventListener('pointerup', state.onPointerEnd);
    track.addEventListener('pointercancel', state.onPointerEnd);
    track.addEventListener('click', state.onDragClickCapture, true);
    track.addEventListener('dragstart', state.onDragStart);
  }

  function teardownDrag(state) {
    const { track } = state;
    if (!track || !state.onPointerDown) return;
    track.removeEventListener('pointerdown', state.onPointerDown);
    track.removeEventListener('pointermove', state.onPointerMove);
    track.removeEventListener('pointerup', state.onPointerEnd);
    track.removeEventListener('pointercancel', state.onPointerEnd);
    track.removeEventListener('click', state.onDragClickCapture, true);
    track.removeEventListener('dragstart', state.onDragStart);
  }

  function bind(state) {
    if (state.bound) return;

    state.onRootClick = (e) => {
      const p = e.target.closest('[data-carousel-prev]');
      if (p && state.root.contains(p)) { e.preventDefault(); handlePrev(state); return; }
      const n = e.target.closest('[data-carousel-next]');
      if (n && state.root.contains(n)) { e.preventDefault(); handleNext(state); return; }
      const dot = e.target.closest('[data-carousel-dot]');
      if (dot && state.root.contains(dot)) {
        e.preventDefault();
        const di = parseInt(dot.getAttribute('data-carousel-dot-index') || '', 10);
        if (Number.isFinite(di)) scrollToIndex(state, di);
      }
    };

    state.onScroll = () => {
      if (state.scrollRaf) return;
      state.scrollRaf = requestAnimationFrame(() => {
        state.scrollRaf = 0;
        updateButtons(state);
        updateDots(state);
      });
    };

    state.onResize = () => {
      if (state.resizeRaf) cancelAnimationFrame(state.resizeRaf);
      state.resizeRaf = requestAnimationFrame(() => {
        state.resizeRaf = 0;
        if (!refreshRefs(state)) return;
        const changed = applyVars(state);
        if (changed) buildDots(state);
        updateButtons(state);
        updateDots(state);
      });
    };

    state.mutationObserver = new MutationObserver(() => {
      if (state.mutRaf) return;
      state.mutRaf = requestAnimationFrame(() => {
        state.mutRaf = 0;
        if (!refreshRefs(state)) return;
        const slideCountChanged = state.lastSlideCount !== state.slides.length;
        state.lastSlideCount = state.slides.length;
        if (slideCountChanged) {
          buildDots(state);
          sync(state);
          return;
        }
        sync(state);
      });
    });

    state.root.addEventListener('click', state.onRootClick);
    state.track.addEventListener('scroll', state.onScroll, { passive: true });
    window.addEventListener('resize', state.onResize, { passive: true });
    state.mutationObserver.observe(state.root, { childList: true, subtree: true });

    setupDrag(state);
    state.bound = true;
  }

  function unbind(state) {
    if (!state.bound) return;
    state.root.removeEventListener('click', state.onRootClick);
    if (state.track) state.track.removeEventListener('scroll', state.onScroll);
    window.removeEventListener('resize', state.onResize);
    if (state.mutationObserver) state.mutationObserver.disconnect();
    if (state.scrollRaf) cancelAnimationFrame(state.scrollRaf);
    if (state.resizeRaf) cancelAnimationFrame(state.resizeRaf);
    if (state.mutRaf) cancelAnimationFrame(state.mutRaf);
    teardownDrag(state);
    state.bound = false;
  }

  function destroy(root) {
    const state = instances.get(root);
    if (!state) return;
    unbind(state);
    clearDots(state);
    instances.delete(root);
    delete root._carouselReady;
    delete root._carouselVars;
    delete root._carouselPreflighted;
  }

  function createBootObserver(root) {
    if (root._carouselBootObserver) return;
    const obs = new MutationObserver(() => {
      preflightMode(root);
      if (shufflePending(root)) return;
      const s = init(root);
      if (s) { obs.disconnect(); delete root._carouselBootObserver; }
    });
    obs.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-shuffled'] });
    root._carouselBootObserver = obs;
  }

  function init(root) {
    if (!root) return null;
    preflightMode(root);

    if (shufflePending(root)) {
      createBootObserver(root);
      return null;
    }

    if (root._carouselReady) return instances.get(root) || null;

    const track = getTrack(root);
    if (!track) return null;
    const slides = getSlides(track);
    if (!slides.length) return null;

    const c = getControls(root);
    const state = {
      root, track, slides,
      prev: c.prev, next: c.next, dotsContainer: c.dotsContainer,
      dots: [],
      snapMode: getSnapMode(root),
      bound: false, mutationObserver: null,
      onRootClick: null, onScroll: null, onResize: null,
      onPointerDown: null, onPointerMove: null, onPointerEnd: null, onDragClickCapture: null, onDragStart: null,
      scrollRaf: 0, resizeRaf: 0, mutRaf: 0,
      lastSlideCount: slides.length
    };

    try {
      ensureAria(root, track, slides);
      applyVars(state);
      buildDots(state);
      bind(state);
      sync(state);
      resetScroll(state);

      instances.set(root, state);
      root._carouselReady = true;
      if (root._carouselBootObserver) { root._carouselBootObserver.disconnect(); delete root._carouselBootObserver; }
      return state;
    } catch (e) {
      return null;
    }
  }

  // ── Hydration gate ─────────────────────────────────────────────────────────
  // React hydrates the whole document. Mutating React-owned DOM (dot buttons,
  // aria attributes, data-carousel-mode) before hydration completes causes a
  // hydration mismatch (React #418) -> React throws away the server DOM and
  // re-renders the entire body client-side, orphaning every other script's
  // event listeners (nav mega-menu hover, etc.).
  // Wait for React to attach its fiber to <body>, then defer one tick so the
  // hydration pass has finished before touching the DOM.
  //
  // On a plain (non-React) page the fiber marker never appears, so this would
  // otherwise burn the full 8s fallback before initialising. Sites that don't
  // hydrate can opt out by setting `window.kwCarouselNoHydrationGate = true`
  // before this script loads (see README.md) — Webstudio/Remix consumers
  // should NOT set this.
  let hydrationDone = false;
  function whenHydrated(cb) {
    if (hydrationDone || window.kwCarouselNoHydrationGate) { hydrationDone = true; cb(); return; }
    const t0 = Date.now();
    (function poll() {
      const b = document.body;
      const ready = b && Object.keys(b).some((k) => k.indexOf('__reactFiber$') === 0);
      if (ready || Date.now() - t0 > 8000) {
        hydrationDone = true;
        setTimeout(cb, 100);
      } else {
        setTimeout(poll, 50);
      }
    })();
  }

  function boot() { whenHydrated(bootNow); }

  function bootNow() {
    document.querySelectorAll('[data-carousel]').forEach((root) => {
      if (instances.get(root)) return;
      const s = init(root);
      if (!s) createBootObserver(root);
    });
  }

  function refresh() {
    document.querySelectorAll('[data-carousel]').forEach((root) => {
      destroy(root);
      if (root._carouselBootObserver) { root._carouselBootObserver.disconnect(); delete root._carouselBootObserver; }
    });
    boot();
  }

  window.kwCarousel = { refresh, destroy };

  new MutationObserver((mutations) => {
    let foundNew = false;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.('[data-carousel]')) {
          preflightMode(node);
          foundNew = true;
        }
        const nested = node.querySelectorAll?.('[data-carousel]:not([data-carousel-mode])');
        if (nested?.length) {
          nested.forEach(n => preflightMode(n));
          foundNew = true;
        }
      }
    }
    if (foundNew) boot();
  }).observe(document.documentElement, { childList: true, subtree: true });

  whenHydrated(preflightAll);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
