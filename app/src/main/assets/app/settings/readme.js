(() => {
  const README_URL = 'README.txt';
  const PREVIEW_LINE_COUNT = 6;
  const DEFAULT_FOLD_DURATION_MS = 900;
  let loaded = false;
  let text = '';
  let foldDurationMs = DEFAULT_FOLD_DURATION_MS;
  let animationFrame = 0;
  let animationTimer = 0;

  function uiString(key, fallback) {
    const value = window.JetNoteLanguage?.get?.(`ui_strings.readme.${key}`);
    return typeof value === 'string' && value ? value : fallback;
  }

  function refreshScrollbar() {
    if (window.JetNoteScrollbar?.refresh) window.JetNoteScrollbar.refresh();
    else window.dispatchEvent(new Event('jet-note-scrollbar-refresh'));
  }

  function stopRefreshLoop() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    if (animationTimer) clearTimeout(animationTimer);
    animationFrame = 0;
    animationTimer = 0;
  }

  function refreshDuringAnimation() {
    stopRefreshLoop();
    const started = performance.now();
    const tick = now => {
      refreshScrollbar();
      if (now - started < foldDurationMs + 80) animationFrame = requestAnimationFrame(tick);
      else animationFrame = 0;
    };
    animationFrame = requestAnimationFrame(tick);
    animationTimer = setTimeout(() => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      animationTimer = 0;
      refreshScrollbar();
    }, foldDurationMs + 120);
  }

  function collapsedHeight(content) {
    const style = getComputedStyle(content);
    const lineHeight = parseFloat(style.lineHeight) || 21.7;
    const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    const borders = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
    return Math.ceil(lineHeight * PREVIEW_LINE_COUNT + padding + borders);
  }

  function setOpen(open, animate = true) {
    const content = document.getElementById('readmeContent');
    const button = document.getElementById('readmeExpandButton');
    if (!content || !button) return;

    stopRefreshLoop();
    content.style.setProperty('--readme-fold-duration', `${animate ? foldDurationMs : 0}ms`);
    const target = open ? content.scrollHeight : collapsedHeight(content);
    content.style.height = `${target}px`;
    content.dataset.open = open ? 'true' : 'false';
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    button.textContent = open ? uiString('collapse', 'Collapse') : uiString('expand', 'Expand');

    if (animate) refreshDuringAnimation();
    else requestAnimationFrame(refreshScrollbar);
  }

  async function applyFoldDuration() {
    try {
      const response = await fetch('config.json', { cache: 'no-store' });
      if (!response.ok) return;
      const config = await response.json();
      const configured = Number(config?.readme?.fold_animation_duration_ms);
      if (Number.isFinite(configured) && configured >= 0) foldDurationMs = configured;
    } catch (error) {
      console.warn('README animation config unavailable', error);
    }
  }

  async function load() {
    if (loaded) return;
    const response = await fetch(README_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`README load failed: ${response.status}`);
    text = await response.text();
    loaded = true;
  }

  async function initialize() {
    const content = document.getElementById('readmeContent');
    const button = document.getElementById('readmeExpandButton');
    if (!content || !button) return;
    await applyFoldDuration();
    try {
      await load();
      content.textContent = text;
    } catch (error) {
      content.textContent = 'README unavailable';
      console.warn(error);
    }

    if (!button.dataset.bound) {
      button.dataset.bound = 'true';
      button.addEventListener('click', () => setOpen(button.getAttribute('aria-expanded') !== 'true', true));
    }

    // Start from a deterministic six-line box without animating page startup.
    requestAnimationFrame(() => setOpen(false, false));
  }

  window.ReadmeSettingsFeature = Object.freeze({ initialize });
})();
