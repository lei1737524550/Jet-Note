async function pickPostImages() {
  if (!isWorkspaceWritable()) return;
  const policy = window.JetNotePostAttachmentPolicy;
  await policy?.ready;
  if (policy?.conflict('image', postDraftImages, draftAttachments.post)) {
    alert(t('imageVideoExclusive'));
    return;
  }
  if ((policy?.remaining('image', postDraftImages, draftAttachments.post) ?? 0) <= 0) {
    alert(t('imageLimit'));
    return;
  }

  // Image picking in the Android app must never go through an HTML
  // <input type="file">. WebView/Chromium is allowed to translate an
  // image-accepting file input into the platform photo/gallery picker, which
  // is exactly the UI Jet Note does not want here. Route the button directly
  // to the native SAF attachment picker, just like the native media path.
  if (!window.JetNoteNative || typeof JetNoteNative.pickAttachments !== 'function') {
    console.error('Jet Note native attachment picker is unavailable');
    alert(t('attachmentReadFailed'));
    return;
  }
  return pickEntryMedia('post', 'image');
}

async function pickPostVideos() {
  if (!isWorkspaceWritable()) return;
  const policy = window.JetNotePostAttachmentPolicy;
  await policy?.ready;
  if (policy?.conflict('video', postDraftImages, draftAttachments.post)) {
    alert(t('imageVideoExclusive'));
    return;
  }
  if ((policy?.remaining('video', postDraftImages, draftAttachments.post) ?? 0) <= 0) {
    alert(t('videoLimit'));
    return;
  }
  if (NativeMedia.available()) {
    return pickEntryMedia('post', 'video');
  }
  document.getElementById('postVideoPicker').click();
}

async function openPostComposerWithImagePicker() {
  if (!isWorkspaceWritable()) return;
  if (!await openPostComposer()) return;

  // Wait until the composer is mounted in body before opening the system picker.
  setTimeout(() => pickPostImages(), 60);
}

async function openPostComposerWithAudioPicker() {
  if (!isWorkspaceWritable()) return;
  if (!await openPostComposer()) return;
  setTimeout(() => pickEntryAudio('post'), 60);
}

async function openPostComposerWithVideoPicker() {
  if (!isWorkspaceWritable()) return;
  if (!await openPostComposer()) return;
  setTimeout(() => pickPostVideos(), 60);
}

function removePostDraftImage(indexOrId) {
  const id = String(indexOrId);
  const attachmentIndex = draftAttachments.post.findIndex(item => item?.type === 'image' && String(item.id) === id);
  if (attachmentIndex >= 0) {
    const item = draftAttachments.post[attachmentIndex];
    const url = NativeMedia.url(item);
    draftAttachments.post.splice(attachmentIndex, 1);
    draftMedia.post.delete(id);
    const imageIndex = postDraftImages.indexOf(url);
    if (imageIndex >= 0) postDraftImages.splice(imageIndex, 1);
  }
  renderPostVisualMediaPreview();
  syncPostEditorDraft();
}

function renderPostImagePreview() {
  renderPostVisualMediaPreview();
}

async function handlePostVideos(event) {
  const picker = event.target;
  if (!isWorkspaceWritable()) { picker.value = ''; return; }
  const files = Array.from(picker.files || []);
  picker.value = '';
  const policy = window.JetNotePostAttachmentPolicy;
  await policy?.ready;
  const remaining = policy?.remaining('video', postDraftImages, draftAttachments.post) ?? 0;
  if (remaining <= 0) { alert(t('videoLimit')); return; }
  if (files.length > remaining) alert(t('videoLimit'));
  try {
    for (const file of files.slice(0, remaining)) {
      if (!file.type.startsWith('video/')) throw Error(t('videoOnly'));
      const bytes = new Uint8Array(await file.arrayBuffer());
      const meta = { id: entryUuid(), type:'video', mimeType:file.type || 'video/mp4', originalName:file.name,
        sourceMimeType:file.type || null, lastModified:file.lastModified, size:bytes.length, sha256:sha256(bytes) };
      draftMedia.post.set(meta.id, {...meta, blob:new Blob([bytes], {type:meta.mimeType})});
      draftAttachments.post.push(meta);
    }
    renderPostVisualMediaPreview();
    renderAudioDraft('post');
    syncPostEditorDraft();
  } catch (error) { alert(error.message); }
}

function removePostDraftVideo(id) {
  draftAttachments.post = draftAttachments.post.filter(item => String(item.id) !== String(id));
  draftMedia.post.delete(String(id));
  renderPostVisualMediaPreview();
  renderAudioDraft('post');
  syncPostEditorDraft();
}

function renderPostVideoPreview() {
  renderPostVisualMediaPreview();
}

