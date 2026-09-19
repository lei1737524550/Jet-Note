(function () {
  'use strict';

  const ENGLISH_LANGUAGE_URL = 'language/english.json';
  const CHINESE_LANGUAGE_URL = 'language/chinese.json';
  let languageData = null;
  let languagePromise = null;

  function preferredLanguage() {
    let tag = '';
    try { tag = window.JetNoteNative?.getUiLanguageCode?.() || ''; } catch (_) { }
    if (!tag) {
      try { tag = window.localStorage.getItem('jet_note_ui_language') || ''; } catch (_) { }
    }
    if (!tag) tag = navigator.languages?.[0] || navigator.language || '';
    return String(tag).toLowerCase().startsWith('zh') ? 'zh' : 'en';
  }

  function languageUrl() {
    return preferredLanguage() === 'zh' ? CHINESE_LANGUAGE_URL : ENGLISH_LANGUAGE_URL;
  }

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

  function isLanguageCatalog(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value)
      && value.ui_strings && typeof value.ui_strings === 'object'
      && typeof value.ui_strings.settings?.page_title === 'string'
      && typeof value.ui_strings.post_composer?.new_post_title === 'string');
  }

  function readNativeCatalog() {
    try {
      const raw = window.JetNoteNative?.getUiLanguageJson?.();
      if (typeof raw !== 'string' || !raw.trim()) return null;
      const parsed = JSON.parse(raw);
      return isLanguageCatalog(parsed) ? parsed : null;
    } catch (error) {
      console.warn('Jet Note native language catalog unavailable', error);
      return null;
    }
  }

  function load() {
    if (languageData) return Promise.resolve(languageData);
    if (window.JET_NOTE_LANGUAGE_DATA && typeof window.JET_NOTE_LANGUAGE_DATA === 'object') {
      if (isLanguageCatalog(window.JET_NOTE_LANGUAGE_DATA)) {
        return Promise.resolve(setData(window.JET_NOTE_LANGUAGE_DATA));
      }
    }
    if (!languagePromise) {
      const nativeCatalog = readNativeCatalog();
      if (nativeCatalog) {
        languagePromise = Promise.resolve(setData(nativeCatalog));
        return languagePromise;
      }
      const selectedUrl = languageUrl();
      languagePromise = fetch(selectedUrl, { cache: 'no-store' })
        .then(response => {
          if (!response.ok) throw new Error(`Language file unavailable: ${response.status}`);
          return response.json().then(value => {
            if (!isLanguageCatalog(value)) throw new Error('Invalid language catalog');
            return value;
          });
        })
        .catch(error => {
          if (selectedUrl === ENGLISH_LANGUAGE_URL) throw error;
          console.warn('Jet Note Chinese language fallback', error);
          return fetch(ENGLISH_LANGUAGE_URL, { cache: 'no-store' }).then(response => {
            if (!response.ok) throw new Error(`English language file unavailable: ${response.status}`);
            return response.json();
          }).then(value => {
            if (!isLanguageCatalog(value)) throw new Error('Invalid English language catalog');
            return value;
          });
        })
        .then(setData)
        .catch(error => {
          console.warn('Jet Note language fallback', error);
          return setData({});
        });
    }
    return languagePromise;
  }

  async function loadForLanguage(languageCode) {
    const code = String(languageCode || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
    const candidates = code === 'zh'
      ? ['language/chinese.json', 'language/Chinese.json']
      : ['language/english.json', 'language/English.json'];

    // Prefer the bundled WebView asset. This deliberately does not depend on the
    // native catalog cache, so changing language cannot leave the page with {}.
    let lastError = null;
    for (const url of candidates) {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Language file unavailable: ${url} (${response.status})`);
        const catalog = await response.json();
        if (!isLanguageCatalog(catalog)) throw new Error(`Invalid language catalog: ${url}`);
        languagePromise = Promise.resolve(setData(catalog));
        return catalog;
      } catch (error) {
        lastError = error;
      }
    }

    // Native is only a final fallback.
    const nativeCatalog = readNativeCatalog();
    if (nativeCatalog) {
      languagePromise = Promise.resolve(setData(nativeCatalog));
      return nativeCatalog;
    }
    throw lastError || new Error(`Unable to load UI language: ${code}`);
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
    document.documentElement.lang = preferredLanguage() === 'zh' ? 'zh-CN' : 'en';

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
    setData,
    loadForLanguage
  });
})();
