/* Home-only battery / HH:mm / Settings row.
   This module owns BOTH the row's runtime content and config.json geometry.
   Android Java owns only system_safe_area/window insets and battery percentage. */
(function () {
  'use strict';

  const DEFAULT_MAIN_STATUS_BAR_CONFIG = Object.freeze({
    main_status_bar_height: 52,
    main_status_bar_vertical_move: 0,
    _main_status_bar_top_margin: 0,
    _main_status_bar_bottom_margin: 0,
    _main_status_bar_horizontal_margin: 8,
    _main_status_bar_text_font_size: 16,
    _main_status_bar_battery_icon_and_percentage_gap: 7,
    _main_status_bar_battery_icon_size: 22,
    _main_status_bar_settings_button_hit_area_size: 44,
    _main_status_bar_settings_icon_size: 24,
    _main_status_bar_time_region_right_padding: 0
  });

  const BATTERY_ICON_BY_MINIMUM_PERCENT = [
    { minimum: 75, path: 'shared/icons/battery_75.svg' },
    { minimum: 50, path: 'shared/icons/battery_50.svg' },
    { minimum: 25, path: 'shared/icons/battery_25.svg' },
    { minimum: 0,  path: 'shared/icons/battery_0.svg' }
  ];

  function boundedNumber(value, fallback, min, max) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(number, max)) : fallback;
  }

  function applyMainStatusBarGeometry(rawConfig) {
    const config = {
      ...DEFAULT_MAIN_STATUS_BAR_CONFIG,
      ...(rawConfig && typeof rawConfig === 'object' ? rawConfig : {})
    };
    const root = document.documentElement;

    const barHeight = boundedNumber(config.main_status_bar_height, DEFAULT_MAIN_STATUS_BAR_CONFIG.main_status_bar_height, 0, 500);
    const verticalMove = boundedNumber(config.main_status_bar_vertical_move, DEFAULT_MAIN_STATUS_BAR_CONFIG.main_status_bar_vertical_move, -500, 500);
    const topMargin = boundedNumber(config._main_status_bar_top_margin, DEFAULT_MAIN_STATUS_BAR_CONFIG._main_status_bar_top_margin, -500, 500);
    const bottomMargin = boundedNumber(config._main_status_bar_bottom_margin, DEFAULT_MAIN_STATUS_BAR_CONFIG._main_status_bar_bottom_margin, -500, 500);
    const horizontalMargin = boundedNumber(config._main_status_bar_horizontal_margin, DEFAULT_MAIN_STATUS_BAR_CONFIG._main_status_bar_horizontal_margin, 0, 500);
    const textFontSize = boundedNumber(config._main_status_bar_text_font_size, DEFAULT_MAIN_STATUS_BAR_CONFIG._main_status_bar_text_font_size, 0, 100);
    const batteryGap = boundedNumber(config._main_status_bar_battery_icon_and_percentage_gap, DEFAULT_MAIN_STATUS_BAR_CONFIG._main_status_bar_battery_icon_and_percentage_gap, 0, 100);
    const batteryIconRequested = boundedNumber(config._main_status_bar_battery_icon_size, DEFAULT_MAIN_STATUS_BAR_CONFIG._main_status_bar_battery_icon_size, 0, 200);
    const settingsButtonRequested = boundedNumber(config._main_status_bar_settings_button_hit_area_size, DEFAULT_MAIN_STATUS_BAR_CONFIG._main_status_bar_settings_button_hit_area_size, 0, 200);
    const settingsIconRequested = boundedNumber(config._main_status_bar_settings_icon_size, DEFAULT_MAIN_STATUS_BAR_CONFIG._main_status_bar_settings_icon_size, 0, 200);
    const timeRightPadding = boundedNumber(config._main_status_bar_time_region_right_padding, DEFAULT_MAIN_STATUS_BAR_CONFIG._main_status_bar_time_region_right_padding, 0, 500);

    // Height is literal. Child visuals are capped so they cannot visually create
    // a taller row than main_status_bar_height. Text is clipped by the row itself.
    const batteryIconSize = Math.min(batteryIconRequested, barHeight);
    const settingsButtonSize = Math.min(settingsButtonRequested, barHeight);
    const settingsIconSize = Math.min(settingsIconRequested, settingsButtonSize);

    root.style.setProperty('--main-status-bar-height', `${barHeight}px`);
    root.style.setProperty('--main-status-bar-vertical-move', `${verticalMove}px`);
    root.style.setProperty('--main-status-bar-top-margin', `${topMargin}px`);
    root.style.setProperty('--main-status-bar-bottom-margin', `${bottomMargin}px`);
    root.style.setProperty('--main-status-bar-horizontal-margin', `${horizontalMargin}px`);
    root.style.setProperty('--main-status-bar-font-size', `${textFontSize}px`);
    root.style.setProperty('--main-status-bar-battery-gap', `${batteryGap}px`);
    root.style.setProperty('--main-status-bar-battery-icon-size', `${batteryIconSize}px`);
    root.style.setProperty('--main-status-bar-settings-button-size', `${settingsButtonSize}px`);
    root.style.setProperty('--main-status-bar-settings-icon-size', `${settingsIconSize}px`);
    root.style.setProperty('--main-status-bar-time-right-padding', `${timeRightPadding}px`);
  }

  function loadMainStatusBarGeometry() {
    applyMainStatusBarGeometry(DEFAULT_MAIN_STATUS_BAR_CONFIG);
    fetch('config.json', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('config.json load failed')))
      .then(config => applyMainStatusBarGeometry(config.main_status_bar))
      .catch(() => { /* defaults already applied */ });
  }

  function selectBatteryIconPath(batteryPercentage) {
    const level = Math.max(0, Math.min(100, Number(batteryPercentage) || 0));
    return BATTERY_ICON_BY_MINIMUM_PERCENT.find(item => level >= item.minimum).path;
  }

  function updateMainStatusBarTime() {
    const element = document.getElementById('mainStatusBarTime');
    if (!element) return;
    const now = new Date();
    element.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  function readNativeBatteryPercentage() {
    try {
      if (window.JetNoteNative && typeof window.JetNoteNative.getBatteryPercentage === 'function') {
        const level = Number(window.JetNoteNative.getBatteryPercentage());
        if (Number.isFinite(level) && level >= 0 && level <= 100) return Math.round(level);
      }
    } catch (_) { }
    return null;
  }

  function updateMainStatusBarBattery() {
    const percentageElement = document.getElementById('mainStatusBarBatteryPercentage');
    const iconElement = document.getElementById('mainStatusBarBatteryIcon');
    if (!percentageElement || !iconElement) return;
    const level = readNativeBatteryPercentage();
    if (level === null) {
      percentageElement.textContent = '--%';
      return;
    }
    percentageElement.textContent = `${level}%`;
    iconElement.src = selectBatteryIconPath(level);
  }

  function updateMainStatusBar() {
    updateMainStatusBarTime();
    updateMainStatusBarBattery();
  }

  loadMainStatusBarGeometry();
  updateMainStatusBar();
  window.setInterval(updateMainStatusBarTime, 1000);
  window.setInterval(updateMainStatusBarBattery, 30000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) updateMainStatusBar();
  });
})();
