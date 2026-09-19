let pendingDeleteRequest = null;

function openDeleteConfirm(type, id, anchorRect = null) {
  if (!isWorkspaceWritable()) return;

  // Native inline video is outside WebView stacking. Hide it before showing
  // the confirmation surface so the entire menu remains clickable.
  window.JetNoteVideoOverlay?.suspend?.();
  pendingDeleteRequest = { type, id };

  const backdrop = document.getElementById('deleteConfirmBackdrop');
  const message = document.getElementById('deleteConfirmMessage');

  if (backdrop.parentElement !== document.body) {
    document.body.appendChild(backdrop);
  }

  message.textContent = t('deleteConfirm');

  backdrop.classList.toggle('post-menu-confirm', type === 'post');
  backdrop.classList.add('open');

  if (type === 'post' && anchorRect) {
    positionMenuLeftOfAnchor(backdrop.querySelector('.delete-confirm-panel'), anchorRect);
  }
}

function cancelDeleteConfirm() {
  pendingDeleteRequest = null;
  const backdrop = document.getElementById('deleteConfirmBackdrop');
  const panel = backdrop?.querySelector('.delete-confirm-panel');
  backdrop?.classList.remove('open', 'post-menu-confirm');
  if (panel) {
    panel.style.removeProperty('left');
    panel.style.removeProperty('right');
    panel.style.removeProperty('top');
    panel.style.removeProperty('transform');
  }
  window.__jetSyncNativeVideoVisibility?.();
}

function handleDeleteConfirmBackdrop(event) {
  if (event.target === event.currentTarget) {
    cancelDeleteConfirm();
  }
}

async function confirmPendingDelete() {
  if (!isWorkspaceWritable() || !pendingDeleteRequest) return;

  const request = pendingDeleteRequest;
  cancelDeleteConfirm();

  if(request.type==='post') {
    if(entriesBusy||!entriesReady)return;
    entriesBusy=true;
    // Confirmation sound is immediate touch feedback; storage work must never delay it.
    playPostUiSound?.('delete_it');
    const nextPosts=posts.filter(p=>String(p.id)!==String(request.id));
    try {
      // Persist first. A failed storage operation must leave the visible post intact.
      await EntryStore.commit(nextPosts);

      const postId = String(request.id);
      const escapedPostId = (typeof CSS !== 'undefined' && CSS.escape)
        ? CSS.escape(postId)
        : postId.replace(/[\"']/g, '\\$&');
      const mainPost = document.querySelector(`#mainPosts article.post[data-post-id="${escapedPostId}"]`);
      const topPost = getSuperStarPost?.();
      const topCard = topPost && String(topPost.id) === postId ? document.getElementById('topPostCard') : null;
      const visualPost = mainPost || topCard;

      posts=nextPosts;

      if (visualPost) {
        // Freeze the occupied slot. Clearing children must not let later posts
        // move until both configured deletion stages have completed.
        const rect = visualPost.getBoundingClientRect();
        visualPost.style.height = `${rect.height}px`;
        visualPost.style.minHeight = `${rect.height}px`;
        visualPost.style.boxSizing = 'border-box';
        releaseAttachmentUrls?.(visualPost);
        visualPost.replaceChildren();

        await waitForPostInteractionDelay?.('delete_content_to_border_clear_delay_ms', 140);
        visualPost.style.setProperty('border-color', 'transparent', 'important');
        visualPost.style.setProperty('border-style', 'none', 'important');

        await waitForPostInteractionDelay?.('delete_border_clear_to_reflow_delay_ms', 140);
      }

      // Capture surviving cards before the full render. Only cards near the current
      // viewport participate in FLIP; off-screen cards are deliberately excluded so
      // content from the first screen can never be transformed through the current view.
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const oldRects = new Map();
      document.querySelectorAll('#mainPosts article.post[data-post-id]').forEach(card => {
        const r = card.getBoundingClientRect();
        if (r.bottom >= -64 && r.top <= viewportHeight + 64) oldRects.set(String(card.dataset.postId), r);
      });
      const scrollX = window.scrollX, scrollY = window.scrollY;
      renderPosts();
      window.scrollTo(scrollX, scrollY);

      const duration = postInteractionDelay?.('post_delete_reflow_animation_duration_ms', 320) ?? 320;
      if (duration > 0) {
        const animations = [];
        document.querySelectorAll('#mainPosts article.post[data-post-id]').forEach(card => {
          const before = oldRects.get(String(card.dataset.postId));
          if (!before) return;
          const after = card.getBoundingClientRect();
          if (after.bottom < -64 || after.top > viewportHeight + 64) return;
          const dx = before.left - after.left, dy = before.top - after.top;
          if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
          // A transform creates a stacking context. Pin the animated Post to the
          // normal content Z layer so FLIP cannot lift it above unrelated UI.
          card.style.zIndex = 'calc(var(--z-axis-height-content, 0) + 1)';
          card.style.willChange = 'transform';
          const animation = card.animate(
            [{transform:`translate(${dx}px, ${dy}px)`},{transform:'translate(0px, 0px)'}],
            {duration, easing:'cubic-bezier(0.22, 0.72, 0.22, 1)', fill:'none'}
          );
          animations.push(animation.finished.catch(()=>{}).finally(()=>{
            card.style.willChange='';
            card.style.zIndex='';
          }));
        });
        if (animations.length) await Promise.all(animations);
      }
    }
    catch(error){alert(t('storageFull'));}
    finally{entriesBusy=false;}
    return;
  }
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    cancelDeleteConfirm();
  }
});
