
let shortStartupTimer = null;

function startupLoaderText(key, fallback) {
  return typeof t === 'function' ? t(key) : fallback;
}

function setStartupLoadingProgress(percent, message) {
  const overlay = document.getElementById('startupLoading');
  const fill = document.getElementById('startupLoadingFill');
  const pct = document.getElementById('startupLoadingPercent');
  const label = document.getElementById('startupLoadingLabel');
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  if (overlay) overlay.hidden = false;
  if (fill) fill.style.width = `${p}%`;
  if (pct) pct.textContent = `${Math.round(p)}%`;
  if (label && message) label.textContent = message;
  const track = overlay?.querySelector('.startup-loading-track');
  if (track) track.setAttribute('aria-valuenow', String(Math.round(p)));
}

function hideStartupLoading() {
  if (shortStartupTimer) {
    clearTimeout(shortStartupTimer);
    shortStartupTimer = null;
  }
  const overlay = document.getElementById('startupLoading');
  if (overlay) overlay.hidden = true;
  document.documentElement.classList.remove('startup-loading-active');
}

/* Regular starts get a brief, deliberate progress animation instead of a flash. */
function startShortStartupLoading() {
  const state = window.JetNoteStartupLoader || {};
  state.startedAt = state.startedAt || Date.now();
  window.JetNoteStartupLoader = state;
  setStartupLoadingProgress(12, startupLoaderText('startupDownloading', 'Downloading…'));
  requestAnimationFrame(() => setStartupLoadingProgress(72, startupLoaderText('startupDownloading', 'Downloading…')));
  shortStartupTimer = setTimeout(() => {
    shortStartupTimer = null;
    setStartupLoadingProgress(92, startupLoaderText('startupDownloading', 'Downloading…'));
  }, 150);
}

async function finishShortStartupLoading() {
  const startedAt = window.JetNoteStartupLoader?.startedAt || Date.now();
  const remaining = Math.max(0, 200 - (Date.now() - startedAt));
  if (remaining) await new Promise(resolve => setTimeout(resolve, remaining));
  setStartupLoadingProgress(100, startupLoaderText('startupDownloading', 'Downloading…'));
  await new Promise(resolve => requestAnimationFrame(resolve));
  hideStartupLoading();
}

