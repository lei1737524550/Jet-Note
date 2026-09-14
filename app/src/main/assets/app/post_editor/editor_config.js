/**
 * Post editor runtime configuration.
 * Height is resolved from the *visible* viewport so the keyboard and differing
 * Android WebView viewport policies do not leave an oversized editor area.
 */
(() => {
  const CONFIG_URL = 'config.json';
  const FONT_SIZE_RANGE = { min: 10, max: 48 };
  const TEXT_AREA_HEIGHT_RANGE = { min: 80, max: 2000 };
  const VIEWPORT_HEIGHT_RATIO_RANGE = { min: 0.1, max: 0.8 };
  const TEXT_AREA_PADDING_RANGE = { min: 0, max: 120 };
  const ATTACHMENT_ROW_HEIGHT_RANGE = { min: 32, max: 120 };
  const DEBUG_CONFIGURATION_TEXT_AREA_HEIGHT_RANGE = { min: 120, max: 3000 };

  let responsiveTextAreaConfig = null;
  let resizeFrame = 0;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function setCssPixels(variableName, rawValue, range) {
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;
    const boundedValue = clamp(value, range.min, range.max);
    document.documentElement.style.setProperty(variableName, `${boundedValue}px`);
  }

  function readViewportHeightCssPixels() {
    // visualViewport reflects the actually visible area when the Android keyboard
    // is open. Do not multiply by devicePixelRatio; these are already CSS pixels.
    const visualHeight = Number(window.visualViewport && window.visualViewport.height);
    if (Number.isFinite(visualHeight) && visualHeight > 0) return visualHeight;

    const innerHeight = Number(window.innerHeight);
    if (Number.isFinite(innerHeight) && innerHeight > 0) return innerHeight;

    const clientHeight = Number(document.documentElement && document.documentElement.clientHeight);
    if (Number.isFinite(clientHeight) && clientHeight > 0) return clientHeight;

    return NaN;
  }

  function resolveResponsiveTextAreaHeight(rawValue) {
    // Backward compatibility: legacy configs may still provide one px value.
    if (typeof rawValue === 'number' || typeof rawValue === 'string') {
      setCssPixels('--new-post-text-area-height', rawValue, TEXT_AREA_HEIGHT_RANGE);
      return;
    }
    if (!rawValue || typeof rawValue !== 'object') return;

    const minimumRaw = Number(rawValue.minimum_px);
    const lowerBound = Number.isFinite(minimumRaw)
      ? clamp(minimumRaw, TEXT_AREA_HEIGHT_RANGE.min, TEXT_AREA_HEIGHT_RANGE.max)
      : TEXT_AREA_HEIGHT_RANGE.min;

    // Preferred new name. maximum_px is accepted only for old configs.
    const tallCapRaw = Number(
      rawValue.if_viewpoint_to_tall_edit_area_height != null
        ? rawValue.if_viewpoint_to_tall_edit_area_height
        : rawValue.maximum_px
    );
    const upperCandidate = Number.isFinite(tallCapRaw)
      ? clamp(tallCapRaw, TEXT_AREA_HEIGHT_RANGE.min, TEXT_AREA_HEIGHT_RANGE.max)
      : TEXT_AREA_HEIGHT_RANGE.max;
    const upperBound = Math.max(lowerBound, upperCandidate);

    const ratioRaw = Number(rawValue.viewport_height_ratio);
    const ratio = Number.isFinite(ratioRaw)
      ? clamp(ratioRaw, VIEWPORT_HEIGHT_RATIO_RANGE.min, VIEWPORT_HEIGHT_RATIO_RANGE.max)
      : NaN;

    const viewportHeight = readViewportHeightCssPixels();
    let resolvedPx = Number.isFinite(viewportHeight) && Number.isFinite(ratio)
      ? viewportHeight * ratio
      : Number(rawValue.fallback_px);

    if (!Number.isFinite(resolvedPx)) resolvedPx = upperBound;
    resolvedPx = clamp(resolvedPx, lowerBound, upperBound);

    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--new-post-text-area-height', `${resolvedPx}px`);
    rootStyle.setProperty('--new-post-text-area-height-min', `${lowerBound}px`);
    rootStyle.setProperty('--new-post-text-area-height-max', `${upperBound}px`);
    if (Number.isFinite(ratio)) {
      rootStyle.setProperty('--new-post-text-area-height-viewport-ratio', String(ratio));
    }
  }

  function scheduleResponsiveHeightRefresh() {
    if (!responsiveTextAreaConfig) return;
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      resolveResponsiveTextAreaHeight(responsiveTextAreaConfig);
    });
  }

  function bindViewportRefresh() {
    window.addEventListener('resize', scheduleResponsiveHeightRefresh, { passive: true });
    window.addEventListener('orientationchange', scheduleResponsiveHeightRefresh, { passive: true });
    window.addEventListener('jetnote:viewport-change', scheduleResponsiveHeightRefresh, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', scheduleResponsiveHeightRefresh, { passive: true });
      window.visualViewport.addEventListener('scroll', scheduleResponsiveHeightRefresh, { passive: true });
    }
  }

  async function applyEditorConfiguration() {
    try {
      const response = await fetch(CONFIG_URL, { cache: 'no-store' });
      if (!response.ok) return;

      const config = await response.json();
      setCssPixels('--new-post-font-size', config.new_post_font_size, FONT_SIZE_RANGE);
      responsiveTextAreaConfig = config.new_post_text_area_height;
      resolveResponsiveTextAreaHeight(responsiveTextAreaConfig);

      const layout = config.post_editor_layout || {};
      setCssPixels('--post-editor-text-padding-top', layout.text_area_padding_top, TEXT_AREA_PADDING_RANGE);
      setCssPixels('--post-editor-text-padding-right', layout.text_area_padding_right, TEXT_AREA_PADDING_RANGE);
      setCssPixels('--post-editor-text-padding-bottom', layout.text_area_padding_bottom, TEXT_AREA_PADDING_RANGE);
      setCssPixels('--post-editor-text-padding-left', layout.text_area_padding_left, TEXT_AREA_PADDING_RANGE);
      setCssPixels('--post-editor-attachment-row-height', layout.attachment_row_height, ATTACHMENT_ROW_HEIGHT_RANGE);

      const debugConfigurationEditor = config.debug_configuration_editor || {};
      setCssPixels(
        '--debug-configuration-editor-text-area-height',
        debugConfigurationEditor.text_area_height,
        DEBUG_CONFIGURATION_TEXT_AREA_HEIGHT_RANGE
      );

      bindViewportRefresh();
      // A second pass after first layout catches WebView viewport settling.
      requestAnimationFrame(scheduleResponsiveHeightRefresh);
    } catch (error) {
      console.warn('[EditorConfig] unable to load config.json', error);
    }
  }

  void applyEditorConfiguration();
})();
