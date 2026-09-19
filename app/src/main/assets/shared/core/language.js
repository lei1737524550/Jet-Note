const I18N = { en: {} };
const currentLanguage = 'en';

function initializeLanguage() {
  return window.JetNoteLanguage.load().then(value => {
    I18N.en = value;
    return value;
  });
}

function t(key, variables) {
  const value = window.JetNoteLanguage.value(key, key);
  return window.JetNoteLanguage.interpolate(value, variables);
}

function applyLanguage(root = document) {
  return window.JetNoteLanguage.apply(root);
}
