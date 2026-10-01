const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../src/main');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const source=read('assets/src/features/home/note_video_image/note_video_image.js');
const context={};vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('function mediaObjectFit('),source.indexOf('(function bindMediaFitRule()')),context);
let cases=0;
for(const surface of ['home','editor','viewer']) {
 for(const count of [1,2,3,4]) for(const [w,h,bw,bh] of [[24,24,180,180],[1200,600,180,180],[600,1200,180,180],[180,180,180,180],[20,600,180,180]]) {
  const mode=context.mediaObjectFit(w,h,bw,bh,count);
  const scale=mode==='none'?1:mode==='cover'?Math.max(bw/w,bh/h):Math.min(1,bw/w,bh/h);
  assert.ok(scale<=1,`${surface}/${count}: never upscale`);
  if(count<3) {assert.equal(mode,'scale-down');assert.ok(w*scale<=bw+1e-8&&h*scale<=bh+1e-8);}
  else assert.equal(mode,w<bw||h<bh?'none':'cover');
  cases++;
 }
}
// Production Home renderer is also used by the read-only viewer.
Object.assign(context,{NativeMedia:{url:i=>'local/'+i.id},renderMediaHTML:()=>'<single-image>',renderVideoAttachmentsHTML:()=>'<single-video>',renderVideoAttachmentCardHTML:()=>'<video>'});
vm.runInContext(source.slice(source.indexOf('function renderPublishedVisualMediaHTML('),source.indexOf('/*\n * Direct-in-Post image gestures.')),context);
for(const types of [['image'],['video'],['image','video'],['image','image'],['video','video'],['image','video','image'],['video','video','video']]) {
 const html=context.renderPublishedVisualMediaHTML([],types.map((type,i)=>({type,id:String(i)})));
 if(types.length>1) assert.ok(html.includes(`data-media-count="${types.length}"`));
 else assert.ok(html.includes(types[0]==='image'?'<single-image>':'<single-video>'));
}
assert.ok(read('assets/src/features/editor/video_image_area/video_image_area.js').includes('box.dataset.mediaCount = String(mediaCount)'));
assert.ok(read('assets/src/features/home/note_viewer.js').includes('renderPublishedVisualMediaHTML'));
const player=read('assets/src/shared/media/video_player.js');
assert.ok(player.includes('setVideoCropMode?.(Number(group?.dataset.mediaCount || 1) >= 3)'));
console.log(`PASS ${cases} fit cases + 7 production render combinations + editor/viewer/native policy wiring`);
