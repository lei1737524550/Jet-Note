(function () {
  'use strict';

  async function fetchFragment(path) {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Failed to load HTML fragment: ${path} (${response.status})`);
    }
    return response.text();
  }

  async function mountFragments(targetId, paths) {
    const target = document.getElementById(targetId);
    if (!target) throw new Error(`Missing fragment mount point: #${targetId}`);

    const htmlParts = await Promise.all(paths.map(fetchFragment));
    target.insertAdjacentHTML('beforeend', htmlParts.join('\n'));
    target.removeAttribute('hidden');
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.body.appendChild(script);
    });
  }

  async function loadScripts(sources) {
    // Preserve the original script order because the current codebase uses
    // classic globals shared across files.
    for (const src of sources) {
      await loadScript(src);
    }
  }

  async function mountAll(config) {
    await Promise.all([
      mountFragments(config.pageMount, config.pages || []),
      mountFragments(config.overlayMount, config.components || [])
    ]);
  }

  window.JetNoteViewLoader = Object.freeze({
    mountAll,
    loadScripts
  });
})();
