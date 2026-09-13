const imageViewerScaleConfiguration = {
  imageViewerMaxScale: -1,
  videoViewerMaxScale: -1
};

function applyImageViewerScaleConfiguration(config) {
  const scale = config?.viewer_media_scale || {};
  const imageMax = Number(scale.image_viewer_max_scale);
  const videoMax = Number(scale.video_viewer_max_scale);
  if (Number.isFinite(imageMax)) imageViewerScaleConfiguration.imageViewerMaxScale = imageMax;
  if (Number.isFinite(videoMax)) imageViewerScaleConfiguration.videoViewerMaxScale = videoMax;
}

try {
  const runtimeConfigJson = window.JetNoteNative?.getRuntimeConfigJson?.();
  if (runtimeConfigJson) applyImageViewerScaleConfiguration(JSON.parse(runtimeConfigJson));
} catch (_) {}

fetch('config.json', {cache: 'no-store'})
  .then(response => response.ok ? response.json() : null)
  .then(applyImageViewerScaleConfiguration)
  .catch(() => {});

function activeImageViewerConfiguredMaxScale() {
  const video = document.getElementById('imageViewerVideo');
  const raw = video?.classList.contains('active')
    ? imageViewerScaleConfiguration.videoViewerMaxScale
    : imageViewerScaleConfiguration.imageViewerMaxScale;
  if (raw === 0) return 0;
  if (raw < 0) return Infinity;
  return Math.max(1, raw);
}

function constrainImageViewerZoom(nextZoom) {
  const maxScale = activeImageViewerConfiguredMaxScale();
  if (maxScale === 0) return 1;
  const finiteNext = Number.isFinite(nextZoom) ? nextZoom : Number.MAX_VALUE;
  return Math.max(1, Math.min(maxScale, finiteNext));
}
let imageViewerZoom = 1;
let imageViewerOffsetX = 0;
let imageViewerOffsetY = 0;
let imageViewerDragPoint = null;
let imageViewerPinchDistance = 0;
let imageViewerPinchZoom = 1;
let imageViewerPinchCenter = null;
let imageViewerPinchOffsetX = 0;
let imageViewerPinchOffsetY = 0;
let imageViewerTransformFrame = 0;
const imageViewerPointers = new Map();

function resetImageViewerTransform() {
  if (imageViewerTransformFrame) {
    cancelAnimationFrame(imageViewerTransformFrame);
    imageViewerTransformFrame = 0;
  }
  document.getElementById('imageViewerImg')?.classList.remove('is-gesturing');
  document.getElementById('imageViewerVideo')?.classList.remove('is-gesturing');
  imageViewerZoom = 1;
  imageViewerOffsetX = 0;
  imageViewerOffsetY = 0;
  imageViewerDragPoint = null;
  imageViewerPinchDistance = 0;
  imageViewerPinchCenter = null;
  imageViewerPointers.clear();
  applyImageViewerTransform(true);
}

function clampImageViewerOffsets() {
  const media = activeViewerMedia();
  if (!media) return;
  const maxX = Math.max(0, (media.offsetWidth * imageViewerZoom - window.innerWidth) / 2);
  const maxY = Math.max(0, (media.offsetHeight * imageViewerZoom - window.innerHeight) / 2);
  imageViewerOffsetX = Math.max(-maxX, Math.min(maxX, imageViewerOffsetX));
  imageViewerOffsetY = Math.max(-maxY, Math.min(maxY, imageViewerOffsetY));
}

function activeViewerMedia() {
  const video = document.getElementById('imageViewerVideo');
  if (video && video.classList.contains('active')) return video;
  return document.getElementById('imageViewerImg');
}

