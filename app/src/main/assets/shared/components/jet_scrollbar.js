/* Jet Note custom scrollbar. It follows the active scroll owner (composer body or page). */
(() => {
  const bar = document.getElementById('jetScrollbar');
  const track = bar?.querySelector('.jet-scrollbar-track');
  const thumb = bar?.querySelector('.jet-scrollbar-thumb');
  if (!bar || !track || !thumb) return;

  const DEFAULT_VISUAL_WIDTH_PX = 4;
  const DEFAULT_INTERACTION_WIDTH_PX = 20;
  let active = null;
  let dragging = false;
  let pointerId = null;

  const clampPx = (value, fallback, min, max) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
  };

  const applyScrollbarConfig = config => {
    const scrollbar = config?.jet_scrollbar || {};
    const visualWidth = clampPx(scrollbar.visual_width_px, DEFAULT_VISUAL_WIDTH_PX, 1, 40);
    const interactionWidth = Math.max(
      visualWidth,
      clampPx(scrollbar.interaction_width_px, DEFAULT_INTERACTION_WIDTH_PX, 4, 96)
    );
    const root = document.documentElement.style;
    root.setProperty('--jet-scrollbar-visual-width', `${visualWidth}px`);
    root.setProperty('--jet-scrollbar-interaction-width', `${interactionWidth}px`);
  };

  // Load visual width and hit width from the same top-level config.json used by
  // the rest of the home UI. CSS has matching fallbacks, so a failed load never
  // makes the scrollbar unusable.
  fetch('config.json', {cache: 'no-store'})
    .then(response => response.ok ? response.json() : null)
    .then(config => {
      applyScrollbarConfig(config);
      requestAnimationFrame(update);
    })
    .catch(() => {});

  const finishDrag = event => {
    if (!dragging && pointerId == null) return;
    const id = event?.pointerId ?? pointerId;
    if (pointerId != null && id != null && id !== pointerId) return;
    const capturedId = pointerId;
    dragging = false;
    pointerId = null;
    try {
      if (capturedId != null && bar.hasPointerCapture?.(capturedId)) bar.releasePointerCapture(capturedId);
    } catch (_) {}
  };

  // Keep the visible track exactly halfway between the Post right border and
  // the viewport right edge. The wider interaction lane is centered on that
  // same axis, so increasing hit width never shifts the visible 4px track.
  const updateHorizontalPosition = () => {
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const mainPosts = document.getElementById('mainPosts');
    if (!mainPosts || !viewportWidth) return;

    const feedRect = mainPosts.getBoundingClientRect();
    const feedStyle = getComputedStyle(mainPosts);
    const paddingRight = parseFloat(feedStyle.paddingRight) || 0;
    const fallbackPostRight = feedRect.right - paddingRight;
    const post = mainPosts.querySelector('.post');
    const postRight = post?.getBoundingClientRect().right || fallbackPostRight;
    const midpoint = postRight + (viewportWidth - postRight) / 2;

    bar.style.left = `${midpoint - bar.offsetWidth / 2}px`;
    bar.style.right = 'auto';
  };

  const getTarget = () => {
    const composer = document.getElementById('postComposeScreen');
    if (composer?.classList.contains('open')) return composer.querySelector('.post-compose-body');
    return document.scrollingElement || document.documentElement;
  };

  function update() {
    updateHorizontalPosition();
    const target = getTarget();
    if (target !== active) active = target;
    if (!active) return;
    const sh = active.scrollHeight;
    const ch = active.clientHeight;
    const overflow = sh > ch + 1;
    bar.classList.toggle('visible', overflow);
    if (!overflow) return;
    const th = Math.max(28, Math.min(track.clientHeight, ch / sh * track.clientHeight));
    const maxScroll = Math.max(1, sh - ch);
    const maxTop = Math.max(0, track.clientHeight - th);
    const top = active.scrollTop / maxScroll * maxTop;
    thumb.style.height = `${th}px`;
    thumb.style.transform = `translateY(${top}px)`;
  }

  const scrollFromClientY = y => {
    if (!active) active = getTarget();
    const rect = track.getBoundingClientRect();
    const th = thumb.getBoundingClientRect().height;
    const maxTop = Math.max(0, rect.height - th);
    const top = Math.max(0, Math.min(maxTop, y - rect.top - th / 2));
    const ratio = maxTop ? top / maxTop : 0;
    active.scrollTop = ratio * Math.max(0, active.scrollHeight - active.clientHeight);
    update();
  };

  // The whole configured lane owns the pointer. The narrow track/thumb below
  // are visual only. This prevents taps beside the visible track from falling
  // through into image/video DOM elements underneath the fixed scrollbar.
  bar.addEventListener('pointerdown', event => {
    finishDrag();
    dragging = true;
    pointerId = event.pointerId;
    try { bar.setPointerCapture?.(pointerId); } catch (_) {}
    scrollFromClientY(event.clientY);
    event.preventDefault();
    event.stopPropagation();
  });

  bar.addEventListener('pointermove', event => {
    if (!dragging || event.pointerId !== pointerId) return;
    scrollFromClientY(event.clientY);
    event.preventDefault();
    event.stopPropagation();
  });

  bar.addEventListener('pointerup', event => {
    if (dragging && event.pointerId === pointerId) {
      scrollFromClientY(event.clientY);
      event.preventDefault();
      event.stopPropagation();
    }
    finishDrag(event);
  });
  bar.addEventListener('pointercancel', finishDrag);
  bar.addEventListener('lostpointercapture', finishDrag);
  window.addEventListener('pointerup', finishDrag, true);
  window.addEventListener('pointercancel', finishDrag, true);
  window.addEventListener('blur', () => finishDrag());
  document.addEventListener('visibilitychange', () => { if (document.hidden) finishDrag(); });
  document.addEventListener('scroll', update, true);
  window.addEventListener('resize', update, {passive:true});
  const mo = new MutationObserver(update);
  mo.observe(document.body, {subtree:true, childList:true, attributes:true, attributeFilter:['class','style']});
  requestAnimationFrame(update);
})();
