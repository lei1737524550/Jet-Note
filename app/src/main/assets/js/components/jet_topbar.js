(function () {
  'use strict';

  let configPromise = null;

  function loadConfig() {
    if (!configPromise) {
      configPromise = fetch('config.json', { cache: 'no-store' }).then(response => {
        if (!response.ok) throw new Error(`Top bar config unavailable: ${response.status}`);
        return response.json();
      });
    }
    return configPromise;
  }

  function px(value) { return `${Number(value) || 0}px`; }

  function apply(spec) {
    if (!spec) return;
    const root = document.documentElement.style;
    root.setProperty('--jet-toolbar-height', px(spec.height));
    root.setProperty('--jet-toolbar-control-height', px(spec.controlHeight));
    root.setProperty('--jet-toolbar-title-size', px(spec.titleSize));
    root.setProperty('--jet-toolbar-control-size', px(spec.controlTextSize));
    root.setProperty('--jet-toolbar-left-axis', px(spec.leftAxis));
    root.setProperty('--jet-toolbar-right-axis', px(spec.rightAxis));
    root.setProperty('--jet-toolbar-icon-width', px(spec.iconButtonWidth));
    root.setProperty('--jet-toolbar-text-min-width', px(spec.textButtonMinWidth));
    root.setProperty('--jet-toolbar-control-radius', px(spec.controlRadius));
    root.setProperty('--jet-toolbar-background', spec.background || '#f8f9fa');
    root.setProperty('--jet-toolbar-border-color', spec.borderColor || '#bfc1c4');
    root.setProperty('--jet-toolbar-divider-color', spec.dividerColor || '#eceef1');
    root.setProperty('--jet-toolbar-title-color', spec.titleColor || '#202124');
    root.setProperty('--jet-toolbar-normal-color', spec.normalTextColor || '#222222');
    root.setProperty('--jet-toolbar-primary-color', spec.primaryTextColor || '#1599e8');
    root.setProperty('--jet-toolbar-tool-action-color', spec.toolActionTextColor || '#168a45');
  }
  function applyEditorAppearance(config) {
    const root = document.documentElement.style;
    const requestedWidth = Number(config?.caret_width);
    const caretWidth = Number.isFinite(requestedWidth) && requestedWidth >= 1
      ? Math.round(requestedWidth)
      : 4;
    const cursorDropColor = config?.cursor_drop_color || '#14A89A';

    // Keep one normalized runtime value as the source of truth. ComposerCaret
    // applies this value directly to the real caret element it creates, so a
    // later stylesheet/default cannot silently replace config.json.
    window.JetEditorAppearance = Object.freeze({ caretWidth, cursorDropColor });
    root.setProperty('--post-compose-caret-width', `${caretWidth}px`);
    root.setProperty('--cursor-drop-color', cursorDropColor);
    window.dispatchEvent(new CustomEvent('jetnote:editor-appearance-changed', {
      detail: window.JetEditorAppearance
    }));
  }

  async function initialize() {
    try {
      const config = await loadConfig();
      apply(config.top_bar);
      applyEditorAppearance(config);
    } catch (error) {
      console.error('Jet Note: top bar config failed', error);
    }
  }

  window.JetTopBar = { initialize, apply, applyEditorAppearance, loadConfig };
  initialize();
})();
