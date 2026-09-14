/**
 * New/Edit Post tools renderer.
 *
 * Canonical model:
 *   tools = [tool_1, tool_2, tool_3, tool_m1]
 *   tool_m1 is a Toolbox anchor.
 *
 * Expanded Toolbox behavior:
 *   child 1 occupies anchor-1, child 2 occupies anchor-2, ...
 *   therefore expansion visually grows LEFT and temporarily covers old tools.
 *   The canonical tools[] array is never mutated.
 */
let toolboxUnfoldAnimationPromise = null;
let currentToolsConfig = null;
let toolboxExpanded = false;
const animatedToolIconTimers = new Set();

function toolIcon(name) {
  const files = {
    video: 'tool_video.svg',
    photo: 'tool_photo.svg',
    sound: 'tool_sound.svg',
    tools: 'toolbox.svg',
    dictionary: 'dictionary.svg',
    sentence: 'sentences.svg',
  };
  if (name === 'google_search') return '';
  const file = files[name] || files.tools;
  return `<img src="shared/icons/${file}" alt="" aria-hidden="true">`;
}

function stopAnimatedToolIcons() {
  for (const timer of animatedToolIconTimers) clearTimeout(timer);
  animatedToolIconTimers.clear();
}

function normalizeAnimatedIconSequence(rule) {
  const raw = Array.isArray(rule?.sequence) ? rule.sequence : [];
  return raw.map(item => ({
    asset: typeof item?.asset === 'string' ? item.asset.trim() : '',
    durationMs: Math.max(0, Math.min(Number(item?.duration_ms) || 0, 86400000)),
  })).filter(item => item.asset);
}

function applyAnimatedToolIcon(img, rule) {
  const sequence = normalizeAnimatedIconSequence(rule);
  if (!img || !sequence.length) return;

  const changeCount = Number(rule?.change_count);
  const mode = changeCount === -1 ? -1 : changeCount === 1 ? 1 : 0;
  let index = 0;

  const show = () => {
    const item = sequence[index];
    img.src = item.asset;

    if (mode === 0 || sequence.length === 1 || (mode === 1 && index === sequence.length - 1)) return;

    const wait = mode === -1 ? Math.max(16, item.durationMs) : item.durationMs;
    const timer = setTimeout(() => {
      animatedToolIconTimers.delete(timer);
      index = (index + 1) % sequence.length;
      show();
    }, wait);
    animatedToolIconTimers.add(timer);
  };

  show();
}

function toolLabel(tool) {
  return tool.labelKey ? t(tool.labelKey) : (tool.label || tool.id);
}

/** Generic URL-tool entry point shared by toolbox buttons and Browser Mode. */
async function openConfiguredTool(tool, options = {}) {
  if (!tool?.url?.startsWith('https://')) {
    throw new Error(`Invalid configured toolbox tool: ${tool?.id}`);
  }

  const browserMode = options?.browserMode === true;
  if (!browserMode && options?.skipEditorSuspend !== true) {
    await EditorController.suspend(tool.id);
  }
  document.activeElement?.blur?.();
  const title = toolLabel(tool);
  const fallbackTitle = String(tool?.fallbackTitle || '').trim()
    || (() => {
      try {
        const host = new URL(tool?.fallbackUrl || '').hostname.toLowerCase();
        if (host === 'baidu.com' || host.endsWith('.baidu.com')) return 'Baidu';
      } catch (_) {}
      return title;
    })();
  const fallbackBackground =
    getComputedStyle(document.documentElement).getPropertyValue('--page-background').trim()
    || 'rgb(255,255,255)';
  const background =
    (await window.JetNoteType?.toolBackground?.(tool.id)) || fallbackBackground;
  const borderColor =
    (await window.JetNoteType?.toolBorderColor?.(tool.id)) || '#bfc1c4';

  if (window.JetNoteNative?.openToolWithFallbackMode && tool.fallbackUrl) {
    JetNoteNative.openToolWithFallbackMode(
      tool.url,
      tool.fallbackUrl,
      title,
      fallbackTitle,
      'en',
      background,
      borderColor,
      currentToolsConfig?.networkProbeTimeoutMs || 3500,
      browserMode
    );
    return;
  }

  // Compatibility path for older native hosts. Browser Mode still opens the
  // same tool core, but title switching needs the newer bridge above.
  if (window.JetNoteNative?.openToolWithFallback && tool.fallbackUrl) {
    JetNoteNative.openToolWithFallback(
      tool.url,
      tool.fallbackUrl,
      title,
      'en',
      background,
      borderColor,
      currentToolsConfig?.networkProbeTimeoutMs || 3500
    );
    return;
  }

  if (window.JetNoteNative?.openTool) {
    JetNoteNative.openTool(tool.url, title, 'en', background, borderColor);
    return;
  }

  window.open(tool.url, '_blank', 'noopener');
}

function registerBuiltInToolActions() {
  ToolActions.register('toolbox', () => toggleToolbox());
  ToolActions.register('video', () => pickPostVideos());
  ToolActions.register('photo', () => pickPostImages());
  ToolActions.register('sound', () => pickEntryAudio('post'));
}

