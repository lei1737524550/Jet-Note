let postMovementTransactionActive = false;
let postMovementProbeAction = null;
// Zero-flash FLIP transaction phase.  This is deliberately separate from the
// business star state: only one geometry transaction may own the render tree.
const postMovementTransaction = { state: 'idle', action: null, postId: null, token: 0 };
function setPostMovementTransactionPhase(state, action = null, postId = null) {
  postMovementTransaction.state = state;
  if (action !== null) postMovementTransaction.action = action;
  if (postId !== null) postMovementTransaction.postId = String(postId);
  document.documentElement.dataset.postFlipPhase = state;
}

function nextAnimationFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve));
}

async function waitForPostMovementVisualSettle(postId) {
  // "Movement ended" means not merely transitionend: compositor settling can
  // still change the screen-space position on following frames.
  // Require three consecutive stable painted frames before starting the 300 ms hold.
  let stableFrames = 0;
  let previous = null;
  for (let frame = 0; frame < 30 && stableFrames < 3; frame += 1) {
    await nextAnimationFrame();
    syncPostActionPanelToPost(postId);
    const id = postId == null ? null : String(postId);
    const card = id == null ? null : collectPostMovementCards().find(item => item.id === id)?.card;
    const rect = card?.getBoundingClientRect();
    // Camera movement belongs to the user and is deliberately excluded from the
    // Post visual-settle test. Scrolling during PLAY must not trigger correction.
    const current = rect ? [rect.left, rect.top, rect.right, rect.bottom] : [];
    const stable = previous && current.length === previous.length && current.every((v, i) => Math.abs(v - previous[i]) < 0.5);
    stableFrames = stable ? stableFrames + 1 : 0;
    previous = current;
  }
  syncPostActionPanelToPost(postId);
}

async function warmPostMovementFrames(durationMs = 300) {
  const started = performance.now();
  while (performance.now() - started < durationMs) await nextAnimationFrame();
}

function collectPostMovementCards() {
  const cards = [];
  document.querySelectorAll('#mainPosts article.post[data-post-id]').forEach(card => {
    cards.push({id: String(card.dataset.postId), card, index: cards.length, surface: 'main'});
  });
  const topCard = document.getElementById('topPostCard');
  const topPost = topCard?.querySelector('article.post[data-post-role="top"][data-post-id]');
  if (topPost) {
    cards.push({id: String(topPost.dataset.postId), card: topPost, index: -1, surface: 'top'});
  }
  return cards;
}

function capturePostMovementSnapshot(activePostId = null, captureCrossSurfaceGroup = false, crossSurfaceIds = null) {
  const rects = new Map();
  const indexes = new Map();
  const surfaces = new Map();
  const crossSurfaceProxies = new Map();
  const items = collectPostMovementCards();

  // FIRST is one atomic snapshot of the WHOLE transaction, not just the clicked Post.
  // This matters for Super Star: one transaction can contain three simultaneous bodies:
  //   A) previous Super Star: Top -> Main,
  //   B) clicked Post: Main -> Top,
  //   C) every remaining Main Post: Main slot -> Main slot.
  // All three must share exactly the same FIRST frame.
  for (const item of items) {
    indexes.set(item.id, item.index);
    surfaces.set(item.id, item.surface);
    const r = item.card.getBoundingClientRect();
    rects.set(item.id, r);
  }

  // Super Star is a multi-body cross-surface transaction. Capture a paint snapshot for
  // EVERY participant now. After render we keep proxies only for Posts that actually
  // crossed Top/Main; unused proxies are removed synchronously before the first paint.
  // This prevents the old Super Star from flashing while the new Super Star is animated.
  if (captureCrossSurfaceGroup) {
    for (const item of items) {
      if (crossSurfaceIds && !crossSurfaceIds.has(String(item.id))) continue;
      const first = rects.get(item.id);
      if (!first) continue;
      const clone = item.card.cloneNode(true);

      // A cross-surface proxy is appended directly under <body>.  Merely cloning the
      // DOM is not a visual snapshot: many card/image rules depend on ancestors such as
      // #topPostCard / #mainPosts.  Once detached from that CSS context the clone can
      // reflow internally (the large yellow image was the clearest symptom), even when
      // the outer proxy itself uses scale(1).  Freeze the complete computed appearance
      // while the source is still in its FIRST context, then move that frozen picture.
      const sourceNodes = [item.card, ...item.card.querySelectorAll('*')];
      const cloneNodes = [clone, ...clone.querySelectorAll('*')];
      for (let i = 0; i < Math.min(sourceNodes.length, cloneNodes.length); i++) {
        const cs = getComputedStyle(sourceNodes[i]);
        const dst = cloneNodes[i];
        for (let j = 0; j < cs.length; j++) {
          const prop = cs[j];
          dst.style.setProperty(prop, cs.getPropertyValue(prop), cs.getPropertyPriority(prop));
        }
        // Stop independent media/content animation inside the flying snapshot.
        dst.style.animation = 'none';
        dst.style.transition = 'none';
      }
      clone.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
      clone.removeAttribute('id');
      clone.setAttribute('aria-hidden', 'true');
      clone.dataset.flipProxyFor = item.id;
      // Cross-surface paint proxies live above every real Post. The acted-on Post
      // owns the highest movement layer for the complete transaction.
      clone.style.zIndex = String(item.id) === String(activePostActionId) ? '2001' : '2000';
      const originDocumentLeft = first.left + window.scrollX;
      const originDocumentTop = first.top + window.scrollY;
      Object.assign(clone.style, {
        position: 'absolute', left: `${originDocumentLeft}px`, top: `${originDocumentTop}px`,
        width: `${first.width}px`, height: `${first.height}px`, margin: '0',
        boxSizing: 'border-box', pointerEvents: 'none', transformOrigin: '0 0',
        transform: 'translate3d(0,0,0)', transition: 'none', willChange: 'transform'
      });
      document.body.appendChild(clone);
      clone.getBoundingClientRect();
      crossSurfaceProxies.set(item.id, {
        id: item.id,
        clone,
        originDocumentLeft,
        originDocumentTop,
        fromSurface: item.surface
      });
    }
  }

  const composer = document.getElementById('postComposerMount');
  const composerRect = composer?.getBoundingClientRect?.() || null;

  // Logical finite sequence used only for block partitioning. Geometry remains
  // authoritative for movement: an item may keep the same sequence index and
  // still move because another Body changes the surrounding layout.
  const topItem = items.find(item => item.surface === 'top');
  const mainItems = items.filter(item => item.surface === 'main').sort((a, b) => a.index - b.index);
  const topologySequence = [];
  if (topItem) topologySequence.push(String(topItem.id));
  if (composer) topologySequence.push('__post_composer__');
  topologySequence.push(...mainItems.map(item => String(item.id)));

  return {rects, indexes, surfaces, crossSurfaceProxies, composerRect, topologySequence};
}

