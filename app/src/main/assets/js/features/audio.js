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
const VOLUME_ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';
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
  const other=(items||[]).filter(item=>item.type!=='audio'&&item.type!=='image');
  if(!audio.length&&!other.length)return '';
  return '<div class="attachment-strip">'+audio.map((item,index)=>`<div class="audio-token attachment-item" data-media-id="${escapeHTML(item.id)}"><button class="audio-token-play" type="button" aria-label="${escapeHTML(t('audioPlay'))}" title="${escapeHTML(item.originalName||t('audioPlay'))}">${VOLUME_ICON}<sub>${index+1}</sub></button><audio preload="metadata"></audio>${editable?'<button class="audio-token-remove" type="button" aria-label="'+escapeHTML(t('remove'))+'">×</button>':''}</div>`).join('')+other.map(item=>`<span class="attachment-unknown attachment-item" data-media-id="${escapeHTML(item.id)}">${escapeHTML(item.type||'file')}</span>`).join('')+'</div>';
}
function releaseAttachmentUrls(container){
  if(!container)return;
  container.querySelectorAll('audio').forEach(audio=>{
    audio.pause(); if(audio.src.startsWith('blob:'))URL.revokeObjectURL(audio.src); audio.removeAttribute('src');
  });
}
async function hydrateAttachments(container,staged=new Map()){
  await Promise.all([...container.querySelectorAll('.attachment-item')].map(async item=>{
    const audio=item.querySelector('audio'),play=item.querySelector('.audio-token-play'); if(!audio||!play)return;
    try{
      const record=staged.get(item.dataset.mediaId)||await EntryStore.media(item.dataset.mediaId); if(!audio.isConnected)return; if(!record)throw Error('Missing attachment'); audio.src=NativeMedia.url(record)||URL.createObjectURL(record.blob); play.onclick=()=>{
        if(audio.paused){
          audio.play().catch(()=>alert(t('audioCannotPlay')));
        }else audio.pause();
      }; audio.addEventListener('play',()=>{
        play.classList.add('playing'); play.setAttribute('aria-label',t('audioPause'));
      }); audio.addEventListener('pause',()=>{
        play.classList.remove('playing'); play.setAttribute('aria-label',t('audioPlay'));
      });
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
  const token=audioLoadToken.post,button=document.querySelector('[data-add-audio="post"]');
  button.disabled=true;
  try{
    const pending=[];
    for(const file of files){
      if(!file.type.startsWith('audio/')&&!/\.(mp3|m4a|aac|wav|ogg|flac)$/i.test(file.name))throw Error(t('audioOnly'));
      if(file.size>MEDIA_MAX)throw Error(t('audioTooLarge'));
      if(draftAttachments.post.length+pending.length>=20)throw Error(t('attachmentLimit'));
      const mime=/\.mp3$/i.test(file.name)?'audio/mpeg':(file.type||'application/octet-stream'),bytes=new Uint8Array(await file.arrayBuffer()),item={
        id:entryUuid(),type:'audio',mimeType:mime,originalName:file.name,sourceMimeType:file.type||null,lastModified:file.lastModified,size:bytes.length,sha256:sha256(bytes)
      };
      pending.push({
        ...item,blob:new Blob([bytes],{
          type:mime
        })
      });
    }
    if(token!==audioLoadToken.post)return;
    for(const record of pending){
      const{
        blob,...meta
      }
      =record;
      draftMedia.post.set(meta.id,record);
      draftAttachments.post.push(meta);
    }
    renderAudioDraft();
  }catch(error){
    alert(error.message);
  }
  finally{
    button.disabled=false;
  }
}
document.addEventListener('play',event=>{
  if(event.target.tagName==='AUDIO')document.querySelectorAll('audio').forEach(a=>{
    if(a!==event.target)a.pause();
  });
},true);
