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
    _main_status_bar_battery_icon_size: 30,
    _main_status_bar_battery_icon_horizontal_offset_px: 0,
    _main_status_bar_battery_percentage_horizontal_offset_px: 0,
    _main_status_bar_settings_button_hit_area_size: 44,
    _main_status_bar_settings_icon_size: 26,
    _main_status_bar_settings_button_horizontal_offset_px: 0,
    _main_status_bar_datetime_format_pattern: 'yyyy/MM/dd-HH-mm',
    _main_status_bar_time_region_right_padding: 6,
    _main_status_bar_time_text_horizontal_offset_px: 0
  });

  const BATTERY_ICON_BY_MINIMUM_PERCENT = [
    { minimum: 75, path: 'shared/icons/battery_75.svg' },
    { minimum: 50, path: 'shared/icons/battery_50.svg' },
    { minimum: 25, path: 'shared/icons/battery_25.svg' },
    { minimum: 0,  path: 'shared/icons/battery_0.svg' }
  ];


  let mainStatusBarDateTimeFormatPattern = DEFAULT_MAIN_STATUS_BAR_CONFIG._main_status_bar_datetime_format_pattern;
  let mainStatusBarTimeElement = null;
  let mainStatusBarClockTimer = 0;
  let mainStatusBarClockIntervalMs = 1000;
  let lastMainStatusBarTimeText = '';
  function boundedNumber(value, fallback, min, max) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(number, max)) : fallback;
  }

  function normalizeDateTimeFormatPattern(value) {
    if (typeof value !== 'string') return DEFAULT_MAIN_STATUS_BAR_CONFIG._main_status_bar_datetime_format_pattern;
    const trimmed = value.trim();
    return trimmed || DEFAULT_MAIN_STATUS_BAR_CONFIG._main_status_bar_datetime_format_pattern;
  }

  function formatDateTime(date, pattern) {
    const formatter = window.JetNoteDateTimeFormat;
    if (formatter && typeof formatter.format === 'function') return formatter.format(date, pattern);
    // Minimal startup fallback if the shared formatter fails to load.
    const hh24 = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh24}:${mm}`;
  }

  function applyMainStatusBarGeometry(rawConfig, effectiveConfigOverride) {
    const config = {
      ...DEFAULT_MAIN_STATUS_BAR_CONFIG,
      ...(rawConfig && typeof rawConfig === 'object' ? rawConfig : {})
    };
    const root = document.documentElement;
    const effectiveConfig = effectiveConfigOverride || null;
    const configuredStatusPattern = normalizeDateTimeFormatPattern(
      config._main_status_bar_datetime_format_pattern ?? config._main_status_bar_time_format
    );
    mainStatusBarDateTimeFormatPattern = window.JetNoteDateTimeFormat?.customPattern?.(effectiveConfig)
      || configuredStatusPattern;

    const barHeight = boundedNumber(config.main_status_bar_height, DEFAULT_MAIN_STATUS_BAR_CONFIG.main_status_bar_height, 0, 500);
    const verticalMove = boundedNumber(config.main_status_bar_vertical_move, DEFAULT_MAIN_STATUS_BAR_CONFIG.main_status_bar_vertical_move, -500, 500);
    const topMargin = boundedNumber(config._main_status_bar_top_margin, DEFAULT_MAIN_STATUS_BAR_CONFIG._main_status_bar_top_margin, -500, 500);
    const bottomMargin = boundedNumber(config._main_status_bar_bottom_margin, DEFAULT_MAIN_STATUS_BAR_CONFIG._main_status_bar_bottom_margin, -500, 500);
    const horizontalMargin = boundedNumber(config._main_status_bar_horizontal_margin, DEFAULT_MAIN_STATUS_BAR_CONFIG._main_status_bar_horizontal_margin, 0, 500);
    const textFontSize = boundedNumber(config._main_status_bar_text_font_size, DEFAULT_MAIN_STATUS_BAR_CONFIG._main_status_bar_text_font_size, 0, 100);
    const batteryGap = boundedNumber(config._main_status_bar_battery_icon_and_percentage_gap, DEFAULT_MAIN_STATUS_BAR_CONFIG._main_status_bar_battery_icon_and_percentage_gap, 0, 100);
    const batteryIconRequested = boundedNumber(config._main_status_bar_battery_icon_size, DEFAULT_MAIN_STATUS_BAR_CONFIG._main_status_bar_battery_icon_size, 0, 200);
    const batteryIconHorizontalOffset = boundedNumber(config._main_status_bar_battery_icon_horizontal_offset_px, DEFAULT_MAIN_STATUS_BAR_CONFIG._main_status_bar_battery_icon_horizontal_offset_px, -500, 500);
    const batteryPercentageHorizontalOffset = boundedNumber(config._main_status_bar_battery_percentage_horizontal_offset_px, DEFAULT_MAIN_STATUS_BAR_CONFIG._main_status_bar_battery_percentage_horizontal_offset_px, -500, 500);
    const settingsButtonRequested = boundedNumber(config._main_status_bar_settings_button_hit_area_size, DEFAULT_MAIN_STATUS_BAR_CONFIG._main_status_bar_settings_button_hit_area_size, 0, 200);
    const settingsIconRequested = boundedNumber(config._main_status_bar_settings_icon_size, DEFAULT_MAIN_STATUS_BAR_CONFIG._main_status_bar_settings_icon_size, 0, 200);
    const settingsButtonHorizontalOffset = boundedNumber(config._main_status_bar_settings_button_horizontal_offset_px, DEFAULT_MAIN_STATUS_BAR_CONFIG._main_status_bar_settings_button_horizontal_offset_px, -500, 500);
    const timeRightPadding = boundedNumber(config._main_status_bar_time_region_right_padding, DEFAULT_MAIN_STATUS_BAR_CONFIG._main_status_bar_time_region_right_padding, 0, 500);
    const timeTextHorizontalOffset = boundedNumber(config._main_status_bar_time_text_horizontal_offset_px, DEFAULT_MAIN_STATUS_BAR_CONFIG._main_status_bar_time_text_horizontal_offset_px, -500, 500);

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
    root.style.setProperty('--main-status-bar-battery-icon-horizontal-offset', `${batteryIconHorizontalOffset}px`);
    root.style.setProperty('--main-status-bar-battery-percentage-horizontal-offset', `${batteryPercentageHorizontalOffset}px`);
    root.style.setProperty('--main-status-bar-settings-button-size', `${settingsButtonSize}px`);
    root.style.setProperty('--main-status-bar-settings-icon-size', `${settingsIconSize}px`);
    root.style.setProperty('--main-status-bar-settings-button-horizontal-offset', `${settingsButtonHorizontalOffset}px`);
    root.style.setProperty('--main-status-bar-time-right-padding', `${timeRightPadding}px`);
    root.style.setProperty('--main-status-bar-time-text-horizontal-offset', `${timeTextHorizontalOffset}px`);
  }

  function readEffectiveConfigSynchronously() {
    try {
      const raw = window.JetNoteNative?.getRuntimeConfigJson?.();
      if (typeof raw !== 'string' || !raw.trim()) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function loadMainStatusBarGeometry() {
    // NativeBridge exposes the already-localized effective config synchronously.
    // Use it before the first paint so the status bar never renders a bundled
    // default and then jumps to the debug/runtime value a moment later.
    const effective = readEffectiveConfigSynchronously();
    if (effective) {
      applyMainStatusBarGeometry(effective.main_status_bar, effective);
      return;
    }

    // Browser-only fallback for development outside Android WebView.
    fetch(`config.json?jetnote_config_refresh=${Date.now()}`, { cache: 'no-store' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('config.json load failed')))
      .then(config => applyMainStatusBarGeometry(config.main_status_bar, config))
      .catch(() => applyMainStatusBarGeometry(DEFAULT_MAIN_STATUS_BAR_CONFIG, null));
  }

  function selectBatteryIconPath(batteryPercentage) {
    const level = Math.max(0, Math.min(100, Number(batteryPercentage) || 0));
    return BATTERY_ICON_BY_MINIMUM_PERCENT.find(item => level >= item.minimum).path;
  }

  function patternClockInterval(pattern) {
    const formatter = window.JetNoteDateTimeFormat;
    if (formatter && typeof formatter.refreshInterval === 'function') {
      return formatter.refreshInterval(pattern);
    }
    // Fallback: SSS needs visibly live sub-second updates; seconds need faster
    // than a one-second interval to avoid timer drift looking delayed.
    if (/S{1,3}/.test(String(pattern || ''))) return 50;
    if (/s{1,2}/.test(String(pattern || ''))) return 200;
    return 1000;
  }

  function updateMainStatusBarTime(force = false) {
    if (!mainStatusBarTimeElement || !mainStatusBarTimeElement.isConnected) {
      mainStatusBarTimeElement = document.getElementById('mainStatusBarTime');
    }
    if (!mainStatusBarTimeElement) return;

    const text = formatDateTime(new Date(), mainStatusBarDateTimeFormatPattern);
    if (force || text !== lastMainStatusBarTimeText) {
      mainStatusBarTimeElement.textContent = text;
      lastMainStatusBarTimeText = text;
    }
  }

  function stopMainStatusBarClock() {
    if (mainStatusBarClockTimer) {
      window.clearTimeout(mainStatusBarClockTimer);
      mainStatusBarClockTimer = 0;
    }
  }

  function scheduleMainStatusBarClock() {
    stopMainStatusBarClock();
    if (document.hidden) return;

    const interval = Math.max(16, patternClockInterval(mainStatusBarDateTimeFormatPattern));
    mainStatusBarClockIntervalMs = interval;

    // Align each tick to the wall-clock interval instead of chaining a drifting
    // setInterval. This keeps SSS/seconds responsive even after a busy frame.
    const now = Date.now();
    const remainder = now % interval;
    const delay = Math.max(1, interval - remainder + 1);

    mainStatusBarClockTimer = window.setTimeout(() => {
      mainStatusBarClockTimer = 0;
      updateMainStatusBarTime();
      scheduleMainStatusBarClock();
    }, delay);
  }

  function restartMainStatusBarClock() {
    stopMainStatusBarClock();
    mainStatusBarClockIntervalMs = patternClockInterval(mainStatusBarDateTimeFormatPattern);
    updateMainStatusBarTime(true);
    scheduleMainStatusBarClock();
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
  updateMainStatusBarBattery();
  restartMainStatusBarClock();
  window.setInterval(updateMainStatusBarBattery, 30000);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopMainStatusBarClock();
      return;
    }
    loadMainStatusBarGeometry();
    updateMainStatusBarBattery();
    restartMainStatusBarClock();
  });

  window.addEventListener('pageshow', () => {
    loadMainStatusBarGeometry();
    updateMainStatusBarBattery();
    restartMainStatusBarClock();
  });

  window.addEventListener('jetnote:date-time-pattern-changed', event => {
    // Use the event payload immediately. Avoid a NativeBridge + JSON parse round
    // trip on the hot path; a subsequent page/visibility refresh still reloads
    // the authoritative effective config.
    const eventPattern = normalizeDateTimeFormatPattern(event?.detail?.pattern);
    if (eventPattern) mainStatusBarDateTimeFormatPattern = eventPattern;
    else loadMainStatusBarGeometry();
    restartMainStatusBarClock();
  });
})();
