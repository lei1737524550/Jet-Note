(function () {
  'use strict';

  const STORAGE_KEY = 'jet_note_ui_language';
  let bound = false;
  let switching = false;

  function normalizeLanguage(value) {
    const code = String(value == null ? '' : value).trim().toLowerCase();
    if (code === 'zh' || code.startsWith('zh-') || code.startsWith('zh_')) return 'zh';
    if (code === 'en' || code.startsWith('en-') || code.startsWith('en_')) return 'en';
    return '';
  }

  function currentLanguage() {
    try {
      const nativeLanguage = normalizeLanguage(window.JetNoteNative?.getUiLanguageCode?.());
      if (nativeLanguage) return nativeLanguage;
    } catch (_) { }
    try {
      const stored = normalizeLanguage(window.localStorage.getItem(STORAGE_KEY));
      if (stored) return stored;
    } catch (_) { }
    return document.documentElement.lang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  }

  async function applySelectedLanguage(target) {
    // Native is the source of truth. Persist first, then immediately fetch the
    // catalog selected by that same native state. This avoids Activity/WebView
    // recreation races and avoids retaining language_catalog.js's old promise.
    const native = window.JetNoteNative;
    if (!native?.setUiLanguageCode || !native?.getUiLanguageJson) {
      throw new Error('JetNoteNative language bridge unavailable');
    }

    const saved = native.setUiLanguageCode(target);
    if (saved === false) throw new Error(`Unable to persist UI language: ${target}`);

    const confirmed = normalizeLanguage(native.getUiLanguageCode?.());
    if (confirmed && confirmed !== target) {
      throw new Error(`UI language persistence mismatch: requested=${target}, actual=${confirmed}`);
    }

    const raw = native.getUiLanguageJson();
    if (typeof raw !== 'string' || !raw.trim()) throw new Error('Native UI language catalog is empty');
    const catalog = JSON.parse(raw);
    if (!catalog || typeof catalog !== 'object' || !catalog.ui_strings) {
      throw new Error('Native UI language catalog is invalid');
    }

    try { window.localStorage.setItem(STORAGE_KEY, target); } catch (_) { }
    window.JetNoteLanguage.setData(catalog);
    document.documentElement.lang = target === 'zh' ? 'zh-CN' : 'en';
    await window.JetNoteLanguage.apply(document);

    // Re-render controls whose text is produced by JS rather than language
    // attributes. These functions are safe to call when their modules exist.
    try { window.DebugConfigurationFeature?.refreshSettings?.(); } catch (_) { }
    try { window.BrowserSettingsFeature?.refreshSettings?.(); } catch (_) { }
    try { window.JetBottomStringBottomBar?.renderBar?.(document.querySelector('#settingsScreen .buttom-string-buttom-bar'), 'settings_page'); } catch (_) { }
  }

  async function switchLanguage() {
    if (switching) return;
    switching = true;
    const target = currentLanguage() === 'zh' ? 'en' : 'zh';
    const button = document.getElementById('switchLanguageButton');
    if (button) button.disabled = true;
    try {
      await applySelectedLanguage(target);
    } catch (error) {
      console.error('Jet Note UI language switch failed', error);
      // Keep storage aligned with Native if the switch failed partway through.
      try {
        const actual = normalizeLanguage(window.JetNoteNative?.getUiLanguageCode?.());
        if (actual) window.localStorage.setItem(STORAGE_KEY, actual);
      } catch (_) { }
    } finally {
      if (button) button.disabled = false;
      switching = false;
    }
  }

  function bind() {
    if (bound) return;
    bound = true;
    // Settings fragments can be rebuilt/reordered at runtime. Delegate from the
    // document so replacing #switchLanguageButton never leaves a stale listener.
    document.addEventListener('click', event => {
      const button = event.target?.closest?.('#switchLanguageButton');
      if (!button) return;
      event.preventDefault();
      void switchLanguage();
    });
  }

  window.LanguageSettingsFeature = Object.freeze({ bind, switchLanguage, currentLanguage });
  // Bind when this module loads instead of depending on openSettings() having
  // run after this script. Delegation also covers a button inserted later.
  bind();
})();
