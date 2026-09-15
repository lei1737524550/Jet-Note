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
  let touchIdentifier = null;
  let dragMetrics = null;

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
    // Full-screen overlays own their scrolling. Settings in particular uses a
    // fixed .settings-screen with an independently scrollable .settings-body;
    // document.scrollingElement does not move while that screen is open.
    const settings = document.getElementById('settingsScreen');
    if (settings?.classList.contains('open')) {
      const settingsBody = settings.querySelector('.settings-body');
      if (settingsBody) return settingsBody;
    }

    const composer = document.getElementById('postComposeScreen');
    if (composer?.classList.contains('open')) {
      const composerBody = composer.querySelector('.post-compose-body');
      if (composerBody) return composerBody;
    }

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

  const captureDragMetrics = () => {
    if (!active) active = getTarget();
    if (!active) return null;
    const rect = track.getBoundingClientRect();
    const thumbHeight = thumb.offsetHeight || thumb.getBoundingClientRect().height;
    return {
      trackTop: rect.top,
      maxThumbTop: Math.max(0, rect.height - thumbHeight),
      maxScroll: Math.max(0, active.scrollHeight - active.clientHeight)
    };
  };

  const scrollFromClientY = (y, metrics = dragMetrics) => {
    if (!active) active = getTarget();
    if (!active) return;
    const m = metrics || captureDragMetrics();
    if (!m) return;
    const top = Math.max(0, Math.min(m.maxThumbTop, y - m.trackTop - (track.clientHeight - m.maxThumbTop) / 2));
    const ratio = m.maxThumbTop ? top / m.maxThumbTop : 0;
    active.scrollTop = ratio * m.maxScroll;
    update();
  };

  const beginDrag = y => {
    active = getTarget();
    dragMetrics = captureDragMetrics();
    dragging = !!dragMetrics;
    if (dragging) scrollFromClientY(y, dragMetrics);
  };

  const endTouchDrag = () => {
    touchIdentifier = null;
    dragging = false;
    dragMetrics = null;
  };

  // Android WebView gets an explicit Touch Events path. Pointer Events remain
  // as the mouse/stylus fallback, but touch dragging no longer depends on
  // pointer capture surviving layout changes while Settings drawers animate.
  bar.addEventListener('touchstart', event => {
    if (!event.changedTouches.length) return;
    const touch = event.changedTouches[0];
    finishDrag();
    touchIdentifier = touch.identifier;
    beginDrag(touch.clientY);
    event.preventDefault();
    event.stopPropagation();
  }, { passive: false });

  bar.addEventListener('touchmove', event => {
    if (touchIdentifier == null) return;
    const touch = Array.from(event.changedTouches).find(item => item.identifier === touchIdentifier)
      || Array.from(event.touches).find(item => item.identifier === touchIdentifier);
    if (!touch) return;
    scrollFromClientY(touch.clientY, dragMetrics);
    event.preventDefault();
    event.stopPropagation();
  }, { passive: false });

  const finishTouch = event => {
    if (touchIdentifier == null) return;
    const touch = Array.from(event.changedTouches || []).find(item => item.identifier === touchIdentifier);
    if (!touch && event.type !== 'touchcancel') return;
    if (touch) scrollFromClientY(touch.clientY, dragMetrics);
    endTouchDrag();
    event.preventDefault?.();
    event.stopPropagation?.();
  };
  bar.addEventListener('touchend', finishTouch, { passive: false });
  bar.addEventListener('touchcancel', finishTouch, { passive: false });
  window.addEventListener('touchend', finishTouch, { capture: true, passive: false });
  window.addEventListener('touchcancel', finishTouch, { capture: true, passive: false });

  // Mouse/stylus fallback. Ignore touch-generated pointer events because the
  // Touch Events path above is the authoritative Android input path.
  bar.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch') return;
    finishDrag();
    dragging = true;
    pointerId = event.pointerId;
    active = getTarget();
    dragMetrics = captureDragMetrics();
    try { bar.setPointerCapture?.(pointerId); } catch (_) {}
    scrollFromClientY(event.clientY, dragMetrics);
    event.preventDefault();
    event.stopPropagation();
  });

  bar.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || !dragging || event.pointerId !== pointerId) return;
    scrollFromClientY(event.clientY, dragMetrics);
    event.preventDefault();
    event.stopPropagation();
  });

  bar.addEventListener('pointerup', event => {
    if (event.pointerType === 'touch') return;
    if (dragging && event.pointerId === pointerId) {
      scrollFromClientY(event.clientY, dragMetrics);
      event.preventDefault();
      event.stopPropagation();
    }
    dragMetrics = null;
    finishDrag(event);
  });
  bar.addEventListener('pointercancel', event => {
    if (event.pointerType === 'touch') return;
    dragMetrics = null;
    finishDrag(event);
  });
  bar.addEventListener('lostpointercapture', event => {
    dragMetrics = null;
    finishDrag(event);
  });
  window.addEventListener('pointerup', event => {
    if (event.pointerType === 'touch') return;
    dragMetrics = null;
    finishDrag(event);
  }, true);
  window.addEventListener('pointercancel', event => {
    if (event.pointerType === 'touch') return;
    dragMetrics = null;
    finishDrag(event);
  }, true);
  window.addEventListener('blur', () => {
    endTouchDrag();
    dragMetrics = null;
    finishDrag();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    endTouchDrag();
    dragMetrics = null;
    finishDrag();
  });
  document.addEventListener('scroll', update, true);
  window.addEventListener('resize', update, {passive:true});
  window.addEventListener('jet-note-scrollbar-refresh', update);
  window.JetNoteScrollbar = Object.freeze({ refresh: update });
  const mo = new MutationObserver(update);
  mo.observe(document.body, {subtree:true, childList:true, attributes:true, attributeFilter:['class','style']});
  requestAnimationFrame(update);
})();
