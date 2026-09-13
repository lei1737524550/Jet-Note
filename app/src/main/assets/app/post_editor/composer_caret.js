/**
 * ComposerCaret
 * -------------
 */
window.JetComposerCaret = (() => {
  const MIRRORED_STYLE_PROPERTIES = [
    'font',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'lineHeight',
    'letterSpacing',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'boxSizing',
    'whiteSpace',
    'overflowWrap',
    'wordBreak',
  ];

  let input = null;
  let layer = null;
  let mirror = null;
  let beforeText = null;
  let caret = null;
  let afterText = null;
  let blinkTimer = null;

  function readAppearance() {
    const configured = window.JetEditorAppearance || {};
    const configuredWidth = Number(configured.caretWidth);
    const cssWidth = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--post-compose-caret-width'),
    );

    return {
      caretWidth:
        Number.isFinite(configuredWidth) && configuredWidth >= 1
          ? Math.round(configuredWidth)
          : Math.max(1, cssWidth || 4),
      caretColor:
        configured.caretColor || 'var(--post-compose-caret-color,#14A89A)',
      visibleDuration: Math.max(
        50,
        Number(configured.caretVisibleStateDurationMs) || 750,
      ),
      hiddenDuration: Math.max(
        50,
        Number(configured.caretHiddenStateDurationMs) || 750,
      ),
    };
  }

  function stopBlink() {
    if (blinkTimer !== null) clearTimeout(blinkTimer);
    blinkTimer = null;
  }

  function scheduleBlink(visible) {
    stopBlink();
    if (!caret || !input || document.activeElement !== input) return;

    const appearance = readAppearance();
    caret.style.opacity = visible ? '1' : '0';

    blinkTimer = window.setTimeout(
      () => scheduleBlink(!visible),
      visible ? appearance.visibleDuration : appearance.hiddenDuration,
    );
  }

  function restartBlink() {
    scheduleBlink(true);
  }

  function copyTextLayoutStyles() {
    const sourceStyle = getComputedStyle(input);
    for (const property of MIRRORED_STYLE_PROPERTIES) {
      mirror.style[property] = sourceStyle[property];
    }
  }

  function refresh() {
    requestAnimationFrame(() => {
      const hasCollapsedSelection =
        input && input.selectionStart === input.selectionEnd;
      const shouldShowCaret =
        input && layer && document.activeElement === input && hasCollapsedSelection;

      if (!shouldShowCaret) {
        if (layer) layer.hidden = true;
        return;
      }

      copyTextLayoutStyles();

      layer.hidden = false;
      layer.style.left = `${input.offsetLeft}px`;
      layer.style.top = `${input.offsetTop}px`;
      layer.style.width = `${input.clientWidth}px`;
      layer.style.height = `${input.clientHeight}px`;

      mirror.style.width = `${input.clientWidth}px`;
      mirror.style.transform = `translate(${-input.scrollLeft}px, ${-input.scrollTop}px)`;

      const appearance = readAppearance();
      caret.style.width = `${appearance.caretWidth}px`;
      caret.style.minWidth = `${appearance.caretWidth}px`;
      caret.style.backgroundColor = appearance.caretColor;

      const caretPosition = input.selectionStart;
      beforeText.data = input.value.slice(0, caretPosition);
      afterText.data = input.value.slice(caretPosition);
    });
  }

  function createMirrorLayer(row) {
    layer = document.createElement('div');
    layer.className = 'post-compose-caret-layer';

    mirror = document.createElement('div');
    mirror.className = 'post-compose-caret-mirror';

    beforeText = document.createTextNode('');
    caret = document.createElement('span');
    caret.className = 'post-compose-caret';
    afterText = document.createTextNode('');

    mirror.append(beforeText, caret, afterText);
    layer.appendChild(mirror);
    row.appendChild(layer);
  }

  function bind(textarea) {
    if (!textarea || textarea.dataset.composerCaretBound) return;

    const row = textarea.closest('.post-input-row');
    if (!row) return;

    input = textarea;
    input.dataset.composerCaretBound = '1';
    createMirrorLayer(row);

    for (const eventName of ['input', 'select', 'keyup', 'click', 'scroll']) {
      input.addEventListener(eventName, refresh, {
        passive: eventName === 'scroll',
      });
    }

    input.addEventListener('focus', () => {
      refresh();
      restartBlink();
    });

    input.addEventListener('blur', () => {
      stopBlink();
      refresh();
    });

    window.addEventListener('jetnote:editor-appearance-changed', () => {
      refresh();
      restartBlink();
    });

    window.addEventListener('jetnote:viewport-change', refresh, { passive: true });
  }

  return Object.freeze({ bind, refresh });
})();
