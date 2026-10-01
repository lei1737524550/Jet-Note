/**
 * Post editor runtime sizing.
 *
 * Editor geometry is controlled directly by CSS/runtime values.
 * No config.json dependency and no artificial numeric limits.
 */
(() => {
  function setCssPixels(variableName, value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return;
    }

    document.documentElement.style.setProperty(
      variableName,
      `${number}px`
    );
  }


  function setCssValue(variableName, value) {
    if (value == null) {
      return;
    }

    document.documentElement.style.setProperty(
      variableName,
      String(value)
    );
  }


  window.JetNotePostEditorLayout = Object.freeze({
    setCssPixels,
    setCssValue
  });
})();