/* Jet Note WebView compatibility layer.
   Keep this file ES2017-compatible and load it before application modules.
   It only fills missing platform APIs; it does not change app business rules. */
(function () {
  'use strict';

  var root = typeof window !== 'undefined' ? window : self;
  var installed = [];

  function mark(name) { installed.push(name); }

  if (typeof root.structuredClone !== 'function') {
    root.structuredClone = function structuredCloneFallback(input) {
      var seen = typeof WeakMap === 'function' ? new WeakMap() : null;

      function clone(value) {
        if (value === null || typeof value !== 'object') return value;
        if (typeof Date !== 'undefined' && value instanceof Date) return new Date(value.getTime());
        if (typeof RegExp !== 'undefined' && value instanceof RegExp) return new RegExp(value.source, value.flags || '');
        if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) return value.slice(0);
        if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(value)) {
          if (value instanceof DataView) return new DataView(clone(value.buffer), value.byteOffset, value.byteLength);
          return new value.constructor(value);
        }
        if (typeof Map !== 'undefined' && value instanceof Map) {
          var map = new Map();
          if (seen) seen.set(value, map);
          value.forEach(function (v, k) { map.set(clone(k), clone(v)); });
          return map;
        }
        if (typeof Set !== 'undefined' && value instanceof Set) {
          var set = new Set();
          if (seen) seen.set(value, set);
          value.forEach(function (v) { set.add(clone(v)); });
          return set;
        }
        if (seen && seen.has(value)) return seen.get(value);

        var output = Array.isArray(value) ? [] : {};
        if (seen) seen.set(value, output);
        Object.keys(value).forEach(function (key) { output[key] = clone(value[key]); });
        return output;
      }

      return clone(input);
    };
    mark('structuredClone');
  }

  if (typeof Object.hasOwn !== 'function') {
    Object.hasOwn = function (object, property) {
      return Object.prototype.hasOwnProperty.call(Object(object), property);
    };
    mark('Object.hasOwn');
  }

  if (typeof String.prototype.replaceAll !== 'function') {
    Object.defineProperty(String.prototype, 'replaceAll', {
      configurable: true,
      writable: true,
      value: function (search, replacement) {
        var source = String(this);
        if (search instanceof RegExp) {
          if (!search.global) throw new TypeError('replaceAll requires a global RegExp');
          return source.replace(search, replacement);
        }
        return source.split(String(search)).join(String(replacement));
      }
    });
    mark('String.replaceAll');
  }

  if (typeof String.prototype.padStart !== 'function') {
    Object.defineProperty(String.prototype, 'padStart', {
      configurable: true,
      writable: true,
      value: function (targetLength, padString) {
        var source = String(this);
        var target = targetLength >> 0;
        var pad = padString === undefined ? ' ' : String(padString);
        if (source.length >= target || !pad) return source;
        var needed = target - source.length;
        while (pad.length < needed) pad += pad;
        return pad.slice(0, needed) + source;
      }
    });
    mark('String.padStart');
  }

  if (typeof root.queueMicrotask !== 'function') {
    root.queueMicrotask = function (callback) {
      Promise.resolve().then(callback).catch(function (error) {
        setTimeout(function () { throw error; }, 0);
      });
    };
    mark('queueMicrotask');
  }

  if (typeof Element !== 'undefined' && !Element.prototype.closest) {
    Element.prototype.closest = function (selector) {
      var element = this;
      while (element && element.nodeType === 1) {
        if (element.matches && element.matches(selector)) return element;
        element = element.parentElement;
      }
      return null;
    };
    mark('Element.closest');
  }

  if (typeof Element !== 'undefined' && !Element.prototype.matches) {
    Element.prototype.matches = Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;
    mark('Element.matches');
  }

  root.JetNoteCompat = Object.freeze({
    installedPolyfills: installed.slice(),
    hasPointerEvents: typeof root.PointerEvent === 'function',
    hasIndexedDB: typeof root.indexedDB !== 'undefined',
    hasClipboard: !!(root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText),
    userAgent: root.navigator ? root.navigator.userAgent : ''
  });

  if (installed.length && root.console && typeof root.console.info === 'function') {
    root.console.info('[JetNoteCompat] polyfills installed:', installed.join(', '));
  }
})();
