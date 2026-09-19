let pendingArchive=null;
let archiveOperationState={operation:'',phase:'',active:false,cancelling:false};
let archiveFallbackCancellationRequested=false;
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
function setArchiveOperationState(operation='',phase='',active=false,cancelling=false){
  const nextOperation=String(operation||'');
  const keepCancelling=!!active&&archiveOperationState.cancelling&&archiveOperationState.operation===nextOperation;
  archiveOperationState={operation:nextOperation,phase:String(phase||''),active:!!active,cancelling:!!cancelling||keepCancelling};
  const stop=document.getElementById('archiveStopButton');
  const exportButton=document.querySelector('.backup-card .settings-option-grid button:nth-child(1)');
  const importButton=document.querySelector('.backup-card .settings-option-grid button:nth-child(2)');
  if(stop)stop.disabled=!archiveOperationState.active||archiveOperationState.cancelling;
  if(exportButton)exportButton.disabled=archiveOperationState.active;
  if(importButton)importButton.disabled=archiveOperationState.active;
}
function archiveCancelledError(){
  const error=new Error('Archive operation cancelled');
  error.name='AbortError';
  return error;
}
function throwIfArchiveFallbackCancelled(){
  if(archiveFallbackCancellationRequested)throw archiveCancelledError();
}
function cancelArchiveOperation(){
  if(!archiveOperationState.active||archiveOperationState.cancelling)return;
  const operation=archiveOperationState.operation;
  setArchiveOperationState(operation,archiveOperationState.phase,true,true);
  archiveFallbackCancellationRequested=true;
  archiveStatus(t('archiveStopping')||'Stopping…');
  if(window.JetNoteNative?.cancelArchiveOperation){
    window.JetNoteNative.cancelArchiveOperation(operation);
    return;
  }
  if(operation==='import'){
    pendingArchive=null;
    document.getElementById('importPreview')?.classList.remove('open');
    entriesBusy=false;
    setArchiveOperationState('', '', false);
    clearArchiveProgress();
    archiveStatus(t('archiveImportCancelled'));
  }else if(operation==='export'){
    entriesBusy=false;
    setArchiveOperationState('', '', false);
    clearArchiveProgress();
    archiveStatus(t('archiveExportCancelled'));
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
  archiveFallbackCancellationRequested=false;
  setArchiveOperationState('export','prepare',true);
  archiveStatus(t('exporting'));
  setArchiveProgress({message:'Preparing export…',percent:0});
  try{
    const snapshot=await EntryStore.read();
    throwIfArchiveFallbackCancelled();
    const bytes=await ArchiveCodec.exportSnapshot(snapshot);
    throwIfArchiveFallbackCancelled();
    const name='JetNote_'+new Date().toISOString().replace(/[:.]/g,'-')+'.jnote',blob=new Blob([bytes],{
      type:'application/vnd.jnote+zip'
    }),url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;
    link.download=name;
    link.click();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    throwIfArchiveFallbackCancelled();
    archiveStatus(t('exportDone'));
    setArchiveOperationState('', '', false);
  }catch(error){
    if(error?.name==='AbortError')archiveStatus(t('archiveExportCancelled'));
    else archiveStatus(t('transferFailed')+error.message);
  }
  finally{
    entriesBusy=false;
    archiveFallbackCancellationRequested=false;
    setArchiveOperationState('', '', false);
  }
}
async function selectArchive(event){
  const file=event.target.files?.[0];
  event.target.value='';
  if(!file||entriesBusy||!entriesReady)return;
  entriesBusy=true;
  archiveFallbackCancellationRequested=false;
  setArchiveOperationState('import','read',true);
  archiveStatus(t('validating'));
  try{
    if(file.size>ARCHIVE_MAX)throw Error('Backup exceeds 128 MiB');
    throwIfArchiveFallbackCancelled();
    const raw=await file.arrayBuffer();
    throwIfArchiveFallbackCancelled();
    pendingArchive=ArchiveCodec.validate(new Uint8Array(raw));
    throwIfArchiveFallbackCancelled();
    showImportPreview();
  }catch(error){
    pendingArchive=null;
    if(error?.name==='AbortError')archiveStatus(t('archiveImportCancelled'));
    else{archiveStatus(t('transferFailed')+error.message);alert(t('transferFailed')+error.message);}
  }
  finally{
    entriesBusy=false;
    archiveFallbackCancellationRequested=false;
    setArchiveOperationState('', '', false);
  }
}
function selectImportMode(mode){
  if(!['add','merge','replace'].includes(mode))return;
  const input=document.getElementById('importMode');
  if(input)input.value=mode;
  document.querySelectorAll('#importModeChoices [data-import-mode]').forEach(button=>{
    const selected=button.dataset.importMode===mode;
    button.classList.toggle('selected',selected);
    button.setAttribute('aria-checked',selected?'true':'false');
  });
}
function showImportPreview(){
  document.getElementById('importSummary').textContent=t('posts')+': '+pendingArchive.posts.length+' · '+t('attachments')+': '+pendingArchive.media.length;
  selectImportMode('merge');
  document.getElementById('importPreview').classList.add('open');
  archiveStatus(t('verified'));
}
function closeImportPreview(){
  if(entriesBusy)return;
  if(pendingArchive?.nativeToken)JetNoteNative.rollbackImport(pendingArchive.nativeToken);
  pendingArchive=null;
  archiveFallbackCancellationRequested=false;
  setArchiveOperationState('', '', false);
  document.getElementById('importPreview')?.classList.remove('open');
}
async function importSnapshot(incoming, mode) {
  if (!['merge', 'replace', 'add'].includes(mode)) {
    throw Error('Invalid import mode');
  }

  throwIfArchiveFallbackCancelled();
  const current = (await EntryStore.read()) || { posts: [] };
  throwIfArchiveFallbackCancelled();
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

    // Add means clone-and-append, not de-duplicate. Every imported Post gets a
    // fresh local identity while preserving its content and timestamps. This
    // makes exporting N Posts and importing the same archive with Add produce
    // N additional Posts. Attachment IDs are intentionally preserved so the
    // clone can safely reference the same immutable media record.
    if (mode === 'add') {
      for (const original of imported) {
        const copy = structuredClone(original);
        copy.id = next++;
        copy.uuid = entryUuid();
        delete copy.legacyId;
        used.add(copy.id);
        result.push(copy);
        stats.added++;
      }
      return result;
    }

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
      throwIfArchiveFallbackCancelled();
      const local = await EntryStore.media(media.id);
      if (local && local.sha256 !== media.sha256) {
        throw Error('Attachment ID collision');
      }
    }
  }

  const originalMedia=[];
  for(const attachment of localPosts.flatMap(item=>item.attachments||[])){
    throwIfArchiveFallbackCancelled();
    const record=await EntryStore.media(attachment.id);
    if(record)originalMedia.push(record);
  }
  let importCommitted=false;
  try {
    throwIfArchiveFallbackCancelled();
    await EntryStore.commit(nextPosts, importedMedia);
    importCommitted=true;
    throwIfArchiveFallbackCancelled();

    if (mode === 'replace') {
      const referencedMediaIds = new Set(
        nextPosts.flatMap(item => (item.attachments || []).map(a => String(a.id)))
      );
      await EntryStore.removeUnreferencedMedia(referencedMediaIds);
      throwIfArchiveFallbackCancelled();
    }
  } catch (error) {
    if(error?.name==='AbortError'&&importCommitted){
      await EntryStore.commit(localPosts,originalMedia);
      const originalIds=new Set(localPosts.flatMap(item=>(item.attachments||[]).map(a=>String(a.id))));
      await EntryStore.removeUnreferencedMedia(originalIds);
    }
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
  archiveFallbackCancellationRequested=false;
  setArchiveOperationState('import','commit',true);
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
    if(error?.name==='AbortError')archiveStatus(t('archiveImportCancelled'));
    else{archiveStatus(t('transferFailed')+error.message);alert(t('transferFailed')+error.message);}
  }
  finally{
    entriesBusy=false;
    archiveFallbackCancellationRequested=false;
    setArchiveOperationState('', '', false);
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
    archiveFallbackCancellationRequested=false;
    setArchiveOperationState('import','select',true);
    archiveStatus(t('validating'));
    setArchiveProgress({message:'Choose a backup file…',percent:0});
    JetNoteNative.importJetNote('merge');
  }else document.getElementById('archivePicker').click();
}
async function exportNativeArchive(){
  entriesBusy=true;
  archiveFallbackCancellationRequested=false;
  setArchiveOperationState('export','prepare',true);
  archiveStatus(t('exporting'));
  setArchiveProgress({message:'Preparing export data…',percent:0});
  try{
    const state=await EntryStore.read(),payload={
      appVersion:'4.0',posts:[]
    };
    for(const item of state.posts||[])payload.posts.push(await ArchiveMapping.toCanonical(item,meta=>NativeMedia.ensure(meta),source=>NativeMedia.image(source)));
    JetNoteNative.exportJetNote(JSON.stringify(payload));
    setArchiveOperationState('export','select',true);
    archiveStatus(t('fileTaskExportDefaultDestinationStatus'));
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
  onValidated(token,mode,postsJson,profileJson,configJson){
    try{
      if(pendingArchive||!entriesReady||document.querySelector('#postComposeScreen.open'))throw Error('Finish the current edit or import first.');
      pendingArchive=ArchiveMapping.fromCanonical(JSON.parse(postsJson),attachment=>({
        ...attachment,sha256:attachment.sha256.toLowerCase()
      }));
      // Legacy archives may still carry profile.json. It is intentionally ignored.
      pendingArchive.profile=null;
      pendingArchive.config=configJson?JSON.parse(configJson):null;
      pendingArchive.nativeToken=token;
      showImportPreview();
      entriesBusy=false;
      setArchiveOperationState('import','ready',true);
    }catch(error){
      JetNoteNative.rollbackImport(token);
      entriesBusy=false;
      if(error?.name==='AbortError')archiveStatus(t('archiveImportCancelled'));
      else{archiveStatus(t('transferFailed')+error.message);alert(t('transferFailed')+error.message);}
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
      archiveFallbackCancellationRequested=false;
      setArchiveOperationState('import','database',true);
      const importedConfig=pendingArchive?.config||null;
      const stats=await importSnapshot(pendingArchive,pendingArchive.selectedMode);
      if(importedConfig?.__jetnoteConfigFolder){
        for(const [sectionName, sectionValue] of Object.entries(importedConfig.__jetnoteConfigFolder)){
          const saved=window.JetNoteNative?.setRuntimeConfigSectionJson?.(sectionName,JSON.stringify(sectionValue));
          if(saved===false)throw Error('Unable to restore config/'+sectionName+' from backup.');
        }
      }else if(importedConfig){
        // Legacy .jnote archives used one data/config.json snapshot.
        const saved=window.JetNoteNative?.setRuntimeConfigJson?.(JSON.stringify(importedConfig));
        if(saved===false)throw Error('Unable to restore legacy config.json from backup.');
      }
      setArchiveOperationState('import','finalize',true,true);
      JetNoteNative.finalizeImport(token);
      finishImport(stats);
      if(importedConfig)setTimeout(()=>location.reload(),120);
    }catch(error){
      JetNoteNative.rollbackImport(token);
      pendingArchive=null;
      document.getElementById('importPreview')?.classList.remove('open');
      if(error?.name==='AbortError')archiveStatus(t('archiveImportCancelled'));
      else{archiveStatus(t('transferFailed')+error.message);alert(t('transferFailed')+error.message);}
    }finally{
      entriesBusy=false;
      archiveFallbackCancellationRequested=false;
    }
  },
  onError(message){
    entriesBusy=false;
    setArchiveOperationState('', '', false);
    if(message==='Import cancelled'){pendingArchive=null;document.getElementById('importPreview')?.classList.remove('open');clearArchiveProgress();archiveStatus(t('archiveImportCancelled'));return;}
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

queueMicrotask(()=>setArchiveOperationState('', '', false));