function resolvePostMovementTiming(actionName, movements, activePostId = null, fallback = 900) {
  const config = threePostOneBodyConfig.main_posts?.interaction_timing?.post_reflow_animation || {};
  const choice = String(config.speed_or_duration || 'duration').trim().toLowerCase();
  const distances = movements.map(item => Number(item.distance) || 0).filter(distance => distance > 0);
  const minimumDistance = distances.length ? Math.min(...distances) : 0;
  const activeMovement = activePostId == null
    ? null
    : movements.find(item => String(item.postId) === String(activePostId));
  const activeDistance = Number(activeMovement?.distance) || 0;
  // Star, Cancel Star, Super Star and Cancel Super Star all bind configured
  // V_small to the Post the user acted on. If that Post has no measurable
  // displacement, fall back to the minimum effective displacement.
  const actedPostTimingAction = actionName === 'star' || actionName === 'cancel_star'
    || actionName === 'super_star' || actionName === 'cancel_super_star';
  const referenceDistance = actedPostTimingAction && activeDistance > 0 ? activeDistance : minimumDistance;

  let commonDurationMs = 0;
  if (choice === 'speed') {
    const configuredReferenceSpeed = Number(config[actionName]?.speed_px_per_second);
    if (Number.isFinite(configuredReferenceSpeed) && configuredReferenceSpeed > 0 && referenceDistance > 0) {
      // T=D_ref/V_small. Every participant shares T and derives V_i=D_i/T,
      // so all Posts still start and finish the movement together.
      commonDurationMs = (referenceDistance / configuredReferenceSpeed) * 1000;
    }
  } else {
    const configuredDuration = Number(config[actionName]?.duration_ms);
    commonDurationMs = Math.max(0, Number.isFinite(configuredDuration) ? configuredDuration : fallback);
  }

  return movements.map(item => ({
    ...item,
    duration: commonDurationMs,
    effectiveSpeedPxPerSecond: commonDurationMs > 0
      ? (Number(item.distance) || 0) / (commonDurationMs / 1000)
      : 0
  }));
}

