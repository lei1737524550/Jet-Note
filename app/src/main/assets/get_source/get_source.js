(() => {
  if (window.JetNoteGetSource) return;

  const config = window.JET_NOTE_GET_SOURCE_CONFIG || {};
  const colors = config.colors || {};
  const backgroundPolicy = config.background_policy || {};
  const getSourceBodyColor = () => String(window.JET_NOTE_GET_SOURCE_BODY_COLOR || '').trim() || 'rgb(255,255,255)';
  const candidates = new Map();
  const types = new Map();
  const extensionFilter = new Set((Array.isArray(window.JET_NOTE_GET_SOURCE_EXTENSION_FILTER) ? window.JET_NOTE_GET_SOURCE_EXTENSION_FILTER : [])
    .map(value => String(value || '').trim().toLowerCase()).filter(Boolean));
  const ds = (key, fallback) => {
    const strings = window.JET_NOTE_SOURCE_STRINGS || {};
    return typeof strings[key] === 'string' ? strings[key] : fallback;
  };

  const normalize = value => {
    try {
      let raw = String(value || '').trim().replace(/&amp;/g, '&').replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
      if (!raw) return null;
      if (raw.startsWith('//')) raw = 'https:' + raw;
      const url = new URL(raw, location.href);
      return url.protocol === 'https:' ? url.href : null;
    } catch (_) {
      return null;
    }
  };

  const extensionOf = url => {
    try {
      const name = new URL(url).pathname.split('/').pop() || '';
      const dot = name.lastIndexOf('.');
      return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
    } catch (_) {
      return '';
    }
  };

  const addCandidate = (value, hintType = '') => {
    const url = normalize(value);
    if (!url) return;
    const ext = extensionOf(url);
    if (extensionFilter.size && (!ext || !extensionFilter.has(ext))) return;
    const current = candidates.get(url) || {url, hints: new Set()};
    if (hintType) current.hints.add(hintType);
    candidates.set(url, current);
    persist();
  };

  const persist = () => {
    window.JET_NOTE_CAPTURED_RESOURCE_URLS = [...candidates.values()].map(item => ({
      url: item.url,
      hints: [...item.hints]
    }));
  };

  const restore = () => {
    const stored = Array.isArray(window.JET_NOTE_CAPTURED_RESOURCE_URLS) ? window.JET_NOTE_CAPTURED_RESOURCE_URLS : [];
    stored.forEach(item => {
      if (typeof item === 'string') addCandidate(item);
      else if (item && item.url) {
        const hints = Array.isArray(item.hints) ? item.hints : [];
        if (!hints.length) addCandidate(item.url);
        else hints.forEach(hint => addCandidate(item.url, hint));
      }
    });
    const nativeAudio = Array.isArray(window.JET_NOTE_NATIVE_AUDIO_URLS) ? window.JET_NOTE_NATIVE_AUDIO_URLS : [];
    nativeAudio.forEach(url => addCandidate(url, 'audio'));
  };

  const installObserver = () => {
    if (window.__jetNoteSourceObserverInstalled) return;
    window.__jetNoteSourceObserverInstalled = true;

    const inspectMedia = event => {
      const node = event.target;
      if (!node) return;
      if (node.tagName === 'AUDIO') addCandidate(node.currentSrc || node.src, 'audio');
      if (node.tagName === 'VIDEO') addCandidate(node.currentSrc || node.src, 'video');
      if (node.tagName === 'IMG') addCandidate(node.currentSrc || node.src, 'image');
    };
    document.addEventListener('loadstart', inspectMedia, true);
    document.addEventListener('play', inspectMedia, true);
    document.addEventListener('load', inspectMedia, true);

    const oldFetch = window.fetch;
    if (oldFetch) window.fetch = function(input, init) {
      addCandidate(input && (input.url || input));
      return oldFetch.call(this, input, init);
    };

    const oldOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      addCandidate(url);
      return oldOpen.apply(this, arguments);
    };

    try {
      new PerformanceObserver(list => list.getEntries().forEach(entry => addCandidate(entry.name)))
        .observe({type: 'resource', buffered: true});
    } catch (_) {}
  };

  const scanPage = () => {
    addCandidate(location.href, String(document.contentType || '').startsWith('text/') ? 'text' : '');
    try { performance.getEntriesByType('resource').forEach(entry => addCandidate(entry.name)); } catch (_) {}

    document.querySelectorAll('[src], [href], [data-src], [data-url], [data-audio], [data-audio-url]').forEach(node => {
      const tag = String(node.tagName || '').toLowerCase();
      const hint = tag === 'audio' ? 'audio' : tag === 'video' ? 'video' : tag === 'img' ? 'image' : '';
      ['src', 'href', 'data-src', 'data-url', 'data-audio', 'data-audio-url'].forEach(attr => {
        if (node.getAttribute) addCandidate(node.getAttribute(attr), hint);
      });
      addCandidate(node.currentSrc, hint);
    });

    document.querySelectorAll('script[type="application/ld+json"], script[type="application/json"], script:not([src])').forEach(script => {
      const source = (script.textContent || '').slice(0, 500000);
      (source.match(/https?:\\?\/\\?\/[^\s"'<>\\]+/g) || []).forEach(addCandidate);
    });
  };

  const registerType = definition => {
    if (!definition || !definition.id) return;
    types.set(definition.id, definition);
  };

  const configuredTypeForExtension = ext => {
    if (!ext) return '';
    const owners = ['text', 'audio', 'image', 'video'].filter(id => {
      const extensions = config[id] && Array.isArray(config[id].extensions) ? config[id].extensions : [];
      return extensions.some(value => String(value).toLowerCase() === ext);
    });
    return owners.length === 1 ? owners[0] : '';
  };

  const classify = (entry, type) => {
    const settings = config[type.id] || {};
    const extensions = Array.isArray(settings.extensions) ? settings.extensions.map(x => String(x).toLowerCase()) : [];
    const priority = Array.isArray(settings.priority) ? settings.priority.map(x => String(x).toLowerCase()) : [];
    const ext = extensionOf(entry.url);
    const explicitType = configuredTypeForExtension(ext);

    // A configured file extension is authoritative. For example, .jpeg is always
    // an Image and must never become a Video just because its URL contains words
    // such as "video", "stream" or "playlist". Hints/heuristics are only
    // fallback signals for extensionless or otherwise unknown resources.
    const matched = explicitType
      ? explicitType === type.id
      : entry.hints.has(type.id) || extensions.includes(ext) || (typeof type.matches === 'function' && type.matches(entry.url, ext));

    const rank = matched ? Math.max(0, priority.indexOf(ext)) : 99999;
    return {matched, rank: priority.includes(ext) ? rank : matched ? priority.length + 1 : 99999, ext};
  };

  const sortedFor = type => [...candidates.values()]
    .map(entry => ({entry, ...classify(entry, type)}))
    .sort((a, b) => Number(b.matched) - Number(a.matched) || a.rank - b.rank || a.entry.url.localeCompare(b.entry.url))
    .slice(0, Math.max(1, Number(config.maximum_candidates) || 160));

  const stopAudioPreview = panel => {
    const audio = panel && panel.__jetNotePlayingAudio;
    if (audio) {
      try { audio.pause(); audio.currentTime = 0; } catch (_) {}
    }
    panel.__jetNotePlayingAudio = null;
    if (panel.__jetNotePlayingButton && typeof panel.__jetNoteResetPlayingButton === 'function') {
      panel.__jetNoteResetPlayingButton(panel.__jetNotePlayingButton);
    }
    panel.__jetNotePlayingButton = null;
  };

  const bindLongPressSave = (target, url, shortAction) => {
    let timer = null;
    let longPressed = false;
    const cancel = () => { if (timer) clearTimeout(timer); timer = null; };
    const down = event => {
      event.preventDefault();
      event.stopPropagation();
      cancel();
      longPressed = false;
      timer = setTimeout(() => {
        timer = null;
        longPressed = true;
        location.href = 'jetnote-save://resource?url=' + encodeURIComponent(url);
      }, 550);
    };
    const up = event => {
      event.preventDefault();
      event.stopPropagation();
      const wasLong = longPressed;
      cancel();
      longPressed = false;
      if (!wasLong && typeof shortAction === 'function') shortAction();
    };
    target.style.userSelect = 'none';
    target.style.webkitUserSelect = 'none';
    target.style.webkitTouchCallout = 'none';
    target.addEventListener('contextmenu', event => event.preventDefault());
    if (window.PointerEvent) {
      target.addEventListener('pointerdown', down, {passive: false});
      target.addEventListener('pointerup', up, {passive: false});
      target.addEventListener('pointercancel', cancel, {passive: false});
      target.addEventListener('pointerleave', cancel, {passive: false});
    } else {
      target.addEventListener('touchstart', down, {passive: false});
      target.addEventListener('touchend', up, {passive: false});
      target.addEventListener('touchcancel', cancel, {passive: false});
    }
  };

  const viewerLayer = () => Math.max(1, Number(config.layers && (config.layers.get_source_image_video_viewer_z_axis_height ?? config.layers.get_source_image_video_viewer_z_index)) || 100000);
  const panelLayer = () => Math.max(1, Number(config.layers && (config.layers.get_source_panel_z_axis_height ?? config.layers.get_source_panel_z_index)) || 90000);

  const promoteViewer = () => {
    const viewer = document.getElementById('imageViewer');
    if (!viewer) return;
    if (viewer.parentElement !== document.body) document.body.appendChild(viewer);
    viewer.style.setProperty('z-index', String(viewerLayer()), 'important');
    const closeButton = document.getElementById('imageViewerClose');
    if (closeButton) closeButton.style.setProperty('z-index', '2', 'important');
  };

  const installViewer = () => {
    const html = window.JET_NOTE_VIEWER_HTML;
    const css = window.JET_NOTE_VIEWER_CSS;
    if (typeof css === 'string' && css && !document.getElementById('jet-note-source-viewer-style')) {
      const style = document.createElement('style');
      style.id = 'jet-note-source-viewer-style';
      style.textContent = css;
      document.head.appendChild(style);
    }
    if (!document.getElementById('imageViewer') && typeof html === 'string' && html) {
      const host = document.createElement('div');
      host.innerHTML = html;
      while (host.firstChild) document.body.appendChild(host.firstChild);
    }
    promoteViewer();
  };

  const getViewerMediaSource = () => {
    const video = document.getElementById('imageViewerVideo');
    if (video && video.classList.contains('active')) return video.currentSrc || video.src || '';
    const image = document.getElementById('imageViewerImg');
    return (image && (image.currentSrc || image.src)) || '';
  };

  const iconButton = (svg, label) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.innerHTML = typeof svg === 'string' ? svg : '';
    button.style.cssText = 'width:44px;height:44px;padding:8px;border:1px solid ' + (colors.border || '#c8cbd0') + ';border-radius:12px;background:' + getSourceBodyColor() + ';color:' + (colors.text || '#202124') + ';display:grid;place-items:center;';
    const icon = button.firstElementChild;
    if (icon) { icon.style.width = '24px'; icon.style.height = '24px'; icon.style.display = 'block'; }
    return button;
  };

  const showResults = () => {
    if (window.JET_NOTE_GET_SOURCE_SHOW_RESULTS !== true) return;
    scanPage();
    installViewer();

    const old = document.getElementById('jet-note-source-results');
    if (old) { stopAudioPreview(old); old.remove(); }

    const panel = document.createElement('div');
    panel.id = 'jet-note-source-results';
    panel.style.cssText = 'position:fixed;top:10px;right:10px;bottom:calc(env(safe-area-inset-bottom,0px) + 56px);left:10px;z-index:' + panelLayer() + ';background:' + getSourceBodyColor() + ';color:' + (colors.text || '#202124') + ';padding:18px;overflow:auto;font:16px sans-serif;border:1px solid ' + (colors.border || '#bfc1c4') + ';border-radius:14px;box-sizing:border-box;box-shadow:0 8px 28px rgba(0,0,0,.18);-webkit-tap-highlight-color:transparent;';

    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'display:block;position:sticky;top:-18px;z-index:2;background:' + getSourceBodyColor() + ';padding:12px 0 14px;border-bottom:1px solid ' + (colors.border || '#c8cbd0') + ';';

    const tabs = document.createElement('div');
    tabs.style.cssText = 'display:grid;grid-template-columns:repeat(' + (window.JET_NOTE_BROWSER_MODE === true ? '5' : '4') + ',minmax(0,1fr));gap:6px;';
    toolbar.appendChild(tabs);
    panel.appendChild(toolbar);

    const hint = document.createElement('p');
    hint.style.cssText = 'margin:20px 0 10px;font-size:15px;line-height:1.45;color:' + (colors.text || '#202124') + ';';
    panel.appendChild(hint);
    const list = document.createElement('div');
    panel.appendChild(list);

    const renderType = id => {
      const type = types.get(id);
      if (!type) return;
      stopAudioPreview(panel);
      [...tabs.children].forEach(button => button.dataset.active = 'false');
      const active = tabs.querySelector('[data-type="' + id + '"]');
      if (active) { active.dataset.active = 'true'; active.style.background = getSourceBodyColor(); active.style.borderColor = colors.matched || '#168A45'; }
      [...tabs.children].filter(button => button !== active).forEach(button => { button.style.background = getSourceBodyColor(); button.style.borderColor = colors.border || '#c8cbd0'; });

      list.replaceChildren();
      const rows = sortedFor(type);
      const matchedCount = rows.filter(row => row.matched).length;
      hint.textContent = ds('foundCandidates', '')
        .replace('{count}', String(rows.length))
        .replace('{type}', type.label);
      if (!rows.length) {
        const empty = document.createElement('p');
        empty.textContent = ds('noResources', '');
        list.appendChild(empty);
        return;
      }
      rows.forEach((row, index) => type.render({panel, list, row, index, bindLongPressSave, colors, ds}));
      if (!matchedCount) {
        const note = document.createElement('p');
        note.textContent = ds('noMatchingResources', '').replace('{type}', type.label.toLowerCase());
        note.style.cssText = 'color:' + (colors.unmatched || '#c73737') + ';font-size:14px;margin:12px 0;';
        list.prepend(note);
      }
    };

    ['text', 'audio', 'image', 'video'].forEach(id => {
      const type = types.get(id);
      if (!type) return;
      const button = iconButton(window.JET_NOTE_SOURCE_ICONS && window.JET_NOTE_SOURCE_ICONS[id], type.label);
      button.dataset.type = id;
      button.style.width = '100%';
      button.onclick = () => renderType(id);
      tabs.appendChild(button);
    });

    if (window.JET_NOTE_BROWSER_MODE === true) {
      const refresh = iconButton(window.JET_NOTE_SOURCE_ICONS && window.JET_NOTE_SOURCE_ICONS.refresh, ds('getSourceRefresh', 'Refresh'));
      refresh.dataset.action = 'refresh';
      refresh.style.width = '100%';
      refresh.onclick = () => {
      stopAudioPreview(panel);
      panel.remove();

      window.location.href = 'jetnote-source-state://inactive';

  // Reload after native has consumed the state notification.
      setTimeout(() => {
      window.location.reload();
        }, 0);
      };
      tabs.appendChild(refresh);
    }

    document.body.appendChild(panel);
    promoteViewer();
    renderType('audio');
  };

  const hideResults = () => {
    const panel = document.getElementById('jet-note-source-results');
    if (panel) { stopAudioPreview(panel); panel.remove(); }
  };

  restore();
  installObserver();
  window.JetNoteGetSource = {config, candidates, registerType, extensionOf, addCandidate, showResults, hideResults, normalize, ds, promoteViewer, browserMode: window.JET_NOTE_BROWSER_MODE === true, canAddToPost: () => window.JET_NOTE_BROWSER_MODE !== true};
})();
