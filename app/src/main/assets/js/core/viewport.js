/* Single owner of viewport geometry. Screens consume CSS variables only. */
const ViewportManager = (() => {
  let nativeKeyboardHeight = 0;
  let scheduled = false;

  function update() {
    scheduled = false;
    const vv = window.visualViewport;
    const height = Math.max(1, vv ? vv.height : window.innerHeight);
    const width = Math.max(1, vv ? vv.width : window.innerWidth);
    const offsetTop = vv ? vv.offsetTop : 0;
    const offsetLeft = vv ? vv.offsetLeft : 0;
    const keyboardOpen = nativeKeyboardHeight > 0 || window.innerHeight - height > 120;
    const root = document.documentElement.style;
    root.setProperty('--viewport-height', `${height}px`);
    root.setProperty('--viewport-width', `${width}px`);
    root.setProperty('--viewport-offset-top', `${offsetTop}px`);
    root.setProperty('--viewport-offset-left', `${offsetLeft}px`);
    root.setProperty('--keyboard-open', keyboardOpen ? '1' : '0');
    root.setProperty('--content-bottom', keyboardOpen ? '0px' : 'var(--safe-bottom)');
    return { height, width, offsetTop, offsetLeft, keyboardOpen };
  }
  function requestUpdate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(update);
  }
  function applySystemInsets(top, right, bottom, left, keyboardHeight = 0) {
    const ratio = window.devicePixelRatio || 1;
    nativeKeyboardHeight = Math.max(0, keyboardHeight / ratio);
    const root = document.documentElement.style;
    const cssInsets = {};
    for (const [name, value] of Object.entries({ top, right, bottom, left })) {
      const cssValue = Math.max(0, value / ratio);
      cssInsets[name] = cssValue;
      root.setProperty(`--system-safe-area-${name}`, `${cssValue}px`);
    }
    document.documentElement.dataset.systemSafeAreaReady = 'true';
    update();
    window.dispatchEvent(new CustomEvent('jetnote:system-safe-area-change', { detail: cssInsets }));
  }

  window.addEventListener('resize', requestUpdate, { passive: true });
  window.visualViewport?.addEventListener('resize', requestUpdate, { passive: true });
  window.visualViewport?.addEventListener('scroll', requestUpdate, { passive: true });
  window.applySystemInsets = applySystemInsets;
  update();
  return Object.freeze({ update, requestUpdate, applySystemInsets });
})();

function fit() { ViewportManager.requestUpdate(); }
