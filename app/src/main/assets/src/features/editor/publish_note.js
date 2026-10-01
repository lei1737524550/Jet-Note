function attachmentsForPostDraft(draft) {
  const imageSources = new Set(draft.images || []);
  return (draft.attachments || []).filter(item => item.type !== 'image' || imageSources.has(NativeMedia.url(item)));
}

async function commitPostDraft(draft) {
  const previous = structuredClone(posts);
  const wasEditing = draft.mode === 'edit';
  const attachments = attachmentsForPostDraft(draft);
  let savedPost = null;
  entriesBusy = true;
  try {
    if (!wasEditing) {
      savedPost = {
        id: nextEntryId(), uuid: entryUuid(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        attachments: structuredClone(attachments), text: draft.text, title: String(document.getElementById('postComposerTitle')?.value||'').trim(), colorCommands: [], images: [...draft.images],
        starState: 'none', time: formatNowForPost()
      };
      replacePosts([savedPost, ...posts]);
    } else {
      const index = posts.findIndex(item => String(item.id) === String(draft.postId));
      if (index < 0) throw Error('This post no longer exists. Please reopen it from the feed.');
      savedPost = {
        ...structuredClone(posts[index]), updatedAt: new Date().toISOString(),
        attachments: structuredClone(attachments), text: draft.text, title: String(document.getElementById('postComposerTitle')?.value||'').trim(), colorCommands: [], images: [...draft.images], starState: normalizeStarStateValue(draft.starState)
      };
      replacePosts(posts.map((post, position) => position === index ? savedPost : post));
    }
    if (!await savePosts()) throw Error(t('storageFull'));
    renderPosts();
    // Archive is a live view too: an edited archived note must update immediately.
    if (document.getElementById('archiveScreen')?.classList.contains('open')) renderArchive?.();
    return { wasEditing, savedPost };
  } catch (error) {
    replacePosts(previous);
    throw error;
  } finally {
    entriesBusy = false;
  }
}

let postPublishInFlight = false;
async function publishTextPost() {
  // Publishing is governed by PostDraftStore, never by a toolbar element.
  if (postPublishInFlight || !isWorkspaceWritable() || !entriesReady || entriesBusy || isPostDraftMediaLoading()) return;
  postPublishInFlight = true;
  const publishButton = document.querySelector('#postComposeScreen [data-editor-action="publish"]');
  if (publishButton) publishButton.disabled = true;
  try {
    syncPostEditorDraft();
    let commitResult = null;
    const result = await EditorController.publish(async draft => { commitResult = await commitPostDraft(draft); });
    if (!result.ok) {
      if (result.code === 'empty-post') alert(t('emptyPost'));
      else if (result.code === 'image-video-exclusive') alert(t('imageVideoExclusive'));
      else if (result.code === 'image-limit') alert(t('imageLimit'));
      else if (result.code === 'video-limit') alert(t('videoLimit'));
      else if (result.code === 'audio-limit' || result.code === 'video-photo-combined-limit') alert(t('attachmentLimit'));
      else if (result.code === 'save-failed') alert(result.error?.message || t('storageFull'));
      return;
    }
    // Clear every composer-owned media container immediately after a successful
    // publish/save. Do not wait for the home transition callback: a new editor
    // session can otherwise observe the previous session's in-memory media.
    postDraftImages = [];
    initAudioDraft(null);
    renderPostImagePreview();
    renderPostVideoPreview();
    closePostComposer();
    if (!commitResult.wasEditing) document.getElementById('mainPosts')?.scrollTo({ top: 0 });
  } finally {
    postPublishInFlight = false;
    if (publishButton?.isConnected) publishButton.disabled = false;
  }
}

/* ---------- Name ---------- */
