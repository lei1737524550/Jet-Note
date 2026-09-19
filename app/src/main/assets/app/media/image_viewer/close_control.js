(function () {
  'use strict';

  function install(options) {
    const closeButton = document.getElementById('imageViewerClose');
    if (!closeButton || !options) return;
    const label = window.JetNoteLanguage?.text?.('viewerCloseAccessibilityLabel', null, '')
      || window.JET_NOTE_VIEWER_STRINGS?.close || '';
    if (label) closeButton.setAttribute('aria-label', String(label));

    let longPressTimer = null;
    let longPressTriggered = false;
    let pointerId = null;
    let startX = 0;
    let startY = 0;

    const cancelLongPress = () => {
      if (longPressTimer !== null) clearTimeout(longPressTimer);
      longPressTimer = null;
      pointerId = null;
    };

    closeButton.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      cancelLongPress();
      longPressTriggered = false;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        longPressTriggered = true;
        try { window.JetNoteNative?.hapticLongPress?.(); } catch (_) {}
      }, 550);
    });

    closeButton.addEventListener('pointermove', event => {
      if (event.pointerId !== pointerId || longPressTimer === null) return;
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > 12) cancelLongPress();
    });

    closeButton.addEventListener('pointerup', event => {
      if (event.pointerId !== pointerId) return;
      const shouldDownload = longPressTriggered;
      cancelLongPress();
      if (!shouldDownload) return;
      event.preventDefault();
      event.stopPropagation();
      const source = options.getDownloadSource?.() || '';
      const mediaType = options.getMediaType?.() || 'image';
      try {
        if (window.JetNoteNative?.downloadViewerMedia) {
          window.JetNoteNative.downloadViewerMedia(source, mediaType);
        } else if (mediaType === 'image' && window.JetNoteNative?.downloadViewerImage) {
          window.JetNoteNative.downloadViewerImage(source);
        } else if (source) {
          location.href = 'jetnote-save://resource?url=' + encodeURIComponent(source);
        }
      } catch (_) {}
    });

    closeButton.addEventListener('pointercancel', () => {
      cancelLongPress();
      longPressTriggered = false;
    });
    closeButton.addEventListener('contextmenu', event => event.preventDefault());
    closeButton.addEventListener('click', event => {
      if (longPressTriggered) {
        longPressTriggered = false;
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      options.close?.(event);
    });
  }

  window.JetNoteImageViewerCloseControl = Object.freeze({ install });
})();
