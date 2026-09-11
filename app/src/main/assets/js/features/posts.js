const POSTS_KEY = 'qzone_text_posts_v1';

const DEFAULT_POSTS = [];

let posts = loadPosts();
let editingPostId = null;
let postDraftImages = [];

function loadPosts() {
  try {
    const saved = AppStorage.getItem(POSTS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return DEFAULT_POSTS.map(p => ({...p}));
}

async function savePosts() {
  if (!isWorkspaceWritable()) return false;
  try { await persistEntries([...draftMedia.post.values()]); return true; }
  catch(error) { console.error('Entry save failed',error); alert(t('storageFull')); return false; }
}

function getDisplayName() {
  const el = document.getElementById('mainName');
  return el ? el.textContent.trim() : 'jnoter';
}

function getDisplayAvatar() {
  const el = document.getElementById('mainAvatar');
  return el ? el.src : '';
}

function renderPosts() {
  const list = document.getElementById('postList');
  if (!list) return;

  const name = escapeHTML(getDisplayName());
  const avatar = getDisplayAvatar();

  const composerHTML = isWorkspaceWritable() ? `
    <div class="feed-composer-wrap">
      <div class="feed-composer">
        <button class="feed-composer-main"
                onclick="openPostComposer()"
                data-i18n="share">${escapeHTML(t('share'))}</button>

        <button class="feed-composer-photo feed-composer-audio"
                onclick="openPostComposerWithAudioPicker()"
                aria-label="add audio">
          <svg viewBox="0 0 48 48" fill="none" stroke="#111" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 36V13l20-4v23"/>
            <circle cx="14" cy="36" r="5"/>
            <circle cx="34" cy="32" r="5"/>
          </svg>
        </button>

        <button class="feed-composer-photo"
                onclick="openPostComposerWithImagePicker()"
                aria-label="add image">
          <svg viewBox="0 0 48 48" fill="none" stroke="#111" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round">
            <rect x="7" y="7" width="34" height="34" rx="6"/>
            <circle cx="18" cy="18" r="3.4"/>
            <path d="M10 35l9-9 7 6 5-5 8 8"/>
          </svg>
        </button>

        <button class="feed-composer-photo"
                onclick="openPostComposerWithVideoPicker()"
                aria-label="add video">
          <svg viewBox="0 0 48 48" fill="none" stroke="#111" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round">
            <rect x="7" y="11" width="25" height="26" rx="5"/>
            <path d="M32 19l9-5v20l-9-5z"/>
          </svg>
        </button>
      </div>
    </div>
  ` : '';

  const postsHTML = posts.map((post) => {
    const images = Array.isArray(post.images) ? post.images : [];
    const postId=escapeHTML(String(post.id));

    return `
      <article class="post" data-post-id="${postId}">
        <div class="post-head">
          <img class="mini-avatar sync-avatar" src="${avatar}" alt="">
          <div class="post-name sync-name">${name}</div>

          ${isWorkspaceWritable() ? `<button class="more"
                  data-post-id="${postId}" onclick="openPostActionPanel(event, this.dataset.postId)"
                  aria-label="更多">${moreMenuIcon()}</button>` : ''}
        </div>

        <div class="text-content">${escapeHTML(post.text || '')}</div>
        ${renderAttachments(post.attachments)}
        ${renderVideoAttachmentsHTML(post.attachments)}
        ${renderMediaHTML(images, 'post-media-grid', true)}
        <div class="time">${escapeHTML(post.time)}</div>
      </article>
    `;
  }).join('');

  releaseAttachmentUrls(list);
  list.innerHTML = composerHTML + postsHTML;
  hydrateAttachments(list);
  hydrateVideoAttachments(list);
  requestAnimationFrame(fit);
}
function syncComposerViewport() {
  const screen = document.getElementById('postComposeScreen');
  if (!screen || !screen.classList.contains('open')) return;

  if (window.visualViewport) {
    const vv = window.visualViewport;
    screen.style.left = vv.offsetLeft + 'px';
    screen.style.top = vv.offsetTop + 'px';
    screen.style.width = vv.width + 'px';
    screen.style.height = syncViewport() + 'px';
  } else {
    screen.style.left = '0px';
    screen.style.top = '0px';
    screen.style.width = '100vw';
    screen.style.height = syncViewport() + 'px';
  }
}

function openPostComposer(prefillText = '', postId = null, sourcePost = null) {
  if(!isWorkspaceWritable()||!entriesReady||entriesBusy)return;
  closePostActionPanel();
  editingPostId = postId;

  // Editing starts from a detached copy, so rebuilding the draft never mutates
  // the live feed before the user explicitly saves it.
  const editDraft = sourcePost
      ? structuredClone(sourcePost)
      : (postId === null ? null : structuredClone(posts.find(item => String(item.id) === String(postId)) || null));

  const screen = document.getElementById('postComposeScreen');
  const textarea = document.getElementById('postComposerText');
  const title = screen.querySelector('.post-compose-title');
  const publishBtn = screen.querySelector('.post-compose-publish');

  if (screen.parentElement !== document.body) {
    document.body.appendChild(screen);
  }

  title.textContent = postId === null ? t('writePost') : t('editPost');
  publishBtn.textContent = postId === null ? t('publish') : t('save');

  textarea.value = editDraft ? String(editDraft.text || '') : prefillText;

  if (postId === null) {
    postDraftImages = [];
  } else {
    postDraftImages = editDraft && Array.isArray(editDraft.images) ? [...editDraft.images] : [];
  }

  initAudioDraft('post', editDraft);
  renderPostImagePreview();
  renderPostVideoPreview();

  screen.classList.add('open');
  document.body.style.overflow = 'hidden';
  updatePostCount();
  syncComposerViewport();

  // The composer was opened from a user gesture: focus immediately and then
  // once more after layout so Android WebView also raises the soft keyboard.
  const focusComposer = () => {
    textarea.focus({preventScroll:true});
    const end = textarea.value.length;
    try { textarea.setSelectionRange(end, end); } catch (_) {}
  };
  focusComposer();
  setTimeout(focusComposer, 80);
}
function closePostComposer() {
  if(entriesBusy)return;
  initAudioDraft('post',null);
  const screen = document.getElementById('postComposeScreen');
  screen.classList.remove('open');
  screen.style.left = '';
  screen.style.top = '';
  screen.style.width = '';
  screen.style.height = '';
  document.body.style.overflow = '';
  document.getElementById('postComposerText').value = '';
  editingPostId = null;
  postDraftImages = [];
  renderPostImagePreview();
  renderPostVideoPreview();
  updatePostCount();
}

function hasDraftVideos() {
  return draftAttachments.post.some(item => item.type === 'video');
}

function pickPostImages() {
  if (!isWorkspaceWritable()) return;
  if (hasDraftVideos()) {
    alert(t('imageVideoExclusive'));
    return;
  }
  if (NativeMedia.available()) {
    pickEntryMedia('post', 'image');
    return;
  }
  document.getElementById('postImagePicker').click();
}

function pickPostVideos() {
  if (!isWorkspaceWritable()) return;
  if (postDraftImages.length > 0) {
    alert(t('imageVideoExclusive'));
    return;
  }
  if (NativeMedia.available()) {
    pickEntryMedia('post', 'video');
    return;
  }
  document.getElementById('postVideoPicker').click();
}

function openPostComposerWithImagePicker() {
  if (!isWorkspaceWritable()) return;
  openPostComposer();

  // Wait until the composer is mounted in body before opening the system picker.
  setTimeout(() => pickPostImages(), 60);
}

function openPostComposerWithAudioPicker() {
  if (!isWorkspaceWritable()) return;
  openPostComposer();
  setTimeout(() => pickEntryAudio('post'), 60);
}

function openPostComposerWithVideoPicker() {
  if (!isWorkspaceWritable()) return;
  openPostComposer();
  setTimeout(() => pickPostVideos(), 60);
}

async function handlePostImages(event) {
  const picker = event.target;
  if (!isWorkspaceWritable()) { picker.value = ''; return; }
  if (hasDraftVideos()) {
    alert(t('imageVideoExclusive'));
    picker.value = '';
    return;
  }
  const remaining = MAX_MEDIA_IMAGES - postDraftImages.length;

  if (remaining <= 0) {
    alert(t('imageLimit'));
    picker.value = '';
    return;
  }

  const selectedCount = (picker.files || []).length;
  const images = await filesToCompressedImages(picker.files, remaining);
  postDraftImages.push(...images);

  if (selectedCount > remaining) {
    alert(t('imageLimit'));
  }

  picker.value = '';
  renderPostImagePreview();
}

function removePostDraftImage(index) {
  postDraftImages.splice(index, 1);
  renderPostImagePreview();
}

function renderPostImagePreview() {
  const box = document.getElementById('postImagePreview');
  if (!box) return;

  box.innerHTML = postDraftImages.map((src, index) => `
    <div class="compose-image-item">
      <img src="${src}"
           alt=""
           onclick="openImageViewer(this.src)">
      <button class="compose-image-remove"
              onclick="event.stopPropagation(); removePostDraftImage(${index})"
              aria-label="remove">×</button>
    </div>
  `).join('');
}

async function handlePostVideos(event) {
  const picker = event.target;
  if (!isWorkspaceWritable()) { picker.value = ''; return; }
  const files = Array.from(picker.files || []);
  picker.value = '';

  if (postDraftImages.length > 0) {
    alert(t('imageVideoExclusive'));
    return;
  }

  const remaining = MAX_MEDIA_IMAGES - draftAttachments.post.filter(item => item.type === 'video').length;
  if (remaining <= 0) {
    alert(t('videoLimit'));
    return;
  }

  if (files.length > remaining) alert(t('videoLimit'));
  const selected = files.slice(0, remaining);

  try {
    for (const file of selected) {
      if (!file.type.startsWith('video/')) throw Error(t('videoOnly'));
      const bytes = new Uint8Array(await file.arrayBuffer());
      const meta = {
        id: entryUuid(),
        type: 'video',
        mimeType: file.type || 'video/mp4',
        originalName: file.name,
        sourceMimeType: file.type || null,
        lastModified: file.lastModified,
        size: bytes.length,
        sha256: sha256(bytes)
      };
      draftMedia.post.set(meta.id, {
        ...meta,
        blob: new Blob([bytes], {type: meta.mimeType})
      });
      draftAttachments.post.push(meta);
    }
    renderPostVideoPreview();
    renderAudioDraft('post');
  } catch (error) {
    alert(error.message);
  }
}

function removePostDraftVideo(id) {
  draftAttachments.post = draftAttachments.post.filter(item => String(item.id) !== String(id));
  draftMedia.post.delete(String(id));
  renderPostVideoPreview();
  renderAudioDraft('post');
}

function renderPostVideoPreview() {
  const box = document.getElementById('postVideoPreview');
  if (!box) return;

  releaseVideoAttachmentUrls(box);
  const videos = draftAttachments.post.filter(item => item.type === 'video');
  box.innerHTML = videos.map(item => `
    <div class="compose-video-item video-attachment-item native-video-card" data-media-id="${escapeHTML(item.id)}">
      <img class="video-poster" alt="" draggable="false">
      <button class="compose-image-remove"
              type="button"
              onclick="event.stopPropagation(); removePostDraftVideo('${escapeHTML(item.id)}')"
              aria-label="${escapeHTML(t('remove'))}">×</button>
    </div>
  `).join('');

  hydrateVideoAttachments(box, draftMedia.post);
}

let activePostActionId = null;
let activePostActionAnchor = null;

function positionMenuLeftOfAnchor(panel, anchorRect) {
  if (!panel || !anchorRect) return;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const menuWidth = panel.offsetWidth;
  const menuHeight = panel.offsetHeight;
  const gap = 6;
  const edge = 8;

  let left = anchorRect.left - menuWidth - gap;
  if (left < edge) left = Math.min(viewportWidth - menuWidth - edge, anchorRect.right + gap);
  const top = Math.max(edge, Math.min(
      viewportHeight - menuHeight - edge,
      anchorRect.top + (anchorRect.height - menuHeight) / 2
  ));

  panel.style.setProperty('left', Math.round(left) + 'px', 'important');
  panel.style.setProperty('right', 'auto', 'important');
  panel.style.setProperty('top', Math.round(top) + 'px', 'important');
  panel.style.setProperty('transform', 'none', 'important');
}

function closePostActionPanel() {
  const panel = document.getElementById('postActionPanel');
  if (panel) panel.classList.remove('open');
  activePostActionId = null;
  activePostActionAnchor = null;
}

function openPostActionPanel(event, postId) {
  if (!isWorkspaceWritable()) return;
  event.preventDefault();
  event.stopPropagation();

  const panel = document.getElementById('postActionPanel');
  if (!panel) return;

  // 操作层挂到 body，避免受到页面容器的布局限制，
  // 在 APK/WebView 中会表现为点击后“没有反应”或面板跑到不可见位置。
  // 显示前挂到 body，避免全屏页面的层叠上下文遮挡。
  if (panel.parentElement !== document.body) {
    document.body.appendChild(panel);
  }


  // 再点同一条说说的三个点时关闭。
  if (panel.classList.contains('open') && activePostActionId === postId) {
    closePostActionPanel();
    return;
  }

  activePostActionId = String(postId);
  const anchor=event.currentTarget||event.target.closest('.more');
  const rect=anchor.getBoundingClientRect();
  activePostActionAnchor = {
    left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
    width: rect.width, height: rect.height
  };
  panel.classList.add('open');
  positionMenuLeftOfAnchor(panel, activePostActionAnchor);
}

function editActivePost() {
  if (!isWorkspaceWritable()) return;
  if (activePostActionId === null) return;

  const post = posts.find(item => String(item.id) === String(activePostActionId));
  if (!post) return;

  const postId = activePostActionId;
  const editDraft = structuredClone(post);
  closePostActionPanel();
  openPostComposer(editDraft.text, postId, editDraft);
}

function deleteActivePost() {
  if (!isWorkspaceWritable()) return;
  if (activePostActionId === null) return;

  const postId = activePostActionId;
  const anchorRect = activePostActionAnchor ? {...activePostActionAnchor} : null;
  closePostActionPanel();
  openDeleteConfirm('post', postId, anchorRect);
}

document.addEventListener('click', event => {
  if (!event.target.closest('#postActionPanel') && !event.target.closest('.more')) {
    closePostActionPanel();
  }
});

const composerTextarea = document.getElementById('postComposerText');

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', syncComposerViewport);
  window.visualViewport.addEventListener('scroll', syncComposerViewport);
}

window.addEventListener('resize', syncComposerViewport);

if (composerTextarea) {
  composerTextarea.addEventListener('focus', () => {
    requestAnimationFrame(syncComposerViewport);
    setTimeout(syncComposerViewport, 120);
    setTimeout(syncComposerViewport, 300);
  });
}

function updatePostCount() {
  const textarea = document.getElementById('postComposerText');
  document.getElementById('postCharCount').textContent = textarea.value.length;
}

function formatNowForPost() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return currentLanguage === 'en' ? `Today ${hh}:${mm}` : `今天${hh}:${mm}`;
}

