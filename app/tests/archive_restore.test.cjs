// Run: node tests/archive_restore.test.cjs (from the extracted ZIP root).
// Executes production JS. Native SAF/ZIP and Android decoding remain device tests.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const assets = process.env.JETNOTE_TEST_ASSETS || path.resolve(__dirname, '../src/main/assets');
const prefix = 'https://appassets.androidplatform.net/';
function harness() {
  let state = {posts: []};
  const media = new Map(), calls = [], notices = [];
  const ctx = {console, structuredClone, Map, Set, URL, Blob,
    localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    HOME_COMPOSER_LABEL_KEY:'label', stableEntry:x=>structuredClone(x),
    alert:x=>notices.push(x), replacePosts:x=>calls.push(['replace',x]),
    renderPosts:()=>calls.push(['render']),
    EntryStore:{read:async()=>structuredClone(state), media:async id=>media.get(id),
      commit:async (posts, records=[])=>{
        calls.push(['commit',records]);
        if(ctx.failCommit) throw Error('transaction aborted');
        state={posts:structuredClone(posts)};
        for(const record of records) media.set(record.id,structuredClone(record));
      }},
    JetNoteNative:{exportJetNote:s=>calls.push(['export',JSON.parse(s)]),
      commitImportMedia:t=>calls.push(['nativeCommit',t]),
      finalizeImport:t=>calls.push(['finalize',t]),rollbackImport:t=>calls.push(['rollback',t]),
      discardMedia:p=>calls.push(['discard',p])},
    t:x=>x, escapeHTML:x=>String(x), setTimeout, clearTimeout,
    releaseVideoAttachmentUrls(){}, hydrateVideoAttachments:async()=>{},
    document:{}, window:null};
  ctx.window=ctx;
  vm.createContext(ctx);
  for(const file of ['src/bridge/android/media_file_connection.js','src/features/settings/backup_and_color.js'])
    vm.runInContext(fs.readFileSync(path.join(assets,file),'utf8'),ctx);
  return {ctx,media,calls,notices,setState:x=>{state=x},state:()=>state};
}
const metadata = [
  {id:'photo',type:'image',path:'media/photo.png',mimeType:'image/png',size:101,sha256:'a'.repeat(64)},
  {id:'music',type:'audio',path:'media/music.mp3',mimeType:'audio/mpeg',size:202,sha256:'b'.repeat(64)},
  {id:'movie',type:'video',path:'media/movie.mp4',mimeType:'video/mp4',size:303,sha256:'c'.repeat(64)}
];
const post={id:1,uuid:'note',text:'mixed media',archived:false,attachments:metadata,images:[prefix+'media/photo.png']};
(async()=>{
  let passed=0;
  const test=async(name,fn)=>{await fn();console.log('PASS',name);passed++};
  await test('export -> empty repository -> import restores all three media indices and exact metadata',async()=>{
    const h=harness();h.setState({posts:[post]});
    await h.ctx.JetNoteBackup.export();
    const payload=h.calls.find(c=>c[0]==='export')[1];
    h.setState({posts:[]});h.media.clear();
    await h.ctx.JetNoteBackupNative.onImportValidated({token:'import',posts:payload.posts});
    assert.equal(h.media.size,0,'no index before native file commit');
    await h.ctx.JetNoteBackupNative.onMediaCommitted('import');
    assert.equal(h.media.size,3);
    for(const item of metadata){assert.deepEqual(h.media.get(item.id),item);
      assert.equal(vm.runInContext(`NativeMedia.url(${JSON.stringify(h.media.get(item.id))})`,h.ctx),prefix+item.path);}
    assert.equal(h.state().posts[0].images[0],prefix+'media/photo.png');
    assert.ok(!h.calls.some(c=>c[0]==='rollback'));
  });
  await test('legacy appassets path and stale runtime URL are normalized without changing id/MIME/extension',async()=>{
    const h=harness();const p=structuredClone(post);p.attachments[0].path=prefix+'media/photo.png';
    p.attachments[0].url='blob:old';p.images=['blob:old'];p.attachments[1].uri='content://old-device';
    const records=h.ctx.JetNoteBackup.restoreMediaReferences([p]);
    assert.equal(records[0].path,'media/photo.png');assert.equal(p.images[0],prefix+'media/photo.png');
    assert.ok(!('url' in records[0]));assert.ok(!('uri' in records[1]));
  });
  await test('missing durable bytes reference fails before native commit',async()=>{
    const h=harness();const p=structuredClone(post);delete p.attachments[1].path;p.attachments[1].url='blob:lost';
    await h.ctx.JetNoteBackupNative.onImportValidated({token:'bad',posts:[p]});
    assert.ok(h.calls.some(c=>c[0]==='rollback'));assert.ok(!h.calls.some(c=>c[0]==='nativeCommit'));
  });
  await test('conflicting duplicate id fails; identical shared attachment is deduplicated',async()=>{
    const h=harness();assert.equal(h.ctx.JetNoteBackup.restoreMediaReferences([structuredClone(post),structuredClone(post)]).length,3);
    const other=structuredClone(post);other.attachments[1].path='media/different.mp3';
    assert.throws(()=>h.ctx.JetNoteBackup.restoreMediaReferences([structuredClone(post),other]),/Conflicting/);
  });
  await test('database failure rolls back media before any render/finalize',async()=>{
    const h=harness();h.ctx.failCommit=true;
    await h.ctx.JetNoteBackupNative.onImportValidated({token:'failure',posts:[post]});
    await h.ctx.JetNoteBackupNative.onMediaCommitted('failure');
    assert.equal(h.media.size,0);assert.ok(h.calls.some(c=>c[0]==='rollback'));
    assert.ok(!h.calls.some(c=>c[0]==='finalize'||c[0]==='render'));
  });
  await test('render failure after committed state never deletes committed media',async()=>{
    const h=harness();h.ctx.renderPosts=()=>{throw Error('render failed')};
    await h.ctx.JetNoteBackupNative.onImportValidated({token:'render',posts:[post]});
    await h.ctx.JetNoteBackupNative.onMediaCommitted('render');
    assert.equal(h.media.size,3);assert.ok(h.calls.some(c=>c[0]==='finalize'));
    assert.ok(!h.calls.some(c=>c[0]==='rollback'));
  });
  await test('inline legacy image retained; plain text notes need no media',async()=>{
    const h=harness();const p={attachments:[],images:['data:image/png;base64,AA==']};
    assert.equal(h.ctx.JetNoteBackup.restoreMediaReferences([p]).length,0);
    assert.equal(p.images[0],'data:image/png;base64,AA==');
  });
  await test('legacy IndexedDB Blob exports its original bytes through NativeMedia staging',async()=>{
    const h=harness();const bytes=Buffer.from('original-audio-bytes');
    const item={id:'legacy',type:'audio',mimeType:'audio/mpeg',size:bytes.length};
    h.setState({posts:[{attachments:[item],images:[]}]});
    h.media.set('legacy',{...item,blob:new Blob([bytes],{type:item.mimeType})});
    let written=Buffer.alloc(0),storedPath;
    h.ctx.bytesToBase64=x=>Buffer.from(x).toString('base64');
    h.ctx.JetNoteNative.beginMedia=p=>{storedPath=p;return 'write'};
    h.ctx.JetNoteNative.appendMedia=(token,b64)=>{written=Buffer.concat([written,Buffer.from(b64,'base64')]);return true};
    h.ctx.JetNoteNative.finishMedia=()=>JSON.stringify({...item,path:storedPath});
    await h.ctx.JetNoteBackup.export();
    assert.deepEqual(written,bytes);assert.equal(storedPath,'media/legacy.mp3');
    const restored=h.calls.find(c=>c[0]==='export')[1].posts[0].attachments[0];
    assert.equal(restored.id,'legacy');assert.ok(!('blob' in restored));
  });
  await test('production audio/video hydration resolves records after clean import',async()=>{
    const h=harness();
    await h.ctx.JetNoteBackupNative.onImportValidated({token:'players',posts:[post]});
    await h.ctx.JetNoteBackupNative.onMediaCommitted('players');
    vm.runInContext(fs.readFileSync(path.join(assets,'src/shared/media/audio_player.js'),'utf8'),h.ctx);
    vm.runInContext('loadAudioPlaybackConfig=async()=>({maxConcurrentPlayingAudios:1});bindAudioLongPress=()=>{};',h.ctx);
    const button={classList:{add(){throw Error('audio marked unavailable')}}};
    const audio={isConnected:true,remove(){}};
    const audioItem={dataset:{mediaId:'music'},querySelector:s=>s==='audio'?audio:button};
    await h.ctx.hydrateAttachments({querySelectorAll:()=>[audioItem]});
    assert.deepEqual(audioItem.__jetAudioRecord,metadata[1]);assert.equal(typeof button.onclick,'function');
    const videoSource=fs.readFileSync(path.join(assets,'src/shared/media/video_player.js'),'utf8');
    vm.runInContext(videoSource.slice(videoSource.indexOf('async function hydrateVideoAttachments(')),h.ctx);
    Object.assign(h.ctx,{resetNativeVideoCard(){},bindVideoProgress(){},videoThumbUrl:()=>'',CSS:{escape:x=>x}});
    h.ctx.document.querySelectorAll=()=>[];
    const videoItem={isConnected:true,dataset:{mediaId:'movie'},querySelector:()=>null,closest:()=>null};
    await h.ctx.hydrateVideoAttachments({querySelectorAll:()=>[videoItem]});
    assert.deepEqual(videoItem.__jetVideoRecord,metadata[2]);assert.equal(typeof videoItem.onclick,'function');
    assert.ok(!videoItem.innerHTML,'video must not become unavailable');
  });
  console.log(`${passed} tests passed. Native transport and rendered geometry are not simulated as device results.`);
})().catch(e=>{console.error(e);process.exitCode=1});