function applyImageViewerTransform(immediate = false) {
  if (!immediate) {
    if (imageViewerTransformFrame) return;
    imageViewerTransformFrame = requestAnimationFrame(() => {
      imageViewerTransformFrame = 0;
      applyImageViewerTransform(true);
    });
    return;
  }
  const media = activeViewerMedia();
  if (!media) return;
  clampImageViewerOffsets();
  media.style.transform = `translate3d(${imageViewerOffsetX}px, ${imageViewerOffsetY}px, 0) scale(${imageViewerZoom})`;
  media.classList.toggle('zoomed', imageViewerZoom > 1.01);
}

function imageViewerPointerCenter() {
  const points = Array.from(imageViewerPointers.values());
  if (points.length < 2) return null;
  return {
    x: (points[0].x + points[1].x) / 2,
    y: (points[0].y + points[1].y) / 2
  };
}

function imageViewerPointerDistance() {
  const points = Array.from(imageViewerPointers.values());
  if (points.length < 2) return 0;
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

function openImageViewer(src) {
  const viewer = document.getElementById('imageViewer');
  const image = document.getElementById('imageViewerImg');

  if (viewer.parentElement !== document.body) {
    document.body.appendChild(viewer);
  }

  const video = document.getElementById('imageViewerVideo');
  video.pause();
  video.removeAttribute('src');
  video.classList.remove('active');
  image.classList.add('active');
  image.src = src;
  viewer.classList.add('open');
  resetImageViewerTransform();
  document.body.style.overflow = 'hidden';
}

function openVideoViewer(src, startTime = 0) {
  const viewer = document.getElementById('imageViewer');
  const image = document.getElementById('imageViewerImg');
  const video = document.getElementById('imageViewerVideo');
  if (!viewer || !video || !src) return;

  if (viewer.parentElement !== document.body) {
    document.body.appendChild(viewer);
  }

  image.src = '';
  image.classList.remove('active');
  video.classList.add('active');
  video.src = src;
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.load();
  const desiredTime = Number.isFinite(startTime) ? startTime : 0;
  if (desiredTime > 0) {
    video.addEventListener('loadedmetadata', () => {
      try { video.currentTime = Math.min(desiredTime, Number.isFinite(video.duration) ? video.duration : desiredTime); } catch (_) {}
    }, {once: true});
  }
  viewer.classList.add('open');
  resetImageViewerTransform();
  document.body.style.overflow = 'hidden';
}

function closeImageViewer(event) {
  if (event) {
    event.stopPropagation();

    // Clicking the media itself does not close the viewer; clicking the backdrop or close button does.
    if (event.target && (event.target.id === 'imageViewerImg' || event.target.id === 'imageViewerVideo')) {
      return;
    }
  }

  const viewer = document.getElementById('imageViewer');
  viewer.classList.remove('open');
  resetImageViewerTransform();
  const image = document.getElementById('imageViewerImg');
  const video = document.getElementById('imageViewerVideo');
  image.src = '';
  image.classList.remove('active');
  video.pause();
  video.removeAttribute('src');
  video.load();
  video.classList.remove('active');

  const anyOverlay =
    document.getElementById('postComposeScreen')?.classList.contains('open') ||
    document.getElementById('settingsScreen')?.classList.contains('open');

  if (!anyOverlay) {
    document.body.style.overflow = '';
  }
}

(() => {
  const viewer = document.getElementById('imageViewer');
  const image = document.getElementById('imageViewerImg');
  const video = document.getElementById('imageViewerVideo');
  if (!viewer || !image || !video) return;

  viewer.addEventListener('pointerdown', event => {
    if (!viewer.classList.contains('open') || event.target === viewer || event.target.closest('.image-viewer-close')) return;
    if (activeImageViewerConfiguredMaxScale() === 0) return;
    if (event.target.closest('video') && event.pointerType === 'mouse') return;
    imageViewerPointers.set(event.pointerId, {x: event.clientX, y: event.clientY});
    viewer.setPointerCapture?.(event.pointerId);
    activeViewerMedia()?.classList.add('is-gesturing');
    if (imageViewerPointers.size === 1) {
      imageViewerDragPoint = {x: event.clientX, y: event.clientY};
    } else if (imageViewerPointers.size === 2) {
      imageViewerDragPoint = null;
      imageViewerPinchDistance = imageViewerPointerDistance();
      imageViewerPinchZoom = imageViewerZoom;
      imageViewerPinchCenter = imageViewerPointerCenter();
      imageViewerPinchOffsetX = imageViewerOffsetX;
      imageViewerPinchOffsetY = imageViewerOffsetY;
    }
  });

  viewer.addEventListener('pointermove', event => {
    if (!imageViewerPointers.has(event.pointerId)) return;
    event.preventDefault();
    imageViewerPointers.set(event.pointerId, {x: event.clientX, y: event.clientY});
    if (imageViewerPointers.size >= 2) {
      event.preventDefault();
      const distance = imageViewerPointerDistance();
      const center = imageViewerPointerCenter();
      if (imageViewerPinchDistance > 0 && center && imageViewerPinchCenter) {
        const nextZoom = constrainImageViewerZoom(imageViewerPinchZoom * distance / imageViewerPinchDistance);
        const ratio = nextZoom / imageViewerPinchZoom;
        const viewportCenterX = window.innerWidth / 2;
        const viewportCenterY = window.innerHeight / 2;
        imageViewerOffsetX = center.x - viewportCenterX
          - ratio * (imageViewerPinchCenter.x - viewportCenterX - imageViewerPinchOffsetX);
        imageViewerOffsetY = center.y - viewportCenterY
          - ratio * (imageViewerPinchCenter.y - viewportCenterY - imageViewerPinchOffsetY);
        imageViewerZoom = nextZoom;
        if (imageViewerZoom <= 1.001) {
          imageViewerOffsetX = 0;
          imageViewerOffsetY = 0;
        }
        applyImageViewerTransform();
      }
      return;
    }
    if (imageViewerDragPoint && imageViewerZoom > 1) {
      event.preventDefault();
      imageViewerOffsetX += event.clientX - imageViewerDragPoint.x;
      imageViewerOffsetY += event.clientY - imageViewerDragPoint.y;
      imageViewerDragPoint = {x: event.clientX, y: event.clientY};
      applyImageViewerTransform();
    }
  });

  const releasePointer = event => {
    imageViewerPointers.delete(event.pointerId);
    if (imageViewerPointers.size === 1) {
      imageViewerDragPoint = Array.from(imageViewerPointers.values())[0];
      imageViewerPinchDistance = 0;
      imageViewerPinchCenter = null;
    } else {
      imageViewerDragPoint = null;
      imageViewerPinchDistance = 0;
      imageViewerPinchCenter = null;
      activeViewerMedia()?.classList.remove('is-gesturing');
      applyImageViewerTransform();
    }
  };
  viewer.addEventListener('pointerup', releasePointer);
  viewer.addEventListener('pointercancel', releasePointer);

  const toggleDoubleZoom = event => {
    event.preventDefault();
    imageViewerZoom = imageViewerZoom > 1 ? 1 : constrainImageViewerZoom(2);
    if (imageViewerZoom === 1) { imageViewerOffsetX = 0; imageViewerOffsetY = 0; }
    applyImageViewerTransform();
  };
  image.addEventListener('dblclick', toggleDoubleZoom);
  video.addEventListener('dblclick', toggleDoubleZoom);

  viewer.addEventListener('wheel', event => {
    if (!viewer.classList.contains('open')) return;
    event.preventDefault();
    imageViewerZoom = constrainImageViewerZoom(imageViewerZoom * (event.deltaY < 0 ? 1.12 : .89));
    if (imageViewerZoom === 1) { imageViewerOffsetX = 0; imageViewerOffsetY = 0; }
    applyImageViewerTransform();
  }, {passive: false});
})();


/* =========================================================
   Image viewer
   ========================================================= */
