const POSTS_KEY = 'qzone_text_posts_v1';

const DEFAULT_POSTS = [];

let posts = loadPosts();
let editingPostId = null;
let postDraftImages = [];

const TOP_POST_DEFAULT_CONFIG = Object.freeze({
  top_post_string: 'welcome to Jet Note',
  top_post_string_color: 'F06E80',
  top_post_string_font_size: 2,
  top_post_border_color: 'bfc1c4',
  write_sth_border_color: 'bfc1c4',
  main_posts_border_color: 'bfc1c4',
  main_page: {
    three_post_one_body_vertical_move: -60,
    top_status_area_height: 52,
    top_status_area_top_margin: 0,
    top_status_area_bottom_margin: 0,
    top_status_area_horizontal_margin: 8,
    top_status_font_size: 16,
    top_status_battery_item_gap: 7,
    top_status_battery_icon_size: 22,
    top_status_settings_button_size: 44,
    top_status_settings_icon_size: 24,
    top_status_time_right_padding: 0
  },
  no_starred_post: {
    outer_border_color: 'bfc1c4',
    time_stamp_color: '999da2',
    time_stamp_top_margin: 3,
    time_stamp_bottom_margin: 3
  },
  starred_post: {
    outer_border_color: 'bfc1c4',
    time_stamp_color: '999da2',
    time_stamp_top_margin: 3,
    time_stamp_bottom_margin: 3
  },
  super_starred_post: {
    outer_border_color: 'bfc1c4',
    time_stamp_color: '999da2',
    time_stamp_top_margin: 10,
    time_stamp_bottom_margin: 3
  }
});
let topPostConfig = {...TOP_POST_DEFAULT_CONFIG};

// Initialize home-page geometry and border variables immediately; config.json overwrites them after loading.
applyHomeLayoutConfig();

fetch('config.json', {cache: 'no-store'})
  .then(response => response.ok ? response.json() : Promise.reject(new Error('config.json load failed')))
  .then(config => {
    topPostConfig = {
      ...TOP_POST_DEFAULT_CONFIG,
      ...config,
      main_page: {
        ...TOP_POST_DEFAULT_CONFIG.main_page,
        ...(config.main_page && typeof config.main_page === 'object' ? config.main_page : {}),
        // Backward compatibility for older config.json files.
        ...(config.three_post_one_body_vertical_move !== undefined ? {three_post_one_body_vertical_move: config.three_post_one_body_vertical_move} : {})
      }
    };
    applyHomeLayoutConfig();
    renderPosts();
  })
  .catch(() => { /* defaults remain active */ });

function getPostStarState(post) {
  return normalizeStarStateValue(post?.starState);
}

function setPostStarState(post, state) {
  if (!post) return;
  const normalized = state === 'super_starred' ? 'super_starred' : state === 'starred' ? 'starred' : 'none';
  post.starState = normalized;
  delete post.favorite;
}

function postPublishedAt(post) {
  const parsed = Date.parse(post?.createdAt || '');
  if (Number.isFinite(parsed)) return parsed;
  const id = Number(post?.id);
  return Number.isFinite(id) ? id : 0;
}

function getSuperStarPost() {
  return posts.find(post => getPostStarState(post) === 'super_starred') || null;
}

function getFeedPosts() {
  const visible = posts.filter(post => getPostStarState(post) !== 'super_starred');
  const regular = visible.filter(post => getPostStarState(post) !== 'starred');
  const starred = visible
    .filter(post => getPostStarState(post) === 'starred')
    .sort((a, b) => postPublishedAt(b) - postPublishedAt(a));
  return starred.concat(regular);
}


function topPostFontSize(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '2em';
  // config uses an em-style scale so the requested value 2 remains meaningful.
  return `${Math.max(0.5, Math.min(number, 6))}em`;
}

function topPostColor(value) {
  const raw = String(value || '').trim();
  return /^#?[0-9a-f]{6}$/i.test(raw) ? `#${raw.replace(/^#/, '')}` : '#F06E80';
}

