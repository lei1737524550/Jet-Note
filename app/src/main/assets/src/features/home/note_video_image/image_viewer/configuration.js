(function () {
  'use strict';

  const state = {
    imageViewerMaxScale: -1,
    videoViewerMaxScale: -1,
    backgroundColorCycle: [],
    defaultBackgroundColorIndex: 0
  };

  function apply(config) {
    if (!config || typeof config !== 'object') return;
    const scale = config.viewer_media_scale || {};
    const imageMax = Number(scale.image_viewer_max_scale);
    const videoMax = Number(scale.video_viewer_max_scale);
    if (Number.isFinite(imageMax)) state.imageViewerMaxScale = imageMax;
    if (Number.isFinite(videoMax)) state.videoViewerMaxScale = videoMax;

    const background = config.image_viewer_background_switch_configuration || {};
    if (Array.isArray(background.background_color_cycle)) {
      const colors = background.background_color_cycle.map(value => String(value || '').trim()).filter(Boolean);
      if (colors.length >= 2) state.backgroundColorCycle = colors;
    }
    const defaultIndex = Number(background.default_background_color_index);
    if (Number.isInteger(defaultIndex) && defaultIndex >= 0) state.defaultBackgroundColorIndex = defaultIndex;
  }

  function initialize() {
    try {
      if (window.JET_NOTE_VIEWER_CONFIG && typeof window.JET_NOTE_VIEWER_CONFIG === 'object') {
        apply(window.JET_NOTE_VIEWER_CONFIG);
      } else {
        const bundled = window.JetNoteNative?.getBundledConfigJson?.();
        if (bundled) apply(JSON.parse(bundled));
      }
    } catch (_) {}
    try {
      const runtime = window.JetNoteNative?.getRuntimeConfigJson?.();
      if (runtime) apply(JSON.parse(runtime));
    } catch (_) {}
  }

  function maxScale(mediaType) {
    const raw = mediaType === 'video' ? state.videoViewerMaxScale : state.imageViewerMaxScale;
    if (raw === 0) return 0;
    if (raw < 0) return Infinity;
    return Math.max(1, raw);
  }

  initialize();
  window.JetNoteImageViewerConfiguration = Object.freeze({ state, apply, initialize, maxScale });
})();
