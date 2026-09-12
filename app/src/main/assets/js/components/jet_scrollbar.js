/* Jet Note custom scrollbar. It follows the active scroll owner (composer body or page). */
(() => {
  const bar = document.getElementById('jetScrollbar');
  const track = bar?.querySelector('.jet-scrollbar-track');
  const thumb = bar?.querySelector('.jet-scrollbar-thumb');
  if (!bar || !track || !thumb) return;
  let active = null, dragging = false, pointerId = null;

  const finishDrag = event => {
    if (!dragging && pointerId == null) return;
    const id = event?.pointerId ?? pointerId;
    if (pointerId != null && id != null && id !== pointerId) return;
    try {
      if (pointerId != null && thumb.hasPointerCapture?.(pointerId)) thumb.releasePointerCapture(pointerId);
    } catch (_) {}
    dragging = false;
    pointerId = null;
  };

  // Keep the scrollbar track exactly halfway between the Post right border
  // and the viewport right edge. The 20px lane may extend slightly beyond
  // the viewport on narrow screens; its 4px track remains at the exact midpoint.
  const updateHorizontalPosition = () => {
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const feed = document.getElementById('postList');
    if (!feed || !viewportWidth) return;

    const feedRect = feed.getBoundingClientRect();
    const feedStyle = getComputedStyle(feed);
    const paddingRight = parseFloat(feedStyle.paddingRight) || 0;
    const fallbackPostRight = feedRect.right - paddingRight;
    const post = feed.querySelector('.post');
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
  const update = () => {
    updateHorizontalPosition();
    const target = getTarget();
    if (target !== active) active = target;
    if (!active) return;
    const sh = active.scrollHeight, ch = active.clientHeight;
    const overflow = sh > ch + 1;
    bar.classList.toggle('visible', overflow);
    if (!overflow) return;
    const th = Math.max(28, Math.min(track.clientHeight, ch / sh * track.clientHeight));
    const maxScroll = Math.max(1, sh - ch), maxTop = Math.max(0, track.clientHeight - th);
    const top = active.scrollTop / maxScroll * maxTop;
    thumb.style.height = `${th}px`;
    thumb.style.transform = `translateY(${top}px)`;
  };
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
  thumb.addEventListener('pointerdown', e => {
    finishDrag();
    dragging = true;
    pointerId = e.pointerId;
    try { thumb.setPointerCapture?.(pointerId); } catch (_) {}
    scrollFromClientY(e.clientY);
    e.preventDefault();
    e.stopPropagation();
  });
  track.addEventListener('pointerdown', e => {
    if (e.target === thumb) return;
    scrollFromClientY(e.clientY);
    e.preventDefault();
    e.stopPropagation();
  });
  track.addEventListener('pointermove', e => {
    if (dragging && e.pointerId === pointerId) {
      scrollFromClientY(e.clientY);
      e.preventDefault();
    }
  });
  thumb.addEventListener('pointerup', finishDrag);
  thumb.addEventListener('pointercancel', finishDrag);
  thumb.addEventListener('lostpointercapture', finishDrag);
  track.addEventListener('pointerup', finishDrag);
  track.addEventListener('pointercancel', finishDrag);
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
