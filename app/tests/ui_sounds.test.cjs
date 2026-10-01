// Production JS with DOM/audio/storage boundary substitutes; no Android speaker claim.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=process.env.JETNOTE_SOUND_TEST_ASSETS||path.resolve(__dirname,'../src/main/assets');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
function publishHarness(mode='create',failure=null){
 const sounds=[],button={disabled:false,isConnected:true};let resolveCommit;
 const c={console,structuredClone,entriesReady:true,entriesBusy:false,isWorkspaceWritable:()=>true,isPostDraftMediaLoading:()=>false,
 document:{querySelector:()=>button,getElementById:()=>null},syncPostEditorDraft(){},alert(){},t:x=>x,
 playPostUiSound:n=>sounds.push(n),initAudioDraft(){},renderPostImagePreview(){},renderPostVideoPreview(){},closePostComposer(){},
 EditorController:{state:'EDITING',State:{EDITING:'EDITING'},publish:async commit=>{
  if(failure)return {ok:false,code:failure};
  await commit({mode});return {ok:true};
 }}};
 vm.createContext(c);vm.runInContext(read('src/features/editor/publish_note.js'),c);
 c.commitPostDraft=async draft=>({wasEditing:draft.mode==='edit'});
 return {c,sounds,button,defer(){c.commitPostDraft=()=>new Promise(resolve=>{resolveCommit=resolve});},finish(){resolveCommit({wasEditing:false})}};
}
(async()=>{
 let count=0;const test=async(name,fn)=>{await fn();console.log('PASS',name);count++};
 await test('publish pipeline does not replay tap sound after successful commit',async()=>{
  const h=publishHarness();await h.c.publishTextPost();assert.deepEqual(h.sounds,[]);assert.equal(h.button.disabled,false);
 });
 await test('existing-note save remains silent',async()=>{const h=publishHarness('edit');await h.c.publishTextPost();assert.deepEqual(h.sounds,[])});
 await test('validation/storage failures remain silent and restore button',async()=>{
  for(const code of ['empty-post','save-failed','image-limit','invalid-state']){const h=publishHarness('create',code);await h.c.publishTextPost();assert.deepEqual(h.sounds,[]);assert.equal(h.button.disabled,false)}
 });
 await test('pending commit is silent; double tap cannot duplicate the send sound',async()=>{
  const h=publishHarness();h.defer();const first=h.c.publishTextPost();await h.c.publishTextPost();assert.deepEqual(h.sounds,[]);
  h.finish();await first;assert.deepEqual(h.sounds,[]);
 });
 await test('editor entry sound starts before async preparation; open/busy guards block duplicates',async()=>{
  const sounds=[];
  const c={console,isWorkspaceWritable:()=>true,entriesReady:true,entriesBusy:false,
   EditorController:{state:'CLOSED',State:{CLOSED:'CLOSED'},begin(){this.state='OPENING';return new Promise(()=>{})}},
   playPostUiSound:n=>sounds.push(n),document:{getElementById:()=>null},closePostActionPanel(){},getPostStarState:()=>null,structuredClone};
  vm.createContext(c);vm.runInContext(read('src/features/editor/editor_session.js'),c);c.initializePostComposerControls=()=>{};
  void c.openPostComposer();assert.deepEqual(sounds,['editor_open']);await c.openPostComposer();assert.equal(sounds.length,1);
  c.EditorController.state='CLOSED';c.entriesBusy=true;await c.openPostComposer();assert.equal(sounds.length,1);
  c.entriesBusy=false;void c.openPostComposer();assert.equal(sounds.length,2);
 });
 await test('preload, cached replay, first-play seek failure, rejected play and sync errors',async()=>{
  const instances=[],warnings=[];
  class Audio {constructor(src){this.src=src;this.plays=0;instances.push(this)}load(){}pause(){}set currentTime(v){if(this.seekError)throw Error('metadata pending');this.time=v}play(){this.plays++;if(this.syncError)throw Error('decode failed');return this.reject?Promise.reject(Error('blocked')):Promise.resolve()}}
  const c={Audio,console:{warn:(...args)=>warnings.push(args)}};vm.createContext(c);vm.runInContext(read('src/features/home/main_notes_sounds.js'),c);
  assert.equal(instances.length,2);assert.ok(instances[0].src.endsWith('/editor_send.mp3'));assert.ok(instances[1].src.endsWith('/editor_send.mp3'));
  instances[0].seekError=true;assert.equal(await c.playPostUiSound('editor_open'),true);assert.equal(instances[0].plays,1);
  instances[0].seekError=false;await c.playPostUiSound('editor_open');assert.equal(instances.length,2);assert.equal(instances[0].time,0);
  instances[1].reject=true;assert.equal(await c.playPostUiSound('send_post'),false);
  instances[1].reject=false;instances[1].syncError=true;assert.equal(await c.playPostUiSound('send_post'),false);
  assert.equal(warnings.length,2);assert.equal(await c.playPostUiSound('unknown'),false);
 });
 console.log(`${count} sound regression groups passed`);
})().catch(e=>{console.error(e);process.exitCode=1});
