const I18N = {
  zh: {
    savedArchive: '备份已保存',
    dictionary: "字典",
    sentences: "句子",
    audioPlay: "播放音频",
    audioPause: "暂停音频",
    notice: "提示",
    addAudio: "添加音乐",
    remove: "移除",
    attachmentPreserved: "已保留附件",
    audioCannotPlay: "此设备无法播放该音频，文件仍会完整备份。",
    audioOnly: "请选择音频文件（支持 MP3）",
    audioTooLarge: "单个音乐文件最多 64 MiB",
    attachmentLimit: "每条内容最多添加 20 个音乐附件",
    backupTitle: "数据备份",
    exportArchive: "导出 .jnote",
    importArchive: "导入 .jnote",
    importMode: "导入方式",
    merge: "合并（优先较新内容）",
    addOnly: "仅添加不存在的内容",
    replaceAll: "覆盖全部说说",
    replaceWarning: "覆盖模式会替换当前全部说说；合并模式保留较新的本地内容。",
    confirmImport: "确认导入",
    exporting: "正在生成备份…",
    chooseDestination: "请选择备份保存位置",
    exportDone: "备份已交给文件保存流程",
    transferFailed: "操作失败：",
    cancelled: "已取消",
    validating: "正在验证备份…",
    attachments: "附件",
    verified: "验证通过，请选择导入方式",
    importing: "正在导入…",
    importDone: "导入成功。",
    added: "新增",
    updated: "更新",
    kept: "保留",

    settings: '设置',
    modeSelection: '模式选择',
    usageMode: '使用模式',
    demoMode: '演示模式',
    language: '语言',
    avatarShape: '头像形状',
    roundAvatar: '圆形',
    squareAvatar: '正方形',
    backgroundSetting: '背景',
    imageBackground: '图片背景',
    imageBackgroundHint: '选择并裁剪图片',
    rgbBackground: 'RGB 背景',
    applyColor: '应用颜色',
    backgroundSaved: '背景设置已保存',
    invalidRgb: 'RGB 数值必须在 0–255 之间',
    posts: '说说',
    share: '分享新鲜事...',
    writePost: '写说说',
    editPost: '编辑说说',
    publish: '发表',
    save: '保存',
    cancel: '取消',
    edit: '编辑',
    delete: '删除',
    done: '完成',
    moveScale: '移动和缩放',
    imageLoadFailed: '无法读取这张图片，请选择其他图片',
    cropHint: '拖动图片调整位置，滑动或双指缩放',
    emptyPost: '说说内容不能为空',
    deleteConfirm: '确定删除这条说说吗？',
    nameEmpty: '名字不能为空',
    imageOnly: '请选择图片文件',
    avatarStorage: '头像已更换，但浏览器本地存储空间不足，刷新后可能无法保留',
    newNamePrompt: '请输入新的名字',
    addImage: '添加图片',
    imageLimit: '最多添加9张图片',
    imageReadFailed: '图片读取失败',
    storageFull: '本地存储空间不足，请减少图片数量或图片大小',
  },

  en: {
    savedArchive: 'Backup saved',
    dictionary: "Dictionary",
    sentences: "Sentences",
    audioPlay: "Play audio",
    audioPause: "Pause audio",
    notice: "Notice",
    addAudio: "Add music",
    remove: "Remove",
    attachmentPreserved: "Attachment preserved",
    audioCannotPlay: "This device cannot play this audio. Its bytes remain backed up.",
    audioOnly: "Choose audio files (MP3 supported).",
    audioTooLarge: "Each audio file must be at most 64 MiB.",
    attachmentLimit: "Up to 20 music attachments per entry.",
    backupTitle: "Backup",
    exportArchive: "Export .jnote",
    importArchive: "Import .jnote",
    importMode: "Import mode",
    merge: "Merge (prefer newer entries)",
    addOnly: "Add missing entries only",
    replaceAll: "Replace all Posts",
    replaceWarning: "Replace overwrites all Posts. Merge keeps newer local entries.",
    confirmImport: "Confirm import",
    exporting: "Creating backup…",
    chooseDestination: "Choose where to save the backup.",
    exportDone: "Backup sent to file save flow.",
    transferFailed: "Operation failed: ",
    cancelled: "Cancelled",
    validating: "Validating backup…",
    attachments: "Attachments",
    verified: "Verified. Choose an import mode.",
    importing: "Importing…",
    importDone: "Import complete.",
    added: "Added",
    updated: "Updated",
    kept: "Kept",

    settings: 'Settings',
    modeSelection: 'Mode',
    usageMode: 'Usage mode',
    demoMode: 'Demo mode',
    language: 'Language',
    avatarShape: 'Avatar shape',
    roundAvatar: 'Circle',
    squareAvatar: 'Square',
    backgroundSetting: 'Background',
    imageBackground: 'Image',
    imageBackgroundHint: 'Choose and crop an image',
    rgbBackground: 'RGB color',
    applyColor: 'Apply color',
    backgroundSaved: 'Background saved',
    invalidRgb: 'RGB values must be between 0 and 255.',
    posts: 'Posts',
    share: 'Share something...',
    writePost: 'New Post',
    editPost: 'Edit Post',
    publish: 'Post',
    save: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
    delete: 'Delete',
    done: 'Done',
    moveScale: 'Move and Scale',
    imageLoadFailed: 'Unable to load this image. Please choose another.',
    cropHint: 'Drag to reposition. Slide or pinch to zoom.',
    emptyPost: 'Post content cannot be empty.',
    deleteConfirm: 'Delete this post?',
    nameEmpty: 'Name cannot be empty.',
    imageOnly: 'Please choose an image file.',
    avatarStorage: 'Avatar changed, but local storage is full. It may not persist after refresh.',
    newNamePrompt: 'Enter a new name',
    addImage: 'Add Images',
    imageLimit: 'You can add up to 9 images.',
    imageReadFailed: 'Could not read the image.',
    storageFull: 'Local storage is full. Please use fewer or smaller images.',
  }
};

