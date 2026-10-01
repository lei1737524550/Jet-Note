/* Jet Note inline video UI. Android owns decoding; WebView owns card/progress/time. */
// Native video ownership is explicit. DOM nodes are replaceable render targets,
// never the identity of the Android player session.
const NativeVideoSession = (() => {
  let generation = 0;
  let current = null;
  function ownerFor(element) {
    if (!element?.closest) return 'none';
    if (element.closest('.post-compose-screen')) return 'editor';
    if (element.closest('#noteViewerScreen')) return 'viewer';
    if (element.closest('#archiveScreen')) return 'archive';
    return 'home';
  }
  function bind(element) {
    if (!element) return clear('bind-null');
    const mediaId = String(element.dataset?.mediaId || '');
    const owner = ownerFor(element);
    if (!current || current.mediaId !== mediaId || current.owner !== owner) generation += 1;
    current = { mediaId, owner, element, generation };
    return current;
  }
  function rebind(element) {
    if (!current || !element) return null;
    if (String(element.dataset?.mediaId || '') !== current.mediaId || ownerFor(element) !== current.owner) return null;
    current = { ...current, element };
    return current;
  }
  function detachElement() { if (current) current = { ...current, element: null }; return current; }
  function clear() { generation += 1; current = null; return generation; }
  function get() { return current; }
  function matches(mediaId, element = null) {
    if (!current || current.mediaId !== String(mediaId || '')) return false;
    return !element || current.element === element;
  }
  return Object.freeze({ ownerFor, bind, rebind, detachElement, clear, get, matches });
})();
window.JetNoteNativeVideoSession = NativeVideoSession;

function activeNativeVideoElement() { return NativeVideoSession.get()?.element || null; }
let nativeVideoRectFrame = 0;

const nativeVideoBlockingSelectors = [
  // All New/Edit/Debug editors share the post-compose-screen contract.
  // Keeping this class-based prevents a newly-added editor from accidentally
  // letting the native TextureView float above the WebView editor.
  '#settingsScreen.open',
  '#toolsScreen.open',
  '#imageViewer.open',
  '#importPreview.open',
  // Post action/confirmation menus must always sit above the native TextureView.
  // CSS z-index cannot order a native sibling below WebView HTML, so treat these
  // overlays as native-video blockers too.
  '#postActionPanel.open',
  '#deleteConfirmBackdrop.open'
];
let nativeVideoOverlayAllowed = true;

/**
 * Hide the native TextureView synchronously from the JS route's point of view
 * before a full-screen editor becomes visible. The native player is a sibling
 * of the WebView, so CSS z-index alone can never guarantee that it stays below
 * an HTML editor.
 */
function suspendNativeVideoOverlay() {
  nativeVideoOverlayAllowed = false;
  try { window.JetNoteNative?.setVideoOverlayAllowed?.(false); } catch (_) {}
}

function syncNativeVideoOverlayVisibility() {
  const openEditor = document.querySelector('.post-compose-screen.open');
  const openViewer = document.querySelector('#noteViewerScreen.open');
  const archiveOpen = document.querySelector('#archiveScreen.open');
  // Archive/Viewer are routes, not permanent video blockers. Their own active
  // inline card may own the native TextureView; an editor opened from Archive
  // takes precedence over the still-mounted Archive route underneath.
  const routeBlocksVideo = !!archiveOpen && !openEditor && !openViewer;
  const blocked = routeBlocksVideo || nativeVideoBlockingSelectors.some(selector => document.querySelector(selector));
  const session = NativeVideoSession.get();
  const activeVideoBelongsToOpenEditor = !!(openEditor && session?.owner === 'editor' && session.element?.isConnected && openEditor.contains(session.element));
  const activeVideoBelongsToOpenViewer = !!(openViewer && session?.owner === 'viewer' && session.element?.isConnected && openViewer.contains(session.element));
  // Full-screen routes own the native TextureView exclusively. Merely opening
  // Post Viewer must never resurrect the Home/feed TextureView that was active
  // before the route transition. The native surface becomes visible again only
  // after startNativeVideo() selects a video DOM node inside the open route.
  const editorAllowsVideo = !openEditor || activeVideoBelongsToOpenEditor;
  const viewerAllowsVideo = !openViewer || activeVideoBelongsToOpenViewer;
  const allowed = postMovementVideoFreezeDepth === 0 && !blocked && editorAllowsVideo && viewerAllowsVideo && !document.hidden;
  if (allowed !== nativeVideoOverlayAllowed) {
    nativeVideoOverlayAllowed = allowed;
    try { window.JetNoteNative?.setVideoOverlayAllowed?.(allowed); } catch (_) {}
  }
  if (allowed && activeNativeVideoElement()?.isConnected) scheduleNativeVideoRect();
}

