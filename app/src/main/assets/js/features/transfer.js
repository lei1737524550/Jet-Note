let pendingArchive=null;
function archiveStatus(message){const el=document.getElementById('archiveStatus');if(el)el.textContent=message;}
function openDictionary(){if(window.JetNoteNative?.openDictionary)JetNoteNative.openDictionary(currentLanguage);else window.open('https://www.merriam-webster.com/','_blank','noopener');}
function openSentences(){if(window.JetNoteNative?.openSentences)JetNoteNative.openSentences(currentLanguage);else window.open('https://soundoftext.com/','_blank','noopener');}
async function exportArchive(){
  if(!entriesReady||entriesBusy)return;
  if(window.JetNoteNative?.exportJetNote){await exportNativeArchive();return;}
  entriesBusy=true;archiveStatus(t('exporting'));
  try{const snapshot=await EntryStore.read(),bytes=await ArchiveCodec.exportSnapshot(snapshot),name='JetNote_'+new Date().toISOString().replace(/[:.]/g,'-')+'.jnote',blob=new Blob([bytes],{type:'application/vnd.jnote+zip'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);archiveStatus(t('exportDone'));}catch(error){archiveStatus(t('transferFailed')+error.message);}finally{entriesBusy=false;}
}
async function selectArchive(event){
  const file=event.target.files?.[0];event.target.value='';if(!file||entriesBusy||!entriesReady)return;entriesBusy=true;archiveStatus(t('validating'));
  try{if(file.size>ARCHIVE_MAX)throw Error('Backup exceeds 128 MiB');pendingArchive=ArchiveCodec.validate(new Uint8Array(await file.arrayBuffer()));showImportPreview();}catch(error){pendingArchive=null;archiveStatus(t('transferFailed')+error.message);alert(t('transferFailed')+error.message);}finally{entriesBusy=false;}
}
function showImportPreview(){document.getElementById('importSummary').textContent=t('posts')+': '+pendingArchive.posts.length+' · '+t('attachments')+': '+pendingArchive.media.length;document.getElementById('importMode').value='merge';document.getElementById('importPreview').classList.add('open');archiveStatus(t('verified'));}
function closeImportPreview(){if(entriesBusy)return;if(pendingArchive?.nativeToken)JetNoteNative.rollbackImport(pendingArchive.nativeToken);pendingArchive=null;document.getElementById('importPreview')?.classList.remove('open');}
async function importSnapshot(incoming,mode){
  if(!['merge','replace','add'].includes(mode))throw Error('Invalid import mode');const current=await EntryStore.read(),used=new Set((current.posts||[]).map(x=>x.id));let next=Math.max(Date.now(),...used)+1;const stats={added:0,updated:0,kept:0};
  function allocate(item){const copy=structuredClone(item);if(used.has(copy.id)){copy.legacyId=copy.legacyId??copy.id;copy.id=next++;}used.add(copy.id);return copy;}
  function combine(local,imported){if(mode==='replace')return imported.map(item=>{stats.added++;return allocate(item);});const result=structuredClone(local),index=new Map(result.map((entry,i)=>[entry.uuid,i]));for(const original of imported){let entry=original;if(!index.has(entry.uuid)&&/^\d+$/.test(entry.uuid)){const matched=result.find(x=>String(x.legacyId??x.id)===entry.uuid);if(matched)entry={...entry,uuid:matched.uuid};}if(!index.has(entry.uuid)){index.set(entry.uuid,result.length);result.push(allocate(entry));stats.added++;}else{const i=index.get(entry.uuid),existing=result[i],newer=entry.updatedAt&&Date.parse(entry.updatedAt)>(Date.parse(existing.updatedAt)||0);if(mode==='merge'&&newer){result[i]={...structuredClone(entry),id:existing.id};stats.updated++;}else stats.kept++;}}return result;}
  if(mode==='replace')used.clear();const nextPosts=combine(current.posts||[],incoming.posts);for(const media of incoming.media){const local=await EntryStore.media(media.id);if(local&&local.sha256!==media.sha256)throw Error('Attachment ID collision');}await EntryStore.commit(nextPosts,incoming.media);posts=nextPosts;renderPosts();return stats;
}
async function confirmArchiveImport(){
  if(!pendingArchive||entriesBusy)return;entriesBusy=true;archiveStatus(t('importing'));if(pendingArchive.nativeToken){pendingArchive.selectedMode=document.getElementById('importMode').value;JetNoteNative.commitImportMedia(pendingArchive.nativeToken);return;}
  try{const stats=await importSnapshot(pendingArchive,document.getElementById('importMode').value);finishImport(stats);}catch(error){archiveStatus(t('transferFailed')+error.message);alert(t('transferFailed')+error.message);}finally{entriesBusy=false;}
}
function finishImport(stats){archiveStatus(t('importDone')+' '+t('added')+': '+stats.added+' · '+t('updated')+': '+stats.updated+' · '+t('kept')+': '+stats.kept);pendingArchive=null;document.getElementById('importPreview').classList.remove('open');}
function chooseArchive(){if(entriesBusy||!entriesReady)return;if(window.JetNoteNative?.importJetNote){entriesBusy=true;archiveStatus(t('validating'));JetNoteNative.importJetNote('merge');}else document.getElementById('archivePicker').click();}
async function exportNativeArchive(){
  entriesBusy=true;archiveStatus(t('exporting'));
  try{const state=await EntryStore.read(),payload={appVersion:'2.4',posts:[]};for(const item of state.posts||[])payload.posts.push(await ArchiveMapping.toCanonical(item,meta=>NativeMedia.ensure(meta),source=>NativeMedia.image(source)));JetNoteNative.exportJetNote(JSON.stringify(payload));archiveStatus(t('chooseDestination'));}catch(error){entriesBusy=false;archiveStatus(t('transferFailed')+error.message);alert(t('transferFailed')+error.message);}
}
window.JetNoteArchive={
  onValidated(token,mode,postsJson){
    try{if(pendingArchive||!entriesReady||document.querySelector('#postComposeScreen.open'))throw Error('请先完成当前编辑或导入');pendingArchive=ArchiveMapping.fromCanonical(JSON.parse(postsJson),attachment=>({...attachment,sha256:attachment.sha256.toLowerCase()}));pendingArchive.nativeToken=token;showImportPreview();}catch(error){JetNoteNative.rollbackImport(token);archiveStatus(t('transferFailed')+error.message);alert(t('transferFailed')+error.message);}finally{entriesBusy=false;}
  },
  async onMediaCommitted(token){if(pendingArchive?.nativeToken!==token){JetNoteNative.rollbackImport(token);entriesBusy=false;return;}try{const stats=await importSnapshot(pendingArchive,pendingArchive.selectedMode);JetNoteNative.finalizeImport(token);finishImport(stats);}catch(error){JetNoteNative.rollbackImport(token);pendingArchive=null;document.getElementById('importPreview').classList.remove('open');archiveStatus(t('transferFailed')+error.message);alert(t('transferFailed')+error.message);}finally{entriesBusy=false;}},
  onError(message){entriesBusy=false;archiveStatus(t('transferFailed')+message);if(pendingArchive?.nativeToken){pendingArchive=null;document.getElementById('importPreview').classList.remove('open');}if(message!=='已取消导入')alert(message);},
  onExportFinished(success,message){entriesBusy=false;archiveStatus(message);if(!success&&message!=='已取消导出')alert(message);}
};
