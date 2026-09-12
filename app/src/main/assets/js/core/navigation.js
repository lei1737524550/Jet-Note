
function returnToStandardHome() {
  if (window.JetNoteNotice?.isOpen()) {
    JetNoteNotice.close();
    return true;
  }
  if (entriesBusy) return true;

  const importPreview = document.getElementById('importPreview');
  if (importPreview?.classList.contains('open')) {
    closeImportPreview();
    return true;
  }

  const deleteConfirm = document.getElementById('deleteConfirmBackdrop');
  if (deleteConfirm?.classList.contains('open')) {
    cancelDeleteConfirm();
    return true;
  }

  const postAction = document.getElementById('postActionPanel');
  if (postAction?.classList.contains('open')) {
    closePostActionPanel();
    return true;
  }

  const viewer = document.getElementById('imageViewer');
  if (viewer?.classList.contains('open')) {
    viewer.classList.remove('open');
    return true;
  }


  const settings = document.getElementById('settingsScreen');
  if (settings?.classList.contains('open')) {
    closeSettings();
    return true;
  }

  const postComposer = document.getElementById('postComposeScreen');
  if (postComposer?.classList.contains('open')) {
    closePostComposer();
    return true;
  }

  const scrolled = Math.abs(window.scrollY || document.documentElement.scrollTop || 0) > 2;
  if (scrolled) {
    window.scrollTo(0, 0);
    requestAnimationFrame(() => fit());
    return true;
  }

  return false;
}

/* ---------- 读取本地个人资料 ---------- */