window.__jetSyncNativeVideoVisibility = syncNativeVideoOverlayVisibility;
window.JetNoteVideoOverlay = Object.freeze({
  suspend: suspendNativeVideoOverlay,
  sync: syncNativeVideoOverlayVisibility
});

// At most one native player is active. Keep its decoded current frame across
// DOM rebuilds; never replace it with the first-frame thumbnail during FLIP.
const JetNoteVideoFrames = (() => {
  const frames = new Map();
  const pending = new Map();
  let serial = 0;
  async function apply(id, source) {
    const posters = [...document.querySelectorAll(`.native-video-card[data-media-id="${CSS.escape(id)}"] .video-poster`)];
    await Promise.all(posters.map(async poster => {
      poster.src = source;
      poster.hidden = false;
      try { await poster.decode(); } catch (_) {}
    }));
  }
  window.__jetReceiveVideoFrame = async (token, id, source) => {
    if (id && source) {
      frames.clear();
      frames.set(String(id), source);
      await apply(String(id), source);
    }
    if (String(token).startsWith('scroll:') && source) {
      window.JetNoteNative?.confirmScrollVideoFrame?.(token);
    }
    pending.get(token)?.();
  };
  function capture() {
    if (!activeNativeVideoElement() || !window.JetNoteNative?.captureVideoFrame) return Promise.resolve();
    return new Promise(resolve => {
      const token = String(++serial);
      const timer = setTimeout(finish, 1000);
      function finish() { clearTimeout(timer); pending.delete(token); resolve(); }
      pending.set(token, finish);
      try { window.JetNoteNative.captureVideoFrame(token); } catch (_) { finish(); }
    });
  }
  return Object.freeze({capture, get: id => frames.get(String(id)) || ''});
})();
window.JetNoteVideoFrames = JetNoteVideoFrames;

// Post FLIP and Android TextureView must never animate independently. The native
// video surface lives outside the WebView compositor, so CSS transform cannot move it.
// During a Post transaction the WebView poster/proxy is the single visual owner.
let postMovementVideoFreezeDepth = 0;
let postMovementDetachedNativeVideoId = null;
// Preserve the real media box across renderPosts(). Published video height is
// normally supplied by the poster image; a freshly rebuilt <img> has no
// intrinsic height until its thumbnail is resolved, which can collapse the
// whole Post for one WebView frame. Keep the FIRST box authoritative until the
// replacement poster is ready.
let postMovementFrozenVideoGeometry = new Map();

function capturePostMovementVideoGeometry() {
  const frozen = new Map();
  document.querySelectorAll('.published-post-surface .native-video-card[data-media-id]').forEach(item => {
    const rect = item.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      frozen.set(String(item.dataset.mediaId), { width: rect.width, height: rect.height });
      item.style.setProperty('height', `${rect.height}px`, 'important');
      item.style.setProperty('min-height', `${rect.height}px`, 'important');
      item.style.setProperty('max-height', `${rect.height}px`, 'important');
    }
  });
  return frozen;
}

window.__jetApplyPostMovementVideoGeometry = function(root = document) {
  if (postMovementVideoFreezeDepth <= 0 || !postMovementFrozenVideoGeometry.size) return;
  postMovementFrozenVideoGeometry.forEach((geometry, id) => {
    const item = root.querySelector?.(`.native-video-card[data-media-id="${CSS.escape(id)}"]`);
    if (!item) return;
    const poster = item.querySelector('.video-poster');
    const frame = JetNoteVideoFrames.get(id);
    if (poster && frame) { poster.src = frame; poster.hidden = false; }
    item.style.setProperty('height', `${geometry.height}px`, 'important');
    item.style.setProperty('min-height', `${geometry.height}px`, 'important');
    item.style.setProperty('max-height', `${geometry.height}px`, 'important');
  });
};

