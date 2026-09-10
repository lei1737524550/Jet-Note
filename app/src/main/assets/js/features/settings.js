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
}

function closeSettings() {
  const screen = document.getElementById('settingsScreen');
  screen.classList.remove('open');
  document.body.style.overflow = '';
}
