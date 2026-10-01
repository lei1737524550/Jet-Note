function initAudioDraft(entry) {
  ++audioLoadToken.post;

  draftMedia.post.clear();

  {
    const cloned = structuredClone(entry?.attachments || []);
    let keptAudio = false;
    draftAttachments.post = cloned.filter(item => {
      if (item?.type !== 'audio') return true;
      if (keptAudio) return false;
      keptAudio = true;
      return true;
    });
  }

  renderAudioDraft();
}


function renderAudioDraft() {
  const node =
    document.getElementById('postAudioDraft');

  if (!node) {
    return;
  }

  releaseAttachmentUrls(node);

  const audioAttachments = (draftAttachments.post || [])
    .filter(item => item?.type === 'audio')
    .slice(0, 1);

  const hasAudio = audioAttachments.length > 0;
  node.hidden = !hasAudio;

  // Keep the editor toolbar state explicit: with no audio the three tools are
  // centered as one group; with audio the speaker becomes the fourth item.
  const toolLine = node.closest('.post-editor-tool-line');
  if (toolLine) {
    toolLine.dataset.hasAudio = hasAudio ? 'true' : 'false';
  }

  node.innerHTML = renderAttachments(
    audioAttachments,
    true
  );

  node
    .querySelectorAll('.audio-token-remove')
    .forEach(remove => {
      remove.onclick = () => {
        const item = remove.closest('.attachment-item');

        if (!item) {
          return;
        }

        const id = item.dataset.mediaId;

        draftAttachments.post =
          draftAttachments.post.filter(
            attachment =>
              String(attachment.id) !== id
          );

        draftMedia.post.delete(id);

        renderAudioDraft();
        syncPostEditorDraft();
      };
    });

  void hydrateAttachments(
    node,
    draftMedia.post
  );

  if (typeof renderPostVisualMediaPreview === 'function') {
    renderPostVisualMediaPreview();
  }
}


async function handleAudioFiles(event) {
  const files = Array.from(
    event.target.files || []
  );

  event.target.value = '';

  if (
    postDraftMediaLoading ||
    files.length === 0
  ) {
    return;
  }

  const policy =
    window.JetNotePostAttachmentPolicy;

  await policy?.ready;

  const remaining =
    policy?.remaining(
      'audio',
      postDraftImages,
      draftAttachments.post
    ) ?? 0;

  if (remaining <= 0) {
    alert(t('attachmentLimit'));
    return;
  }

  postDraftMediaLoading = true;

  const token = audioLoadToken.post;

  const button = document.querySelector(
    '[data-add-audio="post"]'
  );

  if (button) {
    button.disabled = true;
  }

  try {
    const selected = files.slice(
      0,
      remaining
    );

    if (files.length > remaining) {
      alert(t('attachmentLimit'));
    }

    const pending = [];

    for (const file of selected) {
      const supported =
        file.type.startsWith('audio/') ||
        /\.(mp3|m4a|aac|wav|ogg|flac)$/i.test(
          file.name
        );

      if (!supported) {
        throw new Error(t('audioOnly'));
      }

      if (file.size > MEDIA_MAX) {
        throw new Error(t('audioTooLarge'));
      }

      const mime = /\.mp3$/i.test(file.name)
        ? 'audio/mpeg'
        : (
            file.type ||
            'application/octet-stream'
          );

      const bytes = new Uint8Array(
        await file.arrayBuffer()
      );

      const meta = {
        id: entryUuid(),
        type: 'audio',
        mimeType: mime,
        originalName: file.name,
        sourceMimeType: file.type || null,
        lastModified: file.lastModified,
        size: bytes.length,
        sha256: sha256(bytes)
      };

      pending.push({
        ...meta,
        blob: new Blob(
          [bytes],
          { type: mime }
        )
      });
    }

    if (token !== audioLoadToken.post) {
      return;
    }

    for (const record of pending) {
      const { blob, ...meta } = record;

      draftMedia.post.set(
        meta.id,
        record
      );

      draftAttachments.post.push(meta);
    }

    renderAudioDraft();

    if (
      typeof syncPostEditorDraft === 'function'
    ) {
      syncPostEditorDraft();
    }
  } catch (error) {
    alert(
      error instanceof Error
        ? error.message
        : String(error)
    );
  } finally {
    postDraftMediaLoading = false;

    if (button) {
      button.disabled = false;
    }
  }
}