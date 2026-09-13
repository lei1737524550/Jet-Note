function openSettings() {
    cancelDeleteConfirm?.();
    if (typeof closePostActionPanel === 'function') closePostActionPanel();

    const screen = document.getElementById('settingsScreen');
    if (!screen) return;
    if (screen.parentElement !== document.body) document.body.appendChild(screen);

    screen.classList.add('open');
    window.__jetSyncNativeVideoVisibility?.();
    const topBar = screen.querySelector('.buttom-string-buttom-bar');
    if (topBar) window.JetBottomStringBottomBar?.renderBar?.(topBar, 'settings_page');
    document.body.style.overflow = 'hidden';
    applyLanguage();
    refreshAppearanceSettings?.();
    initializeColorViewTool?.();
    window.DebugConfigurationFeature?.refreshSettings?.();
}

function closeSettings() {
    document.getElementById('settingsScreen')?.classList.remove('open');
    window.__jetSyncNativeVideoVisibility?.();
    document.body.style.overflow = '';
}
