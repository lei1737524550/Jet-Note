/* Storage adapter: preserve existing data keys and save failure semantics. */
const AppStorage = {
  getItem(key) { try { return localStorage.getItem(key); } catch (error) { console.warn('Storage read failed', error); return null; } },
  setItem(key, value) { localStorage.setItem(key, value); },
  removeItem(key) { localStorage.removeItem(key); }
};