function releasePostMovementVideoGeometry() {
  postMovementFrozenVideoGeometry.forEach((geometry, id) => {
    const item = document.querySelector(`.native-video-card[data-media-id="${CSS.escape(id)}"]`);
    if (!item) return;
    const release = () => {
      item.style.removeProperty('height');
      item.style.removeProperty('min-height');
      item.style.removeProperty('max-height');
    };
    const poster = item.querySelector('.video-poster');
    // Never recreate the original one-frame collapse while releasing the lock.
    // If the thumbnail is still decoding, keep the box until it can own height.
    if (poster?.complete && poster.naturalWidth > 0) release();
    else if (poster) poster.addEventListener('load', release, { once: true });
    else release();
  });
  postMovementFrozenVideoGeometry.clear();
}
window.__jetBeginPostMovementVideoFreeze = function() {
  postMovementVideoFreezeDepth += 1;
  if (postMovementVideoFreezeDepth !== 1) return;
  // A moving Video Post must be indistinguishable from an image Post to FLIP.
  // The Android player remains alive, but its TextureView is completely hidden
  // and detached from DOM geometry until LAST has settled.
  postMovementDetachedNativeVideoId = NativeVideoSession.get()?.mediaId || null;
  postMovementFrozenVideoGeometry = capturePostMovementVideoGeometry();
  document.documentElement.classList.add('jet-post-movement-video-freeze');
  nativeVideoOverlayAllowed = false;
  if (nativeVideoRectFrame) {
    cancelAnimationFrame(nativeVideoRectFrame);
    nativeVideoRectFrame = 0;
  }
  try { window.JetNoteNative?.setVideoOverlayAllowed?.(false); } catch (_) {}
};
window.__jetEndPostMovementVideoFreeze = function() {
  postMovementVideoFreezeDepth = Math.max(0, postMovementVideoFreezeDepth - 1);
  if (postMovementVideoFreezeDepth > 0) return;

  // renderPosts() replaces the old Video Post DOM. Rebind the still-alive native
  // player to the FINAL card only now; never feed it an intermediate FLIP rect.
  if (postMovementDetachedNativeVideoId) {
    const id = String(postMovementDetachedNativeVideoId);
    {
      const previous = NativeVideoSession.get();
      const selector = `.native-video-card[data-media-id="${CSS.escape(id)}"]`;
      const candidates = [...document.querySelectorAll(selector)];
      const replacement = candidates.find(node => NativeVideoSession.ownerFor(node) === previous?.owner) || null;
      if (replacement) NativeVideoSession.rebind(replacement); else NativeVideoSession.detachElement();
    }
  }
  postMovementDetachedNativeVideoId = null;

  // IMPORTANT: the Android TextureView still remembers its FIRST (pre-move) rect.
  // Do not make it visible before replacing that stale geometry, otherwise the
  // first native frame after a Star/Favorite reorder flashes at the old position.
  // updateVideoRect is sent while the overlay is still disabled; only after the
  // FINAL rect is installed do we release the native surface.
  if (activeNativeVideoElement()?.isConnected && window.JetNoteNative?.updateVideoRect) {
    try {
      const item = activeNativeVideoElement();
      const r = nativeVideoRect(item);
      window.JetNoteNative.updateVideoRect(item.dataset.mediaId, r.left, r.top, r.width, r.height, r.dpr);
    } catch (_) {}
  }

  document.documentElement.classList.remove('jet-post-movement-video-freeze');
  releasePostMovementVideoGeometry();
  syncNativeVideoOverlayVisibility();
  // A following frame may refine sub-pixel/layout settling, but visibility no
  // longer races ahead of the FINAL native rect.
  if (activeNativeVideoElement()?.isConnected && nativeVideoOverlayAllowed) scheduleNativeVideoRect();
};

