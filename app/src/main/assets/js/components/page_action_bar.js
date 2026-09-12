(function () {
  'use strict';

  let configPromise = null;

  function loadConfig() {
    if (!configPromise) {
      configPromise = fetch('config.json', { cache: 'no-store' }).then(response => {
        if (!response.ok) throw new Error(`Page action bar config unavailable: ${response.status}`);
        return response.json();
      });
    }
    return configPromise;
  }

  function px(value) { return `${Number(value) || 0}px`; }

  async function uiString(key, fallback = '') {
    if (!key) return fallback;
    return window.JetNoteUiLanguage?.get
      ? window.JetNoteUiLanguage.get(key, fallback)
      : fallback;
  }

  function apply(spec) {
    if (!spec) return;
    const root = document.documentElement.style;
    root.setProperty('--page-action-bar-height', px(spec.height));
    root.setProperty('--page-action-bar-control-height', px(spec.controlHeight));
    root.setProperty('--page-action-bar-title-size', px(spec.titleSize));
    root.setProperty('--page-action-bar-control-size', px(spec.controlTextSize));
    root.setProperty('--page-action-bar-left-axis', px(spec.leftAxis));
    root.setProperty('--page-action-bar-right-axis', px(spec.rightAxis));
    root.setProperty('--page-action-bar-icon-width', px(spec.iconButtonWidth));
    root.setProperty('--page-action-bar-text-min-width', px(spec.textButtonMinWidth));
    root.setProperty('--page-action-bar-control-radius', px(spec.controlRadius));
    root.setProperty('--page-action-bar-background-default', spec.background || '#f8f9fa');
    if (!getComputedStyle(document.documentElement).getPropertyValue('--page-action-bar-background').trim()) {
      root.setProperty('--page-action-bar-background', spec.background || '#f8f9fa');
    }
    root.setProperty('--page-action-bar-border-color', spec.borderColor || '#bfc1c4');
    root.setProperty('--page-action-bar-divider-color', spec.dividerColor || '#eceef1');
    root.setProperty('--page-action-bar-title-color', spec.titleColor || '#202124');
    root.setProperty('--page-action-bar-normal-color', spec.normalTextColor || '#222222');
    root.setProperty('--page-action-bar-primary-color', spec.primaryTextColor || '#1599e8');
    root.setProperty('--page-action-bar-tool-action-color', spec.toolActionTextColor || '#168a45');
  }

  function applyEditorAppearance(config) {
    const root = document.documentElement.style;
    const caretConfig = config?.post_editor_text_caret && typeof config.post_editor_text_caret === 'object'
      ? config.post_editor_text_caret
      : {};
    const requestedWidth = Number(caretConfig.text_caret_width_px ?? config?.caret_width);
    const caretWidth = Number.isFinite(requestedWidth) && requestedWidth >= 1
      ? Math.round(requestedWidth)
      : 4;
    const caretColor = String(caretConfig.text_caret_color || '#14A89A');
    const visibleDuration = Math.max(50, Number(caretConfig.text_caret_visible_state_duration_ms) || 750);
    const hiddenDuration = Math.max(50, Number(caretConfig.text_caret_hidden_state_duration_ms) || 750);
    const cursorDropColor = config?.cursor_drop_color || '#14A89A';
    window.JetEditorAppearance = Object.freeze({
      caretWidth,
      caretColor,
      caretVisibleStateDurationMs: visibleDuration,
      caretHiddenStateDurationMs: hiddenDuration,
      cursorDropColor
    });
    root.setProperty('--post-compose-caret-width', `${caretWidth}px`);
    root.setProperty('--post-compose-caret-color', caretColor);
    root.setProperty('--cursor-drop-color', cursorDropColor);
    window.dispatchEvent(new CustomEvent('jetnote:editor-appearance-changed', {
      detail: window.JetEditorAppearance
    }));
  }

  const ACTION_TO_EDITOR_ACTION = Object.freeze({
    cancel_post_composer: 'cancel',
    publish_post: 'publish'
  });

  function normalizeContentType(value) {
    const v = String(value || '').trim().toLowerCase();
    if (v === 'none') return 'none';
    if (v === 'string' || v === 'text') return 'string';
    if (v === 'asset_path' || v === 'asset' || v === 'path' || v === 'image_path') return 'asset_path';
    return 'none';
  }

  async function renderButton(button, pageSpec, side) {
    if (!button) return;
    const prefix = `${side}_button_`;
    const contentType = normalizeContentType(pageSpec?.[`${prefix}content_type`]);
    const contentFallback = String(pageSpec?.[`${prefix}string_or_asset_path`] ?? '').trim();
    const contentLanguageKey = String(pageSpec?.[`${prefix}string_language_key`] ?? '').trim();
    const content = contentType === 'string' ? await uiString(contentLanguageKey, contentFallback) : contentFallback;
    const accessibilityLabelKey = String(pageSpec?.[`${prefix}accessibility_label_language_key`] ?? '').trim();
    const accessibilityLabelFallback = String(pageSpec?.[`${prefix}accessibility_label`] ?? '').trim();
    const accessibilityLabel = await uiString(accessibilityLabelKey, accessibilityLabelFallback);
    const actionName = String(pageSpec?.[`${prefix}action_name`] ?? 'none').trim();

    button.replaceChildren();
    button.hidden = contentType === 'none';
    button.classList.toggle('page-action-bar-icon', contentType === 'asset_path');
    button.classList.toggle('page-action-bar-string', contentType === 'string');
    button.removeAttribute('data-editor-action');
    button.removeAttribute('data-buttom-string-buttom-bar-action');
    button.removeAttribute('title');

    if (button.hidden) {
      button.setAttribute('aria-hidden', 'true');
      button.tabIndex = -1;
      return;
    }

    button.removeAttribute('aria-hidden');
    button.tabIndex = 0;
    if (accessibilityLabel) {
      button.setAttribute('aria-label', accessibilityLabel);
      button.title = accessibilityLabel;
    } else {
      button.removeAttribute('aria-label');
    }

    if (contentType === 'asset_path') {
      const image = document.createElement('img');
      image.className = 'page-action-bar-asset-image';
      image.src = content;
      image.alt = '';
      image.setAttribute('aria-hidden', 'true');
      image.draggable = false;
      button.appendChild(image);
    } else if (contentType === 'string') {
      button.textContent = content;
    }

    const editorAction = ACTION_TO_EDITOR_ACTION[actionName];
    if (editorAction) button.dataset.editorAction = editorAction;
    else if (actionName && actionName !== 'none') button.dataset.buttomStringButtomBarAction = actionName;
  }

  function dispatchConfiguredAction(actionName) {
    if (actionName === 'close_settings') return window.closeSettings?.();
    if (actionName === 'close_tools') return window.closeTools?.();
    if (actionName === 'open_settings') return window.openSettings?.();
    console.warn(`Jet Note: unknown buttom_string_buttom_bar action: ${actionName}`);
  }

  async function renderBar(bar, pageKey) {
    if (!bar) return;
    const config = await loadConfig();
    const spec = config?.buttom_string_buttom_bar?.[pageKey];
    if (!spec) {
      console.warn(`Jet Note: buttom_string_buttom_bar page config not found: ${pageKey}`);
      return;
    }
    bar.dataset.buttomStringButtomBarPage = pageKey;
    const title = bar.querySelector('[data-buttom-string-buttom-bar-title]');
    const titleKey = String(spec.center_string_language_key ?? '').trim();
    const titleFallback = String(spec.center_string ?? '');
    if (title) title.textContent = await uiString(titleKey, titleFallback);
    await Promise.all([
      renderButton(bar.querySelector('[data-buttom-string-buttom-bar-side="left"]'), spec, 'left'),
      renderButton(bar.querySelector('[data-buttom-string-buttom-bar-side="right"]'), spec, 'right')
    ]);
  }

  async function renderAll() {
    const bars = [...document.querySelectorAll('.buttom-string-buttom-bar[data-buttom-string-buttom-bar-page]')];
    await Promise.all(bars.map(bar => renderBar(bar, bar.dataset.buttomStringButtomBarPage)));
  }

  function bindConfiguredActions() {
    if (document.documentElement.dataset.buttomStringButtomBarActionsBound === 'true') return;
    document.documentElement.dataset.buttomStringButtomBarActionsBound = 'true';
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-buttom-string-buttom-bar-action]');
      if (!button) return;
      const actionName = button.dataset.buttomStringButtomBarAction;
      if (!actionName) return;
      event.preventDefault();
      dispatchConfiguredAction(actionName);
    });
  }

  async function initialize() {
    try {
      const config = await loadConfig();
      apply(config.page_action_bar);
      applyEditorAppearance(config);
      bindConfiguredActions();
      await window.JetNoteUiLanguage?.apply?.(document);
      await renderAll();
    } catch (error) {
      console.error('Jet Note: page action bar config failed', error);
    }
  }

  window.JetPageActionBar = { initialize, apply, applyEditorAppearance, loadConfig };
  window.JetBottomStringBottomBar = { renderBar, renderAll };
  initialize();
})();
