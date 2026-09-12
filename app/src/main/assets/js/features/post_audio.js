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
    <div class="video-attachment-shell">
      <div class="video-attachment-item native-video-card common_border" data-media-id="${escapeHTML(item.id)}">
        <img class="video-poster" alt="" draggable="false">
      </div>
      <div class="video-progress-track common_border" role="slider" aria-label="video position" aria-valuemin="0" aria-valuemax="1000" aria-valuenow="0">
        <div class="video-progress-fill"></div>
      </div>
      <div class="video-inline-time">0:00 / 0:00</div>
    </div>`).join('')}</div>`;
}

/*
 * Video playback policy is intentionally kept outside of the entry data.
 * Every card owns one persistent inline <video> from hydration onward. The
 * extracted first-frame image covers that element only until its real first
 * frame has decoded; a tap then changes play/pause on the same DOM element.
 * maxConcurrentPlayingVideos limits simultaneous playback, never the number
 * of retained video elements.
 */
const APP_CONFIG_URL = 'config.json';
let videoPlaybackConfigPromise = null;
const activeInlineVideoPlayers = [];
let cachedVideoPlaybackConfig = {maxConcurrentPlayingVideos: 1};

function loadVideoPlaybackConfig() {
  if (videoPlaybackConfigPromise) return videoPlaybackConfigPromise;
  videoPlaybackConfigPromise = fetch(APP_CONFIG_URL, {cache:'no-store'})
    .then(response => response.ok ? response.json() : Promise.reject(Error('video config unavailable')))
    .then(value => {
      const raw = Number(value?.videoPlayback?.maxConcurrentPlayingVideos);
      const max = Number.isFinite(raw) ? Math.trunc(raw) : 1;
      cachedVideoPlaybackConfig = {maxConcurrentPlayingVideos: max < -1 ? -1 : max};
      return cachedVideoPlaybackConfig;
    })
    .catch(error => {
      console.warn('Jet Note video config fallback', error);
      cachedVideoPlaybackConfig = {maxConcurrentPlayingVideos: 1};
      return cachedVideoPlaybackConfig;
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

function suppressNativeVideoControls(video) {
  if (!video) return;
  video.controls = false;
  video.removeAttribute('controls');
  video.disablePictureInPicture = true;
  if ('disableRemotePlayback' in video) video.disableRemotePlayback = true;
  video.setAttribute('controlsList', 'nodownload nofullscreen noremoteplayback');
}

function unloadInlineVideo(item) {
  if (!item) return;
  const video = item.querySelector('video.inline-video-player');
  if (video) {
    try { video.pause(); } catch (_) {}
    video.removeAttribute('src');
    video.remove();
  }
  item.classList.remove('video-loaded', 'video-playing');
  resetInlineVideoProgress(item);
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
  const playing = activeInlineVideoPlayers
    .filter(entry => entry.item !== exceptItem && !entry.video.paused && !entry.video.ended);
  while (playing.length >= limit) {
    const oldest = playing.shift();
    if (!oldest) break;
    // Preserve the original element and current frame; only playback yields.
    try { oldest.video.pause(); } catch (_) {}
  }
}

function resetInlineVideoProgress(item) {
  const shell = item?.closest('.video-attachment-shell');
  if (!shell) return;

  const fill = shell.querySelector('.video-progress-fill');
  const track = shell.querySelector('.video-progress-track');
  const time = shell.querySelector('.video-inline-time');
  if (fill) fill.style.width = '0%';
  if (track) track.setAttribute('aria-valuenow', '0');
  if (time) time.textContent = '0:00 / 0:00';
}

function bindInlineVideoProgress(item, video) {
  const shell = item.closest('.video-attachment-shell');
  const track = shell?.querySelector('.video-progress-track');
  const fill = shell?.querySelector('.video-progress-fill');
  const time = shell?.querySelector('.video-inline-time');
  if (!track || !fill || !time) return;

  const renderProgress = () => {
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    const ratio = duration > 0 ? Math.max(0, Math.min(1, current / duration)) : 0;
    const value = Math.round(ratio * 1000);

    fill.style.width = `${ratio * 100}%`;
    track.setAttribute('aria-valuenow', String(value));
    time.textContent = `${formatVideoClock(current)} / ${formatVideoClock(duration)}`;
  };

  const seekFromPointer = event => {
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    const rect = track.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    video.currentTime = ratio * video.duration;
    renderProgress();
  };

  let seeking = false;
  track.addEventListener('pointerdown', event => {
    seeking = true;
    try { track.setPointerCapture(event.pointerId); } catch (_) {}
    seekFromPointer(event);
  });
  track.addEventListener('pointermove', event => {
    if (seeking) seekFromPointer(event);
  });
  track.addEventListener('pointerup', event => {
    if (!seeking) return;
    seeking = false;
    seekFromPointer(event);
    try { track.releasePointerCapture(event.pointerId); } catch (_) {}
  });
  track.addEventListener('pointercancel', () => { seeking = false; });

  video.addEventListener('loadedmetadata', renderProgress);
  video.addEventListener('durationchange', renderProgress);
  video.addEventListener('loadeddata', renderProgress);
  video.addEventListener('timeupdate', renderProgress);
  video.addEventListener('ended', () => {
    item.classList.remove('video-playing');
  });
  renderProgress();
}

function inlineVideoSource(record, refreshToken = '') {
  const base = NativeMedia.url(record);
  if (!base || !refreshToken) return base;
  const joiner = base.includes('?') ? '&' : '?';
  return `${base}${joiner}jet_refresh=${encodeURIComponent(refreshToken)}`;
}

function createInlineVideo(item, record, options = {}) {
  const existing = item?.querySelector('video.inline-video-player');
  if (existing) return existing;
  if (!item || !record || !record.path) return null;
  const src = inlineVideoSource(record, options.refreshToken || '');
  if (!src) return null;

  const poster = item.querySelector('.video-poster');
  const video = document.createElement('video');
  video.className = 'inline-video-player';
  video.preload = 'metadata';
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  suppressNativeVideoControls(video);

  item.appendChild(video);
  item.classList.add('video-loaded');
  activeInlineVideoPlayers.push({item, video});
  bindInlineVideoProgress(item, video);

  // Keep the already-correct first-frame poster visible until the *same*
  // video element has decoded its own first frame. No black placeholder and
  // no player replacement are involved in the hand-off.
  video.addEventListener('loadeddata', () => {
    if (poster) poster.hidden = true;
    item.classList.add('video-first-frame-ready');
  }, {once:true});
  video.addEventListener('play', () => {
    suppressNativeVideoControls(video);
    item.classList.add('video-playing');
  });
  video.addEventListener('pause', () => item.classList.remove('video-playing'));

  video.addEventListener('error', () => {
    // removeAttribute('src') + load() is also used for intentional teardown.
    // Do not turn that controlled abort into a user-visible playback error.
    if (video.__jetDisposing) return;
    console.warn('Jet Note inline video error', {
      code: video.error?.code || 0,
      message: video.error?.message || '',
      path: record.path
    });
    unloadInlineVideo(item);
    alert(t('videoCannotPlay'));
  }, {once:true});

  // Assigning src starts normal preload. Deliberately do not call load(): this
  // element remains the playback surface for its entire rendered lifetime.
  video.src = src;
  return video;
}

function destroyInlineVideoElement(item, {rememberPosition = false} = {}) {
  if (!item) return {time: 0, wasPlaying: false};

  const video = item.querySelector('video.inline-video-player');
  const state = {
    time: video && Number.isFinite(video.currentTime) ? video.currentTime : 0,
    wasPlaying: !!(video && !video.paused && !video.ended)
  };

  if (rememberPosition && state.time > 0) item.__jetPendingResumeTime = state.time;

  if (video) {
    video.__jetDisposing = true;
    try { video.pause(); } catch (_) {}
    // Do not let the next player inherit Chromium/WebView's stale media
    // pipeline. Clearing src + load() releases the old resource/surface before
    // removing the HTMLMediaElement itself.
    try {
      video.removeAttribute('src');
      video.load();
    } catch (_) {}
    video.remove();
  }

  removeInlinePlayerEntry(item);
  item.classList.remove('video-loaded', 'video-playing', 'video-first-frame-ready');
  resetInlineVideoProgress(item);
  const poster = item.querySelector('.video-poster');
  if (poster) poster.hidden = false;
  return state;
}

function restorePendingInlineVideoPosition(item, video) {
  const requested = Number(item?.__jetPendingResumeTime || 0);
  item.__jetPendingResumeTime = 0;
  if (!requested || !video) return;

  const apply = () => {
    if (!video.isConnected || !Number.isFinite(video.duration) || video.duration <= 0) return;
    const target = Math.min(Math.max(0, requested), Math.max(0, video.duration - 0.05));
    try { video.currentTime = target; } catch (_) {}
  };

  if (video.readyState >= 1) apply();
  else video.addEventListener('loadedmetadata', apply, {once:true});
}

/**
 * Return one feed video to the same cold/unplayed state it has immediately
 * after page hydration.  Long-press is deliberately a RESET only: it releases
 * the current HTMLMediaElement and media pipeline, but does not create another
 * player and does not call play().  The next ordinary user tap creates a brand
 * new <video> through startInlineVideo(), matching the reliable first-play path
 * after a fresh app/page start.
 */
function resetInlineVideoToColdState(item) {
  if (!item || !item.isConnected) return;

  // A manual reset means "start over", unlike background recovery where we
  // intentionally remember the previous position for the next tap.
  item.__jetPendingResumeTime = 0;
  destroyInlineVideoElement(item, {rememberPosition:false});

  // Keep the attachment card itself and its bindings intact.  Only the media
  // object is retired.  This avoids immediately creating a second decoder /
  // Surface while Chromium/WebView may still be releasing the first one.
  item.classList.remove('video-loaded', 'video-playing', 'video-first-frame-ready');
  const poster = item.querySelector('.video-poster');
  if (poster) poster.hidden = false;
  resetInlineVideoProgress(item);
}

function bindInlineVideoLongPress(item) {
  if (!item || item.__jetLongPressBound) return;
  item.__jetLongPressBound = true;

  let timer = null;
  let startX = 0;
  let startY = 0;
  let pointerId = null;
  let longPressReady = false;
  let suppressClick = false;
  const HOLD_MS = 550;
  const MOVE_TOLERANCE = 12;

  const suppressNativeVideoLongPressHaptic = suppressed => {
    try {
      window.JetNoteNative?.setVideoDefaultHapticSuppressed?.(!!suppressed);
    } catch (_) { }
  };

  const cancelTimer = () => {
    if (timer != null) clearTimeout(timer);
    timer = null;
  };
  const resetPointer = () => {
    cancelTimer();
    pointerId = null;
  };

  item.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // A fresh pointerdown is a brand-new user gesture. Android WebView does
    // not always emit the synthetic click that normally follows a long press,
    // so never let the old suppression flag eat this next real tap.
    suppressClick = false;
    resetPointer();
    longPressReady = false;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    // Disable only WebView's built-in haptic for this video gesture.
    // Jet Note's own confirmation haptic below remains active.
    suppressNativeVideoLongPressHaptic(true);
    timer = setTimeout(() => {
      timer = null;
      longPressReady = true;
      suppressClick = true;
      // Give immediate tactile confirmation at the exact moment the existing
      // 550 ms / 12 px long-press condition has been satisfied. This does not
      // alter the gesture decision or start the reset early; the cold reset
      // still runs only on pointerup.
      try {
        if (window.JetNoteNative?.hapticLongPress) {
          window.JetNoteNative.hapticLongPress();
        } else if (navigator.vibrate) {
          navigator.vibrate(30);
        }
      } catch (_) { }
      // Do not touch the media element from the timer callback.  The actual
      // reset happens on pointerup; most importantly, no new player is created
      // as part of this long-press gesture.
    }, HOLD_MS);
  });

  item.addEventListener('pointermove', event => {
    if (event.pointerId !== pointerId || timer == null) return;
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > MOVE_TOLERANCE) {
      cancelTimer();
      pointerId = null;
      suppressNativeVideoLongPressHaptic(false);
    }
  });

  item.addEventListener('pointerup', event => {
    if (event.pointerId !== pointerId) return;
    const shouldReset = longPressReady;
    resetPointer();
    suppressNativeVideoLongPressHaptic(false);
    longPressReady = false;
    if (shouldReset) {
      event.preventDefault();
      event.stopPropagation();
      resetInlineVideoToColdState(item);
    }
  });

  item.addEventListener('pointercancel', () => {
    resetPointer();
    suppressNativeVideoLongPressHaptic(false);
    longPressReady = false;
  });

  item.addEventListener('contextmenu', event => {
    // Android may emit contextmenu after a touch long-press. The pointerup path
    // above is the authoritative cold-reset path, so only suppress the menu here.
    event.preventDefault();
  });

  item.addEventListener('click', event => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}

let videoResumeRecoveryTimer = null;
function recoverInlineVideosAfterResume() {
  if (videoResumeRecoveryTimer != null) clearTimeout(videoResumeRecoveryTimer);
  videoResumeRecoveryTimer = setTimeout(() => {
    videoResumeRecoveryTimer = null;
    activeInlineVideoPlayers.slice().forEach(({item, video}) => {
      if (!item?.isConnected || !video?.isConnected) return;
      // A backgrounded Android WebView may return with a dead decoder/surface.
      // Do not attempt an async auto-play/reload here. Retire that media element
      // and remember the position; the next real user tap creates + plays a new
      // element inside the click gesture, mirroring the reliable Edit Post path.
      destroyInlineVideoElement(item, {rememberPosition:true});
    });
  }, 120);
}

window.addEventListener('jetnote:app-resume', recoverInlineVideosAfterResume);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) recoverInlineVideosAfterResume();
});

