function openSettings() {
    cancelDeleteConfirm?.();
    if (typeof closePostActionPanel === 'function') closePostActionPanel();

    const screen = document.getElementById('settingsScreen');
    if (!screen) return;
    if (screen.parentElement !== document.body) document.body.appendChild(screen);

    screen.classList.add('open');
    const topBar = screen.querySelector('.buttom-string-buttom-bar');
    if (topBar) window.JetBottomStringBottomBar?.renderBar?.(topBar, 'settings_page');
    document.body.style.overflow = 'hidden';
    applyLanguage();
    refreshAppearanceSettings?.();
    initializeColorViewTool?.();
}

function closeSettings() {
    document.getElementById('settingsScreen')?.classList.remove('open');
    document.body.style.overflow = '';
}
