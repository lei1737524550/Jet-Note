/**
 * ---------------------------
 *
 */
(() => {
  const CONFIG_URL = 'config.json';
  const FONT_SIZE_RANGE = { min: 10, max: 48 };
  const TEXT_AREA_HEIGHT_RANGE = { min: 80, max: 2000 };
  const TEXT_AREA_PADDING_RANGE = { min: 0, max: 120 };
  const ATTACHMENT_ROW_HEIGHT_RANGE = { min: 32, max: 120 };
  const DEBUG_CONFIGURATION_TEXT_AREA_HEIGHT_RANGE = { min: 120, max: 3000 };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function setCssPixels(variableName, rawValue, range) {
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;

    const boundedValue = clamp(value, range.min, range.max);
    document.documentElement.style.setProperty(variableName, `${boundedValue}px`);
  }

  async function applyEditorConfiguration() {
    try {
      const response = await fetch(CONFIG_URL, { cache: 'no-store' });
      if (!response.ok) return;

      const config = await response.json();
      setCssPixels('--new-post-font-size', config.new_post_font_size, FONT_SIZE_RANGE);
      setCssPixels('--new-post-text-area-height', config.new_post_text_area_height, TEXT_AREA_HEIGHT_RANGE);

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
    } catch (error) {
      console.warn('[EditorConfig] unable to load config.json', error);
    }
  }

  void applyEditorConfiguration();
})();
