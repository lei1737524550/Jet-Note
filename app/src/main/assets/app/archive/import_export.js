let pendingArchive=null;
let archiveOperationState={operation:'',phase:'',active:false};
function archiveMessage(operation,phase,done=0,total=0,fallback=''){
  const keyMap={
    'export:prepare':'archivePreparingExport','export:archive':'archivePackingAttachments',
    'export:verify':'archiveVerifyingExport','export:write':'archiveWritingDestination',
    'export:done':'archiveExportComplete','import:select':'archiveChooseImport',
    'import:read':'archiveReadingImport','import:extract':'archiveExtractingImport',
    'import:validate':'archiveValidatingImport','import:commit':'archiveInstallingMedia',
    'import:ready':'archiveImportReady','import:done':'archiveImportComplete'
  };
  const key=keyMap[`${operation}:${phase}`];
  let value=key?t(key):fallback;
  return value||fallback||((operation==='export'?'Export':'Import')+' in progress…');
}
function setArchiveOperationState(operation='',phase='',active=false){
  archiveOperationState={operation:String(operation||''),phase:String(phase||''),active:!!active};
  const cancel=document.getElementById('archiveProgressCancelButton');
  if(cancel) cancel.hidden=!(archiveOperationState.active&&archiveOperationState.operation==='export');
}
function cancelArchiveOperation(){
  if(!archiveOperationState.active)return;
  if(archiveOperationState.operation==='export'&&window.JetNoteNative?.cancelArchiveOperation){
    window.JetNoteNative.cancelArchiveOperation('export');
  }
}
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
  const cancel=document.getElementById('archiveProgressCancelButton');
  if(cancel) cancel.hidden=!(archiveOperationState.active&&archiveOperationState.operation==='export');
  if(finished&&!error)archiveProgressHideTimer=setTimeout(()=>{box.hidden=true;},2200);
}
function clearArchiveProgress(delay=0){
  const box=document.getElementById('archiveProgress');
  clearTimeout(archiveProgressHideTimer);
  if(!box)return;
  if(delay>0)archiveProgressHideTimer=setTimeout(()=>{box.hidden=true;},delay);
  else box.hidden=true;
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
  const localPosts = enforceSingleSuperStar(Array.isArray(current.posts) ? current.posts : []);
  const importedPosts = enforceSingleSuperStar(Array.isArray(incoming.posts) ? incoming.posts : []);
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
  const nextPosts = enforceSingleSuperStar(combine(localPosts, importedPosts));

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
      appVersion:'4.0',posts:[]
    };
    for(const item of state.posts||[])payload.posts.push(await ArchiveMapping.toCanonical(item,meta=>NativeMedia.ensure(meta),source=>NativeMedia.image(source)));
    JetNoteNative.exportJetNote(JSON.stringify(payload));
    setArchiveOperationState('export','select',true);
    archiveStatus(t('chooseDestination'));
  }catch(error){
    entriesBusy=false;
    archiveStatus(t('transferFailed')+error.message);
    alert(t('transferFailed')+error.message);
  }
}
window.JetNoteArchive={
  onProgress(operation,phase,done,total,percent,message){
    const finished=phase==='done';
    const error=phase==='error';
    setArchiveOperationState(operation,phase,!finished&&!error);
    setArchiveProgress({
      message:archiveMessage(operation,phase,done,total,message),
      done:Number(done)||0,total:Number(total)||0,percent:Number(percent)||0,
      finished,error
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
    setArchiveOperationState('', '', false);
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
    setArchiveOperationState('', '', false);
    const cancelled=!success&&/cancel/i.test(String(message||''));
    if(cancelled){const label=t('archiveExportCancelled');clearArchiveProgress();archiveStatus(label);return;}
    const label=success?t('archiveExportComplete'):(t('archiveExportFailed')+String(message||''));
    if(success)setArchiveProgress({message:label,done:1,total:1,percent:100,finished:true});
    else setArchiveProgress({message:label,percent:0,error:true});
    archiveStatus(label);
    if(!success)alert(label);
  }
};
