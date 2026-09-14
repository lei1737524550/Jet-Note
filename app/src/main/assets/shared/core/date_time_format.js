/* Jet Note date/time format pattern helper.
   Pattern letters intentionally follow the familiar Java/Android style for the
   common fields used by Jet Note. Literal text can be wrapped in single quotes.
   Examples: yyyy/MM/dd-HH-mm, yyyy-MM-dd hh:mm:ss a, EEEE, MMMM d, yyyy. */
(function () {
  'use strict';

  const TOKEN_ORDER = [
    'yyyy', 'MMMM', 'MMM', 'MM', 'M', 'dd', 'd', 'EEEE', 'EEE',
    'HH', 'H', 'hh', 'h', 'mm', 'm', 'ss', 's', 'SSS', 'a',
    'XXX', 'XX', 'X', 'Z', 'yy'
  ];

  const TOKEN_REGEX = new RegExp(TOKEN_ORDER.join('|'), 'g');

  const FALLBACK_SYSTEM_PATTERN = 'yyyy/MM/dd-HH-mm';

  function normalizePattern(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function parseConfig(raw) {
    try {
      if (typeof raw !== 'string' || !raw.trim()) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function readEffectiveConfig() {
    try { return parseConfig(window.JetNoteNative?.getRuntimeConfigJson?.()); }
    catch (_) { return null; }
  }

  function readBundledConfig() {
    try { return parseConfig(window.JetNoteNative?.getBundledConfigJson?.()); }
    catch (_) { return null; }
  }

  function systemPattern(config) {
    const source = config || readBundledConfig() || readEffectiveConfig() || {};
    const status = source.main_status_bar || {};
    return normalizePattern(status._main_status_bar_datetime_format_pattern ?? status._main_status_bar_time_format)
      || FALLBACK_SYSTEM_PATTERN;
  }

  function customPattern(config) {
    const source = config || readEffectiveConfig() || {};
    const custom = source.date_time_format || {};
    if (custom.custom_enabled !== true) return '';
    return normalizePattern(custom.custom_pattern);
  }

  function effectivePattern(config) {
    return customPattern(config) || systemPattern(config);
  }

  function hasCustomPattern(config) {
    return Boolean(customPattern(config));
  }


  function activePatternText(patternValue) {
    const pattern = String(patternValue == null ? '' : patternValue);
    let visible = '';
    let quoted = false;
    for (let index = 0; index < pattern.length; index += 1) {
      const char = pattern[index];
      if (char === "'") {
        if (pattern[index + 1] === "'") { index += 1; continue; }
        quoted = !quoted;
        continue;
      }
      if (!quoted) visible += char;
    }
    return visible;
  }

  function refreshInterval(patternValue) {
    const active = activePatternText(patternValue);
    if (/S{1,3}/.test(active)) return 50;
    if (/s{1,2}/.test(active)) return 200;
    return 1000;
  }

  function validatePattern(patternValue) {
    const pattern = normalizePattern(patternValue);
    if (!pattern) return false;
    let quoted = false;
    for (let index = 0; index < pattern.length; index += 1) {
      if (pattern[index] !== "'") continue;
      if (pattern[index + 1] === "'") { index += 1; continue; }
      quoted = !quoted;
    }
    return !quoted;
  }

  function pad(value, length) {
    return String(value).padStart(length, '0');
  }


  function timezoneOffsetParts(date) {
    const total = -date.getTimezoneOffset();
    const sign = total >= 0 ? '+' : '-';
    const absolute = Math.abs(total);
    return {
      sign,
      hours: pad(Math.floor(absolute / 60), 2),
      minutes: pad(absolute % 60, 2),
      zero: total === 0
    };
  }

  function localePart(date, options) {
    try {
      return new Intl.DateTimeFormat(undefined, options).format(date);
    } catch (_) {
      return '';
    }
  }


  function tokenValue(date, token) {
    const hour24 = date.getHours();
    const hour12 = (hour24 % 12) || 12;
    const offset = timezoneOffsetParts(date);

    switch (token) {
      case 'yyyy': return pad(date.getFullYear(), 4);
      case 'yy': return pad(date.getFullYear() % 100, 2);
      case 'MMMM': return localePart(date, { month: 'long' });
      case 'MMM': return localePart(date, { month: 'short' });
      case 'MM': return pad(date.getMonth() + 1, 2);
      case 'M': return String(date.getMonth() + 1);
      case 'dd': return pad(date.getDate(), 2);
      case 'd': return String(date.getDate());
      case 'EEEE': return localePart(date, { weekday: 'long' });
      case 'EEE': return localePart(date, { weekday: 'short' });
      case 'HH': return pad(hour24, 2);
      case 'H': return String(hour24);
      case 'hh': return pad(hour12, 2);
      case 'h': return String(hour12);
      case 'mm': return pad(date.getMinutes(), 2);
      case 'm': return String(date.getMinutes());
      case 'ss': return pad(date.getSeconds(), 2);
      case 's': return String(date.getSeconds());
      case 'SSS': return pad(date.getMilliseconds(), 3);
      case 'a': return hour24 < 12 ? 'AM' : 'PM';
      case 'XXX': return offset.zero ? 'Z' : `${offset.sign}${offset.hours}:${offset.minutes}`;
      case 'XX': return offset.zero ? 'Z' : `${offset.sign}${offset.hours}${offset.minutes}`;
      case 'X': return offset.zero ? 'Z' : (offset.minutes === '00' ? `${offset.sign}${offset.hours}` : `${offset.sign}${offset.hours}${offset.minutes}`);
      case 'Z': return `${offset.sign}${offset.hours}${offset.minutes}`;
      default: return token;
    }
  }

  function format(dateValue, patternValue) {
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '';
    const pattern = String(patternValue == null ? '' : patternValue);
    if (!pattern) return '';

    let result = '';
    let segment = '';
    let quoted = false;

    const flushPatternSegment = () => {
      if (!segment) return;
      result += segment.replace(TOKEN_REGEX, token => tokenValue(date, token));
      segment = '';
    };

    for (let index = 0; index < pattern.length; index += 1) {
      const char = pattern[index];
      if (char === "'") {
        if (pattern[index + 1] === "'") {
          if (quoted) result += "'";
          else segment += "'";
          index += 1;
          continue;
        }
        if (quoted) {
          quoted = false;
        } else {
          flushPatternSegment();
          quoted = true;
        }
        continue;
      }
      if (quoted) result += char;
      else segment += char;
    }
    flushPatternSegment();
    return result;
  }

  // Curated reference list for Settings. Keep this list focused on broadly useful,
  // locale-neutral pattern fields. The formatter may support extra manual tokens,
  // but location-name tokens (for example z/zzzz) are intentionally not promoted
  // because their output depends on the device locale/time zone and is not universal.
  const TOKENS = Object.freeze([
    ['yyyy', 'year_4'], ['yy', 'year_2'],
    ['MMMM', 'month_full'], ['MMM', 'month_short'], ['MM', 'month_2'], ['M', 'month'],
    ['dd', 'day_2'], ['d', 'day'],
    ['EEEE', 'weekday_full'], ['EEE', 'weekday_short'],
    ['HH', 'hour_24_2'], ['H', 'hour_24'],
    ['hh', 'hour_12_2'], ['h', 'hour_12'],
    ['mm', 'minute_2'], ['m', 'minute'],
    ['ss', 'second_2'], ['s', 'second'],
    ['SSS', 'milliseconds'], ['a', 'ampm'],
    ['Z', 'utc_offset_basic'], ['X', 'iso_offset_short'],
    ['XX', 'iso_offset_basic'], ['XXX', 'iso_offset_colon']
  ].map(([token, descriptionKey]) => Object.freeze({ token, descriptionKey })));


  window.JetNoteDateTimeFormat = Object.freeze({
    format,
    tokens: TOKENS,
    normalizePattern,
    validatePattern,
    readEffectiveConfig,
    readBundledConfig,
    systemPattern,
    customPattern,
    effectivePattern,
    hasCustomPattern,
    refreshInterval
  });
})();
