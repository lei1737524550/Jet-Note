(async function loadProfile() {
  try { await initializeEntries(); } catch(error) { document.body.innerHTML='<p>数据初始化失败，旧数据未删除。请关闭应用后重试。</p>'; console.error(error); return; }
  const savedName = AppStorage.getItem(PROFILE_NAME_KEY);
  const savedAvatar = AppStorage.getItem(PROFILE_AVATAR_KEY);

  if (savedName) applyName(savedName);

  if (savedAvatar) {
    document.getElementById('mainAvatar').src = savedAvatar;
    document.querySelectorAll('.sync-avatar').forEach(img => img.src = savedAvatar);
  }

  renderPosts();
  applyLanguage();

})();
