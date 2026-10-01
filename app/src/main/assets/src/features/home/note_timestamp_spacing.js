/* Swap the two visible timestamp gaps after the CSS cascade has resolved.
 * Measuring text ranges includes line-height centering, per-state margins,
 * header controls, post padding and media margins. Card/content geometry stays
 * unchanged, so star/FLIP movement continues to use the same bounding boxes.
 */
const NoteTimestampSpacing = (() => {
  let frame = 0;
  const observed = new Set();
  function textRect(element) {
    if (!element?.textContent?.trim()) return null;
    const range = document.createRange();
    range.selectNodeContents(element);
    return Array.from(range.getClientRects()).find(rect => rect.width > 0 && rect.height > 0) || null;
  }
  function update(post) {
    const time = post.querySelector('.post-head > .time');
    if (!time) return;
    time.style.translate = '';
    const timestamp = textRect(time);
    const body = post.getBoundingClientRect();
    if (!timestamp || !body.height) return;
    const text = textRect(post.querySelector('.text-content'));
    const media = post.querySelector('.post-published-media-strip, .post-published-single-photo, .post-published-single-video, .video-attachment-shell');
    const mediaRect = media?.getBoundingClientRect();
    const audio = post.querySelector(':scope > .attachment-strip');
    const audioRect = audio?.getBoundingClientRect();
    const next = text || (mediaRect?.height ? mediaRect : null) || (audioRect?.height ? audioRect : null);
    if (!next) return;
    const border = parseFloat(getComputedStyle(post).borderTopWidth) || 0;
    const above = timestamp.top - body.top - border;
    const below = next.top - timestamp.bottom;
    if (above < 0 || below < 0) return;
    time.style.translate = `0 ${below - above}px`;
  }
  function refresh() {
    frame = 0;
    for (const post of observed) {
      if (!post.isConnected) { observer?.unobserve(post); observed.delete(post); }
      else update(post);
    }
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(refresh);
  }
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  function bind(root = document) {
    for (const post of root.querySelectorAll('.published-post-surface')) {
      if (!observed.has(post)) { observed.add(post); observer?.observe(post); }
      update(post);
    }
    schedule();
  }
  window.addEventListener('resize', schedule, {passive: true});
  document.addEventListener('load', schedule, true);
  document.fonts?.ready.then(schedule);
  return Object.freeze({bind, refresh: schedule});
})();
