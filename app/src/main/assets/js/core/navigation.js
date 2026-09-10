function isStandardHomePage() {
  const openIds = [
    'settingsScreen',
    'postComposeScreen', 'imageViewer', 'cropScreen',
    'deleteConfirmBackdrop', 'postActionPanel'
  ];

  const hasOpenLayer = openIds.some(id => {
    const el = document.getElementById(id);
    return el && el.classList.contains('open');
  });

  const name = document.getElementById('mainName');
  const editingName = !!(name && name.isContentEditable);
  const scrolled = Math.abs(window.scrollY || document.documentElement.scrollTop || 0) > 2;

  return !hasOpenLayer && !editingName && !scrolled;
}

function returnToStandardHome() {
  if(window.JetNoteNotice?.isOpen()){JetNoteNotice.close();return true;}
  if(entriesBusy)return true;
  closeImportPreview();
  // 返回值供 Android 壳判断：true=网页已处理；false=本来就在标准主页。
  if (isStandardHomePage()) return false;

  // 先收起键盘/输入焦点。
  if (document.activeElement && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur();
  }

  // 关闭确认框和“···”操作面板。
  cancelDeleteConfirm();
  closePostActionPanel();

  // 关闭图片查看、头像裁剪、设置及编辑器。
  const viewer = document.getElementById('imageViewer');
  if (viewer) viewer.classList.remove('open');

  if (cropScreen && cropScreen.classList.contains('open')) closeCrop();

  const settings = document.getElementById('settingsScreen');
  if (settings && settings.classList.contains('open')) closeSettings();

  const postComposer = document.getElementById('postComposeScreen');
  if (postComposer && postComposer.classList.contains('open')) closePostComposer();

  // 结束用户名编辑态。
  const name = document.getElementById('mainName');
  if (name && name.isContentEditable && typeof finishNameEdit === 'function') {
    finishNameEdit(true);
  }

  document.body.style.overflow = '';
  window.scrollTo(0, 0);
  requestAnimationFrame(() => {
    window.scrollTo(0, 0);
    fit();
  });

  return true;
}

/* ---------- 读取本地个人资料 ---------- */
