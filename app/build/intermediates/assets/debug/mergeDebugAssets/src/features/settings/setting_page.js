/* Settings items share a name → control structure:
   section.settings-item[data-setting-id][data-setting-name]
     h2.settings-item-name + div.settings-item-control
   Use a unique heading ID and aria-labelledby for each item. */
async function openSettings() {
    cancelDeleteConfirm?.();
    if (typeof closePostActionPanel === 'function') closePostActionPanel();

    const screen = document.getElementById('settingsScreen');
    if (!screen || screen.classList.contains('open')) return;
    if (screen.parentElement !== document.body) document.body.appendChild(screen);

    const topBar = screen.querySelector('.buttom-string-buttom-bar');
    applyLanguage();
    initColorViewer?.();
    window.DebugConfigurationFeature?.refreshSettings?.();
    window.LanguageSettingsFeature?.bind?.();
    await window.SharedTransition.run({
        page: window.SharedTransition.Page.SETTINGS,
        phase: window.SharedTransition.Phase.ENTER,
        screen,
        header: screen.querySelector('.settings-header'),
        body: screen.querySelector('.settings-body'),
        prepare: async () => {
            screen.classList.add('open');
            document.body.style.overflow = 'hidden';
            window.__jetSyncNativeVideoVisibility?.();
            if (topBar) await window.JetBottomStringBottomBar?.renderBar?.(topBar, 'settings_page');
        }
    });
}

function closeSettings() {
    const screen = document.getElementById('settingsScreen');
    if (!screen?.classList.contains('open')) return;
    void window.SharedTransition.run({
        page: window.SharedTransition.Page.SETTINGS,
        phase: window.SharedTransition.Phase.EXIT,
        screen,
        header: screen.querySelector('.settings-header'),
        body: screen.querySelector('.settings-body'),
        finish: () => {
            screen.classList.remove('open');
            window.__jetSyncNativeVideoVisibility?.();
            document.body.style.overflow = '';
        }
    });
}
