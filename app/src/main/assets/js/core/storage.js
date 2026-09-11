/*
 * Mode-aware storage adapter.
 *
 * User mode is the only persistent writable workspace. Demo mode is an
 * isolated, disposable display session reconstructed from demo.jnote.
 */
const APP_MODE_STORAGE_KEY = 'jet_note_app_mode';
const DEFAULT_APP_MODE = 'user';

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

let cachedDemoConfig = null;
function getDemoConfig() {
  if (cachedDemoConfig) return cachedDemoConfig;
  const fallback = { mode_setting: 'user', first_boot: false, display_in_setting: true };
  try {
    if (!window.JetNoteNative || typeof JetNoteNative.getDemoConfig !== 'function') {
      cachedDemoConfig = fallback;
      return cachedDemoConfig;
    }
    const parsed = JSON.parse(JetNoteNative.getDemoConfig());
    cachedDemoConfig = {
      mode_setting: parsed?.mode_setting === 'demo' ? 'demo' : 'user',
      first_boot: !!parsed?.first_boot,
      display_in_setting: parsed?.display_in_setting !== false
    };
  } catch (error) {
    console.warn('demo.json config read failed', error);
    cachedDemoConfig = fallback;
  }
  return cachedDemoConfig;
}

function initializeConfiguredMode() {
  const existing = GlobalStorage.getItem(APP_MODE_STORAGE_KEY);
  if (existing === 'usage') {
    GlobalStorage.setItem(APP_MODE_STORAGE_KEY, 'user');
    return;
  }
  if (existing === 'user' || existing === 'demo') return;
  const config = getDemoConfig();
  GlobalStorage.setItem(APP_MODE_STORAGE_KEY, config.mode_setting === 'demo' ? 'demo' : DEFAULT_APP_MODE);
}
initializeConfiguredMode();

function getCurrentAppMode() {
  return GlobalStorage.getItem(APP_MODE_STORAGE_KEY) === 'demo' ? 'demo' : DEFAULT_APP_MODE;
}

function isDemoSession() {
  return getCurrentAppMode() === 'demo';
}

function isWorkspaceWritable() {
  return !isDemoSession();
}

async function clearDemoSessionStorage() {
  // Demo records must never become a second long-lived notebook. Delete its
  // IndexedDB namespace and only its mode-scoped preference keys.
  if (typeof EntryStore !== 'undefined' && EntryStore.db) {
    try { EntryStore.db.close(); } catch (_) {}
    EntryStore.db = null;
  }
  await new Promise(resolve => {
    try {
      const request = indexedDB.deleteDatabase('jet_note_entries_demo');
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    } catch (_) { resolve(); }
  });
  try {
    const prefix = 'jet_note_mode:demo:';
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) localStorage.removeItem(key);
    }
  } catch (_) {}
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

      /* Preserve pre-mode Jet Note data as user-mode data only. */
      if (getCurrentAppMode() === 'user') {
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
    if (getCurrentAppMode() === 'user') {
      localStorage.removeItem(key);
    }
  }
};
