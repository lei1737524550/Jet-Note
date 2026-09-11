(async function loadProfile() {
  const demoSession = isDemoSession();

  if (!demoSession && typeof startShortStartupLoading === 'function') {
    startShortStartupLoading();
  }

  try {
    if (demoSession) {
      // A demo is always a fresh read-only session, never a second notebook.
      await clearDemoSessionStorage();
      if (typeof resetDemoSessionLanguage === 'function') resetDemoSessionLanguage();
    } else {
      // A package update can force User mode while an older build left demo
      // IndexedDB behind. This removes demo-only storage; user data is untouched.
      await clearDemoSessionStorage();
      window.JetNoteNative?.releaseDemoSession?.();
    }
    await initializeEntries();

    if (demoSession) {
      await startBundledDemoStartupImport();
    }
  } catch (error) {
    const message = error?.message || String(error);
    hideStartupLoading?.();
    document.body.innerHTML = `
      <main style="padding:24px;font-family:sans-serif;line-height:1.6;background:#fff;min-height:100vh">
        <section style="max-width:560px;margin:48px auto;padding:20px;border:1px solid #c8cdd2;border-radius:16px;background:#fff">
          <strong style="color:#b3261e">数据初始化失败</strong>
          <div style="margin-top:10px;overflow-wrap:anywhere">${message}</div>
          <div style="margin-top:10px;color:#7a7f84;font-size:13px">旧数据未删除，请关闭应用后重试。</div>
        </section>
      </main>`;
    console.error(error);
    return;
  }

  const savedName = AppStorage.getItem(PROFILE_NAME_KEY);
  const savedAvatar = AppStorage.getItem(PROFILE_AVATAR_KEY);

  applyName(savedName || 'jnoter');

  if (savedAvatar) {
    document.getElementById('mainAvatar').src = savedAvatar;
    document.querySelectorAll('.sync-avatar').forEach(img => img.src = savedAvatar);
  }

  renderPosts();
  applyLanguage();
  if (typeof refreshWorkspacePermissions === 'function') refreshWorkspacePermissions();
  if (typeof refreshModeSettingsVisibility === 'function') refreshModeSettingsVisibility();
  if (typeof refreshModeSettings === 'function') refreshModeSettings();

  if (!demoSession) await finishShortStartupLoading?.();
})();
