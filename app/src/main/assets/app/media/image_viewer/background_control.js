(function () {
  'use strict';

  let backgroundIndex = 0;

  function configuration() {
    return window.JetNoteImageViewerConfiguration?.state || { backgroundColorCycle: [], defaultBackgroundColorIndex: 0 };
  }

  function normalizeIndex() {
    const colors = configuration().backgroundColorCycle || [];
    if (!colors.length) return 0;
    backgroundIndex = ((backgroundIndex % colors.length) + colors.length) % colors.length;
    return backgroundIndex;
  }

  function initialize() {
    const config = configuration();
    const colors = config.backgroundColorCycle || [];
    backgroundIndex = colors.length ? Number(config.defaultBackgroundColorIndex || 0) % colors.length : 0;
  }

  function apply() {
    const viewer = document.getElementById('imageViewer');
    const image = document.getElementById('imageViewerImg');
    const button = document.getElementById('imageViewerBackgroundSwitch');
    const colors = configuration().backgroundColorCycle || [];
    const imageActive = !!image?.classList.contains('active');
    if (button) button.classList.toggle('is-hidden', !imageActive || colors.length < 2);
    if (!viewer || !imageActive || !colors.length) return;
    const background = colors[normalizeIndex()];
    viewer.style.background = background;

    // Keep both upper-right controls visible throughout the background cycle.
    // Do not use mix-blend-mode:difference: on a mid-gray background (#808080),
    // white difference-blends to nearly the same gray and appears to vanish.
    const probe = document.createElement('span');
    probe.style.color = String(background);
    probe.style.display = 'none';
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    const match = resolved.match(/rgba?\(\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)/i);
    let controlColor = '#ffffff';
    if (match) {
      const r = Number(match[1]), g = Number(match[2]), b = Number(match[3]);
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      controlColor = luminance >= 180 ? '#000000' : '#ffffff';
    }
    viewer.style.setProperty('--image-viewer-control-color', controlColor);
  }

  function reset() {
    const viewer = document.getElementById('imageViewer');
    const button = document.getElementById('imageViewerBackgroundSwitch');
    if (viewer) { viewer.style.removeProperty('background'); viewer.style.removeProperty('--image-viewer-control-color'); }
    if (button) button.classList.add('is-hidden');
  }

  function cycle(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const colors = configuration().backgroundColorCycle || [];
    const image = document.getElementById('imageViewerImg');
    if (!image?.classList.contains('active') || colors.length < 2) return;
    backgroundIndex = (normalizeIndex() + 1) % colors.length;
    apply();
  }

  function install() {
    initialize();
    const button = document.getElementById('imageViewerBackgroundSwitch');
    if (!button) return;
    const label = window.JetNoteLanguage?.text?.('imageViewerSwitchBackground', null, '')
      || window.JET_NOTE_VIEWER_STRINGS?.switchBackground || '';
    if (label) button.setAttribute('aria-label', String(label));
    button.addEventListener('pointerdown', event => event.stopPropagation());
    button.addEventListener('click', cycle);
    button.addEventListener('contextmenu', event => event.preventDefault());
    apply();
  }

  window.JetNoteImageViewerBackgroundControl = Object.freeze({ install, apply, reset, cycle, initialize });
})();
