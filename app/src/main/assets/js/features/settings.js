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
}

function closeSettings() {
  const screen = document.getElementById('settingsScreen');
  screen.classList.remove('open');
  document.body.style.overflow = '';
}





/* =========================================================
   相册数据库
   - 说说里的图片会额外复制一份到 IndexedDB
   - 删除原说说不会删除相册中的备份
   ========================================================= */
