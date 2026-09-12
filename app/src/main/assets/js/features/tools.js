let toolConfigPromise = null;
let toolUnfoldAnimationPromise = null;

function loadToolConfig() {
  if (!toolConfigPromise) {
    toolConfigPromise = fetch('config.json', { cache: 'no-store' }).then(response => {
      if (!response.ok) throw new Error(`Tool config unavailable: ${response.status}`);
      return response.json();
    });
  }
  return toolConfigPromise;
}

function toolIcon(name) {
  const paths = {
    video: '<rect x="3" y="5" width="13" height="14" rx="3"/><path d="m16 10 5-3v10l-5-3z"/>',
    photo: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m4 17 5-5 4 4 3-3 5 5"/>',
    sound: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    tools: '<path d="M8 7V5.8C8 4.8 8.8 4 9.8 4h4.4C15.2 4 16 4.8 16 5.8V7"/><rect x="3" y="7" width="18" height="13" rx="3"/><path d="M3 12.5h18M9.5 12.5v2h5v-2"/>',
    dictionary: '<path d="M12 5Q7 2.5 3 4.5V20q4-2 9 1 5-3 9-1V4.5Q17 2.5 12 5v16"/>',
    sentence: '<path d="M4 5h16v12H9l-5 4V5Z"/><path d="M8 9h8M8 13h5"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.tools}</svg>`;
}

function resolvePostToolReference(config, reference) {
  const match = typeof reference === 'string' && reference.match(/^([a-zA-Z0-9_]+)\[(\d+)]$/);
  return match ? config[match[1]]?.[Number(match[2])] : reference;
}
function postToolDefinition(config, id) { return config.post_tool_definitions?.[id] || config[id]; }
function postToolLabel(definition, id) { return definition?.labelKey ? t(definition.labelKey) : id; }

function createPostTool(config, position) {
  const id = resolvePostToolReference(config, config[`edit_post_tool_${position}`]);
  const definition = postToolDefinition(config, id);
  if (!id || !definition) throw new Error(`Invalid edit_post_tool_${position}: ${String(id)}`);
  const button = document.createElement('button');
  const isChild = position >= 5;
  const isToolbox = definition.action === 'tools';
  button.type = 'button';
  button.className = `compose-add-image common_border${isChild ? ' compose-tool-choice' : ''}${isToolbox ? ' compose-open-tools' : ''}`;
  button.dataset.postTool = id;
  button.title = postToolLabel(definition, id);
  button.setAttribute('aria-label', button.title);
  button.innerHTML = toolIcon(definition.icon);
  if (isChild) button.hidden = true;
  if (isToolbox) {
    button.dataset.collapsedIcon = definition.icon || 'tools';
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', togglePostTools);
  } else if (definition.action === 'video') { button.dataset.addVideo = 'post'; button.addEventListener('click', pickPostVideos); }
  else if (definition.action === 'photo') button.addEventListener('click', pickPostImages);
  else if (definition.action === 'sound') {
    // Kept as an explicit capability marker for audio loading state.  The
    // publish flow must never depend on a label or on static toolbar markup.
    button.dataset.addAudio = 'post';
    button.addEventListener('click', () => pickEntryAudio('post'));
  }
  else if (typeof definition.url === 'string') button.addEventListener('click', () => openConfiguredTool(id));
  else throw new Error(`Unsupported post tool: ${id}`);
  return button;
}

async function initializePostComposerTools() {
  const toolbar = document.getElementById('postComposerToolbar');
  if (!toolbar) return;
  try {
    const config = await loadToolConfig();
    const buttons = Array.from({ length: 6 }, (_, index) => createPostTool(config, index + 1));
    toolbar.replaceChildren(...buttons);
    toolbar.removeAttribute('data-render-error');
    await setPostToolsExpanded(false, true, config);
  } catch (error) {
    toolbar.dataset.renderError = String(error?.message || error);
    console.error('Jet Note: Edit Post tool renderer failed', error);
  }
}

function loadConfiguredUnfoldAnimation(config) {
  if (toolUnfoldAnimationPromise) return toolUnfoldAnimationPromise;
  toolUnfoldAnimationPromise = new Promise(resolve => {
    const script = document.createElement('script');
    script.src = config.tools_unfold_anim;
    script.onload = () => resolve(window.JetNoteToolUnfoldAnimation || null);
    script.onerror = () => { console.error(`Tool unfold animation unavailable: ${config.tools_unfold_anim}`); resolve(null); };
    document.head.appendChild(script);
  });
  return toolUnfoldAnimationPromise;
}

async function setPostToolsExpanded(expanded, skipAnimation = false, suppliedConfig = null) {
  const toolbar = document.getElementById('postComposerToolbar');
  if (!toolbar) return;
  const config = suppliedConfig || await loadToolConfig();
  const trigger = toolbar.querySelector('.compose-open-tools');
  const children = [...toolbar.querySelectorAll('.compose-tool-choice')];
  if (!trigger) return;
  trigger.setAttribute('aria-expanded', String(expanded));
  trigger.innerHTML = expanded
    ? `<img class="compose-tool-unfold-icon" src="${config.tools_unfold_icon}" alt="">`
    : toolIcon(trigger.dataset.collapsedIcon || 'tools');
  children.forEach(button => { button.hidden = !expanded; });
  EditorController.setToolsExpanded(expanded);
  if (!skipAnimation) (await loadConfiguredUnfoldAnimation(config))?.apply?.({ expanded, buttons: children });
}

function togglePostTools() {
  const composer = document.getElementById('postComposeScreen');
  if (!composer?.classList.contains('open')) return;
  const trigger = composer.querySelector('.compose-open-tools');
  setPostToolsExpanded(trigger?.getAttribute('aria-expanded') !== 'true');
}
function closePostToolChoices() { setPostToolsExpanded(false, true); }

async function openConfiguredTool(id) {
  const definition = (await loadToolConfig())[id];
  if (!definition?.url?.startsWith('https://')) throw new Error(`Invalid configured post tool: ${id}`);
  await EditorController.suspend(id);
  document.activeElement?.blur?.();
  const title = postToolLabel(definition, id);
  if (window.JetNoteNative?.openTool) JetNoteNative.openTool(definition.url, title, 'en');
  else window.open(definition.url, '_blank', 'noopener');
}

window.initializePostComposerTools = initializePostComposerTools;
initializePostComposerTools();
