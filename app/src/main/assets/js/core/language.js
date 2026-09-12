const I18N = { en: {} };
const currentLanguage = 'en';
const LANGUAGE_FILE_URL = 'language/english.json';
let languageLoadPromise = null;

function initializeLanguage() {
  if (languageLoadPromise) return languageLoadPromise;

  languageLoadPromise = fetch(LANGUAGE_FILE_URL, { cache: 'no-store' })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Language file unavailable: ${response.status}`);
      }
      return response.json();
    })
    .then(value => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Invalid English language file');
      }
      I18N.en = value;
      return value;
    })
    .catch(error => {
      console.warn('Jet Note language fallback', error);
      I18N.en = {};
      return I18N.en;
    });

  return languageLoadPromise;
}

function t(key) {
  return I18N.en[key] ?? key;
}

function applyLanguage() {
  document.documentElement.lang = 'en';

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const value = I18N.en[el.dataset.i18n];
    if (value !== undefined) el.textContent = value;
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const value = I18N.en[el.dataset.i18nPlaceholder];
    if (value !== undefined) el.placeholder = value;
  });

  document.querySelectorAll('[data-i18n-content-placeholder]').forEach(el => {
    const value = I18N.en[el.dataset.i18nContentPlaceholder];
    if (value !== undefined) el.dataset.placeholder = value;
  });

  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const value = I18N.en[el.dataset.i18nTitle];
    if (value !== undefined) el.title = value;
  });

  document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
    const value = I18N.en[el.dataset.i18nAriaLabel];
    if (value !== undefined) el.setAttribute('aria-label', value);
  });
}

