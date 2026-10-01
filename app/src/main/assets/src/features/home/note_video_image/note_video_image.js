(function loadPublishedSingleMediaSpacing() {
  fetch('config.json', { cache: 'no-store' })
    .then(response => (
      response.ok
        ? response.json()
        : null
    ))
    .then(config => {
      const spacing =
        config?.published_single_media_spacing || {};

      const root =
        document.documentElement.style;

      const px = (value, fallback) => {
        const number = Number(value);

        return `${
          Math.max(
            0,
            Number.isFinite(number)
              ? number
              : fallback
          )
        }px`;
      };

      root.setProperty(
        '--published-single-media-spacing-top',
        px(spacing.top_px, 3)
      );

      root.setProperty(
        '--published-single-media-spacing-right',
        px(spacing.right_px, 3)
      );

      root.setProperty(
        '--published-single-media-spacing-bottom',
        px(spacing.bottom_px, 12)
      );

      root.setProperty(
        '--published-single-media-spacing-left',
        px(spacing.left_px, 3)
      );

      /*
       * Published Post media is deliberately capped to the same visual scale
       * as the New Post text region. This prevents portrait screenshots and
       * videos from taking over the whole feed.
       *
       * Keep this independent from editor layout so it can be tuned at runtime
       * through config.json / Debug Config.
       */
      const configuredMaxHeight =
        Number(config?.published_post_media_max_height_px);

      const maxHeight =
        Number.isFinite(configuredMaxHeight)
          ? Math.min(
              2000,
              Math.max(80, configuredMaxHeight)
            )
          : 234;

      root.setProperty(
        '--published-post-media-max-height',
        `${maxHeight}px`
      );

      const yieldConfig =
        config?.post_media_right_edge_gesture_yield_percent || {};

      const clampPercent = value => {
        const number = Number(value);

        return Math.max(
          0,
          Math.min(
            40,
            Number.isFinite(number)
              ? number
              : 7
          )
        );
      };

      window.JetNotePostMediaGestureConfig =
        Object.freeze({
          image: clampPercent(
            yieldConfig.image
          ),

          videoSurface: clampPercent(
            yieldConfig.video_surface
          ),

          videoSeek: clampPercent(
            yieldConfig.video_seek
          )
        });

      try {
        window.JetNoteNative
          ?.setVideoSurfaceRightEdgeGestureYieldPercent?.(
            window.JetNotePostMediaGestureConfig.videoSurface
          );
      } catch (_) {}
    })
    .catch(() => {});
})();


function compressImageFile(
  file,
  maxSide = 1280,
  quality = 0.82
) {
  return new Promise((resolve, reject) => {
    const isSvg =
      !!file &&
      (
        file.type === 'image/svg+xml' ||
        /\.svg$/i.test(file.name || '')
      );

    if (
      !file ||
      (
        !isSvg &&
        (
          !file.type ||
          !file.type.startsWith('image/')
        )
      )
    ) {
      reject(new Error('not-image'));
      return;
    }

    const reader = new FileReader();

    /*
     * SVG is already compact/vector.
     * Keep the original bytes instead of drawing it to canvas,
     * which would turn it into a raster JPEG and lose vector quality.
     */
    if (isSvg) {
      reader.onerror = () => {
        reject(new Error('read-failed'));
      };

      reader.onload = () => {
        resolve(reader.result);
      };

      reader.readAsDataURL(file);
      return;
    }

    reader.onerror = () => {
      reject(new Error('read-failed'));
    };

    reader.onload = () => {
      const img = new Image();

      img.onerror = () => {
        reject(new Error('decode-failed'));
      };

      img.onload = () => {
        let width =
          img.naturalWidth || img.width;

        let height =
          img.naturalHeight || img.height;

        const scale = Math.min(
          1,
          maxSide / Math.max(width, height)
        );

        width = Math.max(
          1,
          Math.round(width * scale)
        );

        height = Math.max(
          1,
          Math.round(height * scale)
        );

        const canvas =
          document.createElement('canvas');

        canvas.width = width;
        canvas.height = height;

        const context =
          canvas.getContext('2d');

        if (!context) {
          reject(new Error('canvas-unavailable'));
          return;
        }

        context.drawImage(
          img,
          0,
          0,
          width,
          height
        );

        // JPEG dramatically reduces localStorage usage for screenshots/photos.
        resolve(
          canvas.toDataURL(
            'image/jpeg',
            quality
          )
        );
      };

      img.src = reader.result;
    };

    reader.readAsDataURL(file);
  });
}


async function filesToCompressedImages(
  fileList,
  remainingSlots
) {
  const files = Array
    .from(fileList || [])
    .slice(
      0,
      Math.max(0, remainingSlots)
    );

  const results = [];

  for (const file of files) {
    try {
      const image =
        await compressImageFile(file);

      results.push(image);
    } catch (_) {
      alert(t('imageReadFailed'));
    }
  }

  return results;
}


