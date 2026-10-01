(function (global) {
  'use strict';

  function starState(post) {
    if (!post) {
      return '';
    }

    if (typeof global.getPostStarState === 'function') {
      return global.getPostStarState(post);
    }

    return String(post.star_state || post.starState || '');
  }

  function superIds(list) {
    return (Array.isArray(list) ? list : [])
      .filter(post => starState(post) === 'super_star')
      .map(post => String(post.id));
  }

  function classify(previous, current, actionName) {
    if (
      actionName !== 'super_star' &&
      actionName !== 'cancel_super_star'
    ) {
      return {
        kind: 'normal',
        crossIds: []
      };
    }

    const before = superIds(previous);
    const after = superIds(current);

    const crossIds = Array.from(
      new Set(
        before
          .concat(after)
          .filter(id => before.includes(id) !== after.includes(id))
      )
    );

    if (crossIds.length >= 2) {
      return {
        kind: 'super_three_body',
        crossIds
      };
    }

    return {
      kind: 'super_two_body',
      crossIds
    };
  }

  global.JetNoteFlipTopology = {
    classify
  };
})(window);