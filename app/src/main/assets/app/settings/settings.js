/* Settings module model -----------------------------------------------------
   Stable identity is positional: setting_1, setting_2, ... .
   The human-readable feature name is metadata, not the code identity.
   New Settings features should use:
     class="settings-card setting-box ..."
     data-setting-id="setting_N"
     data-setting-name="Feature Name"
   The shared .setting-box contract automatically applies Set Body. */
async function loadSettingsOrderConfig() {
    try {
        const response = await fetch('config.json', { cache: 'no-store' });
        if (!response.ok) return {};
        return await response.json();
    } catch (_) {
        return {};
    }
}

function resolveSettingsEnterAnimationDuration(config) {
    const raw = Number(config?.settings_enter_animation?.duration_ms);
    return Number.isFinite(raw) ? Math.max(0, Math.min(5000, raw)) : 320;
}

function playSettingsEnterAnimation(screen, durationMs) {
    const header = screen?.querySelector('.settings-header');
    const body = screen?.querySelector('.settings-body');
    if (!header || !body) return;

    // Cancel an interrupted previous entrance before measuring/starting again.
    header.getAnimations?.().forEach(animation => animation.cancel());
    body.getAnimations?.().forEach(animation => animation.cancel());

    // Transform only the two page-level layers. Their descendants never get
    // independent transforms, avoiding the frame penetration seen in Post FLIP.
    const easing = 'cubic-bezier(.22,.72,.22,1)';
    const options = { duration: durationMs, easing, fill: 'both' };
    // Initial transforms were installed before .open, so the first visible
    // frame is already outside the viewport rather than flashing final layout.
    header.animate(
        [{ transform: 'translate3d(0,-100%,0)' }, { transform: 'translate3d(0,0,0)' }],
        options
    );
    body.animate(
        [{ transform: 'translate3d(100vw,0,0)' }, { transform: 'translate3d(0,0,0)' }],
        options
    );
}

function enforceSettingsModulePriority() {
    const body=document.querySelector('.settings-body'); if(!body)return;
    const color=document.getElementById('colorViewCard');
    if(color) body.prepend(color);
}

function rebuildSettingsModuleRegistry(settingsOrder = {}) {
    enforceSettingsModulePriority(settingsOrder);
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

async function openSettings() {
    cancelDeleteConfirm?.();
    if (typeof closePostActionPanel === 'function') closePostActionPanel();

    const screen = document.getElementById('settingsScreen');
    if (!screen) return;
    if (screen.parentElement !== document.body) document.body.appendChild(screen);

    const settingsConfig = await loadSettingsOrderConfig();
    const enterDurationMs = resolveSettingsEnterAnimationDuration(settingsConfig);

    // Establish the hidden/off-screen first frame before exposing the screen.
    // The screen itself clips both animated layers, so nothing from another
    // viewport position can paint through during the transition.
    screen.style.setProperty('--settings-enter-animation-duration-ms', `${enterDurationMs}ms`);
    const settingsHeader = screen.querySelector('.settings-header');
    const settingsBody = screen.querySelector('.settings-body');
    if (settingsHeader) settingsHeader.style.transform = 'translate3d(0,-100%,0)';
    if (settingsBody) settingsBody.style.transform = 'translate3d(100vw,0,0)';
    screen.classList.add('open');
    rebuildSettingsModuleRegistry(settingsConfig);
    requestAnimationFrame(() => requestAnimationFrame(() => {
        if (settingsHeader) settingsHeader.style.transform = '';
        if (settingsBody) settingsBody.style.transform = '';
        playSettingsEnterAnimation(screen, enterDurationMs);
    }));
    window.__jetSyncNativeVideoVisibility?.();
    const topBar = screen.querySelector('.buttom-string-buttom-bar');
    if (topBar) window.JetBottomStringBottomBar?.renderBar?.(topBar, 'settings_page');
    document.body.style.overflow = 'hidden';
    applyLanguage();
    refreshAppearanceSettings?.();
    initializeColorViewTool?.();
    window.DebugConfigurationFeature?.refreshSettings?.();
    window.LanguageSettingsFeature?.bind?.();
}

function closeSettings() {
    const prepareHome = () => {
        document.getElementById('settingsScreen')?.classList.remove('open');
        window.__jetSyncNativeVideoVisibility?.();
        document.body.style.overflow = '';
    };
    if (window.JetTargetTransition?.toHome) {
        void window.JetTargetTransition.toHome(prepareHome);
    } else {
        prepareHome();
    }
}
