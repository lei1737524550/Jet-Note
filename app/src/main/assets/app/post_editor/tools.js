/**
 * New/Edit Post tools + toolbox renderer.
 *
 * Stable naming:
 *   tools[]         => tool_1, tool_2, tool_3, ...
 *   toolbox_tools[] => toolbox_tool_1, toolbox_tool_2, ...
 *
 * `name` exists only to help maintainers read/search the configuration.
 * Runtime behavior MUST NOT branch on `name`.
 */
let toolboxUnfoldAnimationPromise = null;
let currentToolsConfig = null;
let currentToolsLayout = null;

function toolIcon(name) {
  const paths = {
    video: '<rect x="3" y="5" width="13" height="14" rx="3"/><path d="m16 10 5-3v10l-5-3z"/>',
    photo: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m4 17 5-5 4 4 3-3 5 5"/>',
    sound: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    tools: '<path d="M8 7V5.8C8 4.8 8.8 4 9.8 4h4.4C15.2 4 16 4.8 16 5.8V7"/><rect x="3" y="7" width="18" height="13" rx="3"/><path d="M3 12.5h18M9.5 12.5v2h5v-2"/>',
    dictionary: '<path d="M12 5Q7 2.5 3 4.5V20q4-2 9 1 5-3 9-1V4.5Q17 2.5 12 5v16"/>',
    sentence: '<path d="M4 5h16v12H9l-5 4V5Z"/><path d="M8 9h8M8 13h5"/>',
  };
  const path = paths[name] || paths.tools;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

function toolLabel(tool) {
  return tool.labelKey ? t(tool.labelKey) : (tool.label || tool.id);
}

/** URL-based toolbox tool entry point. */
async function openConfiguredTool(tool) {
  if (!tool?.url?.startsWith('https://')) {
    throw new Error(`Invalid configured toolbox tool: ${tool?.id}`);
  }

  await EditorController.suspend(tool.id);
  document.activeElement?.blur?.();
  const title = toolLabel(tool);

  if (window.JetNoteNative?.openTool) {
    const fallbackBackground =
      getComputedStyle(document.documentElement).getPropertyValue('--page-background').trim()
      || 'rgb(255,255,255)';
    const background =
      (await window.JetNoteType?.toolBackground?.(tool.id)) || fallbackBackground;
    const borderColor =
      (await window.JetNoteType?.toolBorderColor?.(tool.id)) || '#bfc1c4';

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

function createToolButton(tool, belongsToToolbox) {
  const button = document.createElement('button');
  const isToolboxTrigger = tool.action === 'toolbox';

  button.type = 'button';
  button.id = tool.id;
  button.className = [
    'tool',
    'common_border',
    belongsToToolbox ? 'toolbox_tool' : '',
    isToolboxTrigger ? 'toolbox-trigger' : '',
  ].filter(Boolean).join(' ');

  button.dataset.toolId = tool.id;
  button.dataset.toolAction = tool.action || '';
  button.title = toolLabel(tool);
  button.setAttribute('aria-label', button.title);
  button.innerHTML = toolIcon(tool.icon);
  button.hidden = belongsToToolbox;

  if (isToolboxTrigger) {
    button.dataset.collapsedIcon = tool.icon || 'tools';
    button.setAttribute('aria-expanded', 'false');
  }
  if (tool.action === 'video') button.dataset.addVideo = 'post';
  if (tool.action === 'sound') button.dataset.addAudio = 'post';

  /* tool_4 only toggles toolbox UI. Prevent it from taking focus away from the
     textarea on pointer-down, so Android/Gboard stays open while the toolbox is
     opened or closed. The click event still fires and performs the toggle. */
  if (isToolboxTrigger) {
    button.addEventListener('pointerdown', event => event.preventDefault());
  }

  button.addEventListener('click', () => void ToolActions.run(tool));
  return button;
}

async function initializeTools() {
  const toolsElement = document.getElementById('postEditorTools');
  if (!toolsElement) return;

  try {
    currentToolsConfig = await ToolLoader.load();
    currentToolsLayout = ToolLoader.layout(currentToolsConfig);

    const buttons = [
      ...currentToolsLayout.tools.map(tool => createToolButton(tool, false)),
      ...currentToolsLayout.toolboxTools.map(tool => createToolButton(tool, true)),
    ];

    toolsElement.replaceChildren(...buttons);
    toolsElement.dataset.toolCount = String(currentToolsLayout.tools.length);
    toolsElement.dataset.toolboxToolCount = String(currentToolsLayout.toolboxTools.length);

    /* Anchor the primary tool_* row to the position it occupies when every
       toolbox_tool_* is visible. Button geometry is 48px with an 8px gap. */
    const expandedToolCount = currentToolsLayout.tools.length + currentToolsLayout.toolboxTools.length;
    const expandedRowWidth = expandedToolCount > 0
      ? (expandedToolCount * 48) + ((expandedToolCount - 1) * 8)
      : 0;
    toolsElement.style.setProperty('--tools-expanded-row-width', `${expandedRowWidth}px`);

    toolsElement.removeAttribute('data-render-error');
    await setToolboxExpanded(false, true);
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

async function setToolboxExpanded(expanded, skipAnimation = false) {
  const toolsElement = document.getElementById('postEditorTools');
  if (!toolsElement) return;

  const trigger = toolsElement.querySelector('.toolbox-trigger');
  const toolboxTools = [...toolsElement.querySelectorAll('.toolbox_tool')];
  if (!trigger) return;

  trigger.setAttribute('aria-expanded', String(expanded));
  trigger.innerHTML = expanded && currentToolsConfig?.toolbox?.unfoldIcon
    ? `<img class="toolbox-unfold-icon" src="${currentToolsConfig.toolbox.unfoldIcon}" alt="">`
    : toolIcon(trigger.dataset.collapsedIcon || 'tools');

  for (const button of toolboxTools) button.hidden = !expanded;

  EditorController.setToolsExpanded(expanded);

  if (!skipAnimation) {
    const animation = await loadToolboxUnfoldAnimation();
    animation?.apply?.({ expanded, buttons: toolboxTools });
  }
}

function toggleToolbox() {
  const composer = document.getElementById('postComposeScreen');
  if (!composer?.classList.contains('open')) return;

  const trigger = composer.querySelector('.toolbox-trigger');
  const expanded = trigger?.getAttribute('aria-expanded') === 'true';
  void setToolboxExpanded(!expanded);
}

function closeToolbox() {
  void setToolboxExpanded(false, true);
}

async function reloadTools() {
  ToolLoader.clear();
  toolboxUnfoldAnimationPromise = null;
  await initializeTools();
}

registerBuiltInToolActions();
window.initializeTools = initializeTools;
window.reloadTools = reloadTools;
window.closeToolbox = closeToolbox;
void initializeTools();
