/**
 * ComposerCaret
 * -------------
 * Cross-device compatibility policy:
 * use the Android WebView/browser native caret for positioning.
 *
 * Older Jet Note builds mirrored textarea text into a DIV and drew a custom
 * caret. Text metrics can differ between <textarea> and <div> on different
 * Android WebView builds, producing a per-character horizontal error that
 * accumulates as the user types. The native caret and Android selection handle
 * share the same text layout engine, so native positioning is the reliable
 * source of truth.
 *
 * Keep the public bind()/refresh() API so editor callers do not need special
 * compatibility branches. Caret width/blink cadence are intentionally left to
 * the platform; color remains configurable through CSS.
 */
window.JetComposerCaret = (() => {
  let input = null;

  function refresh() {
    if (!input) return;
    const configured = window.JetEditorAppearance || {};
    const color = configured.caretColor ||
      getComputedStyle(document.documentElement)
        .getPropertyValue('--post-compose-caret-color')
        .trim() || '#14A89A';
    input.style.caretColor = color;
  }

  function bind(textarea) {
    if (!textarea || textarea.dataset.composerCaretBound) return;
    input = textarea;
    input.dataset.composerCaretBound = '1';
    input.dataset.composerCaretMode = 'native';
    refresh();

    window.addEventListener('jetnote:editor-appearance-changed', refresh);
  }

  return Object.freeze({ bind, refresh });
})();
