(function () {
  'use strict';
  window.JetNoteUiLanguage = Object.freeze({
    load: () => window.JetNoteLanguage.load(),
    get: (path, fallback = '') => window.JetNoteLanguage.get(`ui_strings.${path}`, null, fallback),
    apply: (root = document) => window.JetNoteLanguage.apply(root),
    readPath: window.JetNoteLanguage.readPath
  });
})();
