/**
 * New/Edit Post tools renderer.
 *
 * Canonical model:
 *   tools = [tool_1, tool_2, tool_3, tool_m1]
 *   tool_m1 is the Toolbox anchor.
 *
 * Expanded Toolbox behavior:
 *   child 1 occupies anchor - 1,
 *   child 2 occupies anchor - 2,
 *   ...
 *
 * Expansion therefore grows leftward and temporarily replaces
 * primary tool slots. The canonical tools[] array is never mutated.
 */

let toolboxUnfoldAnimationPromise = null;
let currentToolsConfig = null;
let toolboxExpanded = false;
let toolKeyboardSnapshot = null;


/* =========================================================
   Keyboard / Caret State
   ========================================================= */

function captureToolKeyboardState() {
  const textarea =
    document.getElementById('postComposerText');

  toolKeyboardSnapshot = {
    textareaFocused:
      document.activeElement === textarea,

    selectionStart:
      textarea?.selectionStart ?? 0,

    selectionEnd:
      textarea?.selectionEnd ?? 0
  };

  return toolKeyboardSnapshot;
}


function enforceToolKeyboardState() {
  const snapshot = toolKeyboardSnapshot;

  toolKeyboardSnapshot = null;

  if (!snapshot) {
    return;
  }

  const textarea =
    document.getElementById('postComposerText');

  if (!textarea) {
    return;
  }

  try {
    textarea.setSelectionRange(
      snapshot.selectionStart,
      snapshot.selectionEnd
    );
  } catch (_) {}

  /*
   * Never manufacture focus for a tool click.
   *
   * If the user manually hid the IME while the textarea retained
   * DOM focus, leaving that focus untouched preserves the caret
   * without reopening the keyboard.
   */
  if (
    !snapshot.textareaFocused &&
    document.activeElement === textarea
  ) {
    textarea.blur();
  }
}


/* =========================================================
   Tool Presentation
   ========================================================= */

function toolIcon(name) {
  const files = {
    video: 'tool_video.svg',
    photo: 'tool_photo.svg',
    sound: 'tool_sound.svg',
    tools: 'toolbox.svg',
    dictionary: 'dictionary.svg',
    sentence: 'sentences.svg'
  };

  const file =
    files[name] || files.tools;

  return (
    `<img src="src/shared/icons/${file}" ` +
    'alt="" aria-hidden="true">'
  );
}


function toolLabel(tool) {
  if (tool.labelKey) {
    return t(tool.labelKey);
  }

  return tool.label || tool.id;
}


function currentUiLanguage() {
  return (
    window.JetNoteNative
      ?.getUiLanguageCode?.() ||
    document.documentElement.lang ||
    'en'
  );
}


/* =========================================================
   Built-in Actions
   ========================================================= */

function registerBuiltInToolActions() {
  ToolActions.register(
    'video',
    () => pickPostVideos()
  );

  ToolActions.register(
    'photo',
    () => pickPostImages()
  );

  ToolActions.register(
    'sound',
    () => pickEntryAudio('post')
  );
}


/* =========================================================
   Tool Buttons
   ========================================================= */

function createToolButton(tool) {
  const button =
    document.createElement('button');

  const isToolboxTrigger =
    tool.type === 'toolbox' ||
    tool.action === 'toolbox';

  const isToolboxChild =
    tool.type === 'toolbox_tool';


  button.type = 'button';
  button.id = tool.id;

  button.className = [
    'tool',
    'common_border',

    isToolboxChild
      ? 'toolbox_tool'
      : '',

    isToolboxTrigger
      ? 'toolbox-trigger'
      : ''
  ]
    .filter(Boolean)
    .join(' ');


  button.dataset.toolId =
    tool.id;

  button.dataset.toolType =
    tool.type || 'tool';

  button.dataset.toolAction =
    tool.action || '';


  const label =
    toolLabel(tool);

  button.title = label;

  button.setAttribute(
    'aria-label',
    label
  );

  button.innerHTML =
    toolIcon(tool.icon);


  /*
   * Keep the composer focused while a tool is tapped.
   *
   * Allowing the button to receive focus on pointerdown can blur
   * the textarea and close the Android IME. The resulting WebView
   * resize can cancel or retarget the following click, making the
   * first tap appear to only hide the keyboard.
   */
  button.addEventListener(
    'pointerdown',
    event => {
      captureToolKeyboardState();
      event.preventDefault();
    }
  );


  if (isToolboxTrigger) {
    button.dataset.collapsedIcon =
      tool.icon || 'tools';

    button.setAttribute(
      'aria-expanded',
      String(toolboxExpanded)
    );
  }


  if (tool.action === 'video') {
    button.dataset.addVideo = 'post';
  }

  if (tool.action === 'sound') {
    button.dataset.addAudio = 'post';
  }


  button.addEventListener(
    'click',
    () => {
      try {
        const result =
          ToolActions.run(tool);

        if (
          result &&
          typeof result.then === 'function'
        ) {
          result.catch(error => {
            console.error(
              `Jet Note: tool action failed (${tool.id})`,
              error
            );
          });
        }
      } catch (error) {
        console.error(
          `Jet Note: tool action failed (${tool.id})`,
          error
        );
      }
    }
  );


  return button;
}


/* =========================================================
   Rendering
   ========================================================= */

