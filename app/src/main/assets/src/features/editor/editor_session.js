function syncPostEditorDraft() {
  if (EditorController.state === EditorController.State.EDITING || EditorController.state === EditorController.State.TOOL_ACTIVE) {
    EditorController.setMedia({ images: postDraftImages, attachments: draftAttachments.post });
    // syncFromComposer was retired; calling it aborted publishing after the
    // button had already been disabled. Synchronize through the current API.
    EditorController.syncFromView();
  }
}

// ── Post Composer ─────────────────────────────────────────────────────────

function initializePostComposerControls() {
  const screen = document.getElementById('postComposeScreen');
  if (!screen || screen.dataset.editorControlsBound === 'true') return;
  // The Composer is mounted once and then only shown/hidden.  No opening flow
  // recreates its DOM, so focus, toolbar bindings and draft restoration stay stable.
  if (screen.parentElement !== document.body) document.body.appendChild(screen);
  screen.dataset.editorControlsBound = 'true';
  screen.addEventListener('click', event => {
    const action = event.target.closest('[data-editor-action]')?.dataset.editorAction;
    if (action === 'cancel') closePostComposer();
    if (action === 'publish') {
      // This is direct tap feedback: play immediately on every accepted blue
      // Publish/Save button click, before validation, storage, or transition work.
      playPostUiSound?.('send_post');
      publishTextPost();
    }
  });
  EditorController.bindTextarea(document.getElementById('postComposerText'));
}

let postComposerReturnRoute = 'home';

async function openPostComposer(prefillText = '', postId = null, sourcePost = null) {
  if (!isWorkspaceWritable() || !entriesReady || entriesBusy) {
    console.warn('[Editor] opening is unavailable', { writable: isWorkspaceWritable(), entriesReady, entriesBusy });
    return false;
  }
  if (EditorController.state !== EditorController.State.CLOSED) return false;
  // The entry sound is tap feedback: start it before draft preparation or the
  // shared transition so perceived latency is not coupled to editor startup.
  playPostUiSound?.('editor_open');
  initializePostComposerControls();
  postComposerReturnRoute = document.getElementById('archiveScreen')?.classList.contains('open') ? 'archive' : 'home';
  closePostActionPanel();

  try {
    // Editing starts from a detached copy, so rebuilding the draft never mutates
    // the live feed before the user explicitly saves it.
    const editDraft = sourcePost
        ? structuredClone(sourcePost)
        : (postId === null ? null : structuredClone(posts.find(item => String(item.id) === String(postId)) || null));

    // Old/seed entries may have image attachments without the redundant `images`
    // URL list. Reconstruct that list before entering the normal editor pipeline so
    // an unchanged Save cannot accidentally filter those attachments out.
    const editAttachments = Array.isArray(editDraft?.attachments) ? editDraft.attachments : [];
    const editImages = Array.isArray(editDraft?.images) ? [...editDraft.images] : [];
    for (const item of editAttachments) {
      if (item?.type !== 'image') continue;
      const url = NativeMedia.url(item);
      if (url && !editImages.includes(url)) editImages.push(url);
    }
    const initialDraft = await EditorController.begin({
      mode: postId === null ? 'create' : 'edit', postId,
      text: editDraft ? String(editDraft.text || '') : prefillText,
      images: editImages, attachments: editAttachments,
      starState: getPostStarState(editDraft)
    });
    editingPostId = initialDraft.postId;
    const screen = document.getElementById('postComposeScreen');
    const textarea = document.getElementById('postComposerText');
    const title = screen?.querySelector('.post-compose-title');
    const publishBtn = screen?.querySelector('.post-compose-publish');
    const composeTopBar = screen?.querySelector('.buttom-string-buttom-bar');
    const body = screen?.querySelector('.post-compose-body');
    if (!screen || !textarea || !title || !publishBtn || !body) throw new Error('Composer view is incomplete');
    initializeTools?.();

    const topBarPageKey = postId === null ? 'new_post_page' : 'edit_post_page';
    if (composeTopBar && window.JetBottomStringBottomBar?.renderBar) {
      await window.JetBottomStringBottomBar.renderBar(composeTopBar, topBarPageKey);
    } else {
      title.textContent = postId === null ? t('writePost') : t('editPost');
    }
    const publishLabel = postId === null ? t('publish') : t('save');
    publishBtn.setAttribute('aria-label', publishBtn.getAttribute('aria-label') || publishLabel);
    publishBtn.setAttribute('title', publishBtn.getAttribute('title') || publishLabel);

    textarea.value = initialDraft.text;
    loadEditorColorCommands(editDraft); bindEditorColorCommands();
    const titleInput=document.getElementById('postComposerTitle'); if(titleInput) titleInput.value=String(editDraft?.title||'');

    postDraftImages = [...initialDraft.images];

    initAudioDraft({ attachments: initialDraft.attachments });
    renderPostImagePreview();
    renderPostVideoPreview();

    closeToolbox?.();
    body.scrollTop = 0;
    // Native video is a TextureView layered outside the WebView. Suppress it
    // before exposing the editor so there is no one-frame video flash-through.
    window.JetNoteMediaResourceManager?.releaseScope?.('home','open-post-composer');
    window.JetNoteVideoOverlay?.suspend?.();

    const entered = await window.SharedTransition.run({
      page: window.SharedTransition.Page.EDITOR,
      phase: window.SharedTransition.Phase.ENTER,
      screen,
      header: screen.querySelector('.post-compose-header'),
      body,
      prepare: () => {
        screen.classList.add('open');
        window.__jetSyncNativeVideoVisibility?.();
        document.body.style.overflow = 'hidden';
        ViewportManager.update();
      }
    });
    if (!entered) return false;

    const focusComposer = () => {
      if (!screen.classList.contains('open')) return;
      textarea.focus({preventScroll:true});
      const end = textarea.value.length;
      try { textarea.setSelectionRange(end, end); } catch (_) {}
    };
    focusComposer();
    window.JetComposerCaret?.refresh?.();
    return true;
  } catch (error) {
    console.error('[Editor] open failed', error);
    EditorController.abortOpen?.();
    editingPostId = null;
    return false;
  }
}
function closePostComposer() {
  if (entriesBusy) return;
  const screen = document.getElementById('postComposeScreen');
  if (!screen?.classList.contains('open')) return;

  // Release temporary editor media before the visual exit starts. Home remains
  // mounted underneath and is revealed by the reverse transition itself.
  const editorVideoPreview = document.getElementById('postVisualMediaPreview');
  releaseVideoAttachmentUrls(editorVideoPreview);
  closeToolbox?.();
  initAudioDraft(null);

  void window.SharedTransition.run({
    page: window.SharedTransition.Page.EDITOR,
    phase: window.SharedTransition.Phase.EXIT,
    screen,
    header: screen.querySelector('.post-compose-header'),
    body: screen.querySelector('.post-compose-body'),
    finish: () => {
      screen.classList.remove('open');
      window.__jetSyncNativeVideoVisibility?.();
      document.body.style.overflow = postComposerReturnRoute === 'archive' ? 'hidden' : '';
      if (postComposerReturnRoute === 'archive') renderArchive?.();
      postComposerReturnRoute = 'home';
      document.getElementById('postComposerText').value = '';
      const titleInput=document.getElementById('postComposerTitle'); if(titleInput) titleInput.value=''; editorColorCommands=[];editorCurrentColor=null;applyEditorTypingColor();
      editingPostId = null;
      postDraftImages = [];
      renderPostImagePreview();
      renderPostVideoPreview();
      void EditorController.discard();
    }
  });
}
