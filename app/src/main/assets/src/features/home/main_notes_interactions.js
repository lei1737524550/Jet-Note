
// Long-press the Home composer text to edit it. The surface itself is never selectable.
const composerLabelPress = {pointerId:null, button:null, timer:null, long:false, suppressNextClick:false, startX:0, startY:0};
function closeComposerLabelEditor(){ document.getElementById('composerLabelEditor')?.remove(); }
function openComposerLabelEditor(){
  closeComposerLabelEditor();
  const overlay=document.createElement('div');
  overlay.id='composerLabelEditor';
  overlay.className='composer-label-editor';
  const current=homeComposerLabel().replace(/^(?:#[0-9a-f]{6}\$)+/i,'');
  overlay.innerHTML=`<div class="composer-label-editor-card" role="dialog" aria-modal="true">
    <textarea class="composer-label-editor-input"></textarea>
    <div class="composer-label-editor-actions"><button type="button" data-label-cancel>${escapeHTML(t('cancel'))}</button><button type="button" data-label-save>${escapeHTML(t('save'))}</button></div>
  </div>`;
  document.body.appendChild(overlay);
  const input=overlay.querySelector('textarea'); input.value=current;
  overlay.querySelector('[data-label-cancel]').onclick=closeComposerLabelEditor;
  overlay.querySelector('[data-label-save]').onclick=()=>{
    const value=input.value.replace(/\r\n?/g,'\n').trim();
    try { value ? localStorage.setItem(HOME_COMPOSER_LABEL_KEY,'#552323$'+value.replace(/^(?:#[0-9a-f]{6}\$)+/i,'')) : localStorage.removeItem(HOME_COMPOSER_LABEL_KEY); } catch(_){}
    closeComposerLabelEditor(); renderPosts();
  };
  overlay.addEventListener('click',e=>{if(e.target===overlay)closeComposerLabelEditor();});
  input.focus(); input.setSelectionRange(input.value.length,input.value.length);
}
function clearComposerLabelPress(){
  clearTimeout(composerLabelPress.timer); composerLabelPress.timer=null;
  composerLabelPress.pointerId=null; composerLabelPress.button=null;
}
document.addEventListener('pointerdown',event=>{
  const button=event.target.closest('.post-composer-main'); if(!button||event.button>0||event.isPrimary===false)return;
  clearTimeout(composerLabelPress.timer); composerLabelPress.pointerId=event.pointerId; composerLabelPress.button=button; composerLabelPress.long=false;
  composerLabelPress.startX=event.clientX; composerLabelPress.startY=event.clientY;
  composerLabelPress.timer=setTimeout(()=>{composerLabelPress.long=true; composerLabelPress.timer=null; if(navigator.vibrate)navigator.vibrate(28); openComposerLabelEditor();},450);
});
document.addEventListener('pointermove',event=>{
  if(composerLabelPress.pointerId!==event.pointerId||composerLabelPress.timer===null)return;
  if(Math.hypot(event.clientX-composerLabelPress.startX,event.clientY-composerLabelPress.startY)>12) clearComposerLabelPress();
},{passive:true});
for(const type of ['pointerup','pointercancel']) document.addEventListener(type,event=>{
  if(composerLabelPress.pointerId!==event.pointerId)return;
  if(composerLabelPress.long) composerLabelPress.suppressNextClick=true;
  clearComposerLabelPress();
});
document.addEventListener('click',event=>{
  const surface=event.target.closest('.post-composer-main');
  if(!surface)return;
  if(composerLabelPress.suppressNextClick){
    composerLabelPress.suppressNextClick=false;
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  void openPostComposer();
});
document.addEventListener('contextmenu',event=>{if(event.target.closest('.post-composer-main'))event.preventDefault();});

const starPressState = {
  pointerId: null,
  button: null,
  timer: null,
  longPressTriggered: false
};
let suppressStarClick = false;

function clearStarPress({ releaseCapture = true } = {}) {
  if (starPressState.timer !== null) {
    clearTimeout(starPressState.timer);
    starPressState.timer = null;
  }
  if (releaseCapture && starPressState.button && starPressState.pointerId !== null) {
    try {
      if (starPressState.button.hasPointerCapture?.(starPressState.pointerId)) {
        starPressState.button.releasePointerCapture(starPressState.pointerId);
      }
    } catch (_) {}
  }
  starPressState.pointerId = null;
  starPressState.button = null;
  starPressState.longPressTriggered = false;
}

document.addEventListener('pointerdown', event => {
  const button = event.target.closest('#postStarAction[data-post-action="star"]');
  if (!button || event.button > 0 || event.isPrimary === false) return;

  clearStarPress();
  suppressStarClick = false;
  starPressState.pointerId = event.pointerId;
  starPressState.button = button;
  starPressState.longPressTriggered = false;

  // Pointer capture keeps a small finger drift inside the same gesture instead
  // of letting WebView scrolling/media surfaces cancel the long press.
  try { button.setPointerCapture?.(event.pointerId); } catch (_) {}

  starPressState.timer = setTimeout(() => {
    if (starPressState.pointerId !== event.pointerId || starPressState.button !== button) return;
    starPressState.timer = null;
    starPressState.longPressTriggered = true;
    suppressStarClick = true;
    if (navigator.vibrate) navigator.vibrate(28);
    void toggleSuperStarActivePost();
  }, 275);
});

document.addEventListener('pointerup', event => {
  if (starPressState.pointerId !== event.pointerId) return;
  clearStarPress();
});

document.addEventListener('pointercancel', event => {
  if (starPressState.pointerId !== event.pointerId) return;
  // A browser/system cancellation before the timer means the long press did
  // not complete. Pointer capture + touch-action:none makes this rare.
  clearStarPress();
});

document.addEventListener('lostpointercapture', event => {
  if (starPressState.pointerId !== event.pointerId) return;
  clearStarPress({ releaseCapture: false });
});

document.addEventListener('contextmenu', event => {
  if (event.target.closest('#postStarAction')) event.preventDefault();
});

document.addEventListener('click', event => {
  const action = event.target.closest('#postActionPanel [data-post-action]')?.dataset.postAction;
  if (action) {
    event.preventDefault();
    if (action === 'view') { const id=activePostActionId; if(id!=null){ closePostActionPanel(); void window.openNoteViewer?.(id); } }
    if (action === 'edit') void editActivePost();
    if (action === 'archive') { const id=activePostActionId; const p=posts.find(x=>String(x.id)===String(id)); if(id!=null) void setPostArchived(id,!p?.archived); }
    if (action === 'star') {
      if (suppressStarClick) { suppressStarClick = false; return; }
      void toggleStarActivePost();
    }
    if (action === 'delete') void deleteActivePost();
    return;
  }
  if (!event.target.closest('#postActionPanel') && !event.target.closest('.more')) {
    closePostActionPanel();
  }
});

initializePostComposerControls();
window.addEventListener('jetnote:editor-resume', () => {
  const screen = document.getElementById('postComposeScreen');
  if (!screen?.classList.contains('open')) return;
  renderPostImagePreview();
  renderPostVideoPreview();
  renderAudioDraft();
  ViewportManager.requestUpdate();
});

