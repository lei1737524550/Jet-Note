let activePostActionId = null;
let activePostActionAnchor = null;
let activePostActionPostOffset = null;
let activePostActionAnchorOffset = null;
let postHorizontalEllipsisDismissTimer = null;
let postHorizontalEllipsisDismissToken = 0;

// ── Horizontal Ellipsis Menu Family ───────────────────────────────────────
// Menu geometry follows its Post; it does not own Post movement or viewport.

function positionMenuLeftOfAnchor(panel, anchorRect) {
  if (!panel || !anchorRect) return;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const menuWidth = panel.offsetWidth;
  const menuHeight = panel.offsetHeight;
  const gap = 6;
  const edge = 8;

  let left = anchorRect.left - menuWidth - gap;
  if (left < edge) left = Math.min(viewportWidth - menuWidth - edge, anchorRect.right + gap);
  const top = Math.max(edge, Math.min(
      viewportHeight - menuHeight - edge,
      anchorRect.top + (anchorRect.height - menuHeight) / 2
  ));

  panel.style.setProperty('left', Math.round(left) + 'px', 'important');
  panel.style.setProperty('right', 'auto', 'important');
  panel.style.setProperty('top', Math.round(top) + 'px', 'important');
  panel.style.setProperty('transform', 'none', 'important');
}

function postInteractionDelay(name, fallback) {
  const configured = Number(threePostOneBodyConfig.main_posts?.interaction_timing?.[name]);
  if (!Number.isFinite(configured)) return fallback;
  return Math.max(0, Math.min(configured, 60000));
}

function waitForPostInteractionDelay(name, fallback) {
  const delay = postInteractionDelay(name, fallback);
  return delay > 0 ? new Promise(resolve => setTimeout(resolve, delay)) : Promise.resolve();
}

function cancelPostHorizontalEllipsisDismissTimer() {
  postHorizontalEllipsisDismissToken += 1;
  if (postHorizontalEllipsisDismissTimer !== null) {
    clearTimeout(postHorizontalEllipsisDismissTimer);
    postHorizontalEllipsisDismissTimer = null;
  }
}

function holdHorizontalEllipsisMenuAfterPostMovement(postId) {
  cancelPostHorizontalEllipsisDismissTimer();
  const token = postHorizontalEllipsisDismissToken;
  // 100 ms here is only the fallback used when the configured value is missing/invalid.
  // The normally effective value lives near the top of:
  // Interaction timing is compiled into the application configuration.
  const delay = postInteractionDelay('post_horizontal_ellipsis_menu_dismiss_delay_ms', 100);
  // This function is called only after Post movement and the visual settle
  // barrier have completed. First paint the menu at its final Post
  // relative coordinate, then start the configured dismiss clock.  A small RAF follower
  // remains active during the hold so a late WebView compositor frame
  // cannot detach the menu from the Post.
  return new Promise(resolve => {
    let frameId = 0;
    let timerId = null;
    const follow = () => {
      if (token !== postHorizontalEllipsisDismissToken) {
        if (timerId !== null) clearTimeout(timerId);
        resolve();
        return;
      }
      syncPostActionPanelToPost(postId);
      frameId = requestAnimationFrame(follow);
    };
    syncPostActionPanelToPost(postId);
    requestAnimationFrame(() => {
      if (token !== postHorizontalEllipsisDismissToken) { resolve(); return; }
      syncPostActionPanelToPost(postId);
      frameId = requestAnimationFrame(follow);
      timerId = setTimeout(() => {
        if (frameId) cancelAnimationFrame(frameId);
        if (token === postHorizontalEllipsisDismissToken && String(activePostActionId) === String(postId)) {
          closePostActionPanel();
        }
        resolve();
      }, Math.max(0, delay));
    });
  });
}


function closePostActionPanel() {
  cancelPostHorizontalEllipsisDismissTimer();
  const panel = document.getElementById('postActionPanel');
  if (panel) panel.classList.remove('open');
  activePostActionId = null;
  activePostActionAnchor = null;
  activePostActionPostOffset = null;
  activePostActionAnchorOffset = null;
  // Re-evaluate the native TextureView only after the HTML overlay has closed.
  window.__jetSyncNativeVideoVisibility?.();
}

function syncPostStarAction() {
  const button = document.getElementById('postStarAction');
  if (!button) return;

  const post = posts.find(item => String(item.id) === String(activePostActionId));
  const state = getPostStarState(post);
  button.classList.toggle('active', state === 'star');
  button.classList.toggle('super-active', state === 'super_star');
  button.setAttribute('aria-pressed', state === 'none' ? 'false' : 'true');
  button.setAttribute('data-star-state', state);
  const icon = button.querySelector('.post-action-star');
  if (icon) icon.src = state === 'super_star' ? 'src/shared/icons/star_super.svg' : state === 'star' ? 'src/shared/icons/star_active.svg' : 'src/shared/icons/star.svg';
}

