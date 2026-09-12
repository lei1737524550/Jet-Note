const IMAGE_VIEWER_MAX_ZOOM = 4;
let imageViewerZoom = 1;
let imageViewerOffsetX = 0;
let imageViewerOffsetY = 0;
let imageViewerDragPoint = null;
let imageViewerPinchDistance = 0;
let imageViewerPinchZoom = 1;
const imageViewerPointers = new Map();

function resetImageViewerTransform() {
  imageViewerZoom = 1;
  imageViewerOffsetX = 0;
  imageViewerOffsetY = 0;
  imageViewerDragPoint = null;
  imageViewerPinchDistance = 0;
  imageViewerPointers.clear();
  applyImageViewerTransform();
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

function applyImageViewerTransform() {
  const media = activeViewerMedia();
  if (!media) return;
  clampImageViewerOffsets();
  media.style.transform = `translate3d(${imageViewerOffsetX}px, ${imageViewerOffsetY}px, 0) scale(${imageViewerZoom})`;
  media.classList.toggle('zoomed', imageViewerZoom > 1.01);
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

    // 点击图片本身时不关闭；点击黑色背景或 × 时关闭。
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
    if (event.target.closest('video') && event.pointerType === 'mouse') return;
    imageViewerPointers.set(event.pointerId, {x: event.clientX, y: event.clientY});
    viewer.setPointerCapture?.(event.pointerId);
    if (imageViewerPointers.size === 1) {
      imageViewerDragPoint = {x: event.clientX, y: event.clientY};
    } else if (imageViewerPointers.size === 2) {
      imageViewerDragPoint = null;
      imageViewerPinchDistance = imageViewerPointerDistance();
      imageViewerPinchZoom = imageViewerZoom;
    }
  });

  viewer.addEventListener('pointermove', event => {
    if (!imageViewerPointers.has(event.pointerId)) return;
    event.preventDefault();
    imageViewerPointers.set(event.pointerId, {x: event.clientX, y: event.clientY});
    if (imageViewerPointers.size >= 2) {
      event.preventDefault();
      const distance = imageViewerPointerDistance();
      if (imageViewerPinchDistance > 0) {
        imageViewerZoom = Math.max(1, Math.min(IMAGE_VIEWER_MAX_ZOOM, imageViewerPinchZoom * distance / imageViewerPinchDistance));
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
    } else {
      imageViewerDragPoint = null;
      imageViewerPinchDistance = 0;
    }
  };
  viewer.addEventListener('pointerup', releasePointer);
  viewer.addEventListener('pointercancel', releasePointer);

  const toggleDoubleZoom = event => {
    event.preventDefault();
    imageViewerZoom = imageViewerZoom > 1 ? 1 : 2;
    if (imageViewerZoom === 1) { imageViewerOffsetX = 0; imageViewerOffsetY = 0; }
    applyImageViewerTransform();
  };
  image.addEventListener('dblclick', toggleDoubleZoom);
  video.addEventListener('dblclick', toggleDoubleZoom);

  viewer.addEventListener('wheel', event => {
    if (!viewer.classList.contains('open')) return;
    event.preventDefault();
    imageViewerZoom = Math.max(1, Math.min(IMAGE_VIEWER_MAX_ZOOM, imageViewerZoom * (event.deltaY < 0 ? 1.12 : .89)));
    if (imageViewerZoom === 1) { imageViewerOffsetX = 0; imageViewerOffsetY = 0; }
    applyImageViewerTransform();
  }, {passive: false});
})();


/* =========================================================
   图片查看功能
   ========================================================= */
