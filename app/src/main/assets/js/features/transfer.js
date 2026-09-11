
const DEMO_ARCHIVE_ASSET = 'https://appassets.androidplatform.net/demo.jnote';
const DEMO_ARCHIVE_SEED_KEY = 'demo_archive_seed_sha256_v2';

async function loadBundledDemoArchiveOnce() {
  if (getCurrentAppMode() !== 'demo') return;

  const assetUrl = DEMO_ARCHIVE_ASSET;
  let response;
  try {
    response = await fetch(assetUrl, { cache: 'no-store' });
  } catch (error) {
    throw new Error(`无法读取内置 demo.jnote：${error.message || error}`);
  }

  if (!response.ok) {
    throw new Error(`无法读取内置 demo.jnote：HTTP ${response.status}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) {
    throw new Error('内置 demo.jnote 为空');
  }

  const archiveHash = sha256(bytes);
  if (AppStorage.getItem(DEMO_ARCHIVE_SEED_KEY) === archiveHash) return;

  let snapshot;
  try {
    snapshot = ArchiveCodec.validate(bytes);
  } catch (error) {
    throw new Error(`内置 demo.jnote 校验失败：${error.message || error}`);
  }

  try {
    await importSnapshot(snapshot, 'replace');
  } catch (error) {
    throw new Error(`内置 demo.jnote 导入失败：${error.message || error}`);
  }

  /*
   * Store the archive digest instead of a simple boolean. Replacing
   * app/src/main/assets/demo.jnote in a future app build automatically
   * causes the new bundled demo archive to be imported once.
   */
  AppStorage.setItem(DEMO_ARCHIVE_SEED_KEY, archiveHash);
}

let pendingArchive=null;
function archiveStatus(message){
  const el=document.getElementById('archiveStatus');
  if(el)el.textContent=message;
}
function openDictionary(){
  if(window.JetNoteNative?.openDictionary)JetNoteNative.openDictionary(currentLanguage);
  else window.open('https://www.merriam-webster.com/','_blank','noopener');
}
function openSentences(){
  if(window.JetNoteNative?.openSentences)JetNoteNative.openSentences(currentLanguage);
  else window.open('https://soundoftext.com/','_blank','noopener');
}
async function exportArchive(){
  if(!entriesReady||entriesBusy)return;
  if(window.JetNoteNative?.exportJetNote){
    await exportNativeArchive();
    return;
  }
  entriesBusy=true;
  archiveStatus(t('exporting'));
  try{
    const snapshot=await EntryStore.read(),bytes=await ArchiveCodec.exportSnapshot({
      ...snapshot,profile:getProfileSnapshot()
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
   * data set, so an old demo attachment with the same ID must not prevent the
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

  const previousProfile = incoming.profile ? getProfileSnapshot() : null;

  try {
    if (incoming.profile) applyProfileSnapshot(incoming.profile);
    await EntryStore.commit(nextPosts, importedMedia);

    if (mode === 'replace') {
      const referencedMediaIds = new Set(
        nextPosts.flatMap(item => (item.attachments || []).map(a => String(a.id)))
      );
      await EntryStore.removeUnreferencedMedia(referencedMediaIds);
    }
  } catch (error) {
    if (previousProfile) {
      try {
        applyProfileSnapshot(previousProfile);
      } catch (_) {}
    }
    throw error;
  }

  posts = nextPosts;
  renderPosts();
  return stats;
}

async function confirmArchiveImport(){
  if(!pendingArchive||entriesBusy)return;
  entriesBusy=true;
  archiveStatus(t('importing'));
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
  archiveStatus(t('importDone')+' '+t('added')+': '+stats.added+' · '+t('updated')+': '+stats.updated+' · '+t('kept')+': '+stats.kept);
  pendingArchive=null;
  document.getElementById('importPreview').classList.remove('open');
}
function chooseArchive(){
  if(entriesBusy||!entriesReady)return;
  if(window.JetNoteNative?.importJetNote){
    entriesBusy=true;
    archiveStatus(t('validating'));
    JetNoteNative.importJetNote('merge');
  }else document.getElementById('archivePicker').click();
}
async function exportNativeArchive(){
  entriesBusy=true;
  archiveStatus(t('exporting'));
  try{
    const state=await EntryStore.read(),payload={
      appVersion:'3.7',profile:getProfileSnapshot(),posts:[]
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
  onValidated(token,mode,postsJson,profileJson){
    try{
      if(pendingArchive||!entriesReady||document.querySelector('#postComposeScreen.open'))throw Error('请先完成当前编辑或导入');
      pendingArchive=ArchiveMapping.fromCanonical(JSON.parse(postsJson),attachment=>({
        ...attachment,sha256:attachment.sha256.toLowerCase()
      }));
      pendingArchive.profile=profileJson?JSON.parse(profileJson):null;
      pendingArchive.nativeToken=token;
      showImportPreview();
    }catch(error){
      JetNoteNative.rollbackImport(token);
      archiveStatus(t('transferFailed')+error.message);
      alert(t('transferFailed')+error.message);
    }
    finally{
      entriesBusy=false;
    }
  },
  async onMediaCommitted(token){
    if(pendingArchive?.nativeToken!==token){
      JetNoteNative.rollbackImport(token);
      entriesBusy=false;
      return;
    }
    try{
      const stats=await importSnapshot(pendingArchive,pendingArchive.selectedMode);
      JetNoteNative.finalizeImport(token);
      finishImport(stats);
    }catch(error){
      JetNoteNative.rollbackImport(token);
      pendingArchive=null;
      document.getElementById('importPreview').classList.remove('open');
      archiveStatus(t('transferFailed')+error.message);
      alert(t('transferFailed')+error.message);
    }
    finally{
      entriesBusy=false;
    }
  },
  onError(message){
    entriesBusy=false;
    archiveStatus(t('transferFailed')+message);
    if(pendingArchive?.nativeToken){
      pendingArchive=null;
      document.getElementById('importPreview').classList.remove('open');
    }
    if(message!=='已取消导入')alert(message);
  },
  onExportFinished(success,message){
    entriesBusy=false;
    archiveStatus(message);
    if(!success&&message!=='已取消导出')alert(message);
  }
};
