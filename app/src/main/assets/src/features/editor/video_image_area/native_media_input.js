function postComposerCanReceivePastedImage() {
  const screen = document.getElementById('postComposeScreen');
  const textarea = document.getElementById('postComposerText');
  return !!(
    screen?.classList.contains('open') &&
    textarea &&
    document.activeElement === textarea &&
    typeof EditorController !== 'undefined' &&
    EditorController.state === EditorController.State.EDITING
  );
}

function acceptPastedImageMeta(meta) {
  if (!meta || meta.type !== 'image' || !meta.id || !meta.path) {
    discardRejectedNativeMedia(meta);
    return 'invalid-image';
  }
  if (!postComposerCanReceivePastedImage() || !isWorkspaceWritable() || entriesBusy || !entriesReady) {
    discardRejectedNativeMedia(meta);
    return 'composer-unavailable';
  }
  const policy = window.JetNotePostAttachmentPolicy;
  if (policy?.conflict('image', postDraftImages, draftAttachments.post)) {
    discardRejectedNativeMedia(meta);
    alert(t('imageVideoExclusive'));
    return 'image-video-exclusive';
  }
  if ((policy?.remaining('image', postDraftImages, draftAttachments.post) ?? 0) <= 0) {
    discardRejectedNativeMedia(meta);
    alert(t('imageLimit'));
    return 'image-limit';
  }

  draftAttachments.post.push(meta);
  draftMedia.post.set(meta.id, meta);
  postDraftImages.push(NativeMedia.url(meta));
  renderPostImagePreview();
  if (typeof syncPostEditorDraft === 'function') syncPostEditorDraft();
  return 'added';
}

async function storeBrowserClipboardImage(file) {
  const mime = String(file?.type || 'image/png').toLowerCase();
  if (!mime.startsWith('image/')) throw Error('image-read-failed');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = sha256(bytes);
  return NativeMedia.storeBlob({
    id: entryUuid(),
    type: 'image',
    mimeType: mime,
    originalName: file.name || 'clipboard-image.' + mediaExtension(mime),
    sha256: hash,
    size: bytes.length
  }, file);
}

window.JetNotePastedImage = Object.freeze({
  acceptMeta: acceptPastedImageMeta,
  async acceptClipboardFile(file) {
    const meta = await storeBrowserClipboardImage(file);
    return acceptPastedImageMeta(meta);
  }
});
async function pickEntryAudio(kind) {
  if(!NativeMedia.available()){
    document.getElementById(kind+'AudioPicker').click();
    return;
  }
  await pickEntryMedia(kind,'audio');
}
async function pickEntryMedia(kind, type) {
  if (!isWorkspaceWritable()) return;
  if (entriesBusy || !entriesReady) return;

  const policy = window.JetNotePostAttachmentPolicy;
  await policy?.ready;

  if ((type === 'image' || type === 'video') && policy?.conflict(type, postDraftImages, draftAttachments.post)) {
    alert(t('imageVideoExclusive'));
    return;
  }

  const token = audioLoadToken[kind];
  const selector = type === 'audio'
    ? '[data-add-audio="' + kind + '"]'
    : type === 'video'
      ? '[data-add-video="' + kind + '"]'
      : null;
  const button = selector ? document.querySelector(selector) : null;
  if (button?.disabled) return;
  if (postDraftMediaLoading) return;

  const remainingBeforePick = policy?.remaining(type, postDraftImages, draftAttachments.post) ?? 0;
  if (remainingBeforePick <= 0) {
    alert(t(type === 'image' ? 'imageLimit' : type === 'video' ? 'videoLimit' : 'attachmentLimit'));
    return;
  }

  postDraftMediaLoading = true;
  if (button) button.disabled = true;

  try {
    const items = await pickNativeAttachments(type);
    if (token !== audioLoadToken[kind]) {
      items.forEach(discardRejectedNativeMedia);
      return;
    }

    const remaining = policy?.remaining(type, postDraftImages, draftAttachments.post) ?? 0;
    if (items.length > remaining) {
      alert(t(type === 'image' ? 'imageLimit' : type === 'video' ? 'videoLimit' : 'attachmentLimit'));
    }

    const accepted = items.slice(0, Math.max(0, remaining));
    const rejected = items.slice(accepted.length);
    rejected.forEach(discardRejectedNativeMedia);

    for (const meta of accepted) {
      draftAttachments[kind].push(meta);
      draftMedia[kind].set(meta.id, meta);
    }

    if (type === 'image') {
      postDraftImages.push(...accepted.map(item => NativeMedia.url(item)));
      renderPostImagePreview();
    } else if (type === 'video') {
      renderPostVideoPreview();
    }

    renderAudioDraft(kind);
    if (typeof syncPostEditorDraft === 'function') syncPostEditorDraft();
  } catch (error) {
    const code = String(error?.message || '');
    const key = code === 'attachment-read-failed' ? 'attachmentReadFailed' : 'attachmentReadFailed';
    alert(t(key));
  } finally {
    postDraftMediaLoading = false;
    if (button) button.disabled = false;
  }
}


JetNoteMediaInput.registerKeyboardReceiver({
  accept: acceptPastedImageMeta,
  error() { if (postComposerCanReceivePastedImage()) alert(t('imageReadFailed')); }
});
