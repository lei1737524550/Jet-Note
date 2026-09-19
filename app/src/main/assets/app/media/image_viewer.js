function activeImageViewerConfiguredMaxScale() {
  const mediaType = document.getElementById('imageViewerVideo')?.classList.contains('active') ? 'video' : 'image';
  return window.JetNoteImageViewerConfiguration?.maxScale?.(mediaType) ?? Infinity;
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
let activeImageViewerDownloadSource = '';
let imageViewerPreviousBodyOverflow = null;

function releaseAllImageViewerPointerCaptures() {
  const viewer = document.getElementById('imageViewer');
  if (!viewer) return;
  for (const pointerId of imageViewerPointers.keys()) {
    try {
      if (viewer.hasPointerCapture?.(pointerId)) viewer.releasePointerCapture(pointerId);
    } catch (_) {}
  }
}

function resetImageViewerTransform() {
  if (imageViewerTransformFrame) {
    cancelAnimationFrame(imageViewerTransformFrame);
    imageViewerTransformFrame = 0;
  }
  releaseAllImageViewerPointerCaptures();
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
  window.JetNoteImageViewerBackgroundControl?.apply?.();
  activeImageViewerDownloadSource = String(src || '');
  if (!viewer.classList.contains('open')) imageViewerPreviousBodyOverflow = document.body.style.overflow;
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
  window.JetNoteImageViewerBackgroundControl?.reset?.();
  video.classList.add('active');
  video.src = src;
  activeImageViewerDownloadSource = String(src || '');
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.load();
  const desiredTime = Number.isFinite(startTime) ? startTime : 0;
  if (desiredTime > 0) {
    video.addEventListener('loadedmetadata', () => {
      try { video.currentTime = Math.min(desiredTime, Number.isFinite(video.duration) ? video.duration : desiredTime); } catch (_) {}
    }, {once: true});
  }
  if (!viewer.classList.contains('open')) imageViewerPreviousBodyOverflow = document.body.style.overflow;
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
  window.JetNoteImageViewerBackgroundControl?.reset?.();
  video.pause();
  video.removeAttribute('src');
  video.load();
  video.classList.remove('active');
  activeImageViewerDownloadSource = '';

  document.body.style.overflow = imageViewerPreviousBodyOverflow ?? '';
  imageViewerPreviousBodyOverflow = null;
}

(() => {
  const viewer = document.getElementById('imageViewer');
  const image = document.getElementById('imageViewerImg');
  const video = document.getElementById('imageViewerVideo');
  if (!viewer || !image || !video) return;

  window.JetNoteImageViewerBackgroundControl?.install?.();
  window.JetNoteImageViewerCloseControl?.install?.({
    close: closeImageViewer,
    getDownloadSource: () => activeImageViewerDownloadSource || activeViewerMedia()?.currentSrc || activeViewerMedia()?.src || '',
    getMediaType: () => video.classList.contains('active') ? 'video' : 'image'
  });

  viewer.addEventListener('pointerdown', event => {
    if (!viewer.classList.contains('open') || event.target === viewer || event.target.closest('.image-viewer-close, .image-viewer-background-switch')) return;
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
    if (!imageViewerPointers.has(event.pointerId)) return;
    imageViewerPointers.delete(event.pointerId);
    try {
      if (viewer.hasPointerCapture?.(event.pointerId)) viewer.releasePointerCapture(event.pointerId);
    } catch (_) {}
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
  const forceReleaseViewerGestures = () => {
    if (!imageViewerPointers.size) return;
    releaseAllImageViewerPointerCaptures();
    imageViewerPointers.clear();
    imageViewerDragPoint = null;
    imageViewerPinchDistance = 0;
    imageViewerPinchCenter = null;
    activeViewerMedia()?.classList.remove('is-gesturing');
    applyImageViewerTransform();
  };
  viewer.addEventListener('pointerup', releasePointer);
  viewer.addEventListener('pointercancel', releasePointer);
  viewer.addEventListener('lostpointercapture', event => {
    if (imageViewerPointers.has(event.pointerId)) releasePointer(event);
  });
  window.addEventListener('pointerup', releasePointer, true);
  window.addEventListener('pointercancel', releasePointer, true);
  window.addEventListener('blur', forceReleaseViewerGestures);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) forceReleaseViewerGestures();
  });

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
