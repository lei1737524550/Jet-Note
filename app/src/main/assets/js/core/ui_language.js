(function () {
  'use strict';

  let languagePromise = null;

  function load() {
    if (!languagePromise) {
      languagePromise = fetch('language/english.json', { cache: 'no-store' }).then(response => {
        if (!response.ok) throw new Error(`UI language unavailable: ${response.status}`);
        return response.json();
      });
    }
    return languagePromise;
  }

  function readPath(object, path) {
    return String(path || '').split('.').filter(Boolean).reduce((value, key) => {
      if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key)) return value[key];
      return undefined;
    }, object);
  }

  async function get(path, fallback = '') {
    try {
      const language = await load();
      const value = readPath(language?.ui_strings, path);
      return typeof value === 'string' ? value : fallback;
    } catch (_) {
      return fallback;
    }
  }

  async function apply(root = document) {
    let language;
    try { language = await load(); } catch (_) { return; }
    const strings = language?.ui_strings;
    if (!strings) return;

    root.querySelectorAll?.('[data-ui-string]').forEach(element => {
      const value = readPath(strings, element.dataset.uiString);
      if (typeof value === 'string') element.textContent = value;
    });
    root.querySelectorAll?.('[data-ui-aria-label]').forEach(element => {
      const value = readPath(strings, element.dataset.uiAriaLabel);
      if (typeof value === 'string') element.setAttribute('aria-label', value);
    });
    root.querySelectorAll?.('[data-ui-title]').forEach(element => {
      const value = readPath(strings, element.dataset.uiTitle);
      if (typeof value === 'string') element.title = value;
    });
  }

  window.JetNoteUiLanguage = Object.freeze({ load, get, apply, readPath });
})();
