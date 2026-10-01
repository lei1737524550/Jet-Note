(function (global) {
  'use strict';

  // Prepare compositor ownership one frame before DOM mutation.
  // This module does not animate; posts.js remains the proven
  // real-node FLIP engine.
  async function prepare(cards) {
    const saved = [];

    for (const item of cards || []) {
      const element = item.card;

      if (!element) {
        continue;
      }

      saved.push([
        element,
        element.style.willChange
      ]);

      element.style.willChange = 'transform';

      // Force layout so the compositor hint takes effect
      // before the following animation frame.
      element.getBoundingClientRect();
    }

    await new Promise(resolve => {
      requestAnimationFrame(resolve);
    });

    return () => {
      for (const [element, value] of saved) {
        if (element?.isConnected) {
          element.style.willChange = value;
        }
      }
    };
  }

  global.JetNoteNormalStarFlip = {
    prepare
  };
})(window);