/*
 * Edit Post architecture
 * ----------------------
 * PostDraftStore owns business data, EditorView owns cached DOM references,
 * and EditorController is the only lifecycle coordinator. Layout/keyboard
 * events must never create, clear, or reconstruct a draft.
 */
const PostDraftStore = (() => {
  const VERSION = 1;
  let current = null;
  const clone = value => structuredClone(value);
  function create(input = {}) {
    const attachments = clone(input.attachments || []);
    return {
      version: VERSION, draftId: input.draftId || entryUuid(),
      mode: input.mode === 'edit' ? 'edit' : 'create', postId: input.postId ?? null,
      text: String(input.text || ''), images: clone(input.images || []), attachments,
      audio: attachments.filter(item => item.type === 'audio'), video: attachments.filter(item => item.type === 'video'),
      starState: normalizeStarStateValue(input.starState), dirty: !!input.dirty,
      selectionStart: Number(input.selectionStart) || 0, selectionEnd: Number(input.selectionEnd) || 0,
      scrollTop: Number(input.scrollTop) || 0,
      ui: { toolsExpanded: false, keyboardVisible: false, activeTool: null, ...(input.ui || {}) },
      updatedAt: Number(input.updatedAt) || Date.now()
    };
  }
  function replace(next) { current = create(next); return clone(current); }
  function get() { return current ? clone(current) : null; }
  function hasContent(draft = current) { return !!(draft && (draft.text.trim() || draft.images.length || draft.audio.length || draft.video.length)); }
  function update(patch) {
    if (!current) throw new Error('Post draft is unavailable');
    current = create({ ...current, ...patch, dirty: patch.dirty ?? true, updatedAt: Date.now() });
    return clone(current);
  }
  function clear() { current = null; }
  return Object.freeze({ VERSION, create, replace, get, update, clear, hasContent });
})();

const EditorView = (() => {
  let refs = null;
  function get() {
    if (refs?.screen?.isConnected) return refs;
    const screen = document.getElementById('postComposeScreen');
    refs = Object.freeze({
      screen, body: screen?.querySelector('.post-compose-body') || null,
      textarea: document.getElementById('postComposerText'),
      title: screen?.querySelector('.post-compose-title') || null,
      publish: screen?.querySelector('[data-editor-action="publish"]') || null,
      toolbar: document.getElementById('postComposerToolbar')
    });
    return refs;
  }
  function setText(text) { const { textarea } = get(); if (textarea) textarea.value = text; }
  function restoreSelection(draft) {
    const { textarea, body } = get();
    if (textarea) { try { textarea.setSelectionRange(draft.selectionStart, draft.selectionEnd); } catch (_) {} }
    if (body) body.scrollTop = draft.scrollTop || 0;
  }
  return Object.freeze({ get, setText, restoreSelection });
})();

