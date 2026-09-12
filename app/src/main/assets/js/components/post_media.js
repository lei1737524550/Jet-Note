const MAX_MEDIA_IMAGES = 9;

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
             ${zoomable ? `onclick="openImageViewer(this.src)"` : ''}>
      `).join('')}
    </div>
  `;
}



/* =========================================================
   全屏图片查看
   ========================================================= */
