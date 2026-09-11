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
  const other=(items||[]).filter(item=>item.type!=='audio'&&item.type!=='image'&&item.type!=='video');
  if(!audio.length&&!other.length)return '';
  return '<div class="attachment-strip">'+audio.map((item,index)=>`<div class="audio-token attachment-item" data-media-id="${escapeHTML(item.id)}"><button class="audio-token-play" type="button" aria-label="${escapeHTML(t('audioPlay'))}" title="${escapeHTML(item.originalName||t('audioPlay'))}">${VOLUME_ICON}<sub>${index+1}</sub></button><audio preload="metadata"></audio>${editable?'<button class="audio-token-remove" type="button" aria-label="'+escapeHTML(t('remove'))+'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6L18 18M18 6L6 18"/></svg></button>':''}</div>`).join('')+other.map(item=>`<span class="attachment-unknown attachment-item" data-media-id="${escapeHTML(item.id)}">${escapeHTML(item.type||'file')}</span>`).join('')+'</div>';
}
function releaseAttachmentUrls(container){
  if(!container)return;
  container.querySelectorAll('audio').forEach(audio=>{
    audio.pause(); if(audio.src.startsWith('blob:'))URL.revokeObjectURL(audio.src); audio.removeAttribute('src');
  });
  releaseVideoAttachmentUrls(container);
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
function renderVideoAttachmentsHTML(items) {
  const videos = (items || []).filter(item => item.type === 'video');
  if (!videos.length) return '';

  return `<div class="post-video-grid ${mediaGridClass(videos)}">${videos.map(item => `
    <div class="video-attachment-item native-video-card" data-media-id="${escapeHTML(item.id)}">
      <img class="video-poster" alt="" draggable="false">
    </div>`).join('')}</div>`;
}

/*
 * Video playback policy is intentionally kept outside of the entry data.
 * - Before the user presses play, a card contains only the extracted first-frame poster.
 * - The <video> element is created lazily on demand and removed again when its slot is reclaimed.
 * - maxConcurrentPlayingVideos: -1 means unlimited, 0 disables playback, N limits live players to N.
 */
const VIDEO_PLAYBACK_CONFIG_URL = 'config/video-playback.json';
let videoPlaybackConfigPromise = null;
const activeInlineVideoPlayers = [];

function loadVideoPlaybackConfig() {
  if (videoPlaybackConfigPromise) return videoPlaybackConfigPromise;
  videoPlaybackConfigPromise = fetch(VIDEO_PLAYBACK_CONFIG_URL, {cache:'no-store'})
    .then(response => response.ok ? response.json() : Promise.reject(Error('video config unavailable')))
    .then(value => {
      const raw = Number(value?.maxConcurrentPlayingVideos);
      const max = Number.isFinite(raw) ? Math.trunc(raw) : 1;
      return {maxConcurrentPlayingVideos: max < -1 ? -1 : max};
    })
    .catch(error => {
      console.warn('Jet Note video config fallback', error);
      return {maxConcurrentPlayingVideos: 1};
    });
  return videoPlaybackConfigPromise;
}

function videoThumbUrl(record) {
  const path = String(record?.path || '');
  if (!/^media\/[A-Za-z0-9_.-]+$/.test(path)) return '';
  const file = path.slice('media/'.length);
  return 'https://appassets.androidplatform.net/video-thumb/' + file + '.jpg';
}

function formatVideoClock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

function removeInlinePlayerEntry(item) {
  const index = activeInlineVideoPlayers.findIndex(entry => entry.item === item);
  if (index >= 0) activeInlineVideoPlayers.splice(index, 1);
}

function unloadInlineVideo(item) {
  if (!item) return;
  const video = item.querySelector('video.inline-video-player');
  if (video) {
    try { video.pause(); } catch (_) {}
    video.removeAttribute('src');
    try { video.load(); } catch (_) {}
    video.remove();
  }
  item.querySelector('.video-inline-controls')?.remove();
  item.classList.remove('video-loaded', 'video-playing', 'video-controls-visible');
  const poster = item.querySelector('.video-poster');
  if (poster) poster.hidden = false;
  removeInlinePlayerEntry(item);
}

function releaseVideoAttachmentUrls(container) {
  if (!container) return;
  [...container.querySelectorAll('.video-attachment-item.video-loaded')]
    .forEach(unloadInlineVideo);
}

function reclaimVideoSlots(limit, exceptItem = null) {
  if (limit === -1) return;
  while (activeInlineVideoPlayers.filter(entry => entry.item !== exceptItem).length >= limit) {
    const oldest = activeInlineVideoPlayers.find(entry => entry.item !== exceptItem);
    if (!oldest) break;
    unloadInlineVideo(oldest.item);
  }
}

function setInlineVideoControlsVisible(item, visible) {
  if (!item) return;
  item.classList.toggle('video-controls-visible', !!visible);
}

function toggleInlineVideoControls(item) {
  if (!item || !item.classList.contains('video-loaded')) return;
  setInlineVideoControlsVisible(item, !item.classList.contains('video-controls-visible'));
}

function createInlineVideoControls(item, video) {
  const controls = document.createElement('div');
  controls.className = 'video-inline-controls';
  controls.innerHTML = `
    <button class="video-inline-toggle" type="button" aria-label="pause video">
      <span class="video-pause-symbol" aria-hidden="true"></span>
    </button>
    <div class="video-inline-bottom">
      <span class="video-inline-time">0:00 / 0:00</span>
      <input class="video-inline-seek" type="range" min="0" max="1000" value="0" step="1" aria-label="video position">
    </div>`;
  item.appendChild(controls);
  setInlineVideoControlsVisible(item, true);

  const toggle = controls.querySelector('.video-inline-toggle');
  const seek = controls.querySelector('.video-inline-seek');
  const time = controls.querySelector('.video-inline-time');

  const renderState = () => {
    item.classList.toggle('video-playing', !video.paused && !video.ended);
    toggle.innerHTML = video.paused || video.ended
      ? '<span class="video-play-triangle" aria-hidden="true"></span>'
      : '<span class="video-pause-symbol" aria-hidden="true"></span>';
    toggle.setAttribute('aria-label', video.paused || video.ended ? 'play video' : 'pause video');
  };
  const renderProgress = () => {
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    seek.value = duration > 0 ? String(Math.round((current / duration) * 1000)) : '0';
    time.textContent = `${formatVideoClock(current)} / ${formatVideoClock(duration)}`;
  };

  toggle.addEventListener('pointerdown', event => event.stopPropagation());
  toggle.onclick = event => {
    event.preventDefault();
    event.stopPropagation();
    if (video.paused || video.ended) video.play().catch(() => {});
    else video.pause();
    setInlineVideoControlsVisible(item, true);
  };
  seek.addEventListener('pointerdown', event => event.stopPropagation());
  seek.addEventListener('input', event => {
    event.stopPropagation();
    if (Number.isFinite(video.duration) && video.duration > 0) {
      video.currentTime = (Number(seek.value) / 1000) * video.duration;
    }
  });
  seek.addEventListener('click', event => event.stopPropagation());
  video.addEventListener('loadedmetadata', renderProgress);
  video.addEventListener('durationchange', renderProgress);
  video.addEventListener('timeupdate', renderProgress);
  video.addEventListener('play', renderState);
  video.addEventListener('pause', renderState);
  video.addEventListener('ended', () => {
    // Returning to poster releases decoder/memory and restores the non-loaded state.
    unloadInlineVideo(item);
  });
  renderState();
  renderProgress();
}

async function startInlineVideo(item, record) {
  if (!item || !record || !record.path) return;
  const existing = item.querySelector('video.inline-video-player');
  if (existing) {
    toggleInlineVideoControls(item);
    return;
  }

  const config = await loadVideoPlaybackConfig();
  const limit = config.maxConcurrentPlayingVideos;
  if (limit === 0) return;
  reclaimVideoSlots(limit, item);

  const src = NativeMedia.url(record);
  if (!src) return;

  const poster = item.querySelector('.video-poster');
  if (poster) poster.hidden = true;

  const video = document.createElement('video');
  video.className = 'inline-video-player';
  video.preload = 'auto';
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.controls = false; // No Chromium overflow/fullscreen buttons.
  video.disablePictureInPicture = true;
  video.setAttribute('controlsList', 'nodownload nofullscreen noremoteplayback');
  video.src = src; // This is the first point where the real video is loaded.

  item.appendChild(video);
  // Explicit load after the element is in the DOM. This gives Chromium a stable
  // composited surface before playback starts, avoiding audio-only starts on
  // some Android WebView builds.
  try { video.load(); } catch (_) {}
  item.classList.add('video-loaded');
  activeInlineVideoPlayers.push({item, video});
  createInlineVideoControls(item, video);

  video.addEventListener('error', () => {
    console.warn('Jet Note inline video error', {
      code: video.error?.code || 0,
      message: video.error?.message || '',
      path: record.path
    });
    unloadInlineVideo(item);
    alert(t('videoCannotPlay'));
  }, {once:true});

  try {
    await video.play();
  } catch (error) {
    console.warn('Jet Note video play rejected', error);
  }
}

async function hydrateVideoAttachments(container, staged = new Map()) {
  if (!container) return;

  await Promise.all([...container.querySelectorAll('.video-attachment-item')].map(async item => {
    try {
      const record = staged.get(item.dataset.mediaId) || await EntryStore.media(item.dataset.mediaId);
      if (!item.isConnected || !record) throw Error('Missing video attachment');

      const poster = item.querySelector('.video-poster');
      const thumb = videoThumbUrl(record);
      if (poster && thumb) {
        // Only the first-frame JPEG is requested here. No <video> exists before user action.
        poster.src = thumb;
        poster.onerror = () => item.classList.add('poster-unavailable');
      }

      item.onclick = event => {
        if (event.target.closest('.compose-image-remove, .video-inline-controls')) return;
        if (item.classList.contains('video-loaded')) {
          // Tapping the picture never changes playback. It only shows/hides UI.
          toggleInlineVideoControls(item);
        } else {
          startInlineVideo(item, record);
        }
      };
    } catch (error) {
      item.innerHTML = `<div class="video-unavailable">${escapeHTML(t('videoCannotPlay'))}</div>`;
    }
  }));
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
