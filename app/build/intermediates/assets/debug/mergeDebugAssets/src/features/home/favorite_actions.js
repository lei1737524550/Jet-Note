async function commitStarStateChange(previous, postMovementActionName, activePostId, direct = false) {
  const archivedPost = posts.find(post => String(post.id) === String(activePostId));
  if (archivedPost?.archived) {
    const saved = await savePosts();
    if (!saved) replacePosts(previous);
    renderPosts();
    renderArchive();
    syncPostStarAction();
    if (!direct) closePostActionPanel();
    return saved;
  }
  const topology = window.JetNoteFlipTopology?.classify(previous, posts, postMovementActionName)
    || {kind:'normal', crossIds:[]};
  const isCrossSurfaceSuperAction = topology.kind === 'super_two_body' || topology.kind === 'super_three_body';
  // Prepare compositor ownership BEFORE FIRST measurement.  Preparation is allowed
  // to consume a frame; LAST render is not.  Once FIRST is captured, LAST render,
  // LAST read and INVERT write stay in one uninterrupted JS task.
  postMovementTransaction.token += 1;
  setPostMovementTransactionPhase('prepare', postMovementActionName, activePostId);
  let releaseLayerPreparation = () => {};
  if (topology.kind === 'super_two_body' && window.JetNoteSuperStarTwoBodyFlip?.prepare) {
    releaseLayerPreparation = await window.JetNoteSuperStarTwoBodyFlip.prepare(collectPostMovementCards());
  }
  await window.JetNoteVideoFrames?.capture();
  setPostMovementTransactionPhase('first-read');
  // Three-body is the validated v7 reference: preserve its capture-all behavior.
  // Two-body captures ONLY its single crossing body; the remaining list stays real DOM.
  const proxyIds = topology.kind === 'super_two_body' ? new Set(topology.crossIds.map(String)) : null;
  const snapshot = capturePostMovementSnapshot(activePostId, isCrossSurfaceSuperAction, proxyIds);
  syncPostStarAction();

  const display = effectiveHomeDisplay();
  const beforeMainIds = orderedMainPosts(previous, display).map(post => String(post.id));
  const afterMainIds = orderedMainPosts(posts, display).map(post => String(post.id));
  const sameMainGeometry = beforeMainIds.length === afterMainIds.length
    && beforeMainIds.every((id, index) => id === afterMainIds[index]);

  if (sameMainGeometry) {
    const postById = new Map(posts.map(post => [String(post.id), post]));
    // No list slot changed. Rebuilding innerHTML here used to briefly remove the
    // Post and expose the frame/background underneath, even though no movement
    // was required. Update only state-dependent paint on the existing cards.
    document.querySelectorAll('#mainPosts article.post[data-post-id]').forEach(card => {
      const post = postById.get(String(card.dataset.postId));
      if (!post) return;
      const state = getPostStarState(post);
      card.classList.toggle('post-state-star', state === 'star');
      card.classList.toggle('post-state-not-star', state !== 'star');
      card.setAttribute('style', postVisualStyle(state));

    });
    syncPublishedPostFavoriteBadges();
    fitPublishedPostRows();
    // No viewport correction: a Post state change must never move the page scroll position.
  } else {
    // Disable Chromium scroll anchoring BEFORE rebuilding the list. Otherwise WebView
    // may silently shift the viewport between FIRST and LAST when nodes move above
    // the viewport. That viewport movement can be painted before FLIP applies its inverse.
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflowAnchor = html.style.overflowAnchor;
    const previousBodyOverflowAnchor = body?.style.overflowAnchor || '';
    html.style.overflowAnchor = 'none';
    if (body) body.style.overflowAnchor = 'none';
    // Android's TextureView is outside WebView composition. Freeze it BEFORE the
    // DOM rebuild; otherwise a Video Post can visibly lag/jump while its HTML body FLIPs.
    try { window.__jetBeginPostMovementVideoFreeze?.(); } catch (_) {}
    // Freeze geometry synchronously and start the reorder immediately.
    // Do not insert artificial paint-frame waits before Star/Super-Star movement.
    try {
      // Rebuild only when the list really reorders. Post Movement never reads,
      // stores or writes the user's camera position.
      setPostMovementTransactionPhase('last-write');
      renderPosts({scheduleFit: false, preserveComposer: true, stabilizePostText: true});
      // This read intentionally forces the real LAST layout synchronously.  There
      // must be no await/rAF/timer between LAST write and animatePostMovement(),
      // whose synchronous prefix immediately writes every INVERT transform.
      setPostMovementTransactionPhase('last-read');
      await animatePostMovement(snapshot, postMovementActionName, activePostId, 900);
      await nextAnimationFrame();
      await waitForPostMovementVisualSettle(activePostId);
    } finally {
      try { window.__jetEndPostMovementVideoFreeze?.(); } catch (_) {}
      html.style.overflowAnchor = previousHtmlOverflowAnchor;
      if (body) body.style.overflowAnchor = previousBodyOverflowAnchor;
    }
  }

  syncPublishedPostFavoriteBadges();
  if (sameMainGeometry) await waitForPostMovementVisualSettle(activePostId);
  releaseLayerPreparation();
  setPostMovementTransactionPhase('idle');

  // The menu belongs visually to the acted-on Post. Keep it attached for the
  // complete movement, then leave the final state visible for the configured delay before
  // dismissing it. Scheduling here (rather than at pointer-up) makes the delay
  // relative to the actual end of reflow for star, super-star and both cancels.
  if (!direct) {
    syncPostActionPanelToPost(activePostId);
    await holdHorizontalEllipsisMenuAfterPostMovement(activePostId);
  }

  const saved = await savePosts();
  if (!saved) {
    replacePosts(previous);
    renderPosts();
    syncPostStarAction();
    return false;
  }
  return true;
}

