
(function loadPublishedSingleMediaSpacing(){
  fetch('config.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(config=>{
    const spacing=config?.published_single_media_spacing||{};
    const root=document.documentElement.style;
    const px=(value,fallback)=>`${Math.max(0,Number.isFinite(Number(value))?Number(value):fallback)}px`;
    root.setProperty('--published-single-media-spacing-top',px(spacing.top_px,3));
    root.setProperty('--published-single-media-spacing-right',px(spacing.right_px,3));
    root.setProperty('--published-single-media-spacing-bottom',px(spacing.bottom_px,3));
    root.setProperty('--published-single-media-spacing-left',px(spacing.left_px,3));

    // Published Post media is deliberately capped to the same visual scale as
    // the New Post text region. This prevents portrait screenshots and videos
    // from taking over the whole feed. Keep this independent from editor layout
    // so it can be tuned at runtime through config.json / Debug Config.
    const configuredMaxHeight=Number(config?.published_post_media_max_height_px);
    const maxHeight=Number.isFinite(configuredMaxHeight)
      ? Math.min(2000,Math.max(80,configuredMaxHeight))
      : 234;
    root.setProperty('--published-post-media-max-height',`${maxHeight}px`);

    const yieldConfig=config?.post_media_right_edge_gesture_yield_percent||{};
    const clampPercent=value=>Math.max(0,Math.min(40,Number.isFinite(Number(value))?Number(value):7));
    window.JetNotePostMediaGestureConfig=Object.freeze({
      image:clampPercent(yieldConfig.image),
      videoSurface:clampPercent(yieldConfig.video_surface),
      videoSeek:clampPercent(yieldConfig.video_seek)
    });
    try{window.JetNoteNative?.setVideoSurfaceRightEdgeGestureYieldPercent?.(window.JetNotePostMediaGestureConfig.videoSurface);}catch(_){}
  }).catch(()=>{});
})();
function compressImageFile(file, maxSide = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const isSvg = !!file && (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name || ''));
    if (!file || (!isSvg && (!file.type || !file.type.startsWith('image/')))) {
      reject(new Error('not-image'));
      return;
    }

    const reader = new FileReader();

    // SVG is already compact/vector. Keep the original bytes instead of drawing it
    // to canvas, which would turn it into a raster JPEG and lose vector quality.
    if (isSvg) {
      reader.onerror = () => reject(new Error('read-failed'));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
      return;
    }

    reader.onerror = () => reject(new Error('read-failed'));

    reader.onload = () => {
      const img = new Image();

      img.onerror = () => reject(new Error('decode-failed'));

      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        const scale = Math.min(1, maxSide / Math.max(width, height));
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const c = canvas.getContext('2d');
        c.drawImage(img, 0, 0, width, height);

        // JPEG dramatically reduces localStorage usage for screenshots/photos.
        resolve(canvas.toDataURL('image/jpeg', quality));
      };

      img.src = reader.result;
    };

    reader.readAsDataURL(file);
  });
}

async function filesToCompressedImages(fileList, remainingSlots) {
  const files = Array.from(fileList || []).slice(0, Math.max(0, remainingSlots));
  const results = [];

  for (const file of files) {
    try {
      results.push(await compressImageFile(file));
    } catch (e) {
      alert(t('imageReadFailed'));
    }
  }

  return results;
}

function mediaGridClass(images) {
  const count = (images || []).length;
  if (count <= 1) return 'one';
  if (count === 2) return 'two';
  return 'many';
}

function renderMediaHTML(images, className, zoomable = false) {
  const safe = Array.isArray(images) ? images : [];
  if (!safe.length) return '';

  return `
    <div class="${className} ${mediaGridClass(safe)}">
      ${safe.map(src => `
        <img src="${src}"
             alt=""
             ${zoomable ? 'class="published-inline-zoom-media" data-published-inline-zoom="image"' : ''}>
      `).join('')}
    </div>
  `;
}


/*
 * Published visual media layout
 * -----------------------------
 * - one video and no photos: keep Jet Note's original full-width video player;
 * - one photo and no videos: full-width edge-to-edge photo;
 * - multiple photos only: 1xN strip, three items visible;
 * - multiple videos, or any video+photo coexistence: one shared 1xN strip.
 * Video cards still use the existing native player/progress implementation.
 */
