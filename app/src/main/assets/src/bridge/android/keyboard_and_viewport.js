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
  // Once the IME has opened in the editor, keep that usable editor height as
  // the permanent layout baseline. Closing the keyboard must not move tools.
  let lockedEditorVisibleHeight = 0;
  let editorCalibrationTimer = 0;
  const EDITOR_GEOMETRY_STORAGE_KEY = 'jetnote.editor.keyboardGeometry.v1';
  const EDITOR_TOOLBAR_POSITION_KEY = 'jetnote.editor.keyboardToolbarPosition.v2';
  let editorToolbarCalibrationTimer = 0;

  function readPersistedToolbarPosition() {
    try {
      const value = JSON.parse(localStorage.getItem(EDITOR_TOOLBAR_POSITION_KEY) || 'null');
      if (!value || !(Number(value.top) >= 0) || !(Number(value.width) > 0)) return null;
      return { top: Number(value.top), width: Number(value.width) };
    } catch (_) { return null; }
  }

  function restorePersistedToolbarPosition(visualViewport) {
    const saved = readPersistedToolbarPosition();
    if (!saved || Math.abs(saved.width - visualViewport.width) > 2) {
      document.documentElement.style.removeProperty('--post-editor-persisted-toolbar-top');
      return;
    }
    document.documentElement.style.setProperty('--post-editor-persisted-toolbar-top', `${saved.top}px`);
  }

  function scheduleToolbarPositionCalibration(visualViewport) {
    clearTimeout(editorToolbarCalibrationTimer);
    editorToolbarCalibrationTimer = setTimeout(() => {
      const editor = document.querySelector('.post-compose-screen.open');
      const toolbar = editor?.querySelector('.post-editor-tool-line');
      if (!editor || !toolbar) return;
      const top = toolbar.getBoundingClientRect().top;
      if (!(top >= 0)) return;
      try {
        localStorage.setItem(EDITOR_TOOLBAR_POSITION_KEY, JSON.stringify({
          top,
          width: visualViewport.width,
          calibratedAt: Date.now()
        }));
      } catch (_) {}
      document.documentElement.style.setProperty('--post-editor-persisted-toolbar-top', `${top}px`);
    }, 320);
  }

  function readPersistedEditorGeometry() {
    try {
      const value = JSON.parse(localStorage.getItem(EDITOR_GEOMETRY_STORAGE_KEY) || 'null');
      if (!value || !(Number(value.height) > 0) || !(Number(value.width) > 0)) return null;
      return { height: Number(value.height), width: Number(value.width) };
    } catch (_) { return null; }
  }

  function restorePersistedEditorGeometry(visualViewport) {
    if (lockedEditorVisibleHeight > 0) return;
    const saved = readPersistedEditorGeometry();
    if (!saved) return;
    // A persisted keyboard-open height is device/layout specific. Reuse it only
    // when the viewport width still matches; rotation/display-size changes will
    // automatically trigger a fresh keyboard calibration.
    if (Math.abs(saved.width - visualViewport.width) <= 2) {
      lockedEditorVisibleHeight = saved.height;
    }
  }

  function scheduleEditorGeometryCalibration(liveEditorHeight, visualViewport) {
    if (!(liveEditorHeight > 0)) return;
    clearTimeout(editorCalibrationTimer);
    editorCalibrationTimer = setTimeout(() => {
      lockedEditorVisibleHeight = liveEditorHeight;
      try {
        localStorage.setItem(EDITOR_GEOMETRY_STORAGE_KEY, JSON.stringify({
          height: liveEditorHeight,
          width: visualViewport.width,
          calibratedAt: Date.now()
        }));
      } catch (_) {}
      requestUpdate();
    }, 280);
  }

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
    // adjustResize may shrink both innerHeight and visualViewport on older Android.
    const resizedByKeyboard = visualViewport.width === stableEditorViewport.width
      && stableEditorViewport.height - visualViewport.height > KEYBOARD_DETECTION_THRESHOLD_PX;

    return openedByAndroid || openedByBrowser || resizedByKeyboard;
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

    // Native IME bounds already exclude keyboard occlusion. Never subtract IME
    // height again or retain navigation-bar padding inside that usable area.
    const editorTop = nativeImeViewportHeight > 0 ? 0 : visualViewport.offsetTop;
    const liveEditorHeight = nativeImeViewportHeight > 0
      ? nativeImeViewportHeight : visualViewport.height;

    // Keyboard-open geometry is the canonical editor geometry. Persist the
    // stable IME-open height so the same tool position is available before the
    // keyboard opens, after it closes, and after an app restart.
    restorePersistedEditorGeometry(visualViewport);
    // Toolbar follows the fixed text row; no independent persisted Y.
    document.documentElement.style.removeProperty('--post-editor-persisted-toolbar-top');
    if (keyboardOpen && liveEditorHeight > 0) {
      // The keyboard-open toolbar position itself is the canonical coordinate.
      // Persist the measured screen-space Y, not a derived viewport formula.
      // Fixed text geometry determines toolbar Y; no toolbar calibration.
      // Insets can arrive through several provisional frames. Only persist the
      // value after it has remained quiet briefly.
      scheduleEditorGeometryCalibration(liveEditorHeight, visualViewport);
    }
    const editorHeight = lockedEditorVisibleHeight || liveEditorHeight;
    root.setProperty('--editor-visible-viewport-height', `${editorHeight}px`);
    root.setProperty('--editor-visible-offset-top', `${editorTop}px`);

    root.setProperty('--keyboard-open', keyboardOpen ? '1' : '0');
    root.setProperty('--ime-height', `${imeHeight}px`);
    root.setProperty('--content-bottom', lockedEditorVisibleHeight > 0 ? '0px' : (keyboardOpen ? '0px' : 'var(--safe-bottom)'));
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
