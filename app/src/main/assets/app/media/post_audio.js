const MEDIA_MAX=64*1024*1024;
const draftAttachments={
  post:[]
};
const draftMedia={
  post:new Map()
};
const audioLoadToken={
  post:0
};
let postDraftMediaLoading=false;
function isPostDraftMediaLoading(){return postDraftMediaLoading;}
const VOLUME_ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';
const activeAudioPlayers=[];
let audioPlaybackConfigPromise=null;
let cachedAudioPlaybackConfig={maxConcurrentPlayingAudios:2};

function loadAudioPlaybackConfig(){
  if(audioPlaybackConfigPromise)return audioPlaybackConfigPromise;
  audioPlaybackConfigPromise=fetch('config.json',{cache:'no-store'})
    .then(response=>response.ok?response.json():Promise.reject(Error('audio config unavailable')))
    .then(value=>{
      const raw=Number(value?.audioPlayback?.maxConcurrentPlayingAudios);
      const max=Number.isFinite(raw)?Math.trunc(raw):2;
      cachedAudioPlaybackConfig={maxConcurrentPlayingAudios:max < -1 ? -1 : max};
      return cachedAudioPlaybackConfig;
    })
    .catch(error=>{
      console.warn('Jet Note audio config fallback',error);
      cachedAudioPlaybackConfig={maxConcurrentPlayingAudios:2};
      return cachedAudioPlaybackConfig;
    });
  return audioPlaybackConfigPromise;
}

function removeActiveAudio(audio){
  const index=activeAudioPlayers.findIndex(entry=>entry.audio===audio);
  if(index>=0)activeAudioPlayers.splice(index,1);
}

function resetAudioButton(item){
  const play=item?.querySelector('.audio-token-play');
  if(!play)return;
  play.classList.remove('playing','looping');
  play.setAttribute('aria-label',t('audioPlay'));
}

function destroyAudioPlayer(item){
  if(!item)return;
  const audio=item.querySelector('audio');
  if(audio){
    audio.__jetDisposing=true;
    removeActiveAudio(audio);
    try{audio.pause();}catch(_){}
    audio.loop=false;
    try{
      if(audio.src.startsWith('blob:'))URL.revokeObjectURL(audio.src);
      audio.removeAttribute('src');
      audio.load();
    }catch(_){}
    audio.remove();
  }
  resetAudioButton(item);
}

function reclaimAudioSlots(limit,exceptItem=null){
  if(limit===-1)return;
  while(activeAudioPlayers.filter(entry=>entry.item!==exceptItem).length>=limit){
    const oldest=activeAudioPlayers.find(entry=>entry.item!==exceptItem);
    if(!oldest)break;
    destroyAudioPlayer(oldest.item);
  }
}

function bindAudioLongPress(item,play){
  if(play.__jetAudioLongPressBound)return;
  play.__jetAudioLongPressBound=true;
  let timer=null,pointerId=null,startX=0,startY=0,longPressReady=false,suppressClick=false;
  const cancel=()=>{if(timer!=null)clearTimeout(timer);timer=null;pointerId=null;};
  play.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse'&&event.button!==0)return;
    suppressClick=false;cancel();longPressReady=false;
    pointerId=event.pointerId;startX=event.clientX;startY=event.clientY;
    timer=setTimeout(()=>{
      timer=null;longPressReady=true;suppressClick=true;
      try{if(navigator.vibrate)navigator.vibrate(30);}catch(_){}
    },550);
  });
  play.addEventListener('pointermove',event=>{
    if(event.pointerId!==pointerId||timer==null)return;
    if(Math.hypot(event.clientX-startX,event.clientY-startY)>12)cancel();
  });
  play.addEventListener('pointerup',event=>{
    if(event.pointerId!==pointerId)return;
    const shouldLoop=longPressReady;cancel();longPressReady=false;
    if(shouldLoop){event.preventDefault();event.stopPropagation();void startAudioPlayer(item,true);}
  });
  play.addEventListener('pointercancel',()=>{cancel();longPressReady=false;});
  play.addEventListener('contextmenu',event=>event.preventDefault());
  play.addEventListener('click',event=>{
    if(!suppressClick)return;
    suppressClick=false;event.preventDefault();event.stopImmediatePropagation();
  },true);
}