const nativeVideoVisibilityObserver = new MutationObserver(() => syncNativeVideoOverlayVisibility());
nativeVideoVisibilityObserver.observe(document.documentElement, {
  subtree: true,
  attributes: true,
  attributeFilter: ['class', 'hidden']
});
document.addEventListener('visibilitychange', syncNativeVideoOverlayVisibility);
window.addEventListener('pageshow', syncNativeVideoOverlayVisibility);
window.addEventListener('pagehide', () => {
  try { window.JetNoteNative?.setVideoOverlayAllowed?.(false); } catch (_) {}
});
queueMicrotask(syncNativeVideoOverlayVisibility);


function renderVideoAttachmentCardHTML(item) {
  return `
    <div class="video-attachment-shell">
      <div class="video-attachment-item native-video-card" data-media-id="${escapeHTML(item.id)}">
        <img class="video-poster" alt="" draggable="false">
      </div>
      <div class="video-progress-track" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="video-progress-fill"></div>
      </div>
      <div class="video-compact-controls">
        <span class="video-inline-time">0:00/0:00</span>
        <span class="video-playback-state" aria-hidden="true">▶</span>
      </div>
    </div>`;
}

function renderVideoAttachmentsHTML(items) {
  const videos = (items || []).filter(item => item.type === 'video');
  if (!videos.length) return '';
  return `<div class="post-video-grid ${mediaGridClass(videos)}">${videos.map(renderVideoAttachmentCardHTML).join('')}</div>`;
}

function videoThumbUrl(record) {
  const path = String(record?.path || '');
  if (!/^media\/[A-Za-z0-9_.-]+$/.test(path)) return '';
  const file = path.slice('media/'.length);
  return 'https://appassets.androidplatform.net/video-thumb/' + file + '.jpg';
}

function videoMediaUrl(record) {
  const path = String(record?.path || '');
  if (!/^media\/[A-Za-z0-9_.-]+$/.test(path)) return '';
  return 'https://appassets.androidplatform.net/' + path;
}

function openPublishedVideoViewerFromItem(item, startMs = 0) {
  const record = item?.__jetVideoRecord;
  if (!record?.path) return;
  const mediaId = String(item?.dataset.mediaId || '');
  const safeStartMs = Math.max(0, Math.round(Number(startMs || 0)));

  // Prefer Jet Note's Android-native viewer. The current inline position is
  // passed in milliseconds so opening the viewer never restarts from 0:00.
  try {
    if (window.JetNoteNative?.openVideoViewer) {
      window.JetNoteNative.openVideoViewer(record.path, mediaId, safeStartMs);
      return;
    }
  } catch (error) {
    console.warn('Jet Note native video viewer launch failed', error);
  }

  // Browser viewer is only a compatibility fallback for environments without
  // the Android bridge.
  const url = videoMediaUrl(record);
  if (url && typeof openVideoViewer === 'function') {
    openVideoViewer(url, safeStartMs / 1000);
  }
}