async function toggleStarActivePost(postId = activePostActionId, direct = false) {
  if (!isWorkspaceWritable() || postId === null || postMovementTransactionActive) return;
  const actionPostId = String(postId);
  const post = posts.find(item => String(item.id) === actionPostId);
  if (!post) return;

  const previous = structuredClone(posts);
  const change = JetNotePostRules.changeStar(posts, actionPostId, 'toggle', new Date().toISOString());
  replacePosts(change.posts);
  const nextState = change.state;
  if (nextState === 'star') restartThreePostOneBodyStateBorderRule('star');

  // Sound is direct interaction feedback: start it before persistence/render work.
  playPostUiSound(nextState === 'star' ? 'star' : 'cancel_star');

  // Keep the action surface visible after the state changes so the user can
  // perceive the result. The delay is a home-post setting in config.json.
  postMovementTransactionActive = true;
  let saved = false;
  try {
    saved = await commitStarStateChange(
      previous,
      change.movement,
      actionPostId,
      direct
    );
  } finally {
    postMovementTransactionActive = false;
  }
  if (!saved) return;
}

async function toggleSuperStarActivePost() {
  if (!isWorkspaceWritable() || activePostActionId === null || postMovementTransactionActive) return;
  const actionPostId = String(activePostActionId);
  const post = posts.find(item => String(item.id) === actionPostId);
  if (!post) return;

  const previous = structuredClone(posts);
  const change = JetNotePostRules.changeStar(posts, actionPostId, 'super_star', new Date().toISOString());
  replacePosts(change.posts);
  restartThreePostOneBodyStateBorderRule('super_star');

  playPostUiSound('super_star');
  postMovementTransactionActive = true;
  let saved = false;
  try {
    saved = await commitStarStateChange(
      previous,
      'super_star',
      actionPostId
    );
  } finally {
    postMovementTransactionActive = false;
  }
  if (!saved) return;

  // Super Star completion has no camera ownership; the user's live position remains.
}


function cancelPostFavorite(event, postId) {
  event.preventDefault();
  event.stopPropagation();
  const post = posts.find(item => String(item.id) === String(postId));
  if (!post || getPostStarState(post) === 'none') return;
  void toggleStarActivePost(postId, true);
}