function mediaGridClass(images) {
  const count =
    (images || []).length;

  if (count <= 1) {
    return 'one';
  }

  if (count === 2) {
    return 'two';
  }

  return 'many';
}


function renderMediaHTML(
  images,
  className,
  zoomable = false
) {
  const safe =
    Array.isArray(images)
      ? images
      : [];

  if (!safe.length) {
    return '';
  }

  const content = safe
    .map(src => `
      <img
        src="${src}"
        alt=""
        ${
          zoomable
            ? 'class="published-inline-zoom-media" data-published-inline-zoom="image"'
            : ''
        }
      >
    `)
    .join('');

  return `
    <div class="${className} ${mediaGridClass(safe)}">
      ${content}
    </div>
  `;
}


/*
 * Published visual media layout
 * -----------------------------
 * - one video and no photos:
 *   keep Jet Note's original full-width video player;
 *
 * - one photo and no videos:
 *   full-width edge-to-edge photo;
 *
 * - multiple photos only:
 *   1xN strip, three items visible;
 *
 * - multiple videos, or any video+photo coexistence:
 *   one shared 1xN strip.
 *
 * Video cards still use the existing native player/progress implementation.
 */
function renderPublishedVisualMediaHTML(
  images,
  attachments
) {
  const photos =
    Array.isArray(images)
      ? images
      : [];

  const safeAttachments =
    Array.isArray(attachments)
      ? attachments
      : [];

  const visual = [];
  const representedPhotos = new Set();

  /*
   * V6.0:
   * Attachment sequence is authoritative.
   * Images and videos are never regrouped by media type
   * after the user has chosen them.
   */
  for (const item of safeAttachments) {
    if (item?.type === 'video') {
      visual.push({
        type: 'video',
        item
      });

      continue;
    }

    if (item?.type === 'image') {
      const src =
        NativeMedia.url(item);

      representedPhotos.add(src);

      visual.push({
        type: 'image',
        src
      });
    }
  }

  /*
   * Preserve old posts whose image bytes predate
   * ordered image attachments.
   */
  for (const src of photos) {
    if (representedPhotos.has(src)) {
      continue;
    }

    visual.push({
      type: 'image',
      src
    });
  }

  if (!visual.length) {
    return '';
  }

  if (
    visual.length === 1 &&
    visual[0].type === 'video'
  ) {
    return renderVideoAttachmentsHTML([
      visual[0].item
    ]);
  }

  if (
    visual.length === 1 &&
    visual[0].type === 'image'
  ) {
    return renderMediaHTML(
      [visual[0].src],
      'post-media-grid post-published-single-photo',
      true
    );
  }

  const cards = visual
    .map(entry => {
      if (entry.type === 'video') {
        return renderVideoAttachmentCardHTML(
          entry.item
        );
      }

      return `
        <div class="post-published-media-photo-frame">
          <img
            class="post-published-media-photo published-inline-zoom-media"
            data-published-inline-zoom="image"
            src="${entry.src}"
            alt=""
          >
        </div>
      `;
    })
    .join('');

  return `
    <div class="post-published-media-strip" data-media-count="${visual.length}" style="--media-columns:${Math.min(3, visual.length)}">
      ${cards}
    </div>
  `;
}


/*
 * Direct-in-Post image gestures.
 *
 * Single-finger scrolling remains owned by the page.
 * Only an actual two-finger gesture is intercepted.
 *
 * The transform origin is the fingers' midpoint,
 * so the area under the user's fingers is the area
 * that grows instead of always magnifying from the image center.
 */
