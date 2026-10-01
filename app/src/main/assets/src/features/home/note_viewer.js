(() => {
  const screen=()=>document.getElementById('noteViewerScreen');
  let moving=false;
  let returnToArchive=false;
  function finishViewerClose(s){
    releaseAttachmentUrls?.(s);
    s.classList.remove('open');
    s.setAttribute('aria-hidden','true');
    window.__jetSyncNativeVideoVisibility?.();
    document.body.style.overflow=returnToArchive?'hidden':'';
  }
  async function closeNoteViewer(){
    const s=screen(); if(!s||!s.classList.contains('open')||moving)return;
    const header=s.querySelector('.note-viewer-header'), body=document.getElementById('noteViewerScroll');
    moving=true;
    try{
      const ok=await window.SharedTransition.run({page:window.SharedTransition.Page.EDITOR,phase:window.SharedTransition.Phase.EXIT,screen:s,header,body,finish:()=>finishViewerClose(s)});
      if(!ok)finishViewerClose(s);
    } finally { moving=false; }
  }
  async function openNoteViewer(postId){
    if(moving)return;
    const post=posts.find(item=>String(item.id)===String(postId)); const s=screen(); if(!post||!s)return;
    returnToArchive=!!document.getElementById('archiveScreen')?.classList.contains('open');
    if(s.parentElement!==document.body)document.body.appendChild(s);
    const text=document.getElementById('noteViewerText'), visual=document.getElementById('noteViewerVisual'), audio=document.getElementById('noteViewerAudio'), scroll=document.getElementById('noteViewerScroll');
    const header=s.querySelector('.note-viewer-header');
    // Match the editor/media-viewer route boundary: the native video surface is a
    // TextureView outside the WebView, so the Home owner must be released and the
    // overlay suppressed BEFORE the viewer is exposed. Otherwise Home's decoded
    // frame can remain physically above the newly-rendered viewer.
    window.JetNoteMediaResourceManager?.releaseScope?.('home','open-note-viewer');
    window.JetNoteVideoOverlay?.suspend?.();
    releaseAttachmentUrls?.(s); text.innerHTML=renderPostColorCommands(post.text||'',post.colorCommands); const nt=document.getElementById('noteViewerNoteTitle'); if(nt){nt.textContent=post.title||'';nt.hidden=!post.title;}
    visual.innerHTML=renderPublishedVisualMediaHTML(Array.isArray(post.images)?post.images:[],post.attachments)||'';
    const audios=(Array.isArray(post.attachments)?post.attachments:[]).filter(x=>x?.type==='audio'); audio.innerHTML=renderAttachments(audios)||'';
    moving=true;
    try{
      const entered=await window.SharedTransition.run({page:window.SharedTransition.Page.EDITOR,phase:window.SharedTransition.Phase.ENTER,screen:s,header,body:scroll,prepare:()=>{s.classList.add('open');s.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';scroll.scrollTop=0;window.__jetSyncNativeVideoVisibility?.();}});
      if(!entered)return;
      hydrateAttachments(audio);hydrateVideoAttachments(visual);bindPublishedInlineImageZoom?.(visual);window.__jetSyncNativeVideoVisibility?.();
    } finally { moving=false; }
  }
  document.addEventListener('click',e=>{
    if(e.target.closest('.note-viewer-close')){e.preventDefault();void closeNoteViewer();return;}
    // Viewing is an explicit action. Blank Post surface taps deliberately do nothing.
    if(screen()?.classList.contains('open'))return;
  });
  window.openNoteViewer=openNoteViewer;window.closeNoteViewer=closeNoteViewer;
})();
