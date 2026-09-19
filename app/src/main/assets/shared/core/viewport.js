/**
 * Jet Note viewport manager
 * -------------------------
 *
 */
const ViewportManager = (() => {
  const KEYBOARD_DETECTION_THRESHOLD_PX = 120;

  let nativeImeViewportHeight = 0;
  let nativeImeHeight = 0;
  let scheduledFrame = 0;

  const stableEditorViewport = {
    height: 0,
    width: 0,
    offsetTop: 0,
    offsetLeft: 0,
  };

  function readVisualViewport() {
    const viewport = window.visualViewport;

    return {
      height: Math.max(1, viewport?.height ?? window.innerHeight),
      width: Math.max(1, viewport?.width ?? window.innerWidth),
      offsetTop: viewport?.offsetTop ?? 0,
      offsetLeft: viewport?.offsetLeft ?? 0,
    };
  }

  function isKeyboardOpen(visualViewport) {
    const openedByAndroid = nativeImeViewportHeight > 0;
    const openedByBrowser =
      window.innerHeight - visualViewport.height > KEYBOARD_DETECTION_THRESHOLD_PX;

    return openedByAndroid || openedByBrowser;
  }

  function captureStableEditorViewport(visualViewport, keyboardOpen) {
    if (keyboardOpen && stableEditorViewport.height > 0) return;

    stableEditorViewport.height = visualViewport.height;
    stableEditorViewport.width = visualViewport.width;
    stableEditorViewport.offsetTop = visualViewport.offsetTop;
    stableEditorViewport.offsetLeft = visualViewport.offsetLeft;
  }

  function keyboardHeight(visualViewport, keyboardOpen) {
    if (!keyboardOpen) return 0;
    const stableDelta = Math.max(0, stableEditorViewport.height - visualViewport.height);
    const nativeViewportDelta = nativeImeViewportHeight > 0
      ? Math.max(0, stableEditorViewport.height - nativeImeViewportHeight)
      : 0;
    return Math.max(nativeImeHeight, stableDelta, nativeViewportDelta);
  }

  function writeViewportCssVariables(visualViewport, keyboardOpen, imeHeight) {
    const root = document.documentElement.style;

    root.setProperty('--viewport-height', `${visualViewport.height}px`);
    root.setProperty('--viewport-width', `${visualViewport.width}px`);
    root.setProperty('--viewport-offset-top', `${visualViewport.offsetTop}px`);
    root.setProperty('--viewport-offset-left', `${visualViewport.offsetLeft}px`);

    root.setProperty('--editor-stable-viewport-height', `${stableEditorViewport.height}px`);
    root.setProperty('--editor-stable-viewport-width', `${stableEditorViewport.width}px`);
    root.setProperty('--editor-stable-offset-top', `${stableEditorViewport.offsetTop}px`);
    root.setProperty('--editor-stable-offset-left', `${stableEditorViewport.offsetLeft}px`);

    root.setProperty('--keyboard-open', keyboardOpen ? '1' : '0');
    root.setProperty('--ime-height', `${imeHeight}px`);
    root.setProperty('--content-bottom', keyboardOpen ? '0px' : 'var(--safe-bottom)');
    document.documentElement.dataset.jetnoteKeyboardOpen = keyboardOpen ? 'true' : 'false';
  }

  function emitViewportChange(visualViewport, keyboardOpen, imeHeight) {
    window.dispatchEvent(
      new CustomEvent('jetnote:viewport-change', {
        detail: {
          ...visualViewport,
          keyboardOpen,
          keyboardHeight: imeHeight,
          editorHeight: stableEditorViewport.height,
          editorWidth: stableEditorViewport.width,
          editorOffsetTop: stableEditorViewport.offsetTop,
          editorOffsetLeft: stableEditorViewport.offsetLeft,
        },
      }),
    );
  }

  function update() {
    scheduledFrame = 0;

    const visualViewport = readVisualViewport();
    const keyboardOpen = isKeyboardOpen(visualViewport);

    captureStableEditorViewport(visualViewport, keyboardOpen);
    const imeHeight = keyboardHeight(visualViewport, keyboardOpen);
    writeViewportCssVariables(visualViewport, keyboardOpen, imeHeight);
    emitViewportChange(visualViewport, keyboardOpen, imeHeight);

    return { ...visualViewport, keyboardOpen, keyboardHeight: imeHeight };
  }

  function requestUpdate() {
    if (scheduledFrame) return;
    scheduledFrame = requestAnimationFrame(update);
  }

  /**
   */
  function applySystemInsets(top, right, bottom, left, imeViewportHeight = 0, imeHeight = 0) {
    const devicePixelRatio = window.devicePixelRatio || 1;
    const root = document.documentElement.style;
    const cssInsets = {};

    nativeImeViewportHeight = Math.max(0, Number(imeViewportHeight) / devicePixelRatio);
    nativeImeHeight = Math.max(0, Number(imeHeight) / devicePixelRatio);
    // Insets and visualViewport resize callbacks are not ordered consistently
    // across WebView versions. Reconstruct the pre-IME height here so a resize
    // callback cannot accidentally record the already-shrunken viewport as the
    // editor's stable camera.
    if (nativeImeViewportHeight > 0 && nativeImeHeight > 0) {
      stableEditorViewport.height = Math.max(
        stableEditorViewport.height,
        nativeImeViewportHeight + nativeImeHeight
      );
    }

    for (const [name, physicalPixels] of Object.entries({ top, right, bottom, left })) {
      const cssPixels = Math.max(0, Number(physicalPixels) / devicePixelRatio);
      cssInsets[name] = cssPixels;
      root.setProperty(`--system-safe-area-${name}`, `${cssPixels}px`);
    }

    document.documentElement.dataset.systemSafeAreaReady = 'true';
    update();

    window.dispatchEvent(
      new CustomEvent('jetnote:system-safe-area-change', {
        detail: cssInsets,
      }),
    );
  }

  window.addEventListener('resize', requestUpdate, { passive: true });
  window.visualViewport?.addEventListener('resize', requestUpdate, { passive: true });
  window.visualViewport?.addEventListener('scroll', requestUpdate, { passive: true });

  window.applySystemInsets = applySystemInsets;

  update();

  return Object.freeze({ update, requestUpdate, applySystemInsets });
})();

function fit() {
  ViewportManager.requestUpdate();
}