function configBorderColor(value, fallback = '#bfc1c4') {
  const raw = String(value || '').trim();
  return /^#?[0-9a-f]{6}$/i.test(raw) ? `#${raw.replace(/^#/, '')}` : fallback;
}

function configVerticalPixelOffset(value, fallback = -60) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  // Keep this as a direct CSS-pixel offset. No per-region rounding or derived
  // arithmetic is used, so Top Post, Post Composer, and Main Posts move as one body.
  return Math.max(-1000, Math.min(number, 1000));
}

function postVisualConfigForState(state) {
  const key = state === 'super_starred' ? 'super_starred_post' : state === 'starred' ? 'starred_post' : 'no_starred_post';
  const defaults = TOP_POST_DEFAULT_CONFIG[key] || TOP_POST_DEFAULT_CONFIG.no_starred_post;
  const configured = topPostConfig[key];
  return {...defaults, ...(configured && typeof configured === 'object' ? configured : {})};
}

function configPixelMargin(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(-1000, Math.min(number, 1000));
}

function postVisualStyle(state) {
  const config = postVisualConfigForState(state);
  const defaults = TOP_POST_DEFAULT_CONFIG[state === 'super_starred' ? 'super_starred_post' : state === 'starred' ? 'starred_post' : 'no_starred_post'];
  const border = configBorderColor(config.outer_border_color, configBorderColor(defaults.outer_border_color));
  const timeColor = configBorderColor(config.time_stamp_color, configBorderColor(defaults.time_stamp_color, '#999da2'));
  const top = configPixelMargin(config.time_stamp_top_margin, defaults.time_stamp_top_margin);
  const bottom = configPixelMargin(config.time_stamp_bottom_margin, defaults.time_stamp_bottom_margin);
  return `--post-state-border-color:${border};--post-state-time-color:${timeColor};--post-state-time-top-margin:${top}px;--post-state-time-bottom-margin:${bottom}px`;
}

function applyHomeLayoutConfig() {
  const root = document.documentElement;
  root.style.setProperty('--top-post-border-color', configBorderColor(topPostConfig.top_post_border_color));
  root.style.setProperty('--write-sth-border-color', configBorderColor(topPostConfig.write_sth_border_color));
  root.style.setProperty('--main-posts-border-color', configBorderColor(topPostConfig.main_posts_border_color));

  const mainPageDefaults = TOP_POST_DEFAULT_CONFIG.main_page;
  const mainPage = topPostConfig.main_page && typeof topPostConfig.main_page === 'object'
    ? topPostConfig.main_page
    : mainPageDefaults;

  const verticalMove = configVerticalPixelOffset(
    mainPage.three_post_one_body_vertical_move,
    mainPageDefaults.three_post_one_body_vertical_move
  );
  root.style.setProperty('--three-post-one-body-vertical-move', `${verticalMove}px`);

  const px = (name, value, fallback, min = -1000, max = 1000) => {
    const number = Number(value);
    const safe = Number.isFinite(number) ? Math.max(min, Math.min(number, max)) : fallback;
    root.style.setProperty(name, `${safe}px`);
  };
  px('--main-page-top-status-height', mainPage.top_status_area_height, mainPageDefaults.top_status_area_height, 1, 500);
  px('--main-page-top-status-top-margin', mainPage.top_status_area_top_margin, mainPageDefaults.top_status_area_top_margin);
  px('--main-page-top-status-bottom-margin', mainPage.top_status_area_bottom_margin, mainPageDefaults.top_status_area_bottom_margin);
  px('--main-page-top-status-horizontal-margin', mainPage.top_status_area_horizontal_margin, mainPageDefaults.top_status_area_horizontal_margin, 0, 500);
  px('--main-page-top-status-font-size', mainPage.top_status_font_size, mainPageDefaults.top_status_font_size, 1, 100);
  px('--main-page-top-status-battery-gap', mainPage.top_status_battery_item_gap, mainPageDefaults.top_status_battery_item_gap, 0, 100);
  px('--main-page-top-status-battery-icon-size', mainPage.top_status_battery_icon_size, mainPageDefaults.top_status_battery_icon_size, 1, 200);
  px('--main-page-top-status-settings-button-size', mainPage.top_status_settings_button_size, mainPageDefaults.top_status_settings_button_size, 1, 200);
  px('--main-page-top-status-settings-icon-size', mainPage.top_status_settings_icon_size, mainPageDefaults.top_status_settings_icon_size, 1, 200);
  px('--main-page-top-status-time-right-padding', mainPage.top_status_time_right_padding, mainPageDefaults.top_status_time_right_padding, 0, 500);
}

