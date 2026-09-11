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
  const fallback = {
    launch_mode: 'user',
    display_demo_switch: true,
    demo_policy: 'read_only_session'
  };
  try {
    if (!window.JetNoteNative || typeof JetNoteNative.getDemoConfig !== 'function') {
      cachedDemoConfig = fallback;
      return cachedDemoConfig;
    }
    const parsed = JSON.parse(JetNoteNative.getDemoConfig());
    cachedDemoConfig = {
      // Accept a legacy demo.json during project migration.
      launch_mode: (parsed?.launch_mode ?? parsed?.mode_setting) === 'demo' ? 'demo' : 'user',
      display_demo_switch: parsed?.display_demo_switch ?? (parsed?.display_in_setting !== false),
      // This build deliberately has one safe demo policy only.
      demo_policy: 'read_only_session'
    };
  } catch (error) {
    console.warn('demo.json config read failed', error);
    cachedDemoConfig = fallback;
  }
  return cachedDemoConfig;
}

function initializeConfiguredMode() {
  const config = getDemoConfig();
  const existing = GlobalStorage.getItem(APP_MODE_STORAGE_KEY);
  // A fixed package is authoritative, including after an overwrite install.
  // This prevents an old hidden Demo selection from trapping a new user build.
  if (config.display_demo_switch === false) {
    GlobalStorage.setItem(APP_MODE_STORAGE_KEY, config.launch_mode);
    return;
  }
  if (existing === 'usage') {
    GlobalStorage.setItem(APP_MODE_STORAGE_KEY, 'user');
    return;
  }
  if (existing === 'user' || existing === 'demo') return;
  GlobalStorage.setItem(APP_MODE_STORAGE_KEY, config.launch_mode);
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