function renderPostVisualMediaPreview() {
  const box = document.getElementById('postVisualMediaPreview');
  if (!box) return;
  releaseVideoAttachmentUrls(box);

  const representedImages = new Set();
  const visualItems = [];
  for (const item of draftAttachments.post || []) {
    if (item?.type === 'audio') {
      // Audio has its own dedicated slot immediately to the right of the
      // image tool. Do not duplicate it in the image/video preview rail.
      continue;
    } else if (item?.type === 'video') {
      visualItems.push({type:'video', item});
    } else if (item?.type === 'image') {
      const src = NativeMedia.url(item);
      representedImages.add(src);
      visualItems.push({type:'image', item, src});
    }
  }

  // The published Post layout is the source of truth for visual-media
  // cardinality: 1 = one large cell, 2 = two equal cells, 3+ = three visible
  // cells. The composer adds only the removable overlay.
  const mediaCount = visualItems.length;
  box.style.setProperty('--media-columns', String(Math.max(1, Math.min(3, mediaCount))));
  box.classList.toggle('one', mediaCount === 1);
  box.classList.toggle('two', mediaCount === 2);
  box.classList.toggle('many', mediaCount >= 3);
  box.dataset.mediaCount = String(mediaCount);
  box.innerHTML = visualItems.map(entry => {
    if (entry.type === 'video') {
      const id = escapeHTML(entry.item.id);
      // Use the exact same video component as Home and Post Viewer.  The editor
      // adds only its remove overlay; playback, seek, time and Viewer entry all
      // remain owned by shared/media/video_player.js.
      return renderVideoAttachmentCardHTML(entry.item).replace(
        '<img class="video-poster" alt="" draggable="false">',
        `<img class="video-poster" alt="" draggable="false"><button class="compose-image-remove adaptive-complement-remove" type="button" onclick="event.stopPropagation(); removePostDraftVideo('${id}')" aria-label="${escapeHTML(t('remove'))}">×</button>`
      );
    }
    const key = `'${escapeHTML(entry.item.id)}'`;
    return `<div class="compose-image-item common_border"><img src="${escapeHTML(entry.src)}" alt="" onclick="openImageViewer(this.src)">
      <button class="compose-image-remove adaptive-complement-remove" onclick="event.stopPropagation(); removePostDraftImage(${key})" aria-label="${escapeHTML(t('remove'))}">×</button></div>`;
  }).join('') + (visualItems.length > 3 ? '<div class="compose-media-more-indicator" aria-hidden="true"><img src="src/shared/icons/more_vertical.svg" alt=""></div>' : '');

  hydrateVideoAttachments(box, draftMedia.post);
  void hydrateAttachments(box, draftMedia.post);
  box.querySelectorAll('.audio-token-remove').forEach(remove => {
    remove.onclick = () => {
      const item = remove.closest('.attachment-item');
      if (!item) return;
      const id = String(item.dataset.mediaId || '');
      draftAttachments.post = draftAttachments.post.filter(a => String(a.id) !== id);
      draftMedia.post.delete(id);
      renderPostVisualMediaPreview();
      syncPostEditorDraft();
    };
  });
}

function addToolAudioToPost(meta) {
  const composer = document.getElementById('postComposeScreen');
  if (!composer?.classList.contains('open')) return 'composer-not-open';
  if (!meta || meta.type !== 'audio' || !meta.id || !meta.path) return 'invalid-audio';

  if (draftAttachments.post.some(item => String(item.id) === String(meta.id))) {
    return 'duplicate';
  }
  if (draftAttachments.post.filter(item => item.type === 'audio').length >= 1) {
    alert(t('attachmentLimit'));
    return 'limit';
  }

  draftAttachments.post.push(meta);
  draftMedia.post.set(meta.id, meta);
  renderAudioDraft();
  renderPostVisualMediaPreview();
  syncPostEditorDraft();
  return 'added';
}

window.addToolAudioToPost = addToolAudioToPost;

function addToolVisualToPost(meta) {
  const composer = document.getElementById('postComposeScreen');
  if (!composer?.classList.contains('open')) return 'composer-not-open';
  if (!meta || !['image','video'].includes(meta.type) || !meta.id || !meta.path) return 'invalid-media';
  if (draftAttachments.post.some(item => String(item.id) === String(meta.id))) return 'duplicate';
  const policy = window.JetNotePostAttachmentPolicy;
  if (policy?.conflict(meta.type, postDraftImages, draftAttachments.post)) return 'conflict';
  if ((policy?.remaining(meta.type, postDraftImages, draftAttachments.post) ?? 0) <= 0) return 'limit';
  draftAttachments.post.push(meta);
  draftMedia.post.set(meta.id, meta);
  if (meta.type === 'image') postDraftImages.push(NativeMedia.url(meta));
  renderPostVisualMediaPreview();
  renderAudioDraft('post');
  syncPostEditorDraft();
  return 'added';
}
window.addToolVisualToPost = addToolVisualToPost;

