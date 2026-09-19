/**
 * EditorController
 * ----------------
 *
 *
 */
const EditorController = (() => {
  const DraftStore = window.JetPostDraftStore;
  const ComposerCaret = window.JetComposerCaret;

  if (!DraftStore || !ComposerCaret) {
    throw new Error('Editor dependencies were not loaded in the required order');
  }

  const State = Object.freeze({
    CLOSED: 'CLOSED',
    OPENING: 'OPENING',
    EDITING: 'EDITING',
    TOOL_ACTIVE: 'TOOL_ACTIVE',
    SAVING: 'SAVING',
    CLOSING: 'CLOSING',
  });

  const SNAPSHOT_DELAY_MS = 250;

  let state = State.CLOSED;
  let snapshotTimer = null;
  let writeChain = Promise.resolve();
  let boundTextarea = null;

  function clone(value) {
    return structuredClone(value);
  }

  const EditorView = (() => {
    let references = null;

    function get() {
      if (references?.screen?.isConnected) return references;

      const screen = document.getElementById('postComposeScreen');
      references = Object.freeze({
        screen,
        body: screen?.querySelector('.post-compose-body') || null,
        textarea: document.getElementById('postComposerText'),
        title: screen?.querySelector('.post-compose-title') || null,
        publish: screen?.querySelector('[data-editor-action="publish"]') || null,
        tools: document.getElementById('postEditorTools'),
      });

      return references;
    }

    function setText(text) {
      const { textarea } = get();
      if (textarea) textarea.value = text;
    }

    function restoreSelection(draft) {
      const { textarea, body } = get();

      if (textarea) {
        try {
          textarea.setSelectionRange(draft.selectionStart, draft.selectionEnd);
        } catch (_) {
        }
      }

      if (body) body.scrollTop = draft.scrollTop || 0;
    }

    return Object.freeze({ get, setText, restoreSelection });
  })();

  function isCompatibleSnapshot(savedDraft, initialDraft) {
    return (
      savedDraft?.version === DraftStore.VERSION &&
      savedDraft.mode === initialDraft.mode &&
      String(savedDraft.postId ?? '') === String(initialDraft.postId ?? '')
    );
  }

  function runtimeMedia() {
    if (typeof draftMedia === 'undefined') return [];
    return [...draftMedia.post.values()];
  }

  function queueSnapshot(reason = 'change') {
    const draft = DraftStore.get();
    if (!draft) return Promise.resolve();

    draft.snapshotReason = reason;
    draft.snapshotAt = Date.now();

    writeChain = writeChain
      .catch(() => {})
      .then(() => EntryStore.saveDraft(draft, runtimeMedia()));

    return writeChain.catch(error => {
      console.warn('[Editor] draft snapshot failed', error);
    });
  }

  function scheduleSnapshot(reason) {
    clearTimeout(snapshotTimer);
    snapshotTimer = window.setTimeout(
      () => queueSnapshot(reason),
      SNAPSHOT_DELAY_MS,
    );
  }

  async function loadCompatibleSnapshot(initialDraft) {
    try {
      const savedDraft = await EntryStore.readDraft();
      return isCompatibleSnapshot(savedDraft, initialDraft) ? savedDraft : null;
    } catch (error) {
      console.warn('[Editor] draft restore failed', error);
      return null;
    }
  }

  function hydrateRuntimeMedia(draft) {
    if (typeof draftMedia === 'undefined') return;

    draftMedia.post.clear();
    for (const attachment of draft.attachments || []) {
      draftMedia.post.set(attachment.id, attachment);
    }
  }

  function markUi(patch) {
    const draft = DraftStore.get();
    if (!draft) return;

    DraftStore.update({
      ui: {
        ...draft.ui,
        ...patch,
      },
    });
  }

  function syncFromView() {
    if (state === State.CLOSED) return;

    const draft = DraftStore.get();
    if (!draft) return;

    const { textarea, body } = EditorView.get();

    DraftStore.update({
      text: textarea?.value ?? draft.text,
      selectionStart: textarea?.selectionStart ?? draft.selectionStart,
      selectionEnd: textarea?.selectionEnd ?? draft.selectionEnd,
      scrollTop: body?.scrollTop ?? draft.scrollTop,
    });

    scheduleSnapshot('view-sync');
  }

  function setMedia({ images, attachments }) {
    if (state === State.CLOSED) return;

    const nextAttachments = clone(attachments || []);

    DraftStore.update({
      images: clone(images || []),
      attachments: nextAttachments,
      audio: nextAttachments.filter(item => item.type === 'audio'),
      video: nextAttachments.filter(item => item.type === 'video'),
    });

    scheduleSnapshot('media-change');
  }

  function setText(text, selectionStart, selectionEnd) {
    if (state === State.CLOSED) return;

    DraftStore.update({
      text: String(text || ''),
      selectionStart,
      selectionEnd,
    });

    scheduleSnapshot('text-change');
  }

  async function begin(initialDraft) {
    if (state !== State.CLOSED) {
      throw new Error(`Editor cannot open from ${state}`);
    }

    state = State.OPENING;

    const restoredDraft = await loadCompatibleSnapshot(initialDraft);
    const draft = DraftStore.replace(restoredDraft || initialDraft);

    hydrateRuntimeMedia(draft);
    state = State.EDITING;

    await queueSnapshot(restoredDraft ? 'restore' : 'open');
    return DraftStore.get();
  }

  function setNativeImagePasteTarget(active) {
    try {
      window.JetNoteNative?.setPostComposerImagePasteTargetActive?.(Boolean(active));
    } catch (_) {
    }
  }

  async function handleBrowserImagePaste(event, textarea) {
    const clipboardItems = Array.from(event.clipboardData?.items || []);
    const imageItem = clipboardItems.find(
      item =>
        item.kind === 'file' &&
        String(item.type || '').toLowerCase().startsWith('image/'),
    );

    if (!imageItem) return;

    const file = imageItem.getAsFile?.();
    if (!file || !window.JetNotePastedImage?.acceptClipboardFile) return;

    event.preventDefault();

    try {
      await window.JetNotePastedImage.acceptClipboardFile(file);
    } catch (error) {
      console.warn('[Editor] browser clipboard image paste failed', error);
      if (document.activeElement === textarea) alert(t('imageReadFailed'));
    }
  }

  function bindTextarea(textarea) {
    if (!textarea || textarea === boundTextarea) return;

    boundTextarea = textarea;
    ComposerCaret.bind(textarea);

    textarea.addEventListener('focus', () => setNativeImagePasteTarget(true));
    textarea.addEventListener('blur', () => setNativeImagePasteTarget(false));
    textarea.addEventListener('paste', event => {
      void handleBrowserImagePaste(event, textarea);
    });
    textarea.addEventListener('input', () => {
      setText(
        textarea.value,
        textarea.selectionStart || 0,
        textarea.selectionEnd || 0,
      );
    });
    textarea.addEventListener('select', syncFromView);
    textarea.addEventListener(
      'scroll',
      () => {
        if (state === State.EDITING) scheduleSnapshot('text-scroll');
      },
      { passive: true },
    );
  }

  async function suspend(toolId = 'background') {
    if (state !== State.EDITING) return;

    syncFromView();
    markUi({ activeTool: toolId });
    state = State.TOOL_ACTIVE;

    await queueSnapshot('suspend');
  }

  function resume() {
    if (state !== State.TOOL_ACTIVE) return null;

    markUi({ activeTool: null });
    state = State.EDITING;

    const draft = DraftStore.get();
    if (!draft) return null;

    EditorView.setText(draft.text);
    EditorView.restoreSelection(draft);
    return draft;
  }

  function validate() {
    const draft = DraftStore.get();

    if (!draft) return { ok: false, code: 'missing-draft' };
    if (!DraftStore.hasContent(draft)) return { ok: false, code: 'empty-post' };

    const attachmentValidation = window.JetNotePostAttachmentPolicy?.validateDraft(draft);
    if (attachmentValidation && !attachmentValidation.ok) return attachmentValidation;

    return { ok: true, draft };
  }

  async function publish(commit) {
    if (state !== State.EDITING) {
      return { ok: false, code: 'invalid-state' };
    }

    syncFromView();
    const validation = validate();
    if (!validation.ok) return validation;

    state = State.SAVING;

    // Publishing is a terminal draft transaction. syncFromView() schedules a
    // delayed snapshot; if that timer is allowed to run after clearDraft(), it
    // can resurrect the just-published draft (including its image/video media)
    // and the next composer session restores those attachments. Cancel the
    // pending timer and drain any already-started snapshot write before commit.
    clearTimeout(snapshotTimer);
    snapshotTimer = null;

    try {
      await writeChain.catch(() => {});
      await commit(clone(validation.draft));
      await EntryStore.clearDraft();
      DraftStore.clear();
      state = State.CLOSED;
      return { ok: true };
    } catch (error) {
      state = State.EDITING;
      console.error('[Editor] publish failed', error);
      return { ok: false, code: 'save-failed', error };
    }
  }

  async function discard() {
    if (state === State.CLOSED) return;

    setNativeImagePasteTarget(false);
    state = State.CLOSING;
    clearTimeout(snapshotTimer);

    try {
      await EntryStore.clearDraft();
    } catch (error) {
      console.warn('[Editor] draft cleanup failed', error);
    }

    DraftStore.clear();
    state = State.CLOSED;
  }

  /**
   */
  function abortOpen() {
    setNativeImagePasteTarget(false);
    clearTimeout(snapshotTimer);
    DraftStore.clear();
    state = State.CLOSED;
  }

  function setToolsExpanded(expanded) {
    markUi({ toolsExpanded: Boolean(expanded) });
    scheduleSnapshot('tool-ui');
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      void suspend('background');
      return;
    }

    if (resume()) {
      window.dispatchEvent(new CustomEvent('jetnote:editor-resume'));
    }
  });

  return Object.freeze({
    State,
    begin,
    bindTextarea,
    syncFromView,
    setText,
    setMedia,
    suspend,
    resume,
    validate,
    publish,
    discard,
    abortOpen,
    setToolsExpanded,
    get state() {
      return state;
    },
    get draft() {
      return DraftStore.get();
    },
  });
})();

window.EditorController = EditorController;
