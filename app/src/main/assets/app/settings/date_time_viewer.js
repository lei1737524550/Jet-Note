/* Settings -> Date/Time Viewer ---------------------------------------------
   The input is a live preview while typing. Set persists a global override;
   Reset removes that override and falls back to the bundled/system pattern. */
(function () {
  'use strict';

  const FALLBACK_PATTERN = 'yyyy/MM/dd-HH-mm';
  let initialized = false;
  let timer = 0;
  let previewIntervalMs = 250;
  const DEFAULT_FOLD_DURATION_MS = 300;
  const foldAnimations = new WeakMap();
  const copyFeedbackTimers = new WeakMap();
  const COPY_FEEDBACK_DURATION_MS = 1000;
  let setSuccessColorTimer = 0;
  let setSuccessColorGeneration = 0;

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
    const explanation = document.getElementById('dateTimeViewerExplanationContent');
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

  function stablePreviewTextNode(preview) {
    if (!preview) return null;
    const first = preview.firstChild;
    if (preview.childNodes.length === 1 && first?.nodeType === Node.TEXT_NODE) return first;

    // Establish one persistent CharacterData node once. Future clock ticks mutate
    // that same node instead of replacing it, so Android/WebView text-selection
    // range endpoints and drag handles are not invalidated by a new DOM node.
    const node = document.createTextNode('');
    preview.replaceChildren(node);
    return node;
  }

  function selectionSnapshotForNode(node) {
    const selection = window.getSelection?.();
    if (!selection || selection.rangeCount === 0 || !node) return null;
    const range = selection.getRangeAt(0);
    if (range.startContainer !== node && range.endContainer !== node) return null;
    return {
      selection,
      startContainer: range.startContainer,
      endContainer: range.endContainer,
      startOffset: range.startOffset,
      endOffset: range.endOffset
    };
  }

  function restoreSelectionSnapshot(snapshot, node) {
    if (!snapshot || !node) return;
    try {
      const range = document.createRange();
      const startNode = snapshot.startContainer === node ? node : snapshot.startContainer;
      const endNode = snapshot.endContainer === node ? node : snapshot.endContainer;
      const startLimit = startNode === node ? node.length : (startNode?.length ?? startNode?.childNodes?.length ?? 0);
      const endLimit = endNode === node ? node.length : (endNode?.length ?? endNode?.childNodes?.length ?? 0);
      range.setStart(startNode, Math.min(snapshot.startOffset, startLimit));
      range.setEnd(endNode, Math.min(snapshot.endOffset, endLimit));
      snapshot.selection.removeAllRanges();
      snapshot.selection.addRange(range);
    } catch (_) {}
  }

  function updateCharacterDataMinimally(node, nextText) {
    const previous = node.data;
    if (previous === nextText) return;

    // Change only the differing slice instead of replacing all CharacterData.
    // More importantly, preserve and restore a Range whose endpoint is inside
    // the live clock. Android WebView otherwise drops the selection handles
    // when the selected CharacterData changes, while a range spanning stable
    // neighbouring nodes survives. This makes direct clock selection behave
    // like that already-working spanning-selection case without freezing time.
    const snapshot = selectionSnapshotForNode(node);
    let prefix = 0;
    const common = Math.min(previous.length, nextText.length);
    while (prefix < common && previous.charCodeAt(prefix) === nextText.charCodeAt(prefix)) prefix += 1;
    let oldSuffix = previous.length;
    let newSuffix = nextText.length;
    while (oldSuffix > prefix && newSuffix > prefix &&
           previous.charCodeAt(oldSuffix - 1) === nextText.charCodeAt(newSuffix - 1)) {
      oldSuffix -= 1;
      newSuffix -= 1;
    }
    node.replaceData(prefix, oldSuffix - prefix, nextText.slice(prefix, newSuffix));
    restoreSelectionSnapshot(snapshot, node);
  }

  function renderPreviewOnly() {
    const preview = document.getElementById('dateTimeViewerPreview');
    if (!preview) return;

    const pattern = currentInputPattern() || systemPattern();
    const nextText = helper()?.format?.(new Date(), pattern) || '';
    const node = stablePreviewTextNode(preview);
    if (!node || node.data === nextText) return;
    updateCharacterDataMinimally(node, nextText);
  }

  function render() {
    renderPreviewOnly();
    renderTokenGrid();

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

  function normalizeColorRule(rule, fallbackColor) {
    const sequence = (Array.isArray(rule?.sequence) ? rule.sequence : [])
      .map(item => ({
        color: String(item?.color || '').trim(),
        duration_ms: Math.max(0, Math.min(Number(item?.duration_ms) || 0, 86400000))
      }))
      .filter(item => /^#[0-9a-f]{6}$/i.test(item.color));
    return {
      change_count: Number(rule?.change_count),
      sequence: sequence.length ? sequence : [{ color: fallbackColor, duration_ms: 0 }]
    };
  }

  function playSetSuccessTextColorRule() {
    const button = document.getElementById('dateTimeViewerSetButton');
    if (!button) return;
    if (setSuccessColorTimer) window.clearTimeout(setSuccessColorTimer);
    const generation = ++setSuccessColorGeneration;
    const originalColor = getComputedStyle(button).color || '#111111';
    const configured = readEffectiveConfig()?.date_time_viewer_set_success_text_color_rule;
    const rule = normalizeColorRule(configured, originalColor);
    const count = rule.change_count;
    const sequence = rule.sequence;

    // JetNote 颜色变化配置语言：-1 无限循环；0 不变化；正整数表示完整 sequence 的轮数。
    if (count === 0 || sequence.length === 1) {
      button.style.color = sequence[0].color;
      if (count === 0) button.style.color = originalColor;
      return;
    }

    const infinite = count === -1;
    const rounds = infinite ? Infinity : Math.max(0, Math.floor(count));
    if (!infinite && rounds === 0) return;
    let round = 0;
    let index = 0;
    const step = () => {
      if (generation !== setSuccessColorGeneration) return;
      const item = sequence[index];
      button.style.color = item.color;
      const wait = infinite ? Math.max(16, item.duration_ms) : item.duration_ms;
      setSuccessColorTimer = window.setTimeout(() => {
        index += 1;
        if (index >= sequence.length) {
          index = 0;
          round += 1;
          if (!infinite && round >= rounds) {
            button.style.color = originalColor;
            setSuccessColorTimer = 0;
            return;
          }
        }
        step();
      }, wait);
    };
    step();
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
    playSetSuccessTextColorRule();
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

  function foldDurationMs(key) {
    const config = readEffectiveConfig()?.date_time_viewer_fold_animation || {};
    const value = Number(config[key]);
    return Number.isFinite(value) && value >= 0 ? value : DEFAULT_FOLD_DURATION_MS;
  }

  function animateFold(panel, opening, durationMs, onFinished) {
    if (!panel) return;

    const previous = foldAnimations.get(panel);
    if (previous?.cancel) previous.cancel();

    const duration = Math.max(0, Number(durationMs) || 0);
    panel.style.setProperty('--date-time-fold-duration', `${duration}ms`);

    let cancelled = false;
    let fallbackTimer = 0;

    const cleanup = () => {
      panel.removeEventListener('transitionend', handleEnd);
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      fallbackTimer = 0;
    };

    const finish = () => {
      if (cancelled) return;
      cleanup();
      if (foldAnimations.get(panel)?.finish !== finish) return;
      foldAnimations.delete(panel);
      onFinished?.();
    };

    const handleEnd = event => {
      if (event.target !== panel || event.propertyName !== 'grid-template-rows') return;
      finish();
    };

    const controller = {
      finish,
      cancel() {
        if (cancelled) return;
        cancelled = true;
        cleanup();
      }
    };
    foldAnimations.set(panel, controller);

    // Do not animate measured pixel heights. A height animation forces Android
    // WebView to run layout on every frame and is the source of the visible
    // hesitation on collapse. A 0fr <-> 1fr grid track keeps the DOM stable and
    // lets the browser interpolate the drawer as one continuous transition.
    if (opening) {
      panel.removeAttribute('inert');
      panel.setAttribute('aria-hidden', 'false');
      panel.classList.add('is-open');
    } else {
      panel.setAttribute('aria-hidden', 'true');
      panel.classList.remove('is-open');
    }

    if (duration === 0) {
      if (!opening) panel.setAttribute('inert', '');
      finish();
      return;
    }

    panel.addEventListener('transitionend', handleEnd);
    fallbackTimer = window.setTimeout(finish, duration + 100);

    if (!opening) {
      // Delay inert until the visual transition has started so WebView does not
      // synchronously re-evaluate focusability/layout in the click frame.
      requestAnimationFrame(() => panel.setAttribute('inert', ''));
    }
  }

  function resetExplanationState() {
    const explanation = document.getElementById('dateTimeViewerExplanation');
    const explainButton = document.getElementById('dateTimeViewerExplainButton');
    if (explanation) {
      const running = foldAnimations.get(explanation);
      running?.cancel?.();
      foldAnimations.delete(explanation);
      explanation.classList.remove('is-open');
      explanation.setAttribute('aria-hidden', 'true');
      explanation.setAttribute('inert', '');
    }
    if (explainButton) {
      explainButton.setAttribute('aria-expanded', 'false');
      explainButton.textContent = languageValue('explain', 'Explain');
    }
  }

  function toggleLetters() {
    const panel = document.getElementById('dateTimeViewerLettersPanel');
    const button = document.getElementById('dateTimeViewerExpandButton');
    if (!panel || !button) return;

    const opening = !panel.classList.contains('is-open');
    button.setAttribute('aria-expanded', String(opening));
    button.textContent = languageValue(
      opening ? 'collapse_letters' : 'expand_letters',
      opening ? 'Collapse letters' : 'Expand letters'
    );

    animateFold(panel, opening, foldDurationMs('letters_duration_ms'), () => {
      // Reset the nested drawer only after the parent track has reached 0fr.
      // At that point it is fully clipped, so the reset cannot create a visible
      // second movement or pause in the first-level collapse.
      if (!opening) resetExplanationState();
    });
  }

  function toggleExplanation() {
    const panel = document.getElementById('dateTimeViewerExplanation');
    const button = document.getElementById('dateTimeViewerExplainButton');
    const lettersPanel = document.getElementById('dateTimeViewerLettersPanel');
    if (!panel || !button || !lettersPanel || !lettersPanel.classList.contains('is-open')) return;

    const opening = !panel.classList.contains('is-open');
    button.setAttribute('aria-expanded', String(opening));
    const key = opening ? 'hide_explanation' : 'explain';
    button.textContent = languageValue(key, opening ? 'Hide explanation' : 'Explain');
    animateFold(panel, opening, foldDurationMs('explain_duration_ms'));
  }

  async function copyText(text) {
    const value = String(text ?? '');
    if (!value) return false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch (_) {}

    try {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      const copied = document.execCommand('copy');
      textarea.remove();
      return Boolean(copied);
    } catch (_) {
      return false;
    }
  }

  function showCopySuccess(button) {
    if (!button) return;
    const previousTimer = copyFeedbackTimers.get(button);
    if (previousTimer) window.clearTimeout(previousTimer);

    button.textContent = languageValue('copied', 'Copied');
    button.classList.add('is-copied');

    const timerId = window.setTimeout(() => {
      button.textContent = languageValue('copy', 'Copy');
      button.classList.remove('is-copied');
      copyFeedbackTimers.delete(button);
    }, COPY_FEEDBACK_DURATION_MS);
    copyFeedbackTimers.set(button, timerId);
  }

  async function copyPreviewValue() {
    const preview = document.getElementById('dateTimeViewerPreview');
    const button = document.getElementById('dateTimeViewerPreviewCopyButton');
    const copied = await copyText(preview?.textContent || '');
    if (copied) showCopySuccess(button);
    return copied;
  }

  async function copyPatternValue() {
    const button = document.getElementById('dateTimeViewerPatternCopyButton');
    const copied = await copyText(document.getElementById('dateTimePatternInput')?.value || '');
    if (copied) showCopySuccess(button);
    return copied;
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
      // Keep the hot clock path isolated from the rest of the viewer DOM.
      // The live text keeps updating during selection, but no surrounding
      // controls are rebuilt or toggled on each tick.
      if (screenOpen) renderPreviewOnly();
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
      document.getElementById('dateTimeViewerExpandButton')?.addEventListener('click', toggleLetters);
      document.getElementById('dateTimeViewerExplainButton')?.addEventListener('click', toggleExplanation);
      document.getElementById('dateTimeViewerPreviewCopyButton')?.addEventListener('click', copyPreviewValue);
      document.getElementById('dateTimeViewerPatternCopyButton')?.addEventListener('click', copyPatternValue);
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