function startInlineVideo(item) {
  // First tap after hydration/resume creates a genuinely fresh HTMLMediaElement
  // and calls play() in the same user gesture. This avoids reusing a media
  // surface that Android WebView may have invalidated in the background.
  let video = item?.querySelector('video.inline-video-player');
  if (!video) {
    const refreshToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    video = createInlineVideo(item, item?.__jetVideoRecord, {refreshToken});
    if (video) restorePendingInlineVideoPosition(item, video);
  }
  if (!video) return;

  if (!video.paused && !video.ended) {
    video.pause();
    return;
  }

  const limit = cachedVideoPlaybackConfig.maxConcurrentPlayingVideos;
  if (limit === 0) return;
  reclaimVideoSlots(limit, item);
  if (video.ended) {
    try { video.currentTime = 0; } catch (_) {}
  }

  const tryPlay = () => {
    if (!video?.isConnected || item.querySelector('video.inline-video-player') !== video) return;
    try {
      const playResult = video.play();
      if (playResult?.catch) {
        playResult.catch(error => {
          console.warn('Jet Note video play rejected', error);
          // A newly-created WebView video can briefly reject play() before its
          // resource reaches a playable state. Keep the user's first-tap intent
          // and retry once when media readiness advances instead of requiring a
          // second physical tap.
          if (!video.__jetPlayRetryArmed && video.readyState < 2) {
            video.__jetPlayRetryArmed = true;
            const retry = () => {
              video.__jetPlayRetryArmed = false;
              if (!video.isConnected || !video.paused || video.ended) return;
              try {
                const retryResult = video.play();
                if (retryResult?.catch) retryResult.catch(retryError => console.warn('Jet Note video retry play rejected', retryError));
              } catch (retryError) {
                console.warn('Jet Note video retry play rejected', retryError);
              }
            };
            video.addEventListener('loadeddata', retry, {once:true});
            video.addEventListener('canplay', retry, {once:true});
          }
        });
      }
    } catch (error) {
      console.warn('Jet Note video play rejected', error);
    }
  };

  // First attempt stays directly inside the real user click.
  tryPlay();
}

