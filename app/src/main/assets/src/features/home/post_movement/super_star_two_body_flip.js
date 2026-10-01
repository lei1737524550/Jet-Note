(function (global) {
  'use strict';

  // Two-body rule:
  //
  // Exactly one Top <-> Main body may own a paint proxy.
  // The remaining Main body MUST stay on the real DOM and use the same
  // strict FLIP path as Body C of the already-proven three-body transaction.
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
    }

    // Preparation must not stall the interaction for an extra painted frame.
    // FIRST measurement in posts.js provides the required synchronous
    // layout read.
    return () => {
      for (const [element, value] of saved) {
        if (element?.isConnected) {
          element.style.willChange = value;
        }
      }
    };
  }

  global.JetNoteSuperStarTwoBodyFlip = {
    prepare
  };
})(window);