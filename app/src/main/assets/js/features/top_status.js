/* Home top utility row: native Android battery + HH:mm + Settings (handled in HTML). */
(function () {
  'use strict';

  const BATTERY_ICON_BY_MINIMUM_PERCENT = [
    { minimum: 75, path: 'icons/battery_75.svg' },
    { minimum: 50, path: 'icons/battery_50.svg' },
    { minimum: 25, path: 'icons/battery_25.svg' },
    { minimum: 0,  path: 'icons/battery_0.svg' }
  ];

  function selectBatteryIconPath(batteryPercentage) {
    const level = Math.max(0, Math.min(100, Number(batteryPercentage) || 0));
    return BATTERY_ICON_BY_MINIMUM_PERCENT.find(item => level >= item.minimum).path;
  }

  function updateTopStatusTime() {
    const element = document.getElementById('topStatusTime');
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

  function updateTopStatusBattery() {
    const percentageElement = document.getElementById('topStatusBatteryPercentage');
    const iconElement = document.getElementById('topStatusBatteryIcon');
    if (!percentageElement || !iconElement) return;
    const level = readNativeBatteryPercentage();
    if (level === null) {
      percentageElement.textContent = '--%';
      return;
    }
    percentageElement.textContent = `${level}%`;
    iconElement.src = selectBatteryIconPath(level);
  }

  function updateTopStatus() {
    updateTopStatusTime();
    updateTopStatusBattery();
  }

  updateTopStatus();
  window.setInterval(updateTopStatusTime, 1000);
  window.setInterval(updateTopStatusBattery, 30000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) updateTopStatus();
  });
})();