function createAudioPlayer(item){
  const record=item?.__jetAudioRecord;
  if(!item||!record)return null;
  let audio=item.querySelector('audio');
  if(audio)return audio;
  audio=document.createElement('audio');
  audio.preload='metadata';
  audio.src=NativeMedia.url(record)||URL.createObjectURL(record.blob);
  item.appendChild(audio);
  const play=item.querySelector('.audio-token-play');
  audio.addEventListener('play',()=>{
    if(audio.__jetDisposing)return;
    play?.classList.add('playing');
    play?.classList.toggle('looping',audio.loop);
    play?.setAttribute('aria-label',t('audioPause'));
  });
  audio.addEventListener('pause',()=>{
    if(!audio.__jetStarting)removeActiveAudio(audio);
    if(!audio.__jetDisposing)resetAudioButton(item);
  });
  audio.addEventListener('ended',()=>{removeActiveAudio(audio);resetAudioButton(item);});
  audio.addEventListener('error',()=>{
    if(audio.__jetDisposing)return;
    destroyAudioPlayer(item);
    alert(t('audioCannotPlay'));
  });
  return audio;
}

async function startAudioPlayer(item,looping=false){
  let audio=createAudioPlayer(item);
  if(!audio)return;
  if(!audio.paused&&!audio.ended){
    if(looping&&!audio.loop){audio.loop=true;item.querySelector('.audio-token-play')?.classList.add('looping');return;}
    audio.loop=false;audio.pause();return;
  }
  const limit=cachedAudioPlaybackConfig.maxConcurrentPlayingAudios;
  if(limit===0)return;
  reclaimAudioSlots(limit,item);
  // Reserve the slot before play() settles so two rapid long presses cannot
  // both pass the concurrency check while HTMLMediaElement still says paused.
  removeActiveAudio(audio);
  activeAudioPlayers.push({item,audio,startedAt:Date.now()});
  audio.__jetStarting=true;
  audio.loop=looping;
  if(audio.ended)try{audio.currentTime=0;}catch(_){}
  try{
    await audio.play();
  }catch(error){
    if(!audio.__jetDisposing){destroyAudioPlayer(item);alert(t('audioCannotPlay'));}
  }finally{
    audio.__jetStarting=false;
    if(audio.paused&&!audio.__jetDisposing)removeActiveAudio(audio);
  }
}
function initAudioDraft(kind,entry){
  ++audioLoadToken.post;
  draftMedia.post.clear();
  draftAttachments.post=structuredClone(entry?.attachments||[]);
  renderAudioDraft('post');
}
function bytesToBase64(bytes){
  let out='';
  for(let i=0; i<bytes.length; i+=32768)out+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return btoa(out);
}
function base64ToBytes(value){
  const s=atob(value);
  return Uint8Array.from(s,c=>c.charCodeAt(0));
}
function renderAttachments(items,editable=false){
  const audio=(items||[]).filter(item=>item.type==='audio');
  const other=(items||[]).filter(item=>item.type!=='audio'&&item.type!=='image'&&item.type!=='video');
  if(!audio.length&&!other.length)return '';
  return '<div class="attachment-strip">'+audio.map((item,index)=>`<div class="audio-token attachment-item common_border" data-media-id="${escapeHTML(item.id)}"><button class="audio-token-play common_border" type="button" aria-label="${escapeHTML(t('audioPlay'))}" title="${escapeHTML(item.originalName||t('audioPlay'))}">${VOLUME_ICON}<sub>${index+1}</sub></button><audio preload="metadata"></audio>${editable?'<button class="audio-token-remove" type="button" aria-label="'+escapeHTML(t('remove'))+'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6L18 18M18 6L6 18"/></svg></button>':''}</div>`).join('')+other.map(item=>`<span class="attachment-unknown attachment-item common_border" data-media-id="${escapeHTML(item.id)}">${escapeHTML(item.type||'file')}</span>`).join('')+'</div>';
}
function releaseAttachmentUrls(container){
  if(!container)return;
  container.querySelectorAll('.audio-token').forEach(destroyAudioPlayer);
  releaseVideoAttachmentUrls(container);
}
async function hydrateAttachments(container,staged=new Map()){
  void loadAudioPlaybackConfig();
  await Promise.all([...container.querySelectorAll('.attachment-item')].map(async item=>{
    const audio=item.querySelector('audio'),play=item.querySelector('.audio-token-play'); if(!audio||!play)return;
    try{
      const record=staged.get(item.dataset.mediaId)||await EntryStore.media(item.dataset.mediaId); if(!audio.isConnected)return; if(!record)throw Error('Missing attachment');
      item.__jetAudioRecord=record;
      audio.remove();
      play.onclick=()=>void startAudioPlayer(item,false);
      bindAudioLongPress(item,play);
    }
    catch(error){
      play.onclick=()=>alert(t('audioCannotPlay')); play.classList.add('unavailable');
    }
  }));
}
function renderAudioDraft(){
  const node=document.getElementById('postAudioDraft');
  if(!node)return;
  releaseAttachmentUrls(node);
  node.innerHTML=renderAttachments(draftAttachments.post,true);
  node.querySelectorAll('.attachment-item').forEach(item=>{
    const remove=item.querySelector('.audio-token-remove'); if(remove)remove.onclick=()=>{
      const id=item.dataset.mediaId; draftAttachments.post=draftAttachments.post.filter(x=>String(x.id)!==id); draftMedia.post.delete(id); renderAudioDraft();
    };
  });
  hydrateAttachments(node,draftMedia.post);
}
async function handleAudioFiles(event){
  const files=Array.from(event.target.files||[]);
  event.target.value='';
  if(postDraftMediaLoading)return;
  const policy=window.JetNotePostAttachmentPolicy;
  await policy?.ready;
  const remaining=policy?.remaining('audio',postDraftImages,draftAttachments.post)??0;
  if(remaining<=0){alert(t('attachmentLimit'));return;}
  postDraftMediaLoading=true;
  const token=audioLoadToken.post,button=document.querySelector('[data-add-audio="post"]');
  if(button)button.disabled=true;
  try{
    const selected=files.slice(0,remaining);
    if(files.length>remaining)alert(t('attachmentLimit'));
    const pending=[];
    for(const file of selected){
      if(!file.type.startsWith('audio/')&&!/\.(mp3|m4a|aac|wav|ogg|flac)$/i.test(file.name))throw Error(t('audioOnly'));
      if(file.size>MEDIA_MAX)throw Error(t('audioTooLarge'));
      const mime=/\.mp3$/i.test(file.name)?'audio/mpeg':(file.type||'application/octet-stream'),bytes=new Uint8Array(await file.arrayBuffer()),item={
        id:entryUuid(),type:'audio',mimeType:mime,originalName:file.name,sourceMimeType:file.type||null,lastModified:file.lastModified,size:bytes.length,sha256:sha256(bytes)
      };
      pending.push({...item,blob:new Blob([bytes],{type:mime})});
    }
    if(token!==audioLoadToken.post)return;
    for(const record of pending){
      const{blob,...meta}=record;
      draftMedia.post.set(meta.id,record);
      draftAttachments.post.push(meta);
    }
    renderAudioDraft();
    if(typeof syncPostEditorDraft==='function')syncPostEditorDraft();
  }catch(error){
    alert(error.message);
  }finally{
    postDraftMediaLoading=false;
    if(button)button.disabled=false;
  }
}