let pendingArchive=null;
function archiveStatus(message){
  const el=document.getElementById('archiveStatus');
  if(el)el.textContent=message;
}
let archiveProgressHideTimer=null;
function formatTransferBytes(value){
  if(!Number.isFinite(value)||value<0)return '';
  if(value<1024)return Math.round(value)+' B';
  let n=value/1024;
  if(n<1024)return n.toFixed(1)+' KB';
  n/=1024;
  if(n<1024)return n.toFixed(1)+' MB';
  return (n/1024).toFixed(2)+' GB';
}
function setArchiveProgress({message='',done=0,total=0,percent=0,finished=false,error=false}={}){
  const box=document.getElementById('archiveProgress');
  const label=document.getElementById('archiveProgressLabel');
  const pct=document.getElementById('archiveProgressPercent');
  const fill=document.getElementById('archiveProgressFill');
  const bytes=document.getElementById('archiveProgressBytes');
  const track=box?.querySelector('.archive-progress-track');
  if(!box||!label||!pct||!fill||!bytes)return;
  clearTimeout(archiveProgressHideTimer);
  box.hidden=false;
  const p=Math.max(0,Math.min(100,Number(percent)||0));
  label.textContent=message||'Processing…';
  pct.textContent=Math.round(p)+'%';
  fill.style.width=p+'%';
  if(track)track.setAttribute('aria-valuenow',String(Math.round(p)));
  bytes.textContent=total>0?(formatTransferBytes(done)+' / '+formatTransferBytes(total)):'';
  box.classList.toggle('error',!!error);
  if(finished&&!error)archiveProgressHideTimer=setTimeout(()=>{box.hidden=true;},2200);
}
function clearArchiveProgress(delay=0){
  const box=document.getElementById('archiveProgress');
  clearTimeout(archiveProgressHideTimer);
  if(!box)return;
  if(delay>0)archiveProgressHideTimer=setTimeout(()=>{box.hidden=true;},delay);
  else box.hidden=true;
}
function openDictionary(){
  if(window.JetNoteNative?.openDictionary)JetNoteNative.openDictionary('en');
  else window.open('https://www.merriam-webster.com/','_blank','noopener');
}
function openSentences(){
  if(window.JetNoteNative?.openSentences)JetNoteNative.openSentences('en');
  else window.open('https://soundoftext.com/','_blank','noopener');
}
async function exportArchive(){
  if (!isWorkspaceWritable()) return;
  if(!entriesReady||entriesBusy)return;
  if(window.JetNoteNative?.exportJetNote){
    await exportNativeArchive();
    return;
  }
  entriesBusy=true;
  archiveStatus(t('exporting'));
  setArchiveProgress({message:'Preparing export…',percent:0});
  try{
    const snapshot=await EntryStore.read(),bytes=await ArchiveCodec.exportSnapshot({
      ...snapshot
    }),name='JetNote_'+new Date().toISOString().replace(/[:.]/g,'-')+'.jnote',blob=new Blob([bytes],{
      type:'application/vnd.jnote+zip'
    }),url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;
    link.download=name;
    link.click();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    archiveStatus(t('exportDone'));
  }catch(error){
    archiveStatus(t('transferFailed')+error.message);
  }
  finally{
    entriesBusy=false;
  }
}
async function selectArchive(event){
  const file=event.target.files?.[0];
  event.target.value='';
  if(!file||entriesBusy||!entriesReady)return;
  entriesBusy=true;
  archiveStatus(t('validating'));
  try{
    if(file.size>ARCHIVE_MAX)throw Error('Backup exceeds 128 MiB');
    pendingArchive=ArchiveCodec.validate(new Uint8Array(await file.arrayBuffer()));
    showImportPreview();
  }catch(error){
    pendingArchive=null;
    archiveStatus(t('transferFailed')+error.message);
    alert(t('transferFailed')+error.message);
  }
  finally{
    entriesBusy=false;
  }
}
function showImportPreview(){
  document.getElementById('importSummary').textContent=t('posts')+': '+pendingArchive.posts.length+' · '+t('attachments')+': '+pendingArchive.media.length;
  document.getElementById('importMode').value='merge';
  document.getElementById('importPreview').classList.add('open');
  archiveStatus(t('verified'));
}
function closeImportPreview(){
  if(entriesBusy)return;
  if(pendingArchive?.nativeToken)JetNoteNative.rollbackImport(pendingArchive.nativeToken);
  pendingArchive=null;
  document.getElementById('importPreview')?.classList.remove('open');
}
async function importSnapshot(incoming, mode) {
  if (!['merge', 'replace', 'add'].includes(mode)) {
    throw Error('Invalid import mode');
  }

  const current = (await EntryStore.read()) || { posts: [] };
  const localPosts = Array.isArray(current.posts) ? current.posts : [];
  const importedPosts = Array.isArray(incoming.posts) ? incoming.posts : [];
  const importedMedia = Array.isArray(incoming.media) ? incoming.media : [];
  const used = new Set(localPosts.map(item => item.id));
  let next = Math.max(Date.now(), ...used) + 1;

  const stats = {
    added: 0,
    updated: 0,
    kept: 0
  };

  function allocate(item) {
    const copy = structuredClone(item);
    if (used.has(copy.id)) {
      copy.legacyId = copy.legacyId ?? copy.id;
      copy.id = next++;
    }
    used.add(copy.id);
    return copy;
  }

  function combine(local, imported) {
    if (mode === 'replace') {
      return imported.map(item => {
        stats.added++;
        return allocate(item);
      });
    }

    const result = structuredClone(local);
    const index = new Map(result.map((entry, i) => [entry.uuid, i]));

    for (const original of imported) {
      let entry = original;

      if (!index.has(entry.uuid) && /^\d+$/.test(entry.uuid)) {
        const matched = result.find(
          item => String(item.legacyId ?? item.id) === entry.uuid
        );
        if (matched) {
          entry = { ...entry, uuid: matched.uuid };
        }
      }

      if (!index.has(entry.uuid)) {
        index.set(entry.uuid, result.length);
        result.push(allocate(entry));
        stats.added++;
        continue;
      }

      const i = index.get(entry.uuid);
      const existing = result[i];
      const newer = entry.updatedAt
        && Date.parse(entry.updatedAt) > (Date.parse(existing.updatedAt) || 0);

      if (mode === 'merge' && newer) {
        result[i] = {
          ...structuredClone(entry),
          id: existing.id
        };
        stats.updated++;
      } else {
        stats.kept++;
      }
    }

    return result;
  }

  if (mode === 'replace') used.clear();
  const nextPosts = combine(localPosts, importedPosts);

  /*
   * Existing media is relevant for merge/add collision protection. During a
   * replace import, however, the incoming archive becomes the authoritative
   * data set, so an old attachment with the same ID must not prevent the
   * replacement from succeeding.
   */
  if (mode !== 'replace') {
    for (const media of importedMedia) {
      const local = await EntryStore.media(media.id);
      if (local && local.sha256 !== media.sha256) {
        throw Error('Attachment ID collision');
      }
    }
  }

  try {
    await EntryStore.commit(nextPosts, importedMedia);

    if (mode === 'replace') {
      const referencedMediaIds = new Set(
        nextPosts.flatMap(item => (item.attachments || []).map(a => String(a.id)))
      );
      await EntryStore.removeUnreferencedMedia(referencedMediaIds);
    }
  } catch (error) {
    throw error;
  }

  posts = nextPosts;
  renderPosts();
  return stats;
}

