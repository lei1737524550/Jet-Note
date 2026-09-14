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
    const nextPosts=posts.filter(p=>String(p.id)!==String(request.id));
    try {await EntryStore.commit(nextPosts);posts=nextPosts;renderPosts();}
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