const ComposerCaret = (() => {
  let input, layer, mirror, beforeText, caret, afterText, blinkTimer = null;

  function appearance() {
    const configured = window.JetEditorAppearance || {};
    const configuredWidth = Number(configured.caretWidth);
    const caretWidth = Number.isFinite(configuredWidth) && configuredWidth >= 1
      ? Math.round(configuredWidth)
      : Math.max(1, parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--post-compose-caret-width')) || 4);
    return {
      caretWidth,
      caretColor: configured.caretColor || 'var(--post-compose-caret-color,#14A89A)',
      visibleDuration: Math.max(50, Number(configured.caretVisibleStateDurationMs) || 750),
      hiddenDuration: Math.max(50, Number(configured.caretHiddenStateDurationMs) || 750)
    };
  }

  function stopBlink() {
    if (blinkTimer !== null) clearTimeout(blinkTimer);
    blinkTimer = null;
  }

  function scheduleBlink(visible) {
    stopBlink();
    if (!caret || !input || document.activeElement !== input) return;
    const config = appearance();
    caret.style.opacity = visible ? '1' : '0';
    blinkTimer = setTimeout(() => scheduleBlink(!visible), visible ? config.visibleDuration : config.hiddenDuration);
  }

  function restartBlink() {
    scheduleBlink(true);
  }

  function refresh() {
    requestAnimationFrame(() => {
      if (!input || !layer || document.activeElement !== input || input.selectionStart !== input.selectionEnd) {
        if (layer) layer.hidden = true;
        return;
      }
      const s=getComputedStyle(input), p=input.selectionStart;
      for (const k of ['font','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','boxSizing']) mirror.style[k]=s[k];
      layer.hidden=false; layer.style.left=`${input.offsetLeft}px`; layer.style.top=`${input.offsetTop}px`; layer.style.width=`${input.clientWidth}px`; layer.style.height=`${input.clientHeight}px`;
      mirror.style.width=`${input.clientWidth}px`; mirror.style.transform=`translate(${-input.scrollLeft}px,${-input.scrollTop}px)`;
      const config = appearance();
      caret.style.width=`${config.caretWidth}px`;
      caret.style.minWidth=`${config.caretWidth}px`;
      caret.style.backgroundColor=config.caretColor;
      beforeText.data=input.value.slice(0,p);
      afterText.data=input.value.slice(p);
    });
  }
  function bind(textarea) {
    if (!textarea || textarea.dataset.composerCaretBound) return;
    input=textarea; input.dataset.composerCaretBound='1'; const row=input.closest('.post-input-row'); if(!row)return;
    layer=document.createElement('div'); layer.className='post-compose-caret-layer';
    mirror=document.createElement('div'); mirror.className='post-compose-caret-mirror';
    beforeText=document.createTextNode('');
    caret=document.createElement('span'); caret.className='post-compose-caret';
    afterText=document.createTextNode('');
    mirror.append(beforeText,caret,afterText); layer.appendChild(mirror); row.appendChild(layer);
    for(const type of ['input','select','keyup','click','scroll']) input.addEventListener(type,refresh,{passive:type==='scroll'});
    input.addEventListener('focus',()=>{refresh();restartBlink();});
    input.addEventListener('blur',()=>{stopBlink();refresh();});
    window.addEventListener('jetnote:editor-appearance-changed',()=>{refresh();restartBlink();});
  }
  return {bind,refresh};
})();

const EditorController = (() => {
  const State = Object.freeze({ CLOSED: 'CLOSED', OPENING: 'OPENING', EDITING: 'EDITING', TOOL_ACTIVE: 'TOOL_ACTIVE', SAVING: 'SAVING', CLOSING: 'CLOSING' });
  let state = State.CLOSED, snapshotTimer = null, writeChain = Promise.resolve(), boundTextarea = null;
  const clone = value => structuredClone(value);
  function compatible(saved, initial) { return saved?.version === PostDraftStore.VERSION && saved.mode === initial.mode && String(saved.postId ?? '') === String(initial.postId ?? ''); }
  function runtimeMedia() { return typeof draftMedia === 'undefined' ? [] : [...draftMedia.post.values()]; }
  function queueSnapshot(reason = 'change') {
    const draft = PostDraftStore.get(); if (!draft) return Promise.resolve();
    draft.snapshotReason = reason; draft.snapshotAt = Date.now();
    writeChain = writeChain.catch(() => {}).then(() => EntryStore.saveDraft(draft, runtimeMedia()));
    return writeChain.catch(error => console.warn('[Editor] draft snapshot failed', error));
  }
  function scheduleSnapshot(reason) { clearTimeout(snapshotTimer); snapshotTimer = setTimeout(() => queueSnapshot(reason), 250); }
  async function loadCompatibleSnapshot(initial) {
    try { const saved = await EntryStore.readDraft(); return compatible(saved, initial) ? saved : null; }
    catch (error) { console.warn('[Editor] draft restore failed', error); return null; }
  }
  function hydrateRuntimeMedia(draft) {
    if (typeof draftMedia === 'undefined') return;
    draftMedia.post.clear();
    for (const attachment of draft.attachments || []) draftMedia.post.set(attachment.id, attachment);
  }
  function markUi(patch) {
    const draft = PostDraftStore.get(); if (!draft) return;
    PostDraftStore.update({ ui: { ...draft.ui, ...patch } });
  }
  function syncFromView() {
    if (state === State.CLOSED) return;
    const draft = PostDraftStore.get(), { textarea, body } = EditorView.get();
    PostDraftStore.update({ text: textarea ? textarea.value : draft.text, selectionStart: textarea?.selectionStart ?? draft.selectionStart, selectionEnd: textarea?.selectionEnd ?? draft.selectionEnd, scrollTop: body?.scrollTop ?? draft.scrollTop });
    scheduleSnapshot('view-sync');
  }
  function setMedia({ images, attachments }) {
    if (state === State.CLOSED) return;
    const nextAttachments = clone(attachments || []);
    PostDraftStore.update({ images: clone(images || []), attachments: nextAttachments, audio: nextAttachments.filter(item => item.type === 'audio'), video: nextAttachments.filter(item => item.type === 'video') });
    scheduleSnapshot('media-change');
  }
  function setText(text, selectionStart, selectionEnd) {
    if (state === State.CLOSED) return;
    PostDraftStore.update({ text: String(text || ''), selectionStart, selectionEnd });
    scheduleSnapshot('text-change');
  }
  async function begin(initial) {
    if (state !== State.CLOSED) throw new Error(`Editor cannot open from ${state}`);
    state = State.OPENING;
    const restored = await loadCompatibleSnapshot(initial), draft = PostDraftStore.replace(restored || initial);
    hydrateRuntimeMedia(draft); state = State.EDITING;
    await queueSnapshot(restored ? 'restore' : 'open');
    return PostDraftStore.get();
  }
  function setNativeImagePasteTarget(active) {
    try { window.JetNoteNative?.setPostComposerImagePasteTargetActive?.(!!active); } catch (_) {}
  }
  async function handleBrowserImagePaste(event, textarea) {
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find(item => item.kind === 'file' && String(item.type || '').toLowerCase().startsWith('image/'));
    if (!imageItem) return;
    const file = imageItem.getAsFile?.();
    if (!file || !window.JetNotePastedImage?.acceptClipboardFile) return;

    // Rich-image paste is an attachment action. Prevent WebView from inserting
    // a filename/object replacement character into the post text. Plain-text
    // clipboard pastes are untouched because this path runs only for image files.
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
    textarea.addEventListener('paste', event => { void handleBrowserImagePaste(event, textarea); });
    textarea.addEventListener('input', () => setText(textarea.value, textarea.selectionStart || 0, textarea.selectionEnd || 0));
    textarea.addEventListener('select', syncFromView);
    textarea.addEventListener('scroll', () => { if (state === State.EDITING) scheduleSnapshot('text-scroll'); }, { passive: true });
  }
  async function suspend(toolId = 'background') {
    if (state !== State.EDITING) return;
    syncFromView(); markUi({ activeTool: toolId }); state = State.TOOL_ACTIVE;
    await queueSnapshot('suspend');
  }
  function resume() {
    if (state !== State.TOOL_ACTIVE) return null;
    markUi({ activeTool: null }); state = State.EDITING;
    const draft = PostDraftStore.get(); EditorView.setText(draft.text); EditorView.restoreSelection(draft);
    return draft;
  }
  function validate() {
    const draft = PostDraftStore.get();
    if (!draft) return { ok: false, code: 'missing-draft' };
    if (!PostDraftStore.hasContent(draft)) return { ok: false, code: 'empty-post' };
    if (draft.images.length && draft.video.length) return { ok: false, code: 'image-video-exclusive' };
    return { ok: true, draft };
  }
  async function publish(commit) {
    if (state !== State.EDITING) return { ok: false, code: 'invalid-state' };
    syncFromView(); const check = validate(); if (!check.ok) return check;
    state = State.SAVING;
    try { await commit(clone(check.draft)); await EntryStore.clearDraft(); PostDraftStore.clear(); state = State.CLOSED; return { ok: true }; }
    catch (error) { state = State.EDITING; console.error('[Editor] publish failed', error); return { ok: false, code: 'save-failed', error }; }
  }
  async function discard() {
    if (state === State.CLOSED) return;
    setNativeImagePasteTarget(false);
    state = State.CLOSING; clearTimeout(snapshotTimer);
    try { await EntryStore.clearDraft(); } catch (error) { console.warn('[Editor] draft cleanup failed', error); }
    PostDraftStore.clear(); state = State.CLOSED;
  }
  // An opening failure must never leave the editor stuck in OPENING. Keep the
  // persisted snapshot intact so the next successful open can restore it.
  function abortOpen() {
    setNativeImagePasteTarget(false);
    clearTimeout(snapshotTimer);
    PostDraftStore.clear();
    state = State.CLOSED;
  }
  function setToolsExpanded(expanded) { markUi({ toolsExpanded: !!expanded }); scheduleSnapshot('tool-ui'); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) { suspend('background'); return; } if (resume()) window.dispatchEvent(new CustomEvent('jetnote:editor-resume')); });
  return Object.freeze({ State, begin, bindTextarea, syncFromView, setText, setMedia, suspend, resume, validate, publish, discard, abortOpen, setToolsExpanded, get state() { return state; }, get draft() { return PostDraftStore.get(); } });
})();

// Native tool overlays use this public boundary to resume a suspended editor.
window.EditorController = EditorController;