function formatVideoClock(milliseconds) {
  const total = Math.max(0, Math.floor(Number(milliseconds || 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function resetNativeVideoCard(item) {
  const shell = item?.closest('.video-attachment-shell');
  if (!shell) return;
  const fill = shell.querySelector('.video-progress-fill');
  const track = shell.querySelector('.video-progress-track');
  const time = shell.querySelector('.video-inline-time');
  if (fill) fill.style.width = '0%';
  if (track) track.setAttribute('aria-valuenow', '0');
  if (time) time.textContent = '0:00/0:00';
  document.querySelectorAll(`[data-video-time-button-for="${CSS.escape(String(item?.dataset.mediaId || ''))}"]`)
    .forEach(button => { button.textContent = '0:00/0:00'; });
  shell.__jetVideoDurationMs = 0;
  shell.__jetVideoCurrentMs = 0;
  shell.__jetVideoPlaying = false;
  shell.__jetVideoEverStarted = false;
  const playbackState = shell.querySelector('.video-playback-state');
  if (playbackState) playbackState.textContent = '▶';
}

function syncNativeVideoFit(item) {
  const group = item.closest('.post-compose-visual-media, .post-published-media-strip');
  window.JetNoteNative?.setVideoCropMode?.(Number(group?.dataset.mediaCount || 1) >= 3);
}

function nativeVideoRect(item) {
  syncNativeVideoFit(item);
  const rect = item.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    dpr: window.devicePixelRatio || 1
  };
}

function sendNativeVideoRect() {
  nativeVideoRectFrame = 0;
  if (postMovementVideoFreezeDepth > 0) return;
  const item = activeNativeVideoElement();
  if (!item?.isConnected || !window.JetNoteNative?.updateVideoRect) return;
  const r = nativeVideoRect(item);
  window.JetNoteNative.updateVideoRect(item.dataset.mediaId, r.left, r.top, r.width, r.height, r.dpr);
}

function scheduleNativeVideoRect() {
  if (postMovementVideoFreezeDepth > 0 || nativeVideoRectFrame) return;
  nativeVideoRectFrame = requestAnimationFrame(sendNativeVideoRect);
}

// Android calls this only after WebView scrolling has settled. The DOM rect is
// authoritative because getBoundingClientRect() already includes the final scroll.
window.__jetRefreshNativeVideoRect = function() {
  if (activeNativeVideoElement()?.isConnected) sendNativeVideoRect();
};

window.addEventListener('scroll', scheduleNativeVideoRect, true);
window.addEventListener('resize', scheduleNativeVideoRect);

function releaseVideoAttachmentUrls(container) {
  const manager=window.JetNoteMediaResourceManager;
  container?.querySelectorAll?.('.video-attachment-shell')?.forEach(shell=>{
    if(shell.__jetVideoProgressResourceId)manager?.release?.(shell.__jetVideoProgressResourceId,'video-container-release');
    manager?.releaseOwner?.(shell,'video-container-release');
  });
  if (activeNativeVideoElement() && container?.contains(activeNativeVideoElement())) {
    if (postMovementVideoFreezeDepth > 0) {
      // DOM rebuild during FLIP must NOT destroy the Android player. Remember its
      // identity and detach only the obsolete DOM reference; LAST will rebind it.
      postMovementDetachedNativeVideoId = NativeVideoSession.get()?.mediaId || postMovementDetachedNativeVideoId;
      NativeVideoSession.detachElement();
    } else {
      try { window.JetNoteNative?.stopVideo?.(NativeVideoSession.get()?.mediaId); } catch (_) {}
      NativeVideoSession.clear('container-release');
    }
  }
}

function startNativeVideo(item) {
  const record = item?.__jetVideoRecord;
  if (!record?.path) return;
  // Establish an explicit owner session only after the target is known playable.
  // A failed/missing record must never steal ownership from the current player.
  const session = NativeVideoSession.bind(item);
  syncNativeVideoOverlayVisibility();
  if (!nativeVideoOverlayAllowed) {
    if (NativeVideoSession.get()?.generation === session.generation) NativeVideoSession.clear('start-blocked');
    return;
  }
  try {
    if (!window.JetNoteNative?.playVideoInline) throw new Error('Native inline video bridge unavailable');
    const r = nativeVideoRect(item);
    window.JetNoteNative.playVideoInline(
      record.path,
      item.dataset.mediaId,
      r.left,
      r.top,
      r.width,
      r.height,
      r.dpr
    );
  } catch (error) {
    console.warn('Jet Note native inline video launch failed', error);
    if (NativeVideoSession.get()?.generation === session.generation) NativeVideoSession.clear('start-failed');
    syncNativeVideoOverlayVisibility();
    alert(t('videoCannotPlay'));
  }
}

function isPostMediaRightEdgeYield(element, event, kind) {
  if (!element || event?.clientX == null || element.closest('.post-compose-screen')) return false;
  const rect=element.getBoundingClientRect();
  if (!rect.width) return false;
  const config=window.JetNotePostMediaGestureConfig||{};
  const percent=Math.max(0,Math.min(40,Number(config[kind] ?? 7)));
  return event.clientX >= rect.right - rect.width*percent/100;
}

function fractionFromPointer(track, event) {
  const rect = track.getBoundingClientRect();
  if (!rect.width) return 0;
  return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
}

function renderSeekPreview(shell, fraction) {
  const fill = shell.querySelector('.video-progress-fill');
  const track = shell.querySelector('.video-progress-track');
  const time = shell.querySelector('.video-inline-time');
  const duration = Number(shell.__jetVideoDurationMs || 0);
  const target = Math.round(duration * fraction);
  if (fill) fill.style.width = `${fraction * 100}%`;
  if (track) track.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
  const label = `${formatVideoClock(target)}/${formatVideoClock(duration)}`;
  if (time) time.textContent = label;
  const mediaId = shell.querySelector('.video-attachment-item')?.dataset.mediaId || '';
  document.querySelectorAll(`[data-video-time-button-for="${CSS.escape(String(mediaId))}"]`)
    .forEach(button => { button.textContent = label; });
}

function bindVideoProgress(item) {
  const shell = item.closest('.video-attachment-shell');
  const track = shell?.querySelector('.video-progress-track');
  if (!shell || !track || track.__jetBound) return;
  track.__jetBound = true;

  let dragging = false, pointerId = null, lastFraction = 0, disposed = false;
  let seekStartX = null;
  const listeners=[];
  const on=(target,type,fn,options)=>{target.addEventListener(type,fn,options);listeners.push(()=>target.removeEventListener(type,fn,options));};
  const finishSeek = (event, useEventPosition = true) => {
    if (!dragging) return;
    if (event?.pointerId != null && pointerId != null && event.pointerId !== pointerId) return;
    if (useEventPosition && event?.clientX != null) {lastFraction=fractionFromPointer(track,event);renderSeekPreview(shell,lastFraction);}
    const capturedId=pointerId; dragging=false; pointerId=null; track.classList.remove('seeking');
    try{if(capturedId!=null&&track.hasPointerCapture?.(capturedId))track.releasePointerCapture(capturedId);}catch(_){}
    if(!disposed)try{window.JetNoteNative?.endVideoSeek?.(item.dataset.mediaId,lastFraction);}catch(_){}
    // A tap and a drag on the progress track are both seek operations.
    // The time label below the video is the only Video Viewer entry point.
    seekStartX = null;
    event?.preventDefault?.();
    event?.stopPropagation?.();
  };
  const begin=event=>{if(disposed)return;seekStartX=event.clientX;lastFraction=fractionFromPointer(track,event);dragging=true;pointerId=event.pointerId;track.classList.add('seeking');try{track.setPointerCapture(pointerId);}catch(_){}if(!shell.__jetVideoEverStarted||!shell.__jetVideoDurationMs)startNativeVideo(item);window.JetNoteNative?.beginVideoSeek?.(item.dataset.mediaId,lastFraction);renderSeekPreview(shell,lastFraction);event.preventDefault();event.stopPropagation();};
  const move=event=>{if(disposed||!dragging||event.pointerId!==pointerId)return;lastFraction=fractionFromPointer(track,event);renderSeekPreview(shell,lastFraction);event.preventDefault();event.stopPropagation();};
  const up=event=>finishSeek(event,true), cancel=event=>finishSeek(event,false), blur=()=>finishSeek(null,false), visibility=()=>{if(document.hidden)finishSeek(null,false);};
  on(track,'pointerdown',begin); on(track,'pointermove',move); on(track,'pointerup',up); on(track,'pointercancel',cancel); on(track,'lostpointercapture',cancel);
  on(window,'pointerup',up,true); on(window,'pointercancel',cancel,true); on(window,'blur',blur); on(document,'visibilitychange',visibility);

  const manager=window.JetNoteMediaResourceManager;
  shell.__jetVideoProgressResourceId=manager?.register?.({
    id:`video-progress:${item.dataset.mediaId||Math.random()}:${Date.now()}`,kind:'video-progress',scope:manager.scopeFor(item),owner:shell,
    release:()=>{disposed=true;finishSeek(null,false);for(const off of listeners.splice(0))try{off();}catch(_){}track.__jetBound=false;shell.__jetVideoProgressResourceId=null;}
  });
}
window.__jetNativeVideoViewerClosed = function(mediaId, currentMs, durationMs) {
  const id = String(mediaId || '');
  const current = Math.max(0, Number(currentMs || 0));
  const duration = Math.max(0, Number(durationMs || 0));
  const item = document.querySelector(`.video-attachment-item[data-media-id="${CSS.escape(id)}"]`);
  const shell = item?.closest('.video-attachment-shell');
  if (!shell) return;

  // Keep the Post UI at the exact native-viewer position. NativeVideoPlayer is
  // synchronized separately on Android, so the next inline play continues from
  // this same point instead of jumping back to the old decoder position.
  if (duration > 0) shell.__jetVideoDurationMs = duration;
  shell.__jetVideoCurrentMs = current;
  shell.__jetVideoPlaying = false;
  shell.__jetVideoEverStarted = true;
  const effectiveDuration = Math.max(duration, Number(shell.__jetVideoDurationMs || 0));
  const fraction = effectiveDuration > 0 ? Math.max(0, Math.min(1, current / effectiveDuration)) : 0;
  const fill = shell.querySelector('.video-progress-fill');
  const track = shell.querySelector('.video-progress-track');
  const inlineTime = shell.querySelector('.video-inline-time');
  if (fill) fill.style.width = `${fraction * 100}%`;
  if (track) track.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
  const label = `${formatVideoClock(current)}/${formatVideoClock(effectiveDuration)}`;
  if (inlineTime) inlineTime.textContent = label;
  document.querySelectorAll(`[data-video-time-button-for="${CSS.escape(id)}"]`).forEach(button => {
    button.textContent = label;
    button.classList.remove('playing');
    button.setAttribute('aria-pressed', 'false');
  });
};

window.__jetNativeVideoProgress = function(mediaId, currentMs, durationMs, playing, everStarted) {
  if (postMovementVideoFreezeDepth > 0) return;
  const item = activeNativeVideoElement();
  if (!item?.isConnected || !NativeVideoSession.matches(mediaId, item)) return;
  const shell = item.closest('.video-attachment-shell');
  if (!shell) return;

  shell.__jetVideoDurationMs = Math.max(0, Number(durationMs || 0));
  shell.__jetVideoCurrentMs = Math.max(0, Number(currentMs || 0));
  shell.__jetVideoPlaying = !!playing;
  shell.__jetVideoEverStarted = !!everStarted;
  const playbackState = shell.querySelector('.video-playback-state');
  if (playbackState) playbackState.textContent = playing ? 'Ⅱ' : '▶';

  const duration = shell.__jetVideoDurationMs;
  const current = shell.__jetVideoCurrentMs;
  const fraction = duration > 0 ? Math.max(0, Math.min(1, current / duration)) : 0;
  const fill = shell.querySelector('.video-progress-fill');
  const track = shell.querySelector('.video-progress-track');
  const time = shell.querySelector('.video-inline-time');

  if (!track?.classList.contains('seeking')) {
    if (fill) fill.style.width = `${fraction * 100}%`;
    if (track) track.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
    const label = !everStarted
      ? '0:00/0:00'
      : `${formatVideoClock(current)}/${formatVideoClock(duration)}`;
    if (time) time.textContent = label;
    document.querySelectorAll(`[data-video-time-button-for="${CSS.escape(String(mediaId))}"]`)
      .forEach(button => {
        button.textContent = label;
        button.classList.toggle('playing', !!playing);
        button.setAttribute('aria-pressed', playing ? 'true' : 'false');
      });
  }
};

window.__jetNativeVideoClosed = function(mediaId) {
  if (postMovementVideoFreezeDepth > 0) return;
  if (NativeVideoSession.matches(mediaId)) NativeVideoSession.clear('native-closed');
};

// Native long-press cold reset: the whole decoder/surface was destroyed.
// Reset only UI state here; the real first-frame poster is already underneath.
window.__jetNativeVideoReset = function(mediaId) {
  if (postMovementVideoFreezeDepth > 0) return;
  const id = String(mediaId);
  const item = NativeVideoSession.matches(id) ? activeNativeVideoElement() : null;
  if (item) {
    resetNativeVideoCard(item);
    const poster = item.querySelector('.video-poster');
    if (poster) poster.hidden = false;
  }
  if (NativeVideoSession.matches(id)) NativeVideoSession.clear('native-reset');
};

window.__jetNativeVideoSurfaceTapped = function(mediaId, currentMs) {
  if (postMovementVideoFreezeDepth > 0) return;
  const item = activeNativeVideoElement();
  if (!item?.isConnected || !NativeVideoSession.matches(mediaId, item)) return;
  if (item.closest('.post-compose-screen')) {
    startNativeVideo(item);
    return;
  }
  startNativeVideo(item);
};

async function hydrateVideoAttachments(container, staged = new Map()) {
  if (!container) return;

  await Promise.all([...container.querySelectorAll('.video-attachment-item')].map(async item => {
    try {
      const record = staged.get(item.dataset.mediaId) || await EntryStore.media(item.dataset.mediaId);
      if (!item.isConnected || !record?.path) throw Error('Missing video attachment');

      item.__jetVideoRecord = record;
      resetNativeVideoCard(item);
      bindVideoProgress(item);

      const poster = item.querySelector('.video-poster');
      const thumb = videoThumbUrl(record);
      if (poster && thumb) {
        poster.src = JetNoteVideoFrames.get(item.dataset.mediaId) || thumb;
        poster.hidden = false;
        poster.onerror = () => item.classList.add('poster-unavailable');
      }

      const isEditorVideo = !!item.closest('.post-compose-screen');
      item.onclick = event => {
        if (event.target.closest('.compose-image-remove')) return;
        // The video picture has one predictable job everywhere: play/pause.
        // Do not let a parent Post/viewer click handler reinterpret this tap.
        event.preventDefault();
        event.stopPropagation();
        startNativeVideo(item);
      };
      // Editor previews keep the existing double-click restart shortcut. Feed
      // Published videos use tap for inline play/pause; the time text owns Video Viewer entry.
      item.ondblclick = isEditorVideo ? (event => {
        if (event.target.closest('.compose-image-remove')) return;
        event.preventDefault();
        event.stopPropagation();
        const duration = Number(item.closest('.video-attachment-shell')?.__jetVideoDurationMs || 0);
        if (duration > 0) {
          window.JetNoteNative?.beginVideoSeek?.(item.dataset.mediaId, 0);
          window.JetNoteNative?.endVideoSeek?.(item.dataset.mediaId, 0);
          const shell = item.closest('.video-attachment-shell');
          renderSeekPreview(shell, 0);
          if (!shell?.__jetVideoPlaying) setTimeout(() => startNativeVideo(item), 0);
        } else {
          startNativeVideo(item);
        }
      }) : null;

      const shell = item.closest('.video-attachment-shell');
      const inlineTime = shell?.querySelector('.video-inline-time');
      const isPostViewerVideo = !!item.closest('#noteViewerScreen');
      if (inlineTime && inlineTime.dataset.videoViewerBound !== 'true') {
        inlineTime.dataset.videoViewerBound = 'true';
        if (isPostViewerVideo) {
          inlineTime.setAttribute('role', 'button');
          inlineTime.setAttribute('tabindex', '0');
          const openViewer = event => {
            event.preventDefault();
            event.stopPropagation();
            openPublishedVideoViewerFromItem(item, shell?.__jetVideoCurrentMs || 0);
          };
          // Only Post view owns the Video Viewer entry. Home/feed time text is
          // deliberately inert; progress dragging/tapping remains seek-only.
          inlineTime.addEventListener('pointerdown', event => {
            event.stopPropagation();
          }, true);
          inlineTime.addEventListener('click', openViewer, true);
          inlineTime.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') openViewer(event);
          });
        } else {
          inlineTime.removeAttribute('role');
          inlineTime.removeAttribute('tabindex');
          inlineTime.addEventListener('pointerdown', event => event.stopPropagation(), true);
          inlineTime.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
          }, true);
        }
      }
      // Legacy detached time buttons, if any, follow the same rule: only a
      // button rendered inside Post view may launch the Video Viewer.
      document.querySelectorAll(`[data-video-time-button-for="${CSS.escape(String(item.dataset.mediaId || ''))}"]`)
        .forEach(button => {
          if (button.dataset.videoPlaybackBound === 'true') return;
          button.dataset.videoPlaybackBound = 'true';
          button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            if (button.closest('#noteViewerScreen')) {
              openPublishedVideoViewerFromItem(item, shell?.__jetVideoCurrentMs || 0);
            }
          });
        });
    } catch (error) {
      item.innerHTML = `<div class="video-unavailable">${escapeHTML(t('videoCannotPlay'))}</div>`;
    }
  }));
}
