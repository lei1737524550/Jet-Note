function refreshModeSettings() {
  const currentMode = getCurrentAppMode();
  const usage = document.getElementById('usageModeOption');
  const demo = document.getElementById('demoModeOption');

  if (usage) usage.classList.toggle('active', currentMode === 'usage');
  if (demo) demo.classList.toggle('active', currentMode === 'demo');
}

function setAppMode(mode) {
  if (mode !== 'usage' && mode !== 'demo') return;
  if (mode === getCurrentAppMode()) {
    refreshModeSettings();
    return;
  }

  GlobalStorage.setItem(APP_MODE_STORAGE_KEY, mode);

  /*
   * Reload so every storage-backed module reopens the correct namespace and
   * IndexedDB database from a clean initialization path.
   */
  window.location.reload();
}

function openSettings() {
  cancelDeleteConfirm();
  if (typeof closePostActionPanel === 'function') closePostActionPanel();
  const screen = document.getElementById('settingsScreen');
  if (screen.parentElement !== document.body) {
    document.body.appendChild(screen);
  }
  screen.classList.add('open');
  document.body.style.overflow = 'hidden';
  applyLanguage();
  if (typeof refreshAppearanceSettings === 'function') refreshAppearanceSettings();
  refreshModeSettings();
  refreshWebCacheSettings();
}

function closeSettings() {
  const screen = document.getElementById('settingsScreen');
  screen.classList.remove('open');
  document.body.style.overflow = '';
}

function readWebCacheSettings() {
  if (!window.JetNoteNative || typeof JetNoteNative.getWebCacheSettings !== 'function') return null;
  try {
    return JSON.parse(JetNoteNative.getWebCacheSettings());
  } catch (_) {
    return null;
  }
}

function formatWebCacheBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(value >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

function setWebCacheStatus(message, failed = false) {
  const status = document.getElementById('webCacheStatus');
  if (!status) return;
  status.textContent = message || '';
  status.classList.toggle('error', !!failed);
}

function refreshWebCacheSettings() {
  const settings = readWebCacheSettings();
  if (!settings) return;
  const usage = document.getElementById('webCacheUsage');
  if (usage) usage.textContent = `${t('webCacheUsage')}${formatWebCacheBytes(settings.bytes)}`;
  const clearOnClose = !!settings.clearOnClose;
  const limit = Number(settings.limitMb) === 200 ? 200 : 50;
  const toggle = (id, active) => {
    const option = document.getElementById(id);
    if (option) option.classList.toggle('active', active);
  };
  toggle('cacheClearOnCloseOption', clearOnClose);
  toggle('cacheKeepOption', !clearOnClose);
  toggle('cacheLimit50Option', limit === 50);
  toggle('cacheLimit200Option', limit === 200);
}

function setWebCacheClosePolicy(clearOnClose) {
  if (!window.JetNoteNative || typeof JetNoteNative.setWebCacheClosePolicy !== 'function') return;
  JetNoteNative.setWebCacheClosePolicy(!!clearOnClose);
  setWebCacheStatus(t(clearOnClose ? 'cacheClearOnCloseEnabled' : 'cacheKeepEnabled'));
  refreshWebCacheSettings();
}

function setWebCacheLimit(limitMb) {
  if (!window.JetNoteNative || typeof JetNoteNative.setWebCacheLimitMb !== 'function') return;
  const limit = Number(limitMb) === 200 ? 200 : 50;
  JetNoteNative.setWebCacheLimitMb(limit);
  setWebCacheStatus(t('cacheLimitSaved').replace('{limit}', limit));
  refreshWebCacheSettings();
}

function clearWebCache() {
  if (!window.JetNoteNative || typeof JetNoteNative.clearWebCache !== 'function') return;
  JetNoteNative.clearWebCache();
  setWebCacheStatus(t('webCacheCleared'));
  setTimeout(refreshWebCacheSettings, 500);
}

function manageWebCache() {
  if (!window.JetNoteNative || typeof JetNoteNative.manageWebCacheNow !== 'function') return;
  const cleared = !!JetNoteNative.manageWebCacheNow();
  setWebCacheStatus(t(cleared ? 'webCacheManagedCleared' : 'webCacheManagedKept'));
  if (cleared) setTimeout(refreshWebCacheSettings, 500);
}
