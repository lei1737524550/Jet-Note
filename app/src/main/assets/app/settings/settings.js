/* Settings module model -----------------------------------------------------
   Stable identity is positional: setting_1, setting_2, ... .
   The human-readable feature name is metadata, not the code identity.
   New Settings features should use:
     class="settings-card setting-box ..."
     data-setting-id="setting_N"
     data-setting-name="Feature Name"
   The shared .setting-box contract automatically applies Set Body. */
function rebuildSettingsModuleRegistry() {
    const modules = [...document.querySelectorAll('.settings-body > .setting-box[data-setting-id]')];
    const registry = Object.create(null);

    modules.forEach((element, index) => {
        const expectedId = `setting_${index + 1}`;
        const settingId = String(element.dataset.settingId || '').trim();
        const name = String(element.dataset.settingName || '').trim();

        if (settingId !== expectedId) {
            console.warn(`Settings order mismatch: expected ${expectedId}, found ${settingId || '(missing)'}.`);
        }
        if (!name) {
            console.warn(`Settings module ${settingId || expectedId} is missing data-setting-name.`);
        }
        if (settingId && registry[settingId]) {
            console.warn(`Duplicate Settings module id: ${settingId}.`);
            return;
        }

        registry[settingId || expectedId] = Object.freeze({
            id: settingId || expectedId,
            order: index + 1,
            name,
            element
        });
    });

    window.JetNoteSettings = Object.freeze(registry);
    return window.JetNoteSettings;
}

function openSettings() {
    cancelDeleteConfirm?.();
    if (typeof closePostActionPanel === 'function') closePostActionPanel();

    const screen = document.getElementById('settingsScreen');
    if (!screen) return;
    if (screen.parentElement !== document.body) document.body.appendChild(screen);

    screen.classList.add('open');
    rebuildSettingsModuleRegistry();
    window.__jetSyncNativeVideoVisibility?.();
    const topBar = screen.querySelector('.buttom-string-buttom-bar');
    if (topBar) window.JetBottomStringBottomBar?.renderBar?.(topBar, 'settings_page');
    document.body.style.overflow = 'hidden';
    applyLanguage();
    refreshAppearanceSettings?.();
    initializeColorViewTool?.();
    initializeDateTimeViewer?.();
    window.DebugConfigurationFeature?.refreshSettings?.();
    window.BrowserSettingsFeature?.bind?.();
    window.BrowserSettingsFeature?.refreshSettings?.();
}

function closeSettings() {
    document.getElementById('settingsScreen')?.classList.remove('open');
    window.__jetSyncNativeVideoVisibility?.();
    document.body.style.overflow = '';
}