async function confirmArchiveImport(){
  if (!isWorkspaceWritable()) return;
  if(!pendingArchive||entriesBusy)return;
  entriesBusy=true;
  archiveStatus(t('importing'));
  setArchiveProgress({message:'Committing import…',percent:75});
  if(pendingArchive.nativeToken){
    pendingArchive.selectedMode=document.getElementById('importMode').value;
    JetNoteNative.commitImportMedia(pendingArchive.nativeToken);
    return;
  }
  try{
    const stats=await importSnapshot(pendingArchive,document.getElementById('importMode').value);
    finishImport(stats);
  }catch(error){
    archiveStatus(t('transferFailed')+error.message);
    alert(t('transferFailed')+error.message);
  }
  finally{
    entriesBusy=false;
  }
}
function finishImport(stats){
  setArchiveProgress({message:'Import complete',done:1,total:1,percent:100,finished:true});
  archiveStatus(t('importDone')+' '+t('added')+': '+stats.added+' · '+t('updated')+': '+stats.updated+' · '+t('kept')+': '+stats.kept);
  pendingArchive=null;
  document.getElementById('importPreview').classList.remove('open');
}
function chooseArchive(){
  if (!isWorkspaceWritable()) return;
  if(entriesBusy||!entriesReady)return;
  if(window.JetNoteNative?.importJetNote){
    entriesBusy=true;
    archiveStatus(t('validating'));
    setArchiveProgress({message:'Choose a backup file…',percent:0});
    JetNoteNative.importJetNote('merge');
  }else document.getElementById('archivePicker').click();
}
async function exportNativeArchive(){
  entriesBusy=true;
  archiveStatus(t('exporting'));
  setArchiveProgress({message:'Preparing export data…',percent:0});
  try{
    const state=await EntryStore.read(),payload={
      appVersion:'3.7',posts:[]
    };
    for(const item of state.posts||[])payload.posts.push(await ArchiveMapping.toCanonical(item,meta=>NativeMedia.ensure(meta),source=>NativeMedia.image(source)));
    JetNoteNative.exportJetNote(JSON.stringify(payload));
    archiveStatus(t('chooseDestination'));
  }catch(error){
    entriesBusy=false;
    archiveStatus(t('transferFailed')+error.message);
    alert(t('transferFailed')+error.message);
  }
}
window.JetNoteArchive={
  onProgress(operation,phase,done,total,percent,message){
    setArchiveProgress({
      message:message||((operation==='export'?'Export ':'Import ')+'in progress…'),
      done:Number(done)||0,total:Number(total)||0,percent:Number(percent)||0,
      finished:phase==='done',error:phase==='error'
    });
  },
  onValidated(token,mode,postsJson,profileJson){
    try{
      if(pendingArchive||!entriesReady||document.querySelector('#postComposeScreen.open'))throw Error('Finish the current edit or import first.');
      pendingArchive=ArchiveMapping.fromCanonical(JSON.parse(postsJson),attachment=>({
        ...attachment,sha256:attachment.sha256.toLowerCase()
      }));
      // Legacy archives may still carry profile.json. It is intentionally ignored.
      pendingArchive.profile=null;
      pendingArchive.nativeToken=token;
      showImportPreview();
      entriesBusy=false;
    }catch(error){
      JetNoteNative.rollbackImport(token);
      entriesBusy=false;
      archiveStatus(t('transferFailed')+error.message);
      alert(t('transferFailed')+error.message);
    }
  },
  async onMediaCommitted(token){
    if(pendingArchive?.nativeToken!==token){
      JetNoteNative.rollbackImport(token);
      entriesBusy=false;
      return;
    }
    try{
      setArchiveProgress({message:'Committing note data…',percent:96});
      const stats=await importSnapshot(pendingArchive,pendingArchive.selectedMode);
      JetNoteNative.finalizeImport(token);
      finishImport(stats);
    }catch(error){
      JetNoteNative.rollbackImport(token);
      pendingArchive=null;
      document.getElementById('importPreview')?.classList.remove('open');
      archiveStatus(t('transferFailed')+error.message);
      alert(t('transferFailed')+error.message);
    }finally{
      entriesBusy=false;
    }
  },
  onError(message){
    entriesBusy=false;
    if(message==='Import cancelled'){clearArchiveProgress();archiveStatus(message);return;}
    setArchiveProgress({message:message,percent:0,error:true});
    archiveStatus(t('transferFailed')+message);
    if(pendingArchive?.nativeToken){
      pendingArchive=null;
      document.getElementById('importPreview')?.classList.remove('open');
    }
    if(message!=='Import cancelled')alert(message);
  },
  onExportFinished(success,message){
    entriesBusy=false;
    if(!success&&message==='Export cancelled'){clearArchiveProgress();archiveStatus(message);return;}
    if(success)setArchiveProgress({message:'Export complete',done:1,total:1,percent:100,finished:true});
    else setArchiveProgress({message,percent:0,error:true});
    archiveStatus(message);
    if(!success&&message!=='Export cancelled')alert(message);
  }
};