function renderTools({
  animate = false
} = {}) {
  const toolsElement =
    document.getElementById(
      'postEditorTools'
    );

  if (
    !toolsElement ||
    !currentToolsConfig
  ) {
    return;
  }


  const visibleTools =
    ToolLoader.buildVisibleTools(
      currentToolsConfig,
      toolboxExpanded
    );

  const buttons =
    visibleTools.map(
      createToolButton
    );

  toolsElement.replaceChildren(
    ...buttons
  );


  toolsElement.dataset.toolCount =
    String(
      visibleTools.length
    );

  toolsElement.dataset.maximumVisibleTools =
    String(
      currentToolsConfig
        .maximumVisibleTools
    );

  toolsElement.dataset.toolboxExpanded =
    String(
      toolboxExpanded
    );


  /*
   * Reserve geometry for the configured maximum so layouts
   * remain stable when primary tools are added later.
   */
  const max =
    Number(
      currentToolsConfig
        .maximumVisibleTools
    ) || 0;

  const maxRowWidth =
    max > 0
      ? max * 48 +
        (max - 1) * 8
      : 0;

  toolsElement.style.setProperty(
    '--tools-maximum-row-width',
    `${maxRowWidth}px`
  );


  const trigger =
    toolsElement.querySelector(
      '.toolbox-trigger'
    );

  if (trigger) {
    trigger.setAttribute(
      'aria-expanded',
      String(toolboxExpanded)
    );

    if (
      toolboxExpanded &&
      currentToolsConfig
        .toolbox
        ?.unfoldIcon
    ) {
      const image =
        document.createElement('img');

      image.className =
        'toolbox-unfold-icon';

      image.src =
        currentToolsConfig
          .toolbox
          .unfoldIcon;

      image.alt = '';

      image.setAttribute(
        'aria-hidden',
        'true'
      );

      trigger.replaceChildren(
        image
      );
    } else {
      trigger.innerHTML =
        toolIcon(
          trigger.dataset
            .collapsedIcon ||
          'tools'
        );
    }
  }


  EditorController
    .setToolsExpanded(
      toolboxExpanded
    );


  if (!animate) {
    return;
  }


  const changed = [
    ...toolsElement
      .querySelectorAll(
        '.toolbox_tool'
      )
  ];

  void loadToolboxUnfoldAnimation()
    .then(animation => {
      animation?.apply?.({
        expanded:
          toolboxExpanded,

        buttons:
          changed
      });
    });
}


/* =========================================================
   Toolbox
   ========================================================= */

async function openToolboxToolById(){ return false; }


function setToolboxExpanded(
  expanded,
  skipAnimation = false
) {
  const composer =
    document.getElementById(
      'postComposeScreen'
    );

  const nextExpanded =
    Boolean(expanded);

  if (
    nextExpanded &&
    !composer?.classList.contains(
      'open'
    )
  ) {
    return;
  }

  if (
    toolboxExpanded ===
    nextExpanded
  ) {
    return;
  }

  toolboxExpanded =
    nextExpanded;

  renderTools({
    animate: !skipAnimation
  });
}


function toggleToolbox() {
  const composer =
    document.getElementById(
      'postComposeScreen'
    );

  if (
    !composer?.classList.contains(
      'open'
    )
  ) {
    return;
  }

  setToolboxExpanded(
    !toolboxExpanded
  );
}


function closeToolbox() {
  setToolboxExpanded(
    false,
    true
  );
}


/* =========================================================
   Toolbox Animation
   ========================================================= */

function loadToolboxUnfoldAnimation() {
  if (
    toolboxUnfoldAnimationPromise
  ) {
    return toolboxUnfoldAnimationPromise;
  }

  const src =
    currentToolsConfig
      ?.toolbox
      ?.unfoldAnimation;

  if (!src) {
    return Promise.resolve(
      null
    );
  }


  toolboxUnfoldAnimationPromise =
    new Promise(resolve => {
      const script =
        document.createElement(
          'script'
        );

      script.src = src;

      script.onload = () => {
        resolve(
          window
            .JetNoteToolboxUnfoldAnimation ||
          null
        );
      };

      script.onerror = () => {
        resolve(null);
      };

      document.head.appendChild(
        script
      );
    });


  return toolboxUnfoldAnimationPromise;
}


/* =========================================================
   Initialization / Reload
   ========================================================= */

async function initializeTools() {
  const toolsElement =
    document.getElementById(
      'postEditorTools'
    );

  if (!toolsElement) {
    return;
  }


  try {
    currentToolsConfig =
      await ToolLoader.load();

    toolboxExpanded =
      false;

    toolsElement.removeAttribute(
      'data-render-error'
    );

    renderTools();
  } catch (error) {
    toolsElement.dataset.renderError =
      String(
        error?.message ||
        error
      );

    console.error(
      'Jet Note: tools renderer failed',
      error
    );
  }
}


async function reloadTools() {
  ToolLoader.clear();

  toolboxUnfoldAnimationPromise =
    null;

  await initializeTools();
}


/* =========================================================
   Editor Resume
   ========================================================= */

window.addEventListener(
  'jetnote:editor-resume',
  () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(
        enforceToolKeyboardState
      );
    });
  }
);


/* =========================================================
   Startup / Public API
   ========================================================= */

registerBuiltInToolActions();

window.initializeTools =
  initializeTools;

window.reloadTools =
  reloadTools;

window.closeToolbox =
  closeToolbox;

window.openToolboxToolById =
  openToolboxToolById;

void initializeTools();