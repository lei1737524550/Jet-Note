function openImageViewer(src) {
  const viewer = document.getElementById('imageViewer');

  if (viewer.parentElement !== document.body) {
    document.body.appendChild(viewer);
  }

  document.getElementById('imageViewerImg').src = src;
  viewer.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeImageViewer(event) {
  if (event) {
    event.stopPropagation();

    // 点击图片本身时不关闭；点击黑色背景或 × 时关闭。
    if (event.target && event.target.id === 'imageViewerImg') {
      return;
    }
  }

  const viewer = document.getElementById('imageViewer');
  viewer.classList.remove('open');
  document.getElementById('imageViewerImg').src = '';

  const anyOverlay =
    document.getElementById('postComposeScreen')?.classList.contains('open') ||
    document.getElementById('settingsScreen')?.classList.contains('open');

  if (!anyOverlay) {
    document.body.style.overflow = '';
  }
}


/* =========================================================
   图片查看功能
   ========================================================= */
