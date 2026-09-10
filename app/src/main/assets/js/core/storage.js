/*
 * Mode-aware storage adapter.
 *
 * Usage mode and demo mode intentionally keep independent application data.
 * The selected mode itself is global so the app can determine which namespace
 * to open before the rest of the UI is initialized.
 */
const APP_MODE_STORAGE_KEY = 'jet_note_app_mode';
const DEFAULT_APP_MODE = 'usage';

const GlobalStorage = {
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.warn('Global storage read failed', error);
      return null;
    }
  },

  setItem(key, value) {
    localStorage.setItem(key, value);
  },

  removeItem(key) {
    localStorage.removeItem(key);
  }
};

function getCurrentAppMode() {
  return GlobalStorage.getItem(APP_MODE_STORAGE_KEY) === 'demo' ? 'demo' : DEFAULT_APP_MODE;
}

function modeStorageKey(key) {
  return `jet_note_mode:${getCurrentAppMode()}:${key}`;
}

const AppStorage = {
  getItem(key) {
    try {
      const namespacedKey = modeStorageKey(key);
      const value = localStorage.getItem(namespacedKey);
      if (value !== null) return value;

      /*
       * Preserve pre-mode Jet Note data as usage-mode data. Demo mode never
       * reads legacy keys, which keeps a brand-new demo workspace isolated.
       */
      if (getCurrentAppMode() === 'usage') {
        const legacyValue = localStorage.getItem(key);
        if (legacyValue !== null) {
          localStorage.setItem(namespacedKey, legacyValue);
          return legacyValue;
        }
      }
      return null;
    } catch (error) {
      console.warn('Storage read failed', error);
      return null;
    }
  },

  setItem(key, value) {
    localStorage.setItem(modeStorageKey(key), value);
  },

  removeItem(key) {
    localStorage.removeItem(modeStorageKey(key));
    if (getCurrentAppMode() === 'usage') {
      localStorage.removeItem(key);
    }
  }
};
