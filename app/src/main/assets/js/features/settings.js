function refreshModeSettings() {
  const currentMode = getCurrentAppMode();
  const user = document.getElementById('userModeOption');
  const demo = document.getElementById('demoModeOption');

  if (user) user.classList.toggle('active', currentMode === 'user');
  if (demo) demo.classList.toggle('active', currentMode === 'demo');
}

function refreshWorkspacePermissions() {
  const demo = isDemoSession();
  document.documentElement.classList.toggle('demo-read-only', demo);
  const backup = document.getElementById('backupSettingsCard');
  if (backup) backup.hidden = demo;
  ['avatarAppearanceCard', 'backgroundAppearanceCard'].forEach(id => {
    const card = document.getElementById(id);
    if (card) card.hidden = demo;
  });
}

async function setAppMode(mode) {
  if (mode !== 'user' && mode !== 'demo') return;
  if (mode === getCurrentAppMode()) {
    refreshModeSettings();
    return;
  }

  const leavingDemo = isDemoSession();
  if (leavingDemo) {
    // Clear browser-side demo data before the reload; native clears only its
    // cache-backed demo media directory, never the user's media files.
    await clearDemoSessionStorage();
    try { window.JetNoteNative?.releaseDemoSession?.(); } catch (_) {}
  }

  GlobalStorage.setItem(APP_MODE_STORAGE_KEY, mode);

  /*
   * Reload so every storage-backed module reopens the correct namespace and
   * IndexedDB database from a clean initialization path.
   */
  window.location.reload();
}

function refreshModeSettingsVisibility() {
  const card = document.getElementById('modeSettingsCard');
  if (!card) return;
  const config = typeof getDemoConfig === 'function' ? getDemoConfig() : { display_demo_switch: true };
  card.hidden = config.display_demo_switch === false;
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
  refreshModeSettingsVisibility();
  refreshModeSettings();
  refreshWorkspacePermissions();
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

function refreshWebCacheSettings() {
  const settings = readWebCacheSettings();
  if (!settings) return;
  const usage = document.getElementById('webCacheUsage');
  if (usage) usage.textContent = `${t('webCacheUsage')}${formatWebCacheBytes(settings.bytes)}`;
  const clearOnClose = !!settings.clearOnClose;
  const clearButton = document.getElementById('clearWebCacheOption');
  if (clearButton) {
    clearButton.classList.toggle('cache-attention', Number(settings.bytes) > 100 * 1024 * 1024);
  }
  const toggle = (id, active) => {
    const option = document.getElementById(id);
    if (option) option.classList.toggle('active', active);
  };
  toggle('cacheClearOnCloseOption', clearOnClose);
}

function setWebCacheClosePolicy(clearOnClose) {
  if (!window.JetNoteNative || typeof JetNoteNative.setWebCacheClosePolicy !== 'function') return;
  JetNoteNative.setWebCacheClosePolicy(!!clearOnClose);
  refreshWebCacheSettings();
}

function toggleWebCacheClosePolicy() {
  const settings = readWebCacheSettings();
  setWebCacheClosePolicy(!(settings && settings.clearOnClose));
}

function setWebCacheLimit(limitMb) {
  if (!window.JetNoteNative || typeof JetNoteNative.setWebCacheLimitMb !== 'function') return;
  const limit = Number(limitMb) === 200 ? 200 : 50;
  JetNoteNative.setWebCacheLimitMb(limit);
  refreshWebCacheSettings();
}

function clearWebCache() {
  if (!window.JetNoteNative || typeof JetNoteNative.clearWebCache !== 'function') return;
  JetNoteNative.clearWebCache();
  setTimeout(refreshWebCacheSettings, 500);
}

function manageWebCache() {
  if (!window.JetNoteNative || typeof JetNoteNative.manageWebCacheNow !== 'function') return;
  const cleared = !!JetNoteNative.manageWebCacheNow();
  if (cleared) setTimeout(refreshWebCacheSettings, 500);
}
