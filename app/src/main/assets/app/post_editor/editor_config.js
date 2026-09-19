/**
 * Post editor runtime configuration.
 * Applies Post Editor sizing and spacing configuration.
 * Runtime keyboard state does not rewrite editor geometry here.
 */
(() => {
  const CONFIG_URL = 'config.json';
  const FONT_SIZE_RANGE = { min: 10, max: 48 };
  const TEXT_AREA_HEIGHT_RANGE = { min: 80, max: 2000 };
  const VIEWPORT_HEIGHT_RATIO_RANGE = { min: 0.1, max: 0.8 };
  const TEXT_AREA_PADDING_RANGE = { min: 0, max: 120 };
  const ATTACHMENT_ROW_HEIGHT_RANGE = { min: 32, max: 120 };
  const KEYBOARD_ANIMATION_DURATION_RANGE = { min: 0, max: 1000 };

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
    const height = Number(window.innerHeight);
    return Number.isFinite(height) && height > 0 ? height : NaN;
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



  async function applyEditorConfiguration() {
    try {
      const response = await fetch(CONFIG_URL, { cache: 'no-store' });
      if (!response.ok) return;

      const config = await response.json();
      setCssPixels('--new-post-font-size', config.new_post_font_size, FONT_SIZE_RANGE);
      resolveResponsiveTextAreaHeight(config.new_post_text_area_height);

      const layout = config.post_editor_layout || {};
      setCssPixels('--post-editor-text-padding-top', layout.text_area_padding_top, TEXT_AREA_PADDING_RANGE);
      setCssPixels('--post-editor-text-padding-right', layout.text_area_padding_right, TEXT_AREA_PADDING_RANGE);
      setCssPixels('--post-editor-text-padding-bottom', layout.text_area_padding_bottom, TEXT_AREA_PADDING_RANGE);
      setCssPixels('--post-editor-text-padding-left', layout.text_area_padding_left, TEXT_AREA_PADDING_RANGE);
      setCssPixels('--post-editor-attachment-row-height', layout.attachment_row_height, ATTACHMENT_ROW_HEIGHT_RANGE);
      setCssPixels('--post-editor-keyboard-lift-duration', layout.keyboard_lift_animation_duration_ms, KEYBOARD_ANIMATION_DURATION_RANGE);
    } catch (error) {
      console.warn('[EditorConfig] unable to load config.json', error);
    }
  }

  void applyEditorConfiguration();
})();
