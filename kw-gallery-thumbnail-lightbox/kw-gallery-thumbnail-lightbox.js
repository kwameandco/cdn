(() => {
  if (window.__kwGalleryLightboxInit) return;
  window.__kwGalleryLightboxInit = true;

  const proxyUrl = (url, width = 1920) => {
    if (!url) return "";
    if (url.startsWith("/cgi/image/")) return url;
    if (/^https?:\/\//.test(url)) {
      return "/cgi/image/" + encodeURIComponent(url) + "?width=" + width + "&quality=80&format=auto";
    }
    return url;
  };

  const ensureModal = () => {
    let modal = document.getElementById("kw-gallery-modal");
    if (modal && document.body.contains(modal)) return modal;

    modal = document.createElement("div");
    modal.id = "kw-gallery-modal";
    modal.className = "kw-gallery-modal";
    modal.innerHTML = `
      <div class="kw-gallery-backdrop" data-gallery-close></div>
      <div class="kw-gallery-wrap" role="dialog" aria-modal="true" aria-label="Image viewer">
        <button type="button" class="kw-gallery-prev" data-gallery-prev aria-label="Previous image">&#8249;</button>
        <figure class="kw-gallery-figure">
          <img class="kw-gallery-image" alt="">
        </figure>
        <button type="button" class="kw-gallery-next" data-gallery-next aria-label="Next image">&#8250;</button>
        <button type="button" class="kw-gallery-close" data-gallery-close-btn aria-label="Close">&#215;</button>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  };

  const getThumbs = (gallery) => Array.from(gallery.querySelectorAll(".w-thumbnail"));

  const getItem = (gallery, index) => {
    const thumbs = getThumbs(gallery);
    const thumb = thumbs[index];
    if (!thumb) return null;

    const img = thumb.querySelector("img");
    const full = thumb.getAttribute("data-full") || "";
    const alt = thumb.getAttribute("data-alt") || img?.getAttribute("alt") || "";

    if (!full) return null;

    return { thumb, full, alt };
  };

  const setActive = (gallery, index) => {
    const mainLink = gallery.querySelector("[data-main-lightbox]");
    const mainImg = mainLink?.querySelector("img");
    const item = getItem(gallery, index);
    const thumbs = getThumbs(gallery);

    if (!mainLink || !mainImg || !item) return;

    mainLink.setAttribute("href", item.full);
    mainLink.setAttribute("data-active-index", String(index));
    gallery.setAttribute("data-gallery-ready", "true");
    gallery.setAttribute("data-active-index", String(index));

    const fullSrc = proxyUrl(item.full, 1920);

    // Show thumbnail immediately for instant visual response, then swap to full-res when loaded
    const thumbImg = item.thumb.querySelector("img");
    const immediateThumbSrc = thumbImg?.currentSrc || thumbImg?.src;
    if (immediateThumbSrc && mainImg.src !== fullSrc) {
      mainImg.src = immediateThumbSrc;
    }

    const loader = new Image();
    loader.onload = () => { mainImg.src = fullSrc; };
    loader.src = fullSrc;

    mainImg.alt = item.alt;
    mainImg.removeAttribute("srcset");

    thumbs.forEach((thumb, i) => {
      const isActive = i === index;
      thumb.classList.toggle("is-active", isActive);
      thumb.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  };

  let activeGallery = null;
  let activeIndex = 0;
  let lastTrigger = null;

  const openLightbox = (gallery, index, trigger) => {
    const modal = ensureModal();
    const modalImg = modal.querySelector(".kw-gallery-image");
    const item = getItem(gallery, index);
    if (!item || !modalImg) return;

    activeGallery = gallery;
    activeIndex = index;
    lastTrigger = trigger || null;

    modalImg.src = proxyUrl(item.full, 3840);
    modalImg.alt = item.alt;
    modal.classList.add("is-open");
    document.documentElement.style.overflow = "hidden";
  };

  const closeLightbox = () => {
    const modal = ensureModal();
    modal.classList.remove("is-open");
    document.documentElement.style.overflow = "";

    if (lastTrigger && typeof lastTrigger.focus === "function") {
      lastTrigger.focus();
    }
  };

  const goTo = (index) => {
    if (!activeGallery) return;

    const thumbs = getThumbs(activeGallery);
    if (!thumbs.length) return;

    if (index < 0) index = thumbs.length - 1;
    if (index >= thumbs.length) index = 0;

    activeIndex = index;
    setActive(activeGallery, index);

    const modal = ensureModal();
    const modalImg = modal.querySelector(".kw-gallery-image");
    const item = getItem(activeGallery, index);

    if (item && modalImg) {
      modalImg.src = proxyUrl(item.full, 3840);
      modalImg.alt = item.alt;
    }
  };

  const initGallery = (gallery) => {
    if (gallery.dataset.galleryInit === "true") return;
    gallery.dataset.galleryInit = "true";
    setActive(gallery, 0);

    // Preload all full-size images so thumbnail switching feels instant
    getThumbs(gallery).forEach((thumb) => {
      const full = thumb.getAttribute("data-full");
      if (full) {
        const img = new Image();
        img.src = proxyUrl(full, 1920);
      }
    });
  };

  const scan = () => {
    document.querySelectorAll("[data-gallery-lightbox]").forEach(initGallery);
  };

  scan();

  document.addEventListener("click", (event) => {
    const thumb = event.target.closest(".w-thumbnail");
    if (thumb) {
      const gallery = thumb.closest("[data-gallery-lightbox]");
      if (!gallery) return;

      const index = getThumbs(gallery).indexOf(thumb);
      if (index === -1) return;

      event.preventDefault();
      event.stopPropagation();
      setActive(gallery, index);
      return;
    }

    const main = event.target.closest("[data-main-lightbox]");
    if (main) {
      const gallery = main.closest("[data-gallery-lightbox]");
      if (!gallery) return;

      const index = Number(main.getAttribute("data-active-index") || gallery.getAttribute("data-active-index") || 0);

      event.preventDefault();
      event.stopPropagation();
      openLightbox(gallery, index, main);
      return;
    }

    const closeTrigger = event.target.closest("[data-gallery-close], [data-gallery-close-btn]");
    if (closeTrigger) {
      event.preventDefault();
      closeLightbox();
      return;
    }

    const prevTrigger = event.target.closest("[data-gallery-prev]");
    if (prevTrigger) {
      event.preventDefault();
      goTo(activeIndex - 1);
      return;
    }

    const nextTrigger = event.target.closest("[data-gallery-next]");
    if (nextTrigger) {
      event.preventDefault();
      goTo(activeIndex + 1);
      return;
    }
  });

  document.addEventListener("keydown", (event) => {
    const modal = document.getElementById("kw-gallery-modal");
    if (!modal || !modal.classList.contains("is-open")) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closeLightbox();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(activeIndex - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(activeIndex + 1);
    }
  });

  new MutationObserver(() => {
    scan();
  }).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
