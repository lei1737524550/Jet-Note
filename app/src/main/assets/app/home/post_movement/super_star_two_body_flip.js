(function (global) {
  'use strict';
  // Two-body rule: exactly one Top<->Main body may own a paint proxy. The
  // remaining Main body MUST stay on real DOM and use the same strict FLIP path
  // as Body C of the already-proven three-body transaction.
  async function prepare(cards) {
    const saved = [];
    for (const item of cards || []) {
      const el = item.card;
      if (!el) continue;
      saved.push([el, el.style.willChange]);
      el.style.willChange = 'transform';
    }
    // Preparation must not stall the interaction for an extra painted frame.
    // FIRST measurement in posts.js provides the required synchronous layout read.
    return () => { for (const [el, value] of saved) if (el?.isConnected) el.style.willChange = value; };
  }
  global.JetNoteSuperStarTwoBodyFlip = { prepare };
})(window);
