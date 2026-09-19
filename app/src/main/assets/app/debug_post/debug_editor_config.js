/**
 * Edit Debug Post runtime configuration.
 * This module intentionally owns only Debug Editor CSS variables and viewport
 * state. It must not read or mutate Post Editor layout variables/state.
 */
(() => {
  'use strict';

  const DEBUG_CONFIG_URL = 'config/debug.json';
  const HEIGHT_RANGE = { min: 120, max: 3000 };
  const PADDING_RANGE = { min: 0, max: 120 };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function setCssPixels(name, rawValue, range) {
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;
    document.documentElement.style.setProperty(name, `${clamp(value, range.min, range.max)}px`);
  }

  function applyKeyboardState(keyboardOpen) {
    const screen = document.getElementById('debugConfigurationEditorScreen');
    if (!screen) return;
    screen.dataset.keyboardOpen = keyboardOpen ? 'true' : 'false';
  }

  async function readDebugConfiguration() {
    try {
      const runtimeRaw = window.JetNoteNative?.getRuntimeConfigJson?.();
      if (runtimeRaw) {
        const runtime = JSON.parse(runtimeRaw);
        if (runtime?.debug_configuration_editor) return runtime.debug_configuration_editor;
      }
    } catch (_) {}

    try {
      const response = await fetch(DEBUG_CONFIG_URL, { cache: 'no-store' });
      if (!response.ok) return {};
      const config = await response.json();
      return config?.debug_configuration_editor || {};
    } catch (_) {
      return {};
    }
  }

  async function applyDebugEditorConfiguration() {
    const config = await readDebugConfiguration();
    setCssPixels('--debug-editor-text-area-height', config.edit_debud_post_height, HEIGHT_RANGE);
    setCssPixels('--debug-editor-body-bottom-padding', config.body_bottom_padding_px, PADDING_RANGE);
    setCssPixels('--debug-editor-text-bottom-padding', config.text_area_bottom_padding_px, PADDING_RANGE);
  }

  window.addEventListener('jetnote:viewport-change', event => {
    applyKeyboardState(Boolean(event?.detail?.keyboardOpen));
  }, { passive: true });

  void applyDebugEditorConfiguration();
})();
