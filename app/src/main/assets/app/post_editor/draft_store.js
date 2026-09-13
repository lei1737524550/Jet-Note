/**
 * PostDraftStore
 * --------------
 */
window.JetPostDraftStore = (() => {
  const VERSION = 1;
  let currentDraft = null;

  function clone(value) {
    return structuredClone(value);
  }

  function normalize(input = {}) {
    const attachments = clone(input.attachments || []);

    return {
      version: VERSION,
      draftId: input.draftId || entryUuid(),
      mode: input.mode === 'edit' ? 'edit' : 'create',
      postId: input.postId ?? null,
      text: String(input.text || ''),
      images: clone(input.images || []),
      attachments,
      audio: attachments.filter(item => item.type === 'audio'),
      video: attachments.filter(item => item.type === 'video'),
      starState: normalizeStarStateValue(input.starState),
      dirty: Boolean(input.dirty),
      selectionStart: Number(input.selectionStart) || 0,
      selectionEnd: Number(input.selectionEnd) || 0,
      scrollTop: Number(input.scrollTop) || 0,
      ui: {
        toolsExpanded: false,
        keyboardVisible: false,
        activeTool: null,
        ...(input.ui || {}),
      },
      updatedAt: Number(input.updatedAt) || Date.now(),
    };
  }

  function replace(nextDraft) {
    currentDraft = normalize(nextDraft);
    return clone(currentDraft);
  }

  function get() {
    return currentDraft ? clone(currentDraft) : null;
  }

  function update(patch) {
    if (!currentDraft) {
      throw new Error('Post draft is unavailable');
    }

    currentDraft = normalize({
      ...currentDraft,
      ...patch,
      dirty: patch.dirty ?? true,
      updatedAt: Date.now(),
    });

    return clone(currentDraft);
  }

  function hasContent(draft = currentDraft) {
    if (!draft) return false;

    return Boolean(
      draft.text.trim() ||
      draft.images.length ||
      draft.audio.length ||
      draft.video.length,
    );
  }

  function clear() {
    currentDraft = null;
  }

  return Object.freeze({
    VERSION,
    normalize,
    replace,
    get,
    update,
    hasContent,
    clear,
  });
})();
