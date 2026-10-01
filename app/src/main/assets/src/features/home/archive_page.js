function isArchivedPost(post){return !!post?.archived;}
function renderArchive(){
  const root=document.getElementById('archiveList');
  if(!root)return;
  const scrollTop=root.scrollTop;
  releaseAttachmentUrls(root);
  // Archive is an index, not a second Post renderer.  It deliberately owns no
  // attachment DOM at all: exactly one title line + one body line + More.
  root.innerHTML=posts.filter(isArchivedPost)
    .sort((a,b)=>String(b.updatedAt||b.createdAt).localeCompare(String(a.updatedAt||a.createdAt)))
    .map(post=>{
      const id=escapeHTML(String(post.id));
      const title=escapeHTML(String(post.title||''));
      const compactText=String(post.text||'').replace(/\s*\n\s*/g,' ');
      const text=renderPostColorCommands(compactText,post.colorCommands);
      // Reuse the exact Home favorite-state renderer. Archive owns only its compact
      // text layout; favorite state/icon semantics stay canonical and shared.
      const favoriteBadge=renderPostStarButton(post,id);
      return `<article class="archive-index-row common_border" data-post-id="${id}">
        <div class="archive-index-title note-typography">${title}</div>
        <div class="archive-index-actions">
          ${favoriteBadge}
          ${isWorkspaceWritable()?`<button class="more archive-index-more" data-post-id="${id}" onclick="openPostActionPanel(event,this.dataset.postId)" aria-label="${escapeHTML(t('moreActions'))}">${moreMenuIcon()}</button>`:''}
        </div>
        <div class="archive-index-text note-typography">${text}</div>
      </article>`;
    }).join('');
  root.scrollTop=scrollTop;
}

let archiveMoving=false;
async function openArchive(){
  closePostActionPanel?.();
  const s=document.getElementById('archiveScreen');
  if(!s||s.classList.contains('open')||archiveMoving)return;
  if(s.parentElement!==document.body)document.body.appendChild(s);
  // Archive is a full-screen route. Tear down Home media exactly like Settings/Editor
  // so no audio/video decoder or native TextureView survives underneath it.
  window.JetNoteMediaResourceManager?.releaseScope?.('home','open-archive');
  window.JetNoteVideoOverlay?.suspend?.();
  renderArchive(); archiveMoving=true;
  try{
    await window.SharedTransition.run({
      page:window.SharedTransition.Page.SETTINGS,
      phase:window.SharedTransition.Phase.ENTER,
      screen:s, header:s.querySelector('.archive-header'), body:s.querySelector('.archive-list'),
      prepare:()=>{s.classList.add('open');s.setAttribute('aria-hidden','false');window.__jetSyncNativeVideoVisibility?.();document.body.style.overflow='hidden';fitPublishedPostRows();}
    });
  }finally{archiveMoving=false;}
}
async function closeArchive(){
  const s=document.getElementById('archiveScreen');
  if(!s?.classList.contains('open')||archiveMoving)return;
  archiveMoving=true;
  try{
    await window.SharedTransition.run({
      page:window.SharedTransition.Page.SETTINGS,
      phase:window.SharedTransition.Phase.EXIT,
      screen:s, header:s.querySelector('.archive-header'), body:s.querySelector('.archive-list'),
      finish:()=>{releaseAttachmentUrls?.(s);s.classList.remove('open');s.setAttribute('aria-hidden','true');window.__jetSyncNativeVideoVisibility?.();document.body.style.overflow='';}
    });
  }finally{archiveMoving=false;}
}
function flashHomeArchiveButton(durationMs = 200) {
  const button = document.querySelector('[data-home-book-action]');
  const icon = button?.querySelector('img');
  if (!button || !icon) return;
  const normalSrc = 'src/shared/icons/book.svg';
  icon.src = 'src/shared/icons/book_archived.svg';
  button.classList.add('archive-feedback-active');
  window.setTimeout(() => {
    const currentButton = document.querySelector('[data-home-book-action]');
    const currentIcon = currentButton?.querySelector('img');
    if (currentIcon) currentIcon.src = normalSrc;
    currentButton?.classList.remove('archive-feedback-active');
  }, durationMs);
}

async function setPostArchived(id, value) {
  if (!isWorkspaceWritable()) return;
  const post = posts.find(item => String(item.id) === String(id));
  const archived = !!value;
  if (!post || isArchivedPost(post) === archived) return;
  post.archived = archived;
  post.updatedAt = new Date().toISOString();
  // Match favorite feedback: play immediately, before persistence and rendering.
  playPostUiSound(archived ? 'archive' : 'unarchive');
  await savePosts();
  renderPosts();
  if (archived) flashHomeArchiveButton(200);
  renderArchive();
  closePostActionPanel?.();
}
document.addEventListener('click',e=>{
  if(e.target.closest('[data-home-book-action]')){e.preventDefault();void openArchive();return;}
  if(e.target.closest('.archive-close')){e.preventDefault();void closeArchive();return;}
});
window.openArchive=openArchive;window.closeArchive=closeArchive;window.setPostArchived=setPostArchived;
