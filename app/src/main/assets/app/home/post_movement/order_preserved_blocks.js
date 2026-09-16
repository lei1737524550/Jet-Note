(function (global) {
  'use strict';

  // Partition two finite identity sequences into maximal contiguous blocks that
  // preserve their internal order in BOTH sequences. This is the topology layer
  // between Jet Note sorting and geometric FLIP movement.
  function find(beforeSequence, afterSequence) {
    const before = Array.from(beforeSequence || [], String);
    const after = Array.from(afterSequence || [], String);
    const m = before.length, n = after.length;
    const dp = Array.from({length:m + 1}, () => new Uint16Array(n + 1));

    for (let i = 1; i <= m; i += 1) {
      for (let j = 1; j <= n; j += 1) {
        dp[i][j] = before[i - 1] === after[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }

    const pairs = [];
    let i = m, j = n;
    while (i > 0 && j > 0) {
      if (before[i - 1] === after[j - 1]) {
        pairs.push([i - 1, j - 1]); i -= 1; j -= 1;
      } else if (dp[i - 1][j] >= dp[i][j - 1]) i -= 1;
      else j -= 1;
    }
    pairs.reverse();

    const blocks = [];
    for (const pair of pairs) {
      const last = blocks[blocks.length - 1];
      if (last && pair[0] === last.endBefore + 1 && pair[1] === last.endAfter + 1) {
        last.endBefore = pair[0]; last.endAfter = pair[1];
        last.items.push(before[pair[0]]);
      } else {
        blocks.push({
          startBefore: pair[0], endBefore: pair[0],
          startAfter: pair[1], endAfter: pair[1],
          items: [before[pair[0]]]
        });
      }
    }
    for (const block of blocks) block.length = block.items.length;
    return blocks;
  }

  function membership(beforeSequence, afterSequence) {
    const map = new Map();
    find(beforeSequence, afterSequence).forEach((block, blockIndex) => {
      block.items.forEach(id => map.set(String(id), blockIndex));
    });
    return map;
  }

  global.JetNoteOrderPreservedBlocks = { find, membership };
})(window);