const LANGUAGE_KEY = 'qzone_language';
let currentLanguage = AppStorage.getItem(LANGUAGE_KEY) || 'zh';

function t(key) {
  return (I18N[currentLanguage] && I18N[currentLanguage][key]) || I18N.zh[key] || key;
}

function applyLanguage() {
  document.documentElement.lang = currentLanguage === 'zh' ? 'zh-CN' : 'en';

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (I18N[currentLanguage][key] !== undefined) {
      el.textContent = I18N[currentLanguage][key];
    }
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    if (I18N[currentLanguage][key] !== undefined) {
      el.placeholder = I18N[currentLanguage][key];
    }
  });

  document.querySelectorAll('[data-i18n-content-placeholder]').forEach(el => {
    const key = el.dataset.i18nContentPlaceholder;
    if (I18N[currentLanguage][key] !== undefined) {
      el.dataset.placeholder = I18N[currentLanguage][key];
    }
  });

  const zh = document.getElementById('langZh');
  const en = document.getElementById('langEn');
  if (zh) zh.classList.toggle('active', currentLanguage === 'zh');
  if (en) en.classList.toggle('active', currentLanguage === 'en');
  if (typeof refreshAppearanceSettings === 'function') refreshAppearanceSettings();

  // 时间线里的“分享新鲜事...”是动态生成元素，显式同步一次，
  // 避免它因重新渲染时机不同而停留在旧语言。
  const feedComposerMain = document.querySelector('.feed-composer-main');
  if (feedComposerMain) {
    feedComposerMain.textContent = t('share');
  }

  // 编辑器标题/按钮可能处于“编辑”状态，需要根据当前状态单独刷新。
  const composeScreen = document.getElementById('postComposeScreen');
  if (composeScreen) {
    const title = composeScreen.querySelector('.post-compose-title');
    const publishBtn = composeScreen.querySelector('.post-compose-publish');
    if (title && publishBtn) {
      title.textContent = editingPostId === null ? t('writePost') : t('editPost');
      publishBtn.textContent = editingPostId === null ? t('publish') : t('save');
    }
  }

}

function setLanguage(lang) {
  if (!I18N[lang]) return;
  currentLanguage = lang;
  AppStorage.setItem(LANGUAGE_KEY, lang);
  applyLanguage();
}
