/* The document uses CSS layout; this compatibility hook is used by renderers. */
let nativeKeyboardHeight = 0;
function fit() { syncViewport(); }
function syncViewport() {
  const vv = window.visualViewport;
  const visibleHeight = vv ? vv.height : window.innerHeight;
  const height = nativeKeyboardHeight > 0 ? Math.min(visibleHeight, nativeKeyboardHeight) : visibleHeight;
  document.documentElement.style.setProperty('--viewport-height', height + 'px');
  const keyboardOpen = nativeKeyboardHeight > 0 || window.innerHeight - height > 120;
  document.documentElement.style.setProperty('--content-bottom', keyboardOpen ? '0px' : 'var(--safe-bottom)');
  return height;
}
window.applySystemInsets = function(top, right, bottom, left, keyboardHeight = 0) {
  // Native coordinates are physical pixels; CSS pixels use devicePixelRatio.
  const ratio = window.devicePixelRatio || 1;
  nativeKeyboardHeight = keyboardHeight / ratio;
  for (const [name, value] of Object.entries({top,right,bottom,left})) {
    document.documentElement.style.setProperty('--safe-' + name, Math.max(0, value / ratio) + 'px');
  }
  syncViewport();
  if (typeof syncComposerViewport === 'function') syncComposerViewport();
};
window.addEventListener('resize', syncViewport);
if (window.visualViewport) window.visualViewport.addEventListener('resize', syncViewport);
syncViewport();
