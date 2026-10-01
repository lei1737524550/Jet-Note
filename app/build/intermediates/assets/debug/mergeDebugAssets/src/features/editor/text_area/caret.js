/**
 * ComposerCaret
 * -------------
 * Cross-device compatibility policy:
 * use the Android WebView/browser native caret for positioning.
 *
 * Older Jet Note builds mirrored textarea text into a DIV and drew a custom
 * caret. Text metrics can differ between <textarea> and <div> on different
 * Android WebView builds, producing a per-character horizontal error that
 * accumulates as the user types.
 *
 * The native caret and Android selection handle share the same text layout
 * engine, so native positioning is the reliable source of truth.
 *
 * Keep the public bind()/refresh() API so editor callers do not need special
 * compatibility branches.
 *
 * Caret width/blink cadence are intentionally left to the platform;
 * color remains configurable through CSS.
 */
window.JetComposerCaret = (() => {
  let input = null;
  let appearanceListenerInstalled = false;


  function caretColor() {
    const configured =
      window.JetEditorAppearance || {};

    if (configured.caretColor) {
      return configured.caretColor;
    }

    const cssColor = getComputedStyle(
      document.documentElement
    )
      .getPropertyValue(
        '--post-compose-caret-color'
      )
      .trim();

    return cssColor || '#14A89A';
  }


  function refresh() {
    if (!input) {
      return;
    }

    input.style.caretColor =
      caretColor();
  }


  function bind(textarea) {
    if (!textarea) {
      return;
    }

    /*
     * Jet Composer currently uses one native textarea.
     * Rebinding the same element is intentionally a no-op.
     */
    if (
      textarea.dataset.composerCaretBound === '1'
    ) {
      input = textarea;
      refresh();
      return;
    }

    input = textarea;

    input.dataset.composerCaretBound = '1';
    input.dataset.composerCaretMode = 'native';

    refresh();

    /*
     * This listener belongs to the module rather than an individual textarea,
     * so install it only once even if bind() is called again.
     */
    if (!appearanceListenerInstalled) {
      window.addEventListener(
        'jetnote:editor-appearance-changed',
        refresh
      );

      appearanceListenerInstalled = true;
    }
  }


  return Object.freeze({
    bind,
    refresh
  });
})();