async function hydrateVideoAttachments(container, staged = new Map()) {
  if (!container) return;
  // Keep the existing configuration contract, but do not delay a user tap on
  // an async config request; the cached default is used until this resolves.
  void loadVideoPlaybackConfig();

  await Promise.all([...container.querySelectorAll('.video-attachment-item')].map(async item => {
    try {
      const record = staged.get(item.dataset.mediaId) || await EntryStore.media(item.dataset.mediaId);
      if (!item.isConnected || !record) throw Error('Missing video attachment');

      const poster = item.querySelector('.video-poster');
      const thumb = videoThumbUrl(record);
      if (poster && thumb) {
        // The JPEG is a visual safety net while this card's real video frame decodes.
        poster.src = thumb;
        poster.onerror = () => item.classList.add('poster-unavailable');
      }

      // Keep poster and playback as separate lifecycles. Hydration prepares only
      // the poster; the real <video> is created lazily from the user tap.
      item.__jetVideoRecord = record;
      bindInlineVideoLongPress(item);
      item.onclick = event => {
        if (event.target.closest('.compose-image-remove')) return;
        startInlineVideo(item);
      };
    } catch (error) {
      item.innerHTML = `<div class="video-unavailable">${escapeHTML(t('videoCannotPlay'))}</div>`;
    }
  }));
}

async function handleAudioFiles(event){
  const files=Array.from(event.target.files||[]);
  event.target.value='';
  if(postDraftMediaLoading)return;
  postDraftMediaLoading=true;
  const token=audioLoadToken.post,button=document.querySelector('[data-add-audio="post"]');
  if(button)button.disabled=true;
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
    if(typeof syncPostEditorDraft==='function')syncPostEditorDraft();
  }catch(error){
    alert(error.message);
  }
  finally{
    postDraftMediaLoading=false;
    if(button)button.disabled=false;
  }
}
document.addEventListener('play',event=>{
  if(event.target.tagName==='AUDIO')document.querySelectorAll('audio').forEach(a=>{
    if(a!==event.target)a.pause();
  });
},true);