// ── Post Movement / FLIP visual continuity ────────────────────────────────
// Ownership boundary:
//   Post Movement owns Post transforms and timing.
//   Horizontal Ellipsis Menu follows the moving Post only.
// Star/Super-Star movement never writes viewport scroll.
function syncPostActionPanelToPost(postId) {
  if (postId === null || postId === undefined) return;
  const panel = document.getElementById('postActionPanel');
  if (!panel?.classList.contains('open')) return;
  if (String(activePostActionId) !== String(postId)) return;

  // The menu is anchored to this Post's horizontal ellipsis, not to the Post
  // card. renderPosts() may replace the ellipsis DOM when a Post crosses
  // Top/Main, so resolve the CURRENT anchor by postId on every frame. Because
  // getBoundingClientRect() includes the ancestor FLIP transform, this keeps the
  // original menu<->ellipsis vector intact throughout both upward and downward
  // movement, viewport scrolling and the final hold.
  const id = String(postId);
  const anchor = document.querySelector(`.more[data-post-id="${CSS.escape(id)}"]`);
  if (!anchor || !anchor.isConnected) return;

  const rect = anchor.getBoundingClientRect();
  activePostActionAnchor = {
    left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
    width: rect.width, height: rect.height
  };

  if (activePostActionAnchorOffset) {
    panel.style.setProperty('left', Math.round(rect.left + activePostActionAnchorOffset.left) + 'px', 'important');
    panel.style.setProperty('right', 'auto', 'important');
    panel.style.setProperty('top', Math.round(rect.top + activePostActionAnchorOffset.top) + 'px', 'important');
    panel.style.setProperty('transform', 'none', 'important');
    return;
  }

  positionMenuLeftOfAnchor(panel, activePostActionAnchor);
}

function startHorizontalEllipsisMenuFollow(postId) {
  if (postId === null || postId === undefined) return () => {};
  let active = true;
  let frame = 0;
  const tick = () => {
    if (!active) return;
    // Menu follows the transformed ellipsis only; this loop never writes scrollY.
    syncPostActionPanelToPost(postId);
    frame = requestAnimationFrame(tick);
  };
  syncPostActionPanelToPost(postId);
  frame = requestAnimationFrame(tick);
  return () => {
    active = false;
    if (frame) cancelAnimationFrame(frame);
    syncPostActionPanelToPost(postId);
  };
}

function openPostActionPanel(event, postId) {
  if (!isWorkspaceWritable()) return;
  event.preventDefault();
  event.stopPropagation();

  // Opening the lightweight post menu must not tear down Home media.
  // In particular, audio playback continues while the ellipsis menu is open.
  // Hide Android's native TextureView synchronously. It is a sibling of the
  // WebView, so no CSS z-index can reliably place this menu above it.
  window.JetNoteVideoOverlay?.suspend?.();

  const panel = document.getElementById('postActionPanel');
  if (!panel) return;

  // Mount the action layer on body so page containers cannot clip it.
  // This avoids invisible or clipped panels in Android WebView.
  // Mount before display so full-screen stacking contexts cannot cover it.
  if (panel.parentElement !== document.body) {
    document.body.appendChild(panel);
  }


  // Tapping the same post menu button again closes the panel.
  if (panel.classList.contains('open') && activePostActionId === postId) {
    closePostActionPanel();
    return;
  }

  activePostActionId = String(postId);
  const anchor=event.currentTarget||event.target.closest('.more');
  const rect=anchor.getBoundingClientRect();
  activePostActionAnchor = {
    left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
    width: rect.width, height: rect.height
  };
  panel.classList.add('open');
  const archiveButton=document.getElementById('postArchiveAction'); const archivePost=posts.find(item=>String(item.id)===String(activePostActionId)); if(archiveButton){const archived=!!archivePost?.archived;archiveButton.classList.toggle('active',archived);archiveButton.setAttribute('aria-label',archived?'Restore from archive':'Archive');const archiveIcon=archiveButton.querySelector('img');if(archiveIcon)archiveIcon.src=archived?'src/shared/icons/post_archive_book_active.svg':'src/shared/icons/post_archive_book.svg';}
  syncPostStarAction();
  positionMenuLeftOfAnchor(panel, activePostActionAnchor);
  activePostActionAnchorOffset = {
    left: panel.offsetLeft - rect.left,
    top: panel.offsetTop - rect.top
  };
  const postCard = anchor.closest('article.post') || anchor.closest('#topPostCard');
  const postRect = postCard?.getBoundingClientRect();
  if (postRect) {
    activePostActionPostOffset = {
      left: panel.offsetLeft - postRect.left,
      top: panel.offsetTop - postRect.top
    };
  } else {
    activePostActionPostOffset = null;
  }
}

function editActivePost() {
  if (!isWorkspaceWritable()) return;
  if (activePostActionId === null) return;

  const post = posts.find(item => String(item.id) === String(activePostActionId));
  if (!post) return;

  const postId = activePostActionId;
  const editDraft = structuredClone(post);
  closePostActionPanel();
  openPostComposer(editDraft.text, postId, editDraft);
}

function deleteActivePost() {
  if (!isWorkspaceWritable()) return;
  if (activePostActionId === null) return;

  const postId = activePostActionId;
  const anchorRect = activePostActionAnchor ? {...activePostActionAnchor} : null;
  closePostActionPanel();
  playPostUiSound('open_trash');
  openDeleteConfirm('post', postId, anchorRect);
}

