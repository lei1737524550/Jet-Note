(function (global) {
  'use strict';
  // Prepare compositor ownership one frame before DOM mutation. This module does
  // not animate; posts.js remains the proven real-node FLIP engine.
  async function prepare(cards) {
    const saved = [];
    for (const item of cards || []) {
      const el = item.card;
      if (!el) continue;
      saved.push([el, el.style.willChange]);
      el.style.willChange = 'transform';
      el.getBoundingClientRect();
    }
    await new Promise(r => requestAnimationFrame(() => r()));
    return () => { for (const [el, value] of saved) if (el?.isConnected) el.style.willChange = value; };
  }
  global.JetNoteNormalStarFlip = { prepare };
})(window);
