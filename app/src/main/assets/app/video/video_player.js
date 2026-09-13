/* Jet Note inline video UI. Android owns decoding; WebView owns card/progress/time. */
let activeNativeVideoItem = null;
let nativeVideoRectFrame = 0;

const nativeVideoBlockingSelectors = [
  // All New/Edit/Debug editors share the post-compose-screen contract.
  // Keeping this class-based prevents a newly-added editor from accidentally
  // letting the native TextureView float above the WebView editor.
  '#settingsScreen.open',
  '#toolsScreen.open',
  '#imageViewer.open',
  '#importPreview.open'
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
  const blocked = nativeVideoBlockingSelectors.some(selector => document.querySelector(selector));
  const openEditor = document.querySelector('.post-compose-screen.open');
  const activeVideoBelongsToOpenEditor = !!(openEditor && activeNativeVideoItem && openEditor.contains(activeNativeVideoItem));
  // A full-screen editor suppresses feed videos, but its own temporary video is
  // allowed to use the same native TextureView/player implementation.
  const editorAllowsVideo = !openEditor || activeVideoBelongsToOpenEditor;
  const allowed = !blocked && editorAllowsVideo && !document.hidden;
  if (allowed !== nativeVideoOverlayAllowed) {
    nativeVideoOverlayAllowed = allowed;
    try { window.JetNoteNative?.setVideoOverlayAllowed?.(allowed); } catch (_) {}
  }
  if (allowed && activeNativeVideoItem?.isConnected) scheduleNativeVideoRect();
}

window.__jetSyncNativeVideoVisibility = syncNativeVideoOverlayVisibility;
window.JetNoteVideoOverlay = Object.freeze({
  suspend: suspendNativeVideoOverlay,
  sync: syncNativeVideoOverlayVisibility
});

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
      <button type="button" class="video-inline-time video-playback-time-button common_border">0:00/0:00</button>
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
}

function nativeVideoRect(item) {
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
  const item = activeNativeVideoItem;
  if (!item?.isConnected || !window.JetNoteNative?.updateVideoRect) return;
  const r = nativeVideoRect(item);
  window.JetNoteNative.updateVideoRect(item.dataset.mediaId, r.left, r.top, r.width, r.height, r.dpr);
}

function scheduleNativeVideoRect() {
  if (nativeVideoRectFrame) return;
  nativeVideoRectFrame = requestAnimationFrame(sendNativeVideoRect);
}

window.addEventListener('scroll', scheduleNativeVideoRect, true);
window.addEventListener('resize', scheduleNativeVideoRect);

function releaseVideoAttachmentUrls(container) {
  if (activeNativeVideoItem && container?.contains(activeNativeVideoItem)) {
    try { window.JetNoteNative?.stopVideo?.(activeNativeVideoItem.dataset.mediaId); } catch (_) {}
    activeNativeVideoItem = null;
  }
}