function renderTopPost() {
  const card = document.getElementById('topPostCard');
  if (!card) return;
  releaseAttachmentUrls(card);

  const post = getSuperStarPost();
  if (!post) {
    const text = escapeHTML(String(topPostConfig.top_post_string ?? TOP_POST_DEFAULT_CONFIG.top_post_string));
    card.className = 'top-post-card top-post-empty common_border';
    card.removeAttribute('style');
    card.innerHTML = `
      <div class="top-post-layout">
        <div class="top-post-default-text" style="--top-post-string-color:${topPostColor(topPostConfig.top_post_string_color)};--top-post-string-size:${topPostFontSize(topPostConfig.top_post_string_font_size)}">${text}</div>
      </div>`;
    return;
  }

  const postId = escapeHTML(String(post.id));
  const images = Array.isArray(post.images) ? post.images : [];
  card.className = 'top-post-card top-post-super common_border';
  card.setAttribute('style', postVisualStyle('super_starred'));
  card.innerHTML = `
    <div class="top-post-layout">
      <div class="top-post-content" data-post-id="${postId}">
        ${renderAttachments(post.attachments)}
        <div class="text-content">${escapeHTML(post.text || '')}</div>
        <div class="post-content-clear" aria-hidden="true"></div>
        ${renderVideoAttachmentsHTML(post.attachments)}
        ${renderMediaHTML(images, 'post-media-grid', true)}
        <div class="time">${escapeHTML(post.time || '')}</div>
      </div>
      <div class="top-post-actions">
        ${isWorkspaceWritable() ? `<button class="more top-post-more" type="button" data-post-id="${postId}" onclick="openPostActionPanel(event, this.dataset.postId)" aria-label="更多">${moreMenuIcon()}</button>` : ''}
      </div>
    </div>`;
  hydrateAttachments(card);
  hydrateVideoAttachments(card);
}

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


function renderPosts() {
  const list = document.getElementById('postList');
  if (!list) return;


  const composerHTML = isWorkspaceWritable() ? `
    <div class="feed-composer-wrap">
      <div class="feed-composer common_border">
        <button class="feed-composer-main"
                type="button"
                data-editor-open="create"
                data-i18n="share">${escapeHTML(t('share'))}</button>

        <button class="feed-composer-photo"
                onclick="openPostComposerWithVideoPicker()"
                aria-label="add video">
          <svg viewBox="0 0 48 48" fill="none" stroke="#111" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round">
            <rect x="7" y="11" width="25" height="26" rx="5"/>
            <path d="M32 19l9-5v20l-9-5z"/>
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

        <button class="feed-composer-photo feed-composer-audio"
                onclick="openPostComposerWithAudioPicker()"
                aria-label="add audio">
          <svg viewBox="0 0 48 48" fill="none" stroke="#111" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 36V13l20-4v23"/>
            <circle cx="14" cy="36" r="5"/>
            <circle cx="34" cy="32" r="5"/>
          </svg>
        </button>
      </div>
    </div>
  ` : '';

  const postsHTML = getFeedPosts().map((post) => {
    const images = Array.isArray(post.images) ? post.images : [];
    const postId=escapeHTML(String(post.id));

    return `
      <article class="post post-state-${getPostStarState(post) === 'starred' ? 'starred' : 'not-starred'} common_border" data-post-id="${postId}" style="${postVisualStyle(getPostStarState(post))}">
        <div class="post-head post-head-minimal">
          ${isWorkspaceWritable() ? `<button class="more"
                  data-post-id="${postId}" onclick="openPostActionPanel(event, this.dataset.postId)"
                  aria-label="更多">${moreMenuIcon()}</button>` : ''}
        </div>

        ${renderAttachments(post.attachments)}
        <div class="text-content">${escapeHTML(post.text || '')}</div>
        <div class="post-content-clear" aria-hidden="true"></div>
        ${renderVideoAttachmentsHTML(post.attachments)}
        ${renderMediaHTML(images, 'post-media-grid', true)}
        <div class="time">${escapeHTML(post.time)}</div>
      </article>
    `;
  }).join('');

  releaseAttachmentUrls(list);
  list.innerHTML = composerHTML + postsHTML;
  renderTopPost();
  hydrateAttachments(list);
  hydrateVideoAttachments(list);
  requestAnimationFrame(fit);
}