function renderPublishedVisualMediaHTML(images, attachments) {
  const photos = Array.isArray(images) ? images : [];
  const videos = (attachments || []).filter(item => item?.type === 'video');
  if (!photos.length && !videos.length) return '';

  if (videos.length === 1 && photos.length === 0) {
    return renderVideoAttachmentsHTML(videos);
  }

  // A single published photo mirrors the single-video presentation: it keeps
  // its natural aspect ratio and breaks through only the Post's horizontal
  // content padding. Multiple/mixed visual attachments continue to use 1xN.
  if (photos.length === 1 && videos.length === 0) {
    return renderMediaHTML(photos, 'post-media-grid post-published-single-photo', true);
  }

  const videoCards = videos.map(item => renderVideoAttachmentCardHTML(item)).join('');
  const photoCards = photos.map(src => `
    <div class="post-published-media-photo-frame">
      <img class="post-published-media-photo published-inline-zoom-media"
           data-published-inline-zoom="image"
           src="${src}"
           alt="">
    </div>`).join('');

  return `<div class="post-published-media-strip">${videoCards}${photoCards}</div>`;
}

/*
 * Direct-in-Post image gestures.
 * Single-finger scrolling remains owned by the page. Only an actual two-finger
 * gesture is intercepted. The transform origin is the fingers' midpoint, so
 * the area under the user's fingers is the area that grows instead of always
 * magnifying from the image center.
 */
function bindPublishedInlineImageZoom(container) {
  if (!container) return;
  container.querySelectorAll('.published-inline-zoom-media').forEach(image => {
    if (image.dataset.publishedInlineZoomBound === 'true') return;
    image.dataset.publishedInlineZoomBound = 'true';

    let initialDistance = 0;
    let initialScale = 1;
    let gestureScale = Number(image.dataset.inlineZoomScale || 1);
    let pinchOccurred = false;
    let suppressClickUntil = 0;

    const distance = touches => Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY
    );

    const midpoint = touches => ({
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    });

    image.addEventListener('touchstart', event => {
      if (event.touches.length !== 2) return;
      const rect = image.getBoundingClientRect();
      const center = midpoint(event.touches);
      initialDistance = Math.max(1, distance(event.touches));
      initialScale = gestureScale;
      pinchOccurred = true;
      const originX = Math.max(0, Math.min(100, ((center.x - rect.left) / Math.max(1, rect.width)) * 100));
      const originY = Math.max(0, Math.min(100, ((center.y - rect.top) / Math.max(1, rect.height)) * 100));
      image.style.transformOrigin = `${originX}% ${originY}%`;
      image.classList.add('inline-pinching');
      event.preventDefault();
    }, {passive:false});

    image.addEventListener('touchmove', event => {
      if (event.touches.length !== 2 || initialDistance <= 0) return;
      const next = Math.max(1, Math.min(4, initialScale * distance(event.touches) / initialDistance));
      gestureScale = next;
      image.dataset.inlineZoomScale = String(next);
      image.style.transform = `scale(${next})`;
      image.classList.toggle('inline-zoomed', next > 1.01);
      event.preventDefault();
    }, {passive:false});

    const finishPinch = event => {
      if (!pinchOccurred) return;
      if (event.touches && event.touches.length >= 2) return;
      initialDistance = 0;
      initialScale = gestureScale;
      pinchOccurred = false;
      suppressClickUntil = performance.now() + 350;
      image.classList.remove('inline-pinching');
      if (gestureScale <= 1.01) {
        gestureScale = 1;
        image.dataset.inlineZoomScale = '1';
        image.style.transform = '';
        image.style.transformOrigin = '';
        image.classList.remove('inline-zoomed');
      }
    };
    image.addEventListener('touchend', finishPinch, {passive:true});
    image.addEventListener('touchcancel', finishPinch, {passive:true});

    image.addEventListener('click', event => {
      const rect=image.getBoundingClientRect();
      const yieldPercent=window.JetNotePostMediaGestureConfig?.image ?? 7;
      if(rect.width>0 && event.clientX >= rect.right - rect.width*yieldPercent/100) return;
      if (performance.now() < suppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      openImageViewer(image.src);
    });
  });
}



/* =========================================================
   Full-screen image viewer
   ========================================================= */
