(function () {
  'use strict';

  const LANGUAGE_URL = 'language/english.json';
  let languageData = null;
  let languagePromise = null;

  function readPath(object, path) {
    return String(path || '').split('.').filter(Boolean).reduce((value, key) => {
      if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key)) return value[key];
      return undefined;
    }, object);
  }

  function interpolate(value, variables) {
    let result = String(value == null ? '' : value);
    if (!variables || typeof variables !== 'object') return result;
    for (const [key, replacement] of Object.entries(variables)) {
      result = result.replaceAll(`{${key}}`, String(replacement == null ? '' : replacement));
    }
    return result;
  }

  function setData(value) {
    languageData = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    window.JET_NOTE_LANGUAGE_DATA = languageData;
    return languageData;
  }

  function load() {
    if (languageData) return Promise.resolve(languageData);
    if (window.JET_NOTE_LANGUAGE_DATA && typeof window.JET_NOTE_LANGUAGE_DATA === 'object') {
      return Promise.resolve(setData(window.JET_NOTE_LANGUAGE_DATA));
    }
    if (!languagePromise) {
      languagePromise = fetch(LANGUAGE_URL, { cache: 'no-store' })
        .then(response => {
          if (!response.ok) throw new Error(`Language file unavailable: ${response.status}`);
          return response.json();
        })
        .then(setData)
        .catch(error => {
          console.warn('Jet Note language fallback', error);
          return setData({});
        });
    }
    return languagePromise;
  }

  function value(path, fallback = '') {
    const found = readPath(languageData || window.JET_NOTE_LANGUAGE_DATA || {}, path);
    return found === undefined || found === null ? fallback : found;
  }

  function text(path, variables, fallback = '') {
    const found = value(path, fallback || path);
    return interpolate(typeof found === 'string' ? found : fallback || path, variables);
  }

  async function get(path, variables, fallback = '') {
    await load();
    return text(path, variables, fallback);
  }

  function applyElementAttribute(root, selector, datasetKey, attribute, prefix = '') {
    root.querySelectorAll?.(selector).forEach(element => {
      const rawPath = element.dataset[datasetKey];
      const path = prefix + rawPath;
      const found = value(path, undefined);
      if (typeof found !== 'string') return;
      if (attribute === 'textContent') element.textContent = found;
      else if (attribute === 'placeholder') element.placeholder = found;
      else if (attribute === 'contentPlaceholder') element.dataset.placeholder = found;
      else element.setAttribute(attribute, found);
    });
  }

  async function apply(root = document) {
    await load();
    document.documentElement.lang = 'en';

    // Canonical attributes for new UI.
    applyElementAttribute(root, '[data-language-text]', 'languageText', 'textContent');
    applyElementAttribute(root, '[data-language-placeholder]', 'languagePlaceholder', 'placeholder');
    applyElementAttribute(root, '[data-language-title]', 'languageTitle', 'title');
    applyElementAttribute(root, '[data-language-aria-label]', 'languageAriaLabel', 'aria-label');

    // Compatibility with the two older attribute families.
    applyElementAttribute(root, '[data-i18n]', 'i18n', 'textContent');
    applyElementAttribute(root, '[data-i18n-placeholder]', 'i18nPlaceholder', 'placeholder');
    applyElementAttribute(root, '[data-i18n-content-placeholder]', 'i18nContentPlaceholder', 'contentPlaceholder');
    applyElementAttribute(root, '[data-i18n-title]', 'i18nTitle', 'title');
    applyElementAttribute(root, '[data-i18n-aria-label]', 'i18nAriaLabel', 'aria-label');
    applyElementAttribute(root, '[data-ui-string]', 'uiString', 'textContent', 'ui_strings.');
    applyElementAttribute(root, '[data-ui-aria-label]', 'uiAriaLabel', 'aria-label', 'ui_strings.');
    applyElementAttribute(root, '[data-ui-title]', 'uiTitle', 'title', 'ui_strings.');
  }

  window.JetNoteLanguage = Object.freeze({
    load,
    value,
    text,
    get,
    apply,
    readPath,
    interpolate,
    setData
  });
})();
