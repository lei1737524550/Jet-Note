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
let toolKeyboardSnapshot = null;

function captureToolKeyboardState() {
  const textarea = document.getElementById('postComposerText');
  toolKeyboardSnapshot = {
    textareaFocused: document.activeElement === textarea,
    selectionStart: textarea?.selectionStart ?? 0,
    selectionEnd: textarea?.selectionEnd ?? 0,
  };
  return toolKeyboardSnapshot;
}

function enforceToolKeyboardState() {
  const snapshot = toolKeyboardSnapshot;
  if (!snapshot) return;
  const textarea = document.getElementById('postComposerText');
  if (!textarea) return;
  try { textarea.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd); } catch (_) {}
  // Never manufacture focus for a tool click. If the user had manually hidden
  // the IME while the textarea retained DOM focus, keeping that focus untouched
  // is what preserves the caret without reopening the keyboard.
  if (!snapshot.textareaFocused && document.activeElement === textarea) textarea.blur();
}


function toolIcon(name) {
  const files = {
    video: 'tool_video.svg',
    photo: 'tool_photo.svg',
    sound: 'tool_sound.svg',
    tools: 'toolbox.svg',
    dictionary: 'dictionary.svg',
    sentence: 'sentences.svg',
  };
  if (name === 'google_search') return `<img src="shared/icons/google_search.svg" alt="" aria-hidden="true">`;
  const file = files[name] || files.tools;
  return `<img src="shared/icons/${file}" alt="" aria-hidden="true">`;
}

function toolLabel(tool) {
  return tool.labelKey ? t(tool.labelKey) : (tool.label || tool.id);
}

/** Generic URL-tool entry point shared by toolbox buttons and Browser Mode. */
async function openConfiguredTool(tool, options = {}) {
  if (!tool?.url?.startsWith('https://')) {
    throw new Error(`Invalid configured toolbox tool: ${tool?.id}`);
  }

  // as_a_browser is a startup-routing property only. A toolbox opened from
  // Post Editor remains an ordinary tool page unless the caller explicitly
  // identifies the startup route.
  if (options?.skipEditorSuspend !== true) {
    await EditorController.suspend(tool.id);
  }
  // Tool activation must not steal editor focus or dismiss/raise the keyboard.
  // pointerdown is suppressed on every tool button below, so the textarea/caret
  // keeps exactly the focus state it had before the tool was invoked.
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
  // Every toolbox child resolves through the same default Tool color contract.
  const background =
    (await window.JetNoteType?.toolBackground?.(tool.id)) || fallbackBackground;
  const borderColor =
    (await window.JetNoteType?.toolBorderColor?.(tool.id)) || '#bfc1c4';

  if (window.JetNoteNative?.openToolWithFallback && tool.fallbackUrl) {
    // Editor toolbox tools use the ordinary ToolPageController. This is intentionally
    // independent from the removed Settings "Browser Mode" feature.
    JetNoteNative.openToolWithFallback(
      tool.url,
      tool.fallbackUrl,
      title,
      tool.fallbackTitle || 'Baidu',
      (window.JetNoteNative?.getUiLanguageCode?.() || document.documentElement.lang || 'en'),
      background,
      borderColor,
      currentToolsConfig?.networkProbeTimeoutMs || 3500
    );
    return;
  }


  if (window.JetNoteNative?.openTool) {
    JetNoteNative.openTool(tool.url, title, (window.JetNoteNative?.getUiLanguageCode?.() || document.documentElement.lang || 'en'), background, borderColor);
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

  button.innerHTML = toolIcon(tool.icon);

  // Keep the composer focused while a tool is tapped. Blurring the textarea on
  // pointerdown makes Android resize the WebView as the IME closes; that layout
  // change can cancel/retarget the following click, so the first tap only hides
  // the keyboard. Preventing the button's focus default preserves the IME and
  // lets the same gesture reach the tool's click handler.
  button.addEventListener('pointerdown', event => {
    captureToolKeyboardState();
    event.preventDefault();
  });

  if (isToolboxTrigger) {
    button.dataset.collapsedIcon = tool.icon || 'tools';
    button.setAttribute('aria-expanded', String(toolboxExpanded));
  }
  if (tool.action === 'video') button.dataset.addVideo = 'post';
  if (tool.action === 'sound') button.dataset.addAudio = 'post';

  button.addEventListener('click', () => {
    const run = ToolActions.run(tool);
    Promise.resolve(run);
  });
  return button;
}

function renderTools({ animate = false } = {}) {
  const toolsElement = document.getElementById('postEditorTools');
  if (!toolsElement || !currentToolsConfig) return;

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

window.addEventListener('jetnote:editor-resume', () => {
  requestAnimationFrame(() => requestAnimationFrame(enforceToolKeyboardState));
});

registerBuiltInToolActions();
window.initializeTools = initializeTools;
window.reloadTools = reloadTools;
window.closeToolbox = closeToolbox;
window.openToolboxToolById = openToolboxToolById;
void initializeTools();