function createToolButton(tool) {
  const button = document.createElement('button');
  const isToolboxTrigger = tool.type === 'toolbox' || tool.action === 'toolbox';
  const isToolboxChild = tool.type === 'toolbox_tool';

  button.type = 'button';
  button.id = tool.id;
  button.className = [
    'tool',
    'common_border',
    isToolboxChild ? 'toolbox_tool' : '',
    isToolboxTrigger ? 'toolbox-trigger' : '',
  ].filter(Boolean).join(' ');
  button.dataset.toolId = tool.id;
  button.dataset.toolType = tool.type || 'tool';
  button.dataset.toolAction = tool.action || '';
  button.title = toolLabel(tool);
  button.setAttribute('aria-label', button.title);

  if (tool.icon === 'google_search') {
    const icon = document.createElement('img');
    icon.alt = '';
    icon.setAttribute('aria-hidden', 'true');
    button.appendChild(icon);
    applyAnimatedToolIcon(icon, currentToolsConfig?.googleSearchIconRule);
  } else {
    button.innerHTML = toolIcon(tool.icon);
  }

  if (isToolboxTrigger) {
    button.dataset.collapsedIcon = tool.icon || 'tools';
    button.setAttribute('aria-expanded', String(toolboxExpanded));
    // Keep Gboard open while toggling the toolbox.
    button.addEventListener('pointerdown', event => event.preventDefault());
  }
  if (tool.action === 'video') button.dataset.addVideo = 'post';
  if (tool.action === 'sound') button.dataset.addAudio = 'post';

  button.addEventListener('click', () => void ToolActions.run(tool));
  return button;
}

function renderTools({ animate = false } = {}) {
  const toolsElement = document.getElementById('postEditorTools');
  if (!toolsElement || !currentToolsConfig) return;

  stopAnimatedToolIcons();
  const visibleTools = ToolLoader.buildVisibleTools(currentToolsConfig, toolboxExpanded);
  const buttons = visibleTools.map(createToolButton);
  toolsElement.replaceChildren(...buttons);
  toolsElement.dataset.toolCount = String(visibleTools.length);
  toolsElement.dataset.maximumVisibleTools = String(currentToolsConfig.maximumVisibleTools);
  toolsElement.dataset.toolboxExpanded = String(toolboxExpanded);

  // Reserve geometry for the configured maximum so layouts remain stable when
  // primary tools are added later; never render more than the config maximum.
  const max = currentToolsConfig.maximumVisibleTools;
  const maxRowWidth = max > 0 ? (max * 48) + ((max - 1) * 8) : 0;
  toolsElement.style.setProperty('--tools-maximum-row-width', `${maxRowWidth}px`);

  const trigger = toolsElement.querySelector('.toolbox-trigger');
  if (trigger) {
    trigger.setAttribute('aria-expanded', String(toolboxExpanded));
    trigger.innerHTML = toolboxExpanded && currentToolsConfig.toolbox?.unfoldIcon
      ? `<img class="toolbox-unfold-icon" src="${currentToolsConfig.toolbox.unfoldIcon}" alt="">`
      : toolIcon(trigger.dataset.collapsedIcon || 'tools');
  }

  EditorController.setToolsExpanded(toolboxExpanded);

  if (animate) {
    const changed = [...toolsElement.querySelectorAll('.toolbox_tool')];
    void loadToolboxUnfoldAnimation().then(animation => {
      animation?.apply?.({ expanded: toolboxExpanded, buttons: changed });
    });
  }
}

async function openToolboxToolById(toolId, options = {}) {
  if (!currentToolsConfig) currentToolsConfig = await ToolLoader.load();
  const child = currentToolsConfig?.toolbox?.children?.find?.(tool => tool && tool.id === toolId);
  if (!child || child.enabled === false) throw new Error(`Toolbox child is unavailable: ${toolId}`);
  if (options?.browserMode === true) return openConfiguredTool(child, options);
  return ToolActions.run(child);
}

async function initializeTools() {
  const toolsElement = document.getElementById('postEditorTools');
  if (!toolsElement) return;

  try {
    currentToolsConfig = await ToolLoader.load();
    toolboxExpanded = false;
    toolsElement.removeAttribute('data-render-error');
    renderTools();
  } catch (error) {
    toolsElement.dataset.renderError = String(error?.message || error);
    console.error('Jet Note: tools renderer failed', error);
  }
}

function loadToolboxUnfoldAnimation() {
  if (toolboxUnfoldAnimationPromise) return toolboxUnfoldAnimationPromise;
  const src = currentToolsConfig?.toolbox?.unfoldAnimation;
  if (!src) return Promise.resolve(null);

  toolboxUnfoldAnimationPromise = new Promise(resolve => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve(window.JetNoteToolboxUnfoldAnimation || null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return toolboxUnfoldAnimationPromise;
}

function setToolboxExpanded(expanded, skipAnimation = false) {
  const composer = document.getElementById('postComposeScreen');
  if (!composer?.classList.contains('open') && expanded) return;
  toolboxExpanded = Boolean(expanded);
  renderTools({ animate: !skipAnimation });
}

function toggleToolbox() {
  const composer = document.getElementById('postComposeScreen');
  if (!composer?.classList.contains('open')) return;
  setToolboxExpanded(!toolboxExpanded);
}

function closeToolbox() {
  setToolboxExpanded(false, true);
}

async function reloadTools() {
  ToolLoader.clear();
  toolboxUnfoldAnimationPromise = null;
  await initializeTools();
}

window.addEventListener('pagehide', stopAnimatedToolIcons);

registerBuiltInToolActions();
window.initializeTools = initializeTools;
window.reloadTools = reloadTools;
window.closeToolbox = closeToolbox;
window.openToolboxToolById = openToolboxToolById;
void initializeTools();