async function publishTextPost() {
  if(!isWorkspaceWritable()||!entriesReady||entriesBusy||document.querySelector('[data-add-audio="post"]').disabled)return;
  const textarea = document.getElementById('postComposerText');
  const content = textarea.value.trim();

  if (postDraftImages.length > 0 && hasDraftVideos()) {
    alert(t('imageVideoExclusive'));
    return;
  }

  if (!content && postDraftImages.length === 0 && draftAttachments.post.length === 0) {
    alert(t('emptyPost'));
    return;
  }

  pruneDraftImages('post',postDraftImages);
  entriesBusy=true;
  const wasEditing = editingPostId !== null;
  const previous = JSON.parse(JSON.stringify(posts));
  let savedPost = null;

  if (!wasEditing) {
    const newPost = {
      id: nextEntryId(),
      uuid:entryUuid(), createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(),
      attachments:structuredClone(draftAttachments.post),
      text: content,
      images: [...postDraftImages],
      time: formatNowForPost()
    };
    posts.unshift(newPost);
    savedPost = newPost;
  } else {
    const postIndex = posts.findIndex(item => String(item.id) === String(editingPostId));
    if (postIndex >= 0) {
      const rebuiltPost = {
        ...structuredClone(posts[postIndex]),
        updatedAt: new Date().toISOString(),
        attachments: structuredClone(draftAttachments.post),
        text: content,
        images: [...postDraftImages]
      };
      posts[postIndex] = rebuiltPost;
      savedPost = rebuiltPost;
    }
  }

  if (!await savePosts()) {
    entriesBusy=false;
    posts = previous;
    return;
  }


  entriesBusy=false;
  renderPosts();
  closePostComposer();

  if (!wasEditing) {
    const feed = document.getElementById('postList');
    if (feed) feed.scrollTop = 0;
  }
}

/* ---------- 名字 ---------- */