function bindPublishedInlineImageZoom(container) {
  if (!container) {
    return;
  }

  const images =
    container.querySelectorAll(
      '.published-inline-zoom-media'
    );

  images.forEach(image => {
    if (
      image.dataset.publishedInlineZoomBound === 'true'
    ) {
      return;
    }

    image.dataset.publishedInlineZoomBound = 'true';

    let initialDistance = 0;
    let initialScale = 1;

    let gestureScale =
      Number(
        image.dataset.inlineZoomScale || 1
      );

    let pinchOccurred = false;
    let suppressClickUntil = 0;

    const distance = touches => {
      return Math.hypot(
        touches[0].clientX -
          touches[1].clientX,

        touches[0].clientY -
          touches[1].clientY
      );
    };

    const midpoint = touches => ({
      x:
        (
          touches[0].clientX +
          touches[1].clientX
        ) / 2,

      y:
        (
          touches[0].clientY +
          touches[1].clientY
        ) / 2
    });

    image.addEventListener(
      'touchstart',
      event => {
        if (event.touches.length !== 2) {
          return;
        }

        const rect =
          image.getBoundingClientRect();

        const center =
          midpoint(event.touches);

        initialDistance = Math.max(
          1,
          distance(event.touches)
        );

        initialScale = gestureScale;
        pinchOccurred = true;

        const originX = Math.max(
          0,
          Math.min(
            100,
            (
              (
                center.x -
                rect.left
              ) /
              Math.max(1, rect.width)
            ) * 100
          )
        );

        const originY = Math.max(
          0,
          Math.min(
            100,
            (
              (
                center.y -
                rect.top
              ) /
              Math.max(1, rect.height)
            ) * 100
          )
        );

        image.style.transformOrigin =
          `${originX}% ${originY}%`;

        image.classList.add(
          'inline-pinching'
        );

        event.preventDefault();
      },
      {
        passive: false
      }
    );

    image.addEventListener(
      'touchmove',
      event => {
        if (
          event.touches.length !== 2 ||
          initialDistance <= 0
        ) {
          return;
        }

        const scale =
          initialScale *
          distance(event.touches) /
          initialDistance;

        const next = Math.max(
          1,
          Math.min(4, scale)
        );

        gestureScale = next;

        image.dataset.inlineZoomScale =
          String(next);

        image.style.transform =
          `scale(${next})`;

        image.classList.toggle(
          'inline-zoomed',
          next > 1.01
        );

        event.preventDefault();
      },
      {
        passive: false
      }
    );

    const finishPinch = event => {
      if (!pinchOccurred) {
        return;
      }

      if (
        event.touches &&
        event.touches.length >= 2
      ) {
        return;
      }

      initialDistance = 0;
      initialScale = gestureScale;
      pinchOccurred = false;

      suppressClickUntil =
        performance.now() + 350;

      image.classList.remove(
        'inline-pinching'
      );

      if (gestureScale > 1.01) {
        return;
      }

      gestureScale = 1;

      image.dataset.inlineZoomScale = '1';
      image.style.transform = '';
      image.style.transformOrigin = '';

      image.classList.remove(
        'inline-zoomed'
      );
    };

    image.addEventListener(
      'touchend',
      finishPinch,
      {
        passive: true
      }
    );

    image.addEventListener(
      'touchcancel',
      finishPinch,
      {
        passive: true
      }
    );

    image.addEventListener(
      'click',
      event => {
        const rect =
          image.getBoundingClientRect();

        const yieldPercent =
          window
            .JetNotePostMediaGestureConfig
            ?.image ?? 7;

        const yieldWidth =
          rect.width *
          yieldPercent /
          100;

        if (
          rect.width > 0 &&
          event.clientX >=
            rect.right - yieldWidth
        ) {
          return;
        }

        if (
          performance.now() <
          suppressClickUntil
        ) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        // Full image viewing is intentionally available only from the explicit
        // Post viewer. Home/feed media is display-only so the recommended path
        // remains Home -> View Post -> media viewer.
        if (image.closest('#noteViewerScreen')) {
          openImageViewer(image.src);
        } else {
          event.preventDefault();
          event.stopPropagation();
        }
      }
    );
  });
}


/* =========================================================
   Full-screen image viewer
   ========================================================= */
// One/two: shrink to fit. Three or more: crop, without enlarging pixels.
function mediaObjectFit(width, height, boxWidth, boxHeight, count) {
  if (count < 3) return 'scale-down';
  return width < boxWidth || height < boxHeight ? 'none' : 'cover';
}
(function bindMediaFitRule() {
  const selector = '.post-compose-visual-media .compose-image-item img, ' +
    '.post-compose-visual-media .video-poster, .published-post-surface .video-poster, ' +
    '.note-viewer-visual .video-poster, .post-published-media-photo, ' +
    '.post-published-single-photo > img';
  const observed = new Set();
  function fit(img) {
    if (!img.naturalWidth || !img.naturalHeight) return;
    const group = img.closest('.post-compose-visual-media, .post-published-media-strip');
    const count = Number(group?.dataset.mediaCount || 1);
    const mode = mediaObjectFit(img.naturalWidth, img.naturalHeight,
      img.clientWidth, img.clientHeight, count);
    img.style.setProperty('--media-object-fit', mode);
  }
  const resize = new ResizeObserver(entries => entries.forEach(entry => fit(entry.target)));
  function scan() {
    for (const img of observed) {
      if (!img.isConnected) { resize.unobserve(img); observed.delete(img); }
    }
    document.querySelectorAll(selector).forEach(img => {
      if (!observed.has(img)) { observed.add(img); resize.observe(img); }
      fit(img);
    });
  }
  document.addEventListener('load', event => {
    if (event.target instanceof HTMLImageElement && event.target.matches(selector)) fit(event.target);
  }, true);
  document.addEventListener('DOMContentLoaded', scan);
  new MutationObserver(scan).observe(document.documentElement,
    {childList:true, subtree:true, attributes:true, attributeFilter:['data-media-count']});
})();