async function animatePostMovement(snapshot, actionName, activePostId = null, fallback = 900) {
  if (!snapshot) return;
  postMovementProbeAction = actionName;
  const activeId = activePostId == null ? null : String(activePostId);
  const currentItems = collectPostMovementCards();
  const currentById = new Map(currentItems.map(item => [item.id, item]));
  const proxies = snapshot.crossSurfaceProxies || new Map();
  const crossSurface = new Map();

  // LAST is captured for the whole transaction before any PLAY begins.
  // Decide which bodies crossed a render surface. Those bodies use their FIRST clones;
  // same-surface bodies use strict FLIP transforms on the real nodes.
  for (const [id, proxy] of proxies) {
    const target = currentById.get(id);
    if (target && proxy.fromSurface !== target.surface) {
      const last = target.card.getBoundingClientRect();
      const destinationDocumentLeft = last.left + window.scrollX;
      const destinationDocumentTop = last.top + window.scrollY;
      const oldVisibility = target.card.style.visibility;
      target.card.style.visibility = 'hidden';
      crossSurface.set(id, {
        proxy,
        target,
        destinationDocumentLeft,
        destinationDocumentTop,
        oldVisibility
      });
    } else if (proxy.clone?.isConnected) {
      proxy.clone.remove();
    }
  }

  // Camera/world motion intentionally does not exist here. Each Post owns only
  // its own FIRST->LAST FLIP; the viewport and postMainLayoutWorld are never transformed.

  const topCurrent = currentItems.find(item => item.surface === 'top');
  const mainCurrent = currentItems.filter(item => item.surface === 'main').sort((a, b) => a.index - b.index);
  const afterTopologySequence = [];
  if (topCurrent) afterTopologySequence.push(String(topCurrent.id));
  if (document.getElementById('postComposerMount')) afterTopologySequence.push('__post_composer__');
  afterTopologySequence.push(...mainCurrent.map(item => String(item.id)));
  const blockMembership = window.JetNoteOrderPreservedBlocks?.membership?.(
    snapshot.topologySequence || [], afterTopologySequence
  ) || new Map();
  const fixedBottomUp = window.JetNoteOrderPreservedBlocks?.fixedBottomUpSuffix?.(
    snapshot.topologySequence || [], afterTopologySequence
  ) || {ids:new Set()};

  const prepared = [];
  for (const item of currentItems) {
    // Post Movement is identity/topology owned, not geometry owned. Compare the
    // finite before/after sequence from the bottom upward. Every matched identity
    // is the fixed suffix and MUST NOT receive FLIP even if a temporary layout
    // measurement differs while A/B are being rebuilt. Example ABC -> BAC: C is
    // fixed; only A and B participate. This prevents C from being transformed by
    // both the DOM reflow and FLIP, which made it jitter during Super Star moves.
    if (fixedBottomUp.ids?.has(String(item.id))) continue;
    const first = snapshot.rects.get(item.id);
    if (!first) continue;
    const last = item.card.getBoundingClientRect();
    const beforeSurface = snapshot.surfaces?.get(item.id);
    const beforeIndex = snapshot.indexes?.get(item.id);
    const changedSurface = beforeSurface !== item.surface;
    const changedSlot = item.surface === 'main' && Number.isInteger(beforeIndex) && beforeIndex !== item.index;

    // Inside the topology-approved changing prefix, geometry decides the exact
    // FLIP displacement. Geometry never re-admits an ID from the fixed suffix.
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    const distance = Math.hypot(dx, dy);
    if (distance < 0.5) continue;

    const card = item.card;
    const previousPosition = card.style.position;
    const previousTransition = card.style.transition;
    const previousTransform = card.style.transform;
    const previousWillChange = card.style.willChange;
    const previousZIndex = card.style.zIndex;

    // Cross-surface real nodes are hidden, but receive the same FLIP geometry so menu
    // anchoring and transaction timing remain coherent. Main residual Posts are visible.
    card.style.position = 'relative';
    card.style.willChange = 'transform';
    card.style.transition = 'none';
    card.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    if (String(item.id) === activeId) card.style.zIndex = '2001';
    prepared.push({postId:item.id, card, dx, dy, distance, changedSurface, changedSlot,
      preservedBlock: blockMembership.get(String(item.id)) ?? null,
      previousPosition, previousTransition, previousTransform, previousWillChange, previousZIndex});
  }

  // The Composer is part of the visible Post Movement even though it is not a
  // persisted Post.  FIRST was captured before renderPosts(); LAST exists now.
  // FLIP it exactly like every other moving body so the destination layout cannot
  // appear to open a hole instantaneously before the Posts arrive.
  const composer = document.getElementById('postComposerMount');
  if (composer && snapshot.composerRect && !fixedBottomUp.ids?.has('__post_composer__')) {
    // The composer follows the same finite-sequence rule. If it belongs to the
    // fixed bottom-up suffix, it is not admitted into FLIP by geometry alone.
    const first = snapshot.composerRect;
    const last = composer.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    const distance = Math.hypot(dx, dy);
    if (distance >= 0.5) {
      const previousPosition = composer.style.position;
      const previousTransition = composer.style.transition;
      const previousTransform = composer.style.transform;
      const previousWillChange = composer.style.willChange;
      const previousZIndex = composer.style.zIndex;
      composer.style.position = 'relative';
      composer.style.willChange = 'transform';
      composer.style.transition = 'none';
      composer.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      prepared.push({
        postId: '__post_composer__', card: composer, dx, dy, distance,
        changedSurface: false, isLayoutBody: true,
        preservedBlock: blockMembership.get('__post_composer__') ?? null,
        previousPosition, previousTransition, previousTransform, previousWillChange, previousZIndex
      });
    }
  }

  const cleanupAll = () => {
    for (const {proxy, target, oldVisibility} of crossSurface.values()) {
      if (target.card?.isConnected) target.card.style.visibility = oldVisibility;
      if (proxy.clone?.isConnected) proxy.clone.remove();
    }
    for (const [id, proxy] of proxies) if (proxy.clone?.isConnected) proxy.clone.remove();
  };

  if (!prepared.length) { cleanupAll(); postMovementProbeAction = null; return; }
  const timedPrepared = resolvePostMovementTiming(actionName, prepared, activePostId, fallback).filter(x => x.duration > 0);
  if (!timedPrepared.length) { cleanupAll(); postMovementProbeAction = null; return; }

  // One shared transaction duration is already produced by resolvePostMovementTiming.
  // Commit ALL inverses before WebView gets a paint opportunity.
  for (const item of timedPrepared) item.card.getBoundingClientRect();
  void document.documentElement.offsetHeight;

  // INVERT is now fully written.  Do not PLAY on the first animation frame.
  // rAF #1 lets Chromium/WebView commit the inverted FIRST-looking frame; rAF #2
  // starts PLAY.  This prevents an uninverted LAST layout from becoming the first
  // visible frame of the transaction.
  setPostMovementTransactionPhase('invert-armed');
  const stopMenuFollower = startHorizontalEllipsisMenuFollow(activePostId);
  await nextAnimationFrame();
  setPostMovementTransactionPhase('invert-presented');
  await nextAnimationFrame();
  setPostMovementTransactionPhase('play');

  // UI Language contract: Star/Cancel Star/Super Star/Cancel Super Star all
  // apply V_small to the acted-on Post. Every body shares T and therefore keeps
  // its derived constant speed V_i = D_i / T.
  const easing = 'linear';
  const waits = [];

  // Body A/B: every Top<->Main crossing gets its own shared-element proxy.
  // This includes BOTH the displaced old Super Star and the newly clicked Super Star.
  for (const [id, group] of crossSurface) {
    const timing = timedPrepared.find(x => x.postId === id);
    if (!timing) continue;
    const {clone, originDocumentLeft, originDocumentTop} = group.proxy;
    // Translation-only shared-element FLIP. Keep the FIRST geometry frozen for the
    // entire flight: Superstar movement must not zoom/stretch while crossing surfaces.
    // The real LAST node stays hidden until cleanup, so the proxy is the sole visual
    // owner during movement. Its fixed width/height were captured in FIRST.
    const tx = group.destinationDocumentLeft - originDocumentLeft;
    const ty = group.destinationDocumentTop - originDocumentTop;
    waits.push(new Promise(resolve => {
      let done = false;
      const finish = () => { if (done) return; done = true; clone.removeEventListener('transitionend', onEnd); clearTimeout(timer); resolve(); };
      const onEnd = e => { if (e.target === clone && e.propertyName === 'transform') finish(); };
      clone.addEventListener('transitionend', onEnd);
      clone.style.transition = `transform ${timing.duration}ms ${easing}`;
      clone.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
      var timer = setTimeout(finish, timing.duration + 120);
    }));
  }

  // Body C + hidden real A/B: all real nodes PLAY on the exact same frame/duration.
  for (const item of timedPrepared) {
    waits.push(new Promise(resolve => {
      const {card, duration} = item;
      let done = false;
      const finish = () => {
        if (done) return; done = true; card.removeEventListener('transitionend', onEnd); clearTimeout(timer);
        card.style.transition = item.previousTransition; card.style.transform = item.previousTransform;
        card.style.willChange = item.previousWillChange; card.style.position = item.previousPosition;
        card.style.zIndex = item.previousZIndex;
        resolve();
      };
      const onEnd = e => { if (e.target === card && e.propertyName === 'transform') finish(); };
      card.addEventListener('transitionend', onEnd);
      card.style.transition = `transform ${duration}ms ${easing}`;
      card.style.transform = 'translate3d(0,0,0)';
      var timer = setTimeout(finish, duration + 120);
    }));
  }

  try {
    await Promise.all(waits);
  } finally {
    cleanupAll();
    stopMenuFollower();
    postMovementProbeAction = null;
    setPostMovementTransactionPhase('cleanup');
  }
}

// ── Star / Super Star state transaction ──────────────────────────────────