function syncPostEditorDraft() {
  if (EditorController.state === EditorController.State.EDITING || EditorController.state === EditorController.State.TOOL_ACTIVE) {
    EditorController.setMedia({ images: postDraftImages, attachments: draftAttachments.post });
    // syncFromComposer was retired; calling it aborted publishing after the
    // button had already been disabled. Synchronize through the current API.
    EditorController.syncFromView();
  }
}

function initializePostComposerControls() {
  const screen = document.getElementById('postComposeScreen');
  if (!screen || screen.dataset.editorControlsBound === 'true') return;
  // The Composer is mounted once and then only shown/hidden.  No opening flow
  // recreates its DOM, so focus, toolbar bindings and draft restoration stay stable.
  if (screen.parentElement !== document.body) document.body.appendChild(screen);
  screen.dataset.editorControlsBound = 'true';
  screen.addEventListener('click', event => {
    const action = event.target.closest('[data-editor-action]')?.dataset.editorAction;
    if (action === 'cancel') closePostComposer();
    if (action === 'publish') publishTextPost();
  });
  EditorController.bindTextarea(document.getElementById('postComposerText'));
}

async function openPostComposer(prefillText = '', postId = null, sourcePost = null) {
  if (!isWorkspaceWritable() || !entriesReady || entriesBusy) {
    console.warn('[Editor] opening is unavailable', { writable: isWorkspaceWritable(), entriesReady, entriesBusy });
    return false;
  }
  if (EditorController.state !== EditorController.State.CLOSED) return false;
  initializePostComposerControls();
  closePostActionPanel();

  try {
    // Editing starts from a detached copy, so rebuilding the draft never mutates
    // the live feed before the user explicitly saves it.
    const editDraft = sourcePost
        ? structuredClone(sourcePost)
        : (postId === null ? null : structuredClone(posts.find(item => String(item.id) === String(postId)) || null));

    const initialDraft = await EditorController.begin({
      mode: postId === null ? 'create' : 'edit', postId,
      text: editDraft ? String(editDraft.text || '') : prefillText,
      images: editDraft?.images || [], attachments: editDraft?.attachments || [],
      starState: getPostStarState(editDraft)
    });
    editingPostId = initialDraft.postId;
    const screen = document.getElementById('postComposeScreen');
    const textarea = document.getElementById('postComposerText');
    const title = screen?.querySelector('.post-compose-title');
    const publishBtn = screen?.querySelector('.post-compose-publish');
    const body = screen?.querySelector('.post-compose-body');
    if (!screen || !textarea || !title || !publishBtn || !body) throw new Error('Composer view is incomplete');
    initializePostComposerTools?.();

    title.textContent = postId === null ? t('writePost') : t('editPost');
    // Keep the reusable icon control intact. Only its accessible label changes
    // between create and edit mode; replacing textContent would delete the SVG icon.
    const publishLabel = postId === null ? t('publish') : t('save');
    publishBtn.setAttribute('aria-label', publishLabel);
    publishBtn.setAttribute('title', publishLabel);

    textarea.value = initialDraft.text;

    postDraftImages = [...initialDraft.images];

    initAudioDraft('post', { attachments: initialDraft.attachments });
    renderPostImagePreview();
    renderPostVideoPreview();

    closePostToolChoices?.();
    body.scrollTop = 0;
    screen.classList.add('open');
    document.body.style.overflow = 'hidden';
    ViewportManager.update();

    // The composer was opened from a user gesture: focus immediately and then
    // once more after layout so Android WebView also raises the soft keyboard.
    const focusComposer = () => {
      textarea.focus({preventScroll:true});
      const end = textarea.value.length;
      try { textarea.setSelectionRange(end, end); } catch (_) {}
    };
    focusComposer();
    setTimeout(focusComposer, 80);
    return true;
  } catch (error) {
    console.error('[Editor] open failed', error);
    EditorController.abortOpen?.();
    editingPostId = null;
    return false;
  }
}
function closePostComposer() {
  if(entriesBusy)return;
  closePostToolChoices?.();
  initAudioDraft('post',null);
  const screen = document.getElementById('postComposeScreen');
  screen.classList.remove('open');
  document.body.style.overflow = '';
  document.getElementById('postComposerText').value = '';
  editingPostId = null;
  postDraftImages = [];
  renderPostImagePreview();
  renderPostVideoPreview();
  void EditorController.discard();
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

  // Image picking in the Android app must never go through an HTML
  // <input type="file">. WebView/Chromium is allowed to translate an
  // image-accepting file input into the platform photo/gallery picker, which
  // is exactly the UI Jet Note does not want here. Route the button directly
  // to the native SAF attachment picker, just like the native media path.
  if (!window.JetNoteNative || typeof JetNoteNative.pickAttachments !== 'function') {
    console.error('Jet Note native attachment picker is unavailable');
    alert(t('attachmentReadFailed'));
    return;
  }
  void pickEntryMedia('post', 'image');
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

async function openPostComposerWithImagePicker() {
  if (!isWorkspaceWritable()) return;
  if (!await openPostComposer()) return;

  // Wait until the composer is mounted in body before opening the system picker.
  setTimeout(() => pickPostImages(), 60);
}

async function openPostComposerWithAudioPicker() {
  if (!isWorkspaceWritable()) return;
  if (!await openPostComposer()) return;
  setTimeout(() => pickEntryAudio('post'), 60);
}

async function openPostComposerWithVideoPicker() {
  if (!isWorkspaceWritable()) return;
  if (!await openPostComposer()) return;
  setTimeout(() => pickPostVideos(), 60);
}

function removePostDraftImage(index) {
  postDraftImages.splice(index, 1);
  renderPostImagePreview();
  syncPostEditorDraft();
}

function renderPostImagePreview() {
  const box = document.getElementById('postImagePreview');
  if (!box) return;

  box.innerHTML = postDraftImages.map((src, index) => `
    <div class="compose-image-item common_border">
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
    syncPostEditorDraft();
  } catch (error) {
    alert(error.message);
  }
}

function removePostDraftVideo(id) {
  draftAttachments.post = draftAttachments.post.filter(item => String(item.id) !== String(id));
  draftMedia.post.delete(String(id));
  renderPostVideoPreview();
  renderAudioDraft('post');
  syncPostEditorDraft();
}

function renderPostVideoPreview() {
  const box = document.getElementById('postVideoPreview');
  if (!box) return;

  releaseVideoAttachmentUrls(box);
  const videos = draftAttachments.post.filter(item => item.type === 'video');
  box.innerHTML = videos.map(item => `
    <div class="video-attachment-shell compose-video-shell">
      <div class="compose-video-item video-attachment-item native-video-card common_border" data-media-id="${escapeHTML(item.id)}">
        <img class="video-poster" alt="" draggable="false">
        <button class="compose-image-remove"
                type="button"
                onclick="event.stopPropagation(); removePostDraftVideo('${escapeHTML(item.id)}')"
                aria-label="${escapeHTML(t('remove'))}">×</button>
      </div>
      <div class="video-progress-track common_border" role="slider" aria-label="video position" aria-valuemin="0" aria-valuemax="1000" aria-valuenow="0">
        <div class="video-progress-fill"></div>
      </div>
      <div class="video-inline-time">0:00 / 0:00</div>
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

function syncPostFavoriteAction() {
  const button = document.getElementById('postFavoriteAction');
  if (!button) return;

  const post = posts.find(item => String(item.id) === String(activePostActionId));
  const state = getPostStarState(post);
  button.classList.toggle('active', state === 'starred');
  button.classList.toggle('super-active', state === 'super_starred');
  button.setAttribute('aria-pressed', state === 'none' ? 'false' : 'true');
  button.setAttribute('data-star-state', state);
}

async function commitStarStateChange(previous) {
  syncPostFavoriteAction();
  renderPosts();
  const saved = await savePosts();
  if (!saved) {
    posts = previous;
    renderPosts();
    syncPostFavoriteAction();
    return false;
  }
  return true;
}

async function toggleFavoriteActivePost() {
  if (!isWorkspaceWritable() || activePostActionId === null) return;
  const post = posts.find(item => String(item.id) === String(activePostActionId));
  if (!post) return;

  const previous = structuredClone(posts);
  const state = getPostStarState(post);
  setPostStarState(post, state === 'none' ? 'starred' : 'none');
  await commitStarStateChange(previous);
}

async function toggleSuperStarActivePost() {
  if (!isWorkspaceWritable() || activePostActionId === null) return;
  const post = posts.find(item => String(item.id) === String(activePostActionId));
  if (!post) return;

  const previous = structuredClone(posts);
  // Long-press is an idempotent "make this the Super Star" action.
  // It never cancels the current Super Star; cancellation is click-only.
  for (const item of posts) {
    if (item !== post && getPostStarState(item) === 'super_starred') setPostStarState(item, 'none');
  }
  setPostStarState(post, 'super_starred');

  // Super Star moves the post into Top Post, so the action menu anchored to the
  // post's old screen coordinates must disappear before the list is rebuilt.
  closePostActionPanel();

  const saved = await commitStarStateChange(previous);
  if (!saved) return;

  // Reuse exactly the same home-return behavior as Android's Back button.
  // At this point overlays are closed, so the existing navigation function
  // naturally scrolls the main sliding page to its top.
  if (typeof returnToStandardHome === 'function') {
    returnToStandardHome();
  } else {
    window.scrollTo(0, 0);
    requestAnimationFrame(() => fit());
  }
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
  syncPostFavoriteAction();
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

let favoriteLongPressTimer = null;
let suppressFavoriteClick = false;

document.addEventListener('pointerdown', event => {
  const button = event.target.closest('#postFavoriteAction[data-post-action="favorite"]');
  if (!button) return;
  suppressFavoriteClick = false;
  clearTimeout(favoriteLongPressTimer);
  favoriteLongPressTimer = setTimeout(() => {
    suppressFavoriteClick = true;
    if (navigator.vibrate) navigator.vibrate(28);
    void toggleSuperStarActivePost();
  }, 550);
});

document.addEventListener('pointerup', () => {
  clearTimeout(favoriteLongPressTimer);
  favoriteLongPressTimer = null;
});
document.addEventListener('pointercancel', () => {
  clearTimeout(favoriteLongPressTimer);
  favoriteLongPressTimer = null;
});
document.addEventListener('contextmenu', event => {
  if (event.target.closest('#postFavoriteAction')) event.preventDefault();
});

document.addEventListener('click', event => {
  const editorOpen = event.target.closest('[data-editor-open="create"]');
  if (editorOpen) {
    event.preventDefault();
    void openPostComposer();
    return;
  }
  const action = event.target.closest('#postActionPanel [data-post-action]')?.dataset.postAction;
  if (action) {
    event.preventDefault();
    if (action === 'edit') void editActivePost();
    if (action === 'favorite') {
      if (suppressFavoriteClick) { suppressFavoriteClick = false; return; }
      void toggleFavoriteActivePost();
    }
    if (action === 'delete') void deleteActivePost();
    return;
  }
  if (!event.target.closest('#postActionPanel') && !event.target.closest('.more')) {
    closePostActionPanel();
  }
});

initializePostComposerControls();
window.addEventListener('jetnote:editor-resume', () => {
  const screen = document.getElementById('postComposeScreen');
  if (!screen?.classList.contains('open')) return;
  renderPostImagePreview();
  renderPostVideoPreview();
  renderAudioDraft();
  ViewportManager.requestUpdate();
});

function formatNowForPost() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `Today ${hh}:${mm}`;
}

function addToolAudioToPost(meta) {
  const composer = document.getElementById('postComposeScreen');
  if (!composer?.classList.contains('open')) return 'composer-not-open';
  if (!meta || meta.type !== 'audio' || !meta.id || !meta.path) return 'invalid-audio';

  if (draftAttachments.post.some(item => String(item.id) === String(meta.id))) {
    return 'duplicate';
  }
  if (draftAttachments.post.filter(item => item.type === 'audio').length >= 20) {
    alert(t('attachmentLimit'));
    return 'limit';
  }

  draftAttachments.post.push(meta);
  draftMedia.post.set(meta.id, meta);
  renderAudioDraft();
  syncPostEditorDraft();
  return 'added';
}

window.addToolAudioToPost = addToolAudioToPost;

function attachmentsForPostDraft(draft) {
  const imageSources = new Set(draft.images || []);
  return (draft.attachments || []).filter(item => item.type !== 'image' || imageSources.has(NativeMedia.url(item)));
}

async function commitPostDraft(draft) {
  const previous = structuredClone(posts);
  const wasEditing = draft.mode === 'edit';
  const attachments = attachmentsForPostDraft(draft);
  let savedPost = null;
  entriesBusy = true;
  try {
    if (!wasEditing) {
      savedPost = {
        id: nextEntryId(), uuid: entryUuid(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        attachments: structuredClone(attachments), text: draft.text.trim(), images: [...draft.images],
        starState: 'none', time: formatNowForPost()
      };
      posts.unshift(savedPost);
    } else {
      const index = posts.findIndex(item => String(item.id) === String(draft.postId));
      if (index < 0) throw Error('This post no longer exists. Please reopen it from the feed.');
      savedPost = {
        ...structuredClone(posts[index]), updatedAt: new Date().toISOString(),
        attachments: structuredClone(attachments), text: draft.text.trim(), images: [...draft.images], starState: normalizeStarStateValue(draft.starState)
      };
      posts[index] = savedPost;
    }
    if (!await savePosts()) throw Error(t('storageFull'));
    renderPosts();
    return { wasEditing, savedPost };
  } catch (error) {
    posts = previous;
    throw error;
  } finally {
    entriesBusy = false;
  }
}

let postPublishInFlight = false;
async function publishTextPost() {
  // Publishing is governed by PostDraftStore, never by a toolbar element.
  if (postPublishInFlight || !isWorkspaceWritable() || !entriesReady || entriesBusy || isPostDraftMediaLoading()) return;
  postPublishInFlight = true;
  const publishButton = document.querySelector('#postComposeScreen [data-editor-action="publish"]');
  if (publishButton) publishButton.disabled = true;
  syncPostEditorDraft();
  let commitResult = null;
  const result = await EditorController.publish(async draft => { commitResult = await commitPostDraft(draft); });
  try {
    if (!result.ok) {
      if (result.code === 'empty-post') alert(t('emptyPost'));
      else if (result.code === 'image-video-exclusive') alert(t('imageVideoExclusive'));
      else if (result.code === 'save-failed') alert(result.error?.message || t('storageFull'));
      return;
    }
    closePostComposer();
    if (!commitResult.wasEditing) document.getElementById('postList')?.scrollTo({ top: 0 });
  } finally {
    postPublishInFlight = false;
    if (publishButton?.isConnected) publishButton.disabled = false;
  }
}

/* ---------- 名字 ---------- */
