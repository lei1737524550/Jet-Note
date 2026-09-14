/* Settings -> Date/Time Viewer ---------------------------------------------
   The input is a live preview while typing. Set persists a global override;
   Reset removes that override and falls back to the bundled/system pattern. */
(function () {
  'use strict';

  const FALLBACK_PATTERN = 'yyyy/MM/dd-HH-mm';
  let initialized = false;
  let timer = 0;
  let previewIntervalMs = 250;

  function helper() {
    return window.JetNoteDateTimeFormat;
  }

  function languageValue(key, fallback) {
    return window.JetNoteLanguage?.value?.(`ui_strings.date_time_viewer.${key}`, '') || fallback;
  }

  function currentInputPattern() {
    return String(document.getElementById('dateTimePatternInput')?.value || '').trim();
  }

  function systemPattern() {
    return helper()?.systemPattern?.() || FALLBACK_PATTERN;
  }

  function currentPersistedPattern() {
    return helper()?.effectivePattern?.() || systemPattern();
  }

  function tokenDescription(key) {
    if (!key) return '';
    return window.JetNoteLanguage?.value?.(`ui_strings.date_time_viewer.token_descriptions.${key}`, '') || '';
  }

  function renderTokenGrid() {
    const grid = document.getElementById('dateTimeViewerTokenGrid');
    const explanation = document.getElementById('dateTimeViewerExplanation');
    const formatter = helper();
    if (!grid || !formatter?.tokens) return;

    if (grid.childElementCount !== formatter.tokens.length) {
      grid.replaceChildren();
      explanation?.replaceChildren();

      formatter.tokens.forEach(item => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'date-time-viewer-token common_border';
        button.dataset.patternToken = item.token;
        button.textContent = item.token;
        button.addEventListener('click', () => insertToken(item.token));
        grid.appendChild(button);

        if (explanation) {
          const row = document.createElement('div');
          row.className = 'date-time-viewer-explanation-item';
          const code = document.createElement('code');
          code.className = 'date-time-viewer-explanation-code';
          code.textContent = item.token;
          const description = document.createElement('span');
          description.className = 'date-time-viewer-explanation-text';
          description.dataset.tokenDescriptionKey = item.descriptionKey || '';
          row.append(code, description);
          explanation.appendChild(row);
        }
      });
    }

    explanation?.querySelectorAll('[data-token-description-key]').forEach(element => {
      element.textContent = tokenDescription(element.dataset.tokenDescriptionKey || '');
    });
  }

  function render() {
    const now = new Date();
    const preview = document.getElementById('dateTimeViewerPreview');
    const inputPattern = currentInputPattern();
    const pattern = inputPattern || systemPattern();
    if (preview) preview.textContent = helper()?.format?.(now, pattern) || '';
    renderTokenGrid();

    const setButton = document.getElementById('dateTimeViewerSetButton');
    if (setButton) {
      const applied = Boolean(inputPattern) && inputPattern === currentPersistedPattern() && Boolean(helper()?.hasCustomPattern?.());
      setButton.classList.toggle('is-applied', applied);
    }
  }

  function insertToken(token) {
    const input = document.getElementById('dateTimePatternInput');
    if (!input) return;
    const start = Number.isInteger(input.selectionStart) ? input.selectionStart : input.value.length;
    const end = Number.isInteger(input.selectionEnd) ? input.selectionEnd : start;
    input.setRangeText(token, start, end, 'end');
    input.focus();
    render();
  }

  function readEffectiveConfig() {
    return helper()?.readEffectiveConfig?.() || {};
  }

  function readBundledConfig() {
    return helper()?.readBundledConfig?.() || {};
  }

  function saveConfig(config) {
    const native = window.JetNoteNative;
    if (!native || typeof native.setRuntimeConfigJson !== 'function') return false;
    try { return native.setRuntimeConfigJson(JSON.stringify(config)); }
    catch (_) { return false; }
  }

  function dispatchPatternChanged() {
    const detail = {
      custom: helper()?.hasCustomPattern?.() || false,
      pattern: helper()?.effectivePattern?.() || systemPattern()
    };
    window.dispatchEvent(new CustomEvent('jetnote:date-time-pattern-changed', { detail }));
  }

  function loadConfiguredPattern(replaceInput = false) {
    const input = document.getElementById('dateTimePatternInput');
    if (input && (replaceInput || !input.value.trim())) input.value = currentPersistedPattern();
    render();
  }

  function setPattern() {
    const input = document.getElementById('dateTimePatternInput');
    if (!input) return;
    const pattern = String(input.value || '').trim();
    if (!pattern || helper()?.validatePattern?.(pattern) === false) {
      input.focus();
      input.setAttribute('aria-invalid', 'true');
      return;
    }

    const config = readEffectiveConfig();
    config.date_time_format = {
      ...(config.date_time_format || {}),
      custom_enabled: true,
      custom_pattern: pattern
    };

    if (!saveConfig(config)) return;
    input.removeAttribute('aria-invalid');
    dispatchPatternChanged();
    render();
  }

  function reset() {
    const config = readEffectiveConfig();
    config.date_time_format = {
      ...(config.date_time_format || {}),
      custom_enabled: false,
      custom_pattern: ''
    };

    if (!saveConfig(config)) return;

    const input = document.getElementById('dateTimePatternInput');
    if (input) {
      input.value = helper()?.systemPattern?.(readBundledConfig()) || FALLBACK_PATTERN;
      input.removeAttribute('aria-invalid');
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
    dispatchPatternChanged();
    render();
  }

  function toggleExplanation() {
    const panel = document.getElementById('dateTimeViewerExplanation');
    const button = document.getElementById('dateTimeViewerExplainButton');
    if (!panel || !button) return;
    const opening = panel.hidden;
    panel.hidden = !opening;
    button.setAttribute('aria-expanded', String(opening));
    const key = opening ? 'hide_explanation' : 'explain';
    button.textContent = languageValue(key, opening ? 'Hide explanation' : 'Explain');
  }

  function stopPreviewTimer() {
    if (timer) {
      window.clearTimeout(timer);
      timer = 0;
    }
  }

  function schedulePreviewTimer() {
    stopPreviewTimer();
    if (document.hidden) return;
    const screenOpen = document.getElementById('settingsScreen')?.classList.contains('open');
    const pattern = currentInputPattern() || systemPattern();
    previewIntervalMs = helper()?.refreshInterval?.(pattern) || 250;
    // Date/Time Viewer does not need to redraw token controls at 20fps.
    // Only the preview text is hot; render() itself avoids rebuilding the grid.
    const interval = Math.max(50, previewIntervalMs);
    timer = window.setTimeout(() => {
      timer = 0;
      if (screenOpen) render();
      schedulePreviewTimer();
    }, interval);
  }

  function restartPreviewTimer() {
    stopPreviewTimer();
    render();
    schedulePreviewTimer();
  }

  function init() {
    const input = document.getElementById('dateTimePatternInput');
    if (!input) return;

    if (!initialized) {
      initialized = true;
      input.addEventListener('input', () => {
        input.removeAttribute('aria-invalid');
        restartPreviewTimer();
      });
      document.getElementById('dateTimeViewerSetButton')?.addEventListener('click', setPattern);
      document.getElementById('dateTimeViewerResetButton')?.addEventListener('click', reset);
      document.getElementById('dateTimeViewerExplainButton')?.addEventListener('click', toggleExplanation);
      schedulePreviewTimer();
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          stopPreviewTimer();
          return;
        }
        loadConfiguredPattern(false);
        restartPreviewTimer();
      });
    }

    loadConfiguredPattern(true);
    window.JetNoteUiLanguage?.apply?.(document)
      .then?.(() => render())
      .catch?.(() => {});
  }

  window.DateTimeViewer = Object.freeze({ init, render, setPattern, reset });
  window.initializeDateTimeViewer = init;
})();
