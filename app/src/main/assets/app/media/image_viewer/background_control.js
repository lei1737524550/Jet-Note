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
    viewer.style.background = colors[normalizeIndex()];
  }

  function reset() {
    const viewer = document.getElementById('imageViewer');
    const button = document.getElementById('imageViewerBackgroundSwitch');
    if (viewer) viewer.style.removeProperty('background');
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
