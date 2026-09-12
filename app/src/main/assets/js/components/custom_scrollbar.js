/* Jet Note custom scrollbar. One component follows the active scroll root. */
(() => {
  'use strict';

  const TRACK_PADDING = 3;
  const MIN_THUMB_HEIGHT = 36;
  const bar = document.getElementById('jetNoteScrollbar');
  const thumb = document.getElementById('jetNoteScrollThumb');
  if (!bar || !thumb) return;

  let activeScroller = null;
  let frame = 0;
  let drag = null;

  function isOpen(id) {
    return document.getElementById(id)?.classList.contains('open');
  }

  function documentScroller() {
    return document.scrollingElement || document.documentElement;
  }

  function chooseScroller() {
    if (isOpen('importPreview')) {
      return document.querySelector('#importPreview .import-panel');
    }
    if (isOpen('settingsScreen')) {
      return document.querySelector('#settingsScreen .settings-body');
    }
    if (isOpen('postComposeScreen')) {
      return document.querySelector('#postComposeScreen .post-compose-body');
    }
    return documentScroller();
  }

  function metrics(scroller) {
    if (!scroller) return null;
    const doc = scroller === documentScroller();
    const clientHeight = doc ? window.innerHeight : scroller.clientHeight;
    const scrollHeight = doc ? Math.max(
      document.documentElement.scrollHeight,
      document.body?.scrollHeight || 0
    ) : scroller.scrollHeight;
    const scrollTop = doc
      ? (window.scrollY || document.documentElement.scrollTop || 0)
      : scroller.scrollTop;
    return { doc, clientHeight, scrollHeight, scrollTop };
  }

  function setScrollTop(scroller, value) {
    const m = metrics(scroller);
    if (!m) return;
    const max = Math.max(0, m.scrollHeight - m.clientHeight);
    const next = Math.max(0, Math.min(max, value));
    if (m.doc) window.scrollTo(0, next);
    else scroller.scrollTop = next;
  }

  function updateNow() {
    frame = 0;
    activeScroller = chooseScroller();
    const m = metrics(activeScroller);
    if (!m || m.clientHeight <= 0 || m.scrollHeight <= m.clientHeight + 1) {
      bar.hidden = true;
      bar.setAttribute('aria-hidden', 'true');
      return;
    }

    bar.hidden = false;
    bar.setAttribute('aria-hidden', 'false');

    const trackHeight = Math.max(1, bar.clientHeight - TRACK_PADDING * 2);
    const maxScroll = Math.max(1, m.scrollHeight - m.clientHeight);
    const thumbHeight = Math.max(
      MIN_THUMB_HEIGHT,
      Math.min(trackHeight, trackHeight * (m.clientHeight / m.scrollHeight))
    );
    const travel = Math.max(0, trackHeight - thumbHeight);
    const progress = Math.max(0, Math.min(1, m.scrollTop / maxScroll));

    thumb.style.height = `${thumbHeight}px`;
    thumb.style.transform = `translateY(${travel * progress}px)`;
  }

  function requestUpdate() {
    if (frame) return;
    frame = requestAnimationFrame(updateNow);
  }

  function pointerY(event) {
    return Number.isFinite(event.clientY) ? event.clientY : 0;
  }

  thumb.addEventListener('pointerdown', event => {
    activeScroller = chooseScroller();
    const m = metrics(activeScroller);
    if (!m) return;
    drag = { pointerId: event.pointerId, startY: pointerY(event), startScrollTop: m.scrollTop };
    thumb.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });

  thumb.addEventListener('pointermove', event => {
    if (!drag || drag.pointerId !== event.pointerId || !activeScroller) return;
    const m = metrics(activeScroller);
    if (!m) return;
    const trackHeight = Math.max(1, bar.clientHeight - TRACK_PADDING * 2);
    const thumbHeight = Math.max(1, thumb.offsetHeight);
    const travel = Math.max(1, trackHeight - thumbHeight);
    const maxScroll = Math.max(0, m.scrollHeight - m.clientHeight);
    const delta = pointerY(event) - drag.startY;
    setScrollTop(activeScroller, drag.startScrollTop + (delta / travel) * maxScroll);
    requestUpdate();
    event.preventDefault();
  });

  function finishDrag(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    try { thumb.releasePointerCapture?.(event.pointerId); } catch (_) {}
    drag = null;
  }
  thumb.addEventListener('pointerup', finishDrag);
  thumb.addEventListener('pointercancel', finishDrag);

  bar.addEventListener('pointerdown', event => {
    if (event.target === thumb) return;
    activeScroller = chooseScroller();
    const m = metrics(activeScroller);
    if (!m) return;
    const rect = bar.getBoundingClientRect();
    const trackHeight = Math.max(1, bar.clientHeight - TRACK_PADDING * 2);
    const thumbHeight = Math.max(1, thumb.offsetHeight);
    const travel = Math.max(1, trackHeight - thumbHeight);
    const localY = pointerY(event) - rect.top - TRACK_PADDING - thumbHeight / 2;
    const progress = Math.max(0, Math.min(1, localY / travel));
    setScrollTop(activeScroller, progress * Math.max(0, m.scrollHeight - m.clientHeight));
    requestUpdate();
    event.preventDefault();
  });

  window.addEventListener('scroll', requestUpdate, { passive: true, capture: true });
  window.addEventListener('resize', requestUpdate, { passive: true });
  window.visualViewport?.addEventListener('resize', requestUpdate, { passive: true });

  const observer = new MutationObserver(requestUpdate);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'hidden']
  });

  if ('ResizeObserver' in window) {
    new ResizeObserver(requestUpdate).observe(document.documentElement);
  }

  window.JetNoteScrollbar = Object.freeze({ update: requestUpdate });
  requestUpdate();
})();