function startNativeVideo(item) {
  // Select the target first. This matters inside New/Edit Post: feed video is
  // blocked there, while a video that belongs to the open editor is allowed.
  activeNativeVideoItem = item;
  syncNativeVideoOverlayVisibility();
  if (!nativeVideoOverlayAllowed) {
    if (activeNativeVideoItem === item) activeNativeVideoItem = null;
    return;
  }
  const record = item?.__jetVideoRecord;
  if (!record?.path) return;
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
    alert(t('videoCannotPlay'));
  }
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

  let dragging = false;
  let pointerId = null;

  const begin = event => {
    const fraction = fractionFromPointer(track, event);
    dragging = true;
    pointerId = event.pointerId;
    track.classList.add('seeking');
    try { track.setPointerCapture(pointerId); } catch (_) {}

    // Seeking an unopened video is a valid launch gesture. Start the native
    // player first, then queue the requested fraction; NativeVideoPlayer applies
    // it as soon as duration becomes known and starts playback from that point.
    if (!shell.__jetVideoEverStarted || !shell.__jetVideoDurationMs) {
      startNativeVideo(item);
      window.JetNoteNative?.beginVideoSeek?.(item.dataset.mediaId, fraction);
    } else {
      window.JetNoteNative?.beginVideoSeek?.(item.dataset.mediaId, fraction);
    }
    renderSeekPreview(shell, fraction);
    event.preventDefault();
  };

  const move = event => {
    if (!dragging || event.pointerId !== pointerId) return;
    renderSeekPreview(shell, fractionFromPointer(track, event));
    event.preventDefault();
  };

  const end = event => {
    if (!dragging || event.pointerId !== pointerId) return;
    const fraction = fractionFromPointer(track, event);
    renderSeekPreview(shell, fraction);
    dragging = false;
    track.classList.remove('seeking');
    try { track.releasePointerCapture(pointerId); } catch (_) {}
    pointerId = null;
    window.JetNoteNative?.endVideoSeek?.(item.dataset.mediaId, fraction);
    event.preventDefault();
  };

  track.addEventListener('pointerdown', begin);
  track.addEventListener('pointermove', move);
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);
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
  const item = activeNativeVideoItem;
  if (!item?.isConnected || item.dataset.mediaId !== String(mediaId)) return;
  const shell = item.closest('.video-attachment-shell');
  if (!shell) return;

  shell.__jetVideoDurationMs = Math.max(0, Number(durationMs || 0));
  shell.__jetVideoCurrentMs = Math.max(0, Number(currentMs || 0));
  shell.__jetVideoPlaying = !!playing;
  shell.__jetVideoEverStarted = !!everStarted;

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
  if (activeNativeVideoItem?.dataset.mediaId === String(mediaId)) {
    activeNativeVideoItem = null;
  }
};

// Native long-press cold reset: the whole decoder/surface was destroyed.
// Reset only UI state here; the real first-frame poster is already underneath.
window.__jetNativeVideoReset = function(mediaId) {
  const id = String(mediaId);
  const item = activeNativeVideoItem?.dataset.mediaId === id ? activeNativeVideoItem : null;
  if (item) {
    resetNativeVideoCard(item);
    const poster = item.querySelector('.video-poster');
    if (poster) poster.hidden = false;
  }
  if (activeNativeVideoItem?.dataset.mediaId === id) activeNativeVideoItem = null;
};

window.__jetNativeVideoSurfaceTapped = function(mediaId, currentMs) {
  const item = activeNativeVideoItem;
  if (!item?.isConnected || item.dataset.mediaId !== String(mediaId)) return;
  if (item.closest('.post-compose-screen')) {
    startNativeVideo(item);
    return;
  }
  openPublishedVideoViewerFromItem(item, currentMs);
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
        poster.src = thumb;
        poster.hidden = false;
        poster.onerror = () => item.classList.add('poster-unavailable');
      }

      const isEditorVideo = !!item.closest('.post-compose-screen');
      item.onclick = event => {
        if (event.target.closest('.compose-image-remove')) return;
        if (isEditorVideo) {
          startNativeVideo(item);
        } else {
          openPublishedVideoViewerFromItem(item, item.closest('.video-attachment-shell')?.__jetVideoCurrentMs || 0);
        }
      };
      // Editor previews keep the existing double-click restart shortcut. Feed
      // videos use ordinary tap for the dedicated Video Viewer instead.
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
      shell?.querySelector('.video-playback-time-button')?.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        startNativeVideo(item);
      });
      document.querySelectorAll(`[data-video-time-button-for="${CSS.escape(String(item.dataset.mediaId || ''))}"]`)
        .forEach(button => {
          if (button.dataset.videoPlaybackBound === 'true') return;
          button.dataset.videoPlaybackBound = 'true';
          button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            startNativeVideo(item);
          });
        });
    } catch (error) {
      item.innerHTML = `<div class="video-unavailable">${escapeHTML(t('videoCannotPlay'))}</div>`;
    }
  }));
}
