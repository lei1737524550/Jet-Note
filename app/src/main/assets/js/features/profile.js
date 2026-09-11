const PROFILE_NAME_KEY = 'qzone_profile_name';
const PROFILE_AVATAR_KEY = 'qzone_profile_avatar';

const DEFAULT_PROFILE_NAME = 'jnoter';
const DEFAULT_PROFILE_AVATAR = 'images/default-avatar.png';

function getProfileSnapshot() {
  const savedAvatar = AppStorage.getItem(PROFILE_AVATAR_KEY);
  const name = (AppStorage.getItem(PROFILE_NAME_KEY) || document.getElementById('mainName')?.textContent || DEFAULT_PROFILE_NAME).trim() || DEFAULT_PROFILE_NAME;
  return {
    name,
    avatar: savedAvatar || null
  };
}

function applyProfileSnapshot(profile) {
  if (!profile || typeof profile !== 'object') return;

  const name = typeof profile.name === 'string' && profile.name.trim()
    ? profile.name.trim()
    : DEFAULT_PROFILE_NAME;
  const avatar = typeof profile.avatar === 'string' && profile.avatar.startsWith('data:image/')
    ? profile.avatar
    : null;

  AppStorage.setItem(PROFILE_NAME_KEY, name);
  applyName(name);

  if (avatar) {
    AppStorage.setItem(PROFILE_AVATAR_KEY, avatar);
  } else {
    AppStorage.removeItem(PROFILE_AVATAR_KEY);
  }

  const source = avatar || DEFAULT_PROFILE_AVATAR;
  const mainAvatar = document.getElementById('mainAvatar');
  if (mainAvatar) mainAvatar.src = source;
  document.querySelectorAll('.sync-avatar').forEach(img => {
    img.src = source;
  });
}


function applyName(name) {
  document.getElementById('mainName').textContent = name;
  document.querySelectorAll('.sync-name').forEach(el => el.textContent = name);
  if (typeof renderPosts === 'function') renderPosts();
}

function changeName() {
  if (!isWorkspaceWritable()) return;
  const el = document.getElementById('mainName');

  if (el.isContentEditable) return;

  const original = el.textContent.trim();

  el.contentEditable = 'true';
  el.classList.add('editing');
  el.focus();

  // 点击名字后直接在原位置编辑，并把光标放到文字末尾。
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);

  function finishNameEdit(save = true) {
    if (!el.isContentEditable) return;

    let next = el.textContent.trim();

    if (!save || !next) {
      next = original;
    }

    el.contentEditable = 'false';
    el.classList.remove('editing');
    el.onkeydown = null;
    el.onblur = null;

    try {
      AppStorage.setItem(PROFILE_NAME_KEY, next);
      applyName(next);
    } catch (error) {
      applyName(original);
      alert(t('storageFull'));
    }
  }

  el.onkeydown = function(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      el.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      finishNameEdit(false);
    }
  };

  el.onblur = function() {
    finishNameEdit(true);
  };
}

/* =========================================================
   QQ 风格头像裁剪
   ========================================================= */
