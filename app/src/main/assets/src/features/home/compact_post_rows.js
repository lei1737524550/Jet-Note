/* Measure the actual styled text and control rail before merging their rows. */
function fitPublishedPostRows() {
  for (const card of document.querySelectorAll('.published-post-surface')) {
    const text = card.querySelector(':scope > .post-text-drawer > .text-content');
    const actions = card.querySelector('.post-head-actions');
    const title = card.querySelector('.post-title');
    const fullText = text?.dataset.fullText ?? text?.textContent ?? '';
    if (!text || !actions || title?.textContent.trim() || !fullText.trim() || /[\r\n]/.test(fullText)) {
      card.classList.remove('post-single-row');
      continue;
    }
    // A temporary max-content clone measures glyphs, including colored spans,
    // without depending on whether the live text currently wraps or is collapsed.
    const probe = text.cloneNode(true);
    if (probe.textContent !== fullText) probe.textContent = fullText;
    probe.removeAttribute('id');
    probe.style.cssText = 'position:fixed!important;visibility:hidden!important;pointer-events:none!important;width:max-content!important;max-width:none!important;white-space:pre!important;display:block!important;transform:none!important;';
    text.parentElement.appendChild(probe);
    const textWidth = probe.getBoundingClientRect().width;
    probe.remove();
    const style = getComputedStyle(card);
    const available = card.clientWidth - parseFloat(style.paddingLeft || 0) - parseFloat(style.paddingRight || 0);
    const controlsWidth = actions.getBoundingClientRect().width;
    card.classList.toggle('post-single-row', textWidth + controlsWidth + 12 <= available);
  }
}
window.addEventListener('resize', fitPublishedPostRows, {passive:true});
document.fonts?.ready.then(fitPublishedPostRows);
