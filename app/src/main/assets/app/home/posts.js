const POSTS_KEY = 'qzone_text_posts_v1';

const DEFAULT_POSTS = [];

let posts = loadPosts();
let editingPostId = null;
let postDraftImages = [];

const WELCOME_POST_DEFAULT_STRING = 'welcome to Jet Note';
let welcomePostDefaultString = WELCOME_POST_DEFAULT_STRING;

const THREE_POST_ONE_BODY_DEFAULT_CONFIG = Object.freeze({
  vertical_move_px: -32,
  font_size_px: 17,
  welcome_post: Object.freeze({
    text_color: '#F06E80',
    text_font_size_em: 2
  }),
  top_post: Object.freeze({
    welcome: Object.freeze({
      border_rule: Object.freeze({
        change_count: 0,
        sequence: Object.freeze([{color: '#bfc1c4', duration_ms: 1000}])
      })
    }),
    super_starred: Object.freeze({
      border_rule: Object.freeze({
        change_count: 1,
        sequence: Object.freeze([
          {color: '#34A853', duration_ms: 2250},
          {color: '#ff0073', duration_ms: 0}
        ])
      }),
      time_stamp_color: '999da2',
      time_stamp_top_margin: 10,
      time_stamp_bottom_margin: 3
    })
  }),
  post_composer: Object.freeze({
    border_rule: Object.freeze({
      change_count: 0,
      sequence: Object.freeze([{color: '#bfc1c4', duration_ms: 1000}])
    })
  }),
  main_posts: Object.freeze({
    non_star: Object.freeze({
      border_rule: Object.freeze({
        change_count: 0,
        sequence: Object.freeze([{color: '#bfc1c4', duration_ms: 1000}])
      }),
      time_stamp_color: '999da2',
      time_stamp_top_margin: 3,
      time_stamp_bottom_margin: 3
    }),
    starred: Object.freeze({
      border_rule: Object.freeze({
        change_count: 1,
        sequence: Object.freeze([
          {color: '#34A853', duration_ms: 2250},
          {color: '#d3cc06', duration_ms: 0}
        ])
      }),
      time_stamp_color: '999da2',
      time_stamp_top_margin: 3,
      time_stamp_bottom_margin: 3
    })
  })
});

let threePostOneBodyConfig = THREE_POST_ONE_BODY_DEFAULT_CONFIG;

// The IME is raised only after the split entrance settles. This timing is a
// structural part of the animation, not a global config option; exposing values
// below the settle point was misleading because they were always clamped.

const threePostOneBodyBorderTimers = new Map();

function mergeObject(defaultValue, configuredValue) {
  if (!configuredValue || typeof configuredValue !== 'object' || Array.isArray(configuredValue)) return {...defaultValue};
  return {...defaultValue, ...configuredValue};
}

function configuredThreePostOneBody(config) {
  const configured = config?.three_post_one_body;
  if (!configured || typeof configured !== 'object') return THREE_POST_ONE_BODY_DEFAULT_CONFIG;
  return {
    ...THREE_POST_ONE_BODY_DEFAULT_CONFIG,
    ...configured,
    welcome_post: mergeObject(THREE_POST_ONE_BODY_DEFAULT_CONFIG.welcome_post, configured.welcome_post),
    top_post: {
      ...THREE_POST_ONE_BODY_DEFAULT_CONFIG.top_post,
      ...configured.top_post,
      welcome: mergeObject(THREE_POST_ONE_BODY_DEFAULT_CONFIG.top_post.welcome, configured.top_post?.welcome),
      super_starred: mergeObject(THREE_POST_ONE_BODY_DEFAULT_CONFIG.top_post.super_starred, configured.top_post?.super_starred)
    },
    post_composer: mergeObject(THREE_POST_ONE_BODY_DEFAULT_CONFIG.post_composer, configured.post_composer),
    main_posts: {
      ...THREE_POST_ONE_BODY_DEFAULT_CONFIG.main_posts,
      ...configured.main_posts,
      non_star: mergeObject(THREE_POST_ONE_BODY_DEFAULT_CONFIG.main_posts.non_star, configured.main_posts?.non_star),
      starred: mergeObject(THREE_POST_ONE_BODY_DEFAULT_CONFIG.main_posts.starred, configured.main_posts?.starred)
    }
  };
}

// Initialize canonical Three Posts, One Body geometry before config.json arrives.
applyThreePostOneBodyConfig();

Promise.all([
  fetch('config.json', {cache: 'no-store'}).then(response => response.ok ? response.json() : Promise.reject(new Error('config.json load failed'))),
  window.JetNoteUiLanguage?.get
    ? window.JetNoteUiLanguage.get('home.welcome_post_default', WELCOME_POST_DEFAULT_STRING)
    : Promise.resolve(WELCOME_POST_DEFAULT_STRING)
]).then(([config, defaultString]) => {
    welcomePostDefaultString = defaultString || WELCOME_POST_DEFAULT_STRING;
    threePostOneBodyConfig = configuredThreePostOneBody(config);
    applyThreePostOneBodyConfig();
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

function getMainPosts() {
  const visible = posts.filter(post => getPostStarState(post) !== 'super_starred');
  const regular = visible.filter(post => getPostStarState(post) !== 'starred');
  const starred = visible
    .filter(post => getPostStarState(post) === 'starred')
    .sort((a, b) => postPublishedAt(b) - postPublishedAt(a));
  return starred.concat(regular);
}

function welcomePostFontSize(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '2em';
  return `${Math.max(0.5, Math.min(number, 6))}em`;
}

function welcomePostTextColor(value) {
  const raw = String(value || '').trim();
  return /^#?[0-9a-f]{6}$/i.test(raw) ? `#${raw.replace(/^#/, '')}` : '#F06E80';
}

function configBorderColor(value, fallback = '#bfc1c4') {
  const raw = String(value || '').trim();
  return /^#?[0-9a-f]{6}$/i.test(raw) ? `#${raw.replace(/^#/, '')}` : fallback;
}

function configVerticalPixelOffset(value, fallback = -32) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(-1000, Math.min(number, 1000));
}

function configFontSize(value, fallback = 17) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(10, Math.min(number, 48));
}

function postVisualConfigForState(state) {
  if (state === 'super_starred') {
    return threePostOneBodyConfig.top_post?.super_starred || THREE_POST_ONE_BODY_DEFAULT_CONFIG.top_post.super_starred;
  }
  if (state === 'starred') {
    return threePostOneBodyConfig.main_posts?.starred || THREE_POST_ONE_BODY_DEFAULT_CONFIG.main_posts.starred;
  }
  return threePostOneBodyConfig.main_posts?.non_star || THREE_POST_ONE_BODY_DEFAULT_CONFIG.main_posts.non_star;
}

function configPixelMargin(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(-1000, Math.min(number, 1000));
}

function postVisualStyle(state) {
  const config = postVisualConfigForState(state);
  const defaults = state === 'super_starred'
    ? THREE_POST_ONE_BODY_DEFAULT_CONFIG.top_post.super_starred
    : state === 'starred'
      ? THREE_POST_ONE_BODY_DEFAULT_CONFIG.main_posts.starred
      : THREE_POST_ONE_BODY_DEFAULT_CONFIG.main_posts.non_star;
  const timeColor = configBorderColor(config.time_stamp_color, configBorderColor(defaults.time_stamp_color, '#999da2'));
  const top = configPixelMargin(config.time_stamp_top_margin, defaults.time_stamp_top_margin);
  const bottom = configPixelMargin(config.time_stamp_bottom_margin, defaults.time_stamp_bottom_margin);
  return `--post-state-time-color:${timeColor};--post-state-time-top-margin:${top}px;--post-state-time-bottom-margin:${bottom}px`;
}

function normalizedBorderSequence(rule, fallbackColor) {
  const rawSequence = Array.isArray(rule?.sequence) ? rule.sequence : [];
  const sequence = rawSequence.map(item => ({
    color: configBorderColor(item?.color, ''),
    duration_ms: Math.max(0, Math.min(Number(item?.duration_ms) || 0, 86400000))
  })).filter(item => item.color);
  return sequence.length ? sequence : [{color: fallbackColor, duration_ms: 1000}];
}

function stopThreePostOneBodyBorderRule(name) {
  const timer = threePostOneBodyBorderTimers.get(name);
  if (timer) clearTimeout(timer);
  threePostOneBodyBorderTimers.delete(name);
}

function applyThreePostOneBodyBorderRule(name, rule, cssVariable, fallbackColor = '#bfc1c4') {
  stopThreePostOneBodyBorderRule(name);
  const sequence = normalizedBorderSequence(rule, fallbackColor);
  const changeCount = Number(rule?.change_count);
  const mode = changeCount === -1 ? -1 : changeCount === 1 ? 1 : 0;
  const root = document.documentElement;

  if (mode === 0 || sequence.length === 1) {
    root.style.setProperty(cssVariable, sequence[0].color);
    return;
  }

  let index = 0;
  const show = () => {
    const item = sequence[index];
    root.style.setProperty(cssVariable, item.color);

    if (mode === 1 && index === sequence.length - 1) {
      threePostOneBodyBorderTimers.delete(name);
      return;
    }

    const wait = mode === -1 ? Math.max(16, item.duration_ms) : item.duration_ms;
    const timer = setTimeout(() => {
      index = (index + 1) % sequence.length;
      show();
    }, wait);
    threePostOneBodyBorderTimers.set(name, timer);
  };
  show();
}

function restartThreePostOneBodyStateBorderRule(state) {
  if (state === 'starred') {
    applyThreePostOneBodyBorderRule(
      'main_posts.starred',
      threePostOneBodyConfig.main_posts?.starred?.border_rule,
      '--three-post-one-body-main-posts-starred-border-color'
    );
    return;
  }
  if (state === 'super_starred') {
    applyThreePostOneBodyBorderRule(
      'top_post.super_starred',
      threePostOneBodyConfig.top_post?.super_starred?.border_rule,
      '--three-post-one-body-top-post-super-starred-border-color'
    );
  }
}

function applyThreePostOneBodyConfig() {
  const root = document.documentElement;
  root.style.setProperty(
    '--three-post-one-body-font-size',
    `${configFontSize(threePostOneBodyConfig.font_size_px, THREE_POST_ONE_BODY_DEFAULT_CONFIG.font_size_px)}px`
  );
  root.style.setProperty(
    '--three-post-one-body-vertical-move',
    `${configVerticalPixelOffset(threePostOneBodyConfig.vertical_move_px, THREE_POST_ONE_BODY_DEFAULT_CONFIG.vertical_move_px)}px`
  );

  applyThreePostOneBodyBorderRule(
    'top_post.welcome',
    threePostOneBodyConfig.top_post?.welcome?.border_rule,
    '--three-post-one-body-top-post-welcome-border-color'
  );
  applyThreePostOneBodyBorderRule(
    'top_post.super_starred',
    threePostOneBodyConfig.top_post?.super_starred?.border_rule,
    '--three-post-one-body-top-post-super-starred-border-color'
  );
  applyThreePostOneBodyBorderRule(
    'post_composer',
    threePostOneBodyConfig.post_composer?.border_rule,
    '--three-post-one-body-post-composer-border-color'
  );
  applyThreePostOneBodyBorderRule(
    'main_posts.non_star',
    threePostOneBodyConfig.main_posts?.non_star?.border_rule,
    '--three-post-one-body-main-posts-non-star-border-color'
  );
  applyThreePostOneBodyBorderRule(
    'main_posts.starred',
    threePostOneBodyConfig.main_posts?.starred?.border_rule,
    '--three-post-one-body-main-posts-starred-border-color'
  );
}

window.addEventListener('pagehide', () => {
  for (const name of [...threePostOneBodyBorderTimers.keys()]) stopThreePostOneBodyBorderRule(name);
});

function renderPublishedPostFooter(post) {
  return `<div class="post-footer-row"><div class="time">${escapeHTML(formatPostTimestamp(post))}</div></div>`;
}

function renderTopPost() {
  const card = document.getElementById('topPostCard');
  if (!card) return;
  releaseAttachmentUrls(card);

  const post = getSuperStarPost();
  if (!post) {
    const text = escapeHTML(String(welcomePostDefaultString || WELCOME_POST_DEFAULT_STRING));
    card.className = 'top-post-card welcome-post three-posts-one-body__box common_border';
    card.removeAttribute('style');
    card.innerHTML = `
      <div class="top-post-layout">
        <div class="welcome-post-text" style="--welcome-post-text-color:${welcomePostTextColor(threePostOneBodyConfig.welcome_post?.text_color)};--welcome-post-text-size:${welcomePostFontSize(threePostOneBodyConfig.welcome_post?.text_font_size_em)}">${text}</div>
      </div>`;
    return;
  }

  const postId = escapeHTML(String(post.id));
  const images = Array.isArray(post.images) ? post.images : [];
  card.className = 'top-post-card top-post-super three-posts-one-body__box common_border';
  card.setAttribute('style', postVisualStyle('super_starred'));
  card.innerHTML = `
    <div class="top-post-layout">
      <div class="top-post-content" data-post-id="${postId}">
        ${renderAttachments(post.attachments)}
        <div class="text-content">${escapeHTML(post.text || '')}</div>
        <div class="post-content-clear" aria-hidden="true"></div>
        ${renderPublishedVisualMediaHTML(images, post.attachments)}
        <div class="time">${escapeHTML(formatPostTimestamp(post))}</div>
      </div>
      <div class="top-post-actions">
        ${isWorkspaceWritable() ? `<button class="more top-post-more" type="button" data-post-id="${postId}" onclick="openPostActionPanel(event, this.dataset.postId)" aria-label="More">${moreMenuIcon()}</button>` : ''}
      </div>
    </div>`;
  hydrateAttachments(card);
  hydrateVideoAttachments(card);
  bindPublishedInlineImageZoom?.(card);
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
  const list = document.getElementById('mainPosts');
  const composerMount = document.getElementById('postComposerMount');
  if (!list || !composerMount) return;

  const composerHTML = isWorkspaceWritable() ? `
      <div class="post-composer three-posts-one-body__box common_border">
        <button class="post-composer-main"
                type="button"
                data-editor-open="create"
                data-i18n="share">${escapeHTML(t('share'))}</button>

        <button class="post-composer-media-button"
                onclick="openPostComposerWithVideoPicker()"
                aria-label="add video">
          <img src="shared/icons/video.svg" alt="">
        </button>

        <button class="post-composer-media-button"
                onclick="openPostComposerWithImagePicker()"
                aria-label="add image">
          <img src="shared/icons/image.svg" alt="">
        </button>

        <button class="post-composer-media-button post-composer-audio-button"
                onclick="openPostComposerWithAudioPicker()"
                aria-label="add audio">
          <img src="shared/icons/audio.svg" alt="">
        </button>
      </div>
  ` : '';

  const postsHTML = getMainPosts().map((post) => {
    const images = Array.isArray(post.images) ? post.images : [];
    const postId=escapeHTML(String(post.id));

    return `
      <article class="post post-state-${getPostStarState(post) === 'starred' ? 'starred' : 'not-starred'} three-posts-one-body__box common_border" data-post-id="${postId}" style="${postVisualStyle(getPostStarState(post))}">
        <div class="post-head post-head-minimal">
          ${isWorkspaceWritable() ? `<button class="more"
                  data-post-id="${postId}" onclick="openPostActionPanel(event, this.dataset.postId)"
                  aria-label="More">${moreMenuIcon()}</button>` : ''}
        </div>

        ${renderAttachments(post.attachments)}
        <div class="text-content">${escapeHTML(post.text || '')}</div>
        <div class="post-content-clear" aria-hidden="true"></div>
        ${renderPublishedVisualMediaHTML(images, post.attachments)}
        ${renderPublishedPostFooter(post)}
      </article>
    `;
  }).join('');

  releaseAttachmentUrls(list);
  const debugPostHTML = window.DebugConfigurationFeature?.render?.() || '';
  composerMount.innerHTML = composerHTML;
  list.innerHTML = debugPostHTML + postsHTML;
  renderTopPost();
  hydrateAttachments(list);
  hydrateVideoAttachments(list);
  bindPublishedInlineImageZoom?.(list);
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
    const composeTopBar = screen?.querySelector('.buttom-string-buttom-bar');
    const body = screen?.querySelector('.post-compose-body');
    if (!screen || !textarea || !title || !publishBtn || !body) throw new Error('Composer view is incomplete');
    initializeTools?.();

    const topBarPageKey = postId === null ? 'new_post_page' : 'edit_post_page';
    if (composeTopBar && window.JetBottomStringBottomBar?.renderBar) {
      await window.JetBottomStringBottomBar.renderBar(composeTopBar, topBarPageKey);
    } else {
      title.textContent = postId === null ? t('writePost') : t('editPost');
    }
    const publishLabel = postId === null ? t('publish') : t('save');
    publishBtn.setAttribute('aria-label', publishBtn.getAttribute('aria-label') || publishLabel);
    publishBtn.setAttribute('title', publishBtn.getAttribute('title') || publishLabel);

    textarea.value = initialDraft.text;

    postDraftImages = [...initialDraft.images];

    initAudioDraft('post', { attachments: initialDraft.attachments });
    renderPostImagePreview();
    renderPostVideoPreview();

    closeToolbox?.();
    body.scrollTop = 0;
    // Native video is a TextureView layered outside the WebView. Suppress it
    // before exposing the editor so there is no one-frame video flash-through.
    window.JetNoteVideoOverlay?.suspend?.();

    // Split entrance: prepare both regions off-screen before the editor becomes
    // visible, then commit the transform on the next animation frame. Keeping
    // this transform-only avoids layout thrashing and keeps the opening path fast.
    const splitMotionMs = 320;
    screen.classList.remove('composer-split-enter-active');
    screen.classList.add('composer-split-enter');
    screen.classList.add('open');
    window.__jetSyncNativeVideoVisibility?.();
    document.body.style.overflow = 'hidden';
    ViewportManager.update();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!screen.classList.contains('open')) return;
        screen.classList.add('composer-split-enter-active');
      });
    });

    // Do not raise the Android keyboard while the two halves are moving: an IME
    // viewport resize during the transform makes the lower half visibly jump.
    // Focus once the panels have met, while preserving the original caret rule.
    const focusComposer = () => {
      if (!screen.classList.contains('open')) return;
      textarea.focus({preventScroll:true});
      const end = textarea.value.length;
      try { textarea.setSelectionRange(end, end); } catch (_) {}
    };
    const splitSettledMs = splitMotionMs + 30;

    // Finish the visual transition independently of the keyboard delay. A long
    // configured IME delay must not leave animation classes hanging around.
    setTimeout(() => {
      if (!screen.classList.contains('open')) return;
      screen.classList.remove('composer-split-enter', 'composer-split-enter-active');
    }, splitSettledMs);

    // Raise the keyboard as soon as the split animation has fully settled.
    setTimeout(() => {
      if (!screen.classList.contains('open')) return;
      focusComposer();
      // One lightweight retry keeps Android WebView/IME hand-off reliable.
      setTimeout(focusComposer, 80);
    }, splitSettledMs);
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
  // Editor video is temporary. Stop/release it before the editor DOM is hidden
  // so no decoder, TextureView, seek state or callbacks leak back into the feed.
  const editorVideoPreview = document.getElementById('postVideoPreview');
  releaseVideoAttachmentUrls(editorVideoPreview);
  closeToolbox?.();
  initAudioDraft('post',null);
  const screen = document.getElementById('postComposeScreen');
  screen.classList.remove('open', 'composer-split-enter', 'composer-split-enter-active');
  window.__jetSyncNativeVideoVisibility?.();
  document.body.style.overflow = '';
  document.getElementById('postComposerText').value = '';
  editingPostId = null;
  postDraftImages = [];
  renderPostImagePreview();
  renderPostVideoPreview();
  void EditorController.discard();
}

async function pickPostImages() {
  if (!isWorkspaceWritable()) return;
  const policy = window.JetNotePostAttachmentPolicy;
  await policy?.ready;
  if (policy?.conflict('image', postDraftImages, draftAttachments.post)) {
    alert(t('imageVideoExclusive'));
    return;
  }
  if ((policy?.remaining('image', postDraftImages, draftAttachments.post) ?? 0) <= 0) {
    alert(t('imageLimit'));
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

async function pickPostVideos() {
  if (!isWorkspaceWritable()) return;
  const policy = window.JetNotePostAttachmentPolicy;
  await policy?.ready;
  if (policy?.conflict('video', postDraftImages, draftAttachments.post)) {
    alert(t('imageVideoExclusive'));
    return;
  }
  if ((policy?.remaining('video', postDraftImages, draftAttachments.post) ?? 0) <= 0) {
    alert(t('videoLimit'));
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

  const policy = window.JetNotePostAttachmentPolicy;
  await policy?.ready;
  if (policy?.conflict('video', postDraftImages, draftAttachments.post)) {
    alert(t('imageVideoExclusive'));
    return;
  }

  const remaining = policy?.remaining('video', postDraftImages, draftAttachments.post) ?? 0;
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
    <div class="video-attachment-shell compose-video-shell common_border">
      <div class="compose-video-item video-attachment-item native-video-card" data-media-id="${escapeHTML(item.id)}">
        <img class="video-poster" alt="" draggable="false">
        <button class="compose-image-remove"
                type="button"
                onclick="event.stopPropagation(); removePostDraftVideo('${escapeHTML(item.id)}')"
                aria-label="${escapeHTML(t('remove'))}">×</button>
      </div>
      <div class="video-progress-track" role="slider" tabindex="0" aria-label="video position" aria-valuemin="0" aria-valuemax="1000" aria-valuenow="0">
        <div class="video-progress-fill"></div>
      </div>
      <div class="video-inline-time">0:00/0:00</div>
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
  // Re-evaluate the native TextureView only after the HTML overlay has closed.
  window.__jetSyncNativeVideoVisibility?.();
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
  const icon = button.querySelector('.post-action-star');
  if (icon) icon.src = state === 'super_starred' ? 'shared/icons/star_super.svg' : state === 'starred' ? 'shared/icons/star_active.svg' : 'shared/icons/star.svg';
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
  const nextState = state === 'none' ? 'starred' : 'none';
  setPostStarState(post, nextState);
  if (nextState === 'starred') restartThreePostOneBodyStateBorderRule('starred');

  // Every short-press favorite action closes the shared three-dot menu before
  // renderPosts(). The panel lives under document.body, so rebuilding the post
  // list cannot remove it for us. This also covers cancelling Super Star.
  closePostActionPanel();

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
  restartThreePostOneBodyStateBorderRule('super_starred');

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

  // Hide Android's native TextureView synchronously. It is a sibling of the
  // WebView, so no CSS z-index can reliably place this menu above it.
  window.JetNoteVideoOverlay?.suspend?.();

  const panel = document.getElementById('postActionPanel');
  if (!panel) return;

  // Mount the action layer on body so page containers cannot clip it.
  // This avoids invisible or clipped panels in Android WebView.
  // Mount before display so full-screen stacking contexts cannot cover it.
  if (panel.parentElement !== document.body) {
    document.body.appendChild(panel);
  }


  // Tapping the same post menu button again closes the panel.
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

const favoritePressState = {
  pointerId: null,
  button: null,
  timer: null,
  longPressTriggered: false
};
let suppressFavoriteClick = false;

function clearFavoritePress({ releaseCapture = true } = {}) {
  if (favoritePressState.timer !== null) {
    clearTimeout(favoritePressState.timer);
    favoritePressState.timer = null;
  }
  if (releaseCapture && favoritePressState.button && favoritePressState.pointerId !== null) {
    try {
      if (favoritePressState.button.hasPointerCapture?.(favoritePressState.pointerId)) {
        favoritePressState.button.releasePointerCapture(favoritePressState.pointerId);
      }
    } catch (_) {}
  }
  favoritePressState.pointerId = null;
  favoritePressState.button = null;
  favoritePressState.longPressTriggered = false;
}

document.addEventListener('pointerdown', event => {
  const button = event.target.closest('#postFavoriteAction[data-post-action="favorite"]');
  if (!button || event.button > 0 || event.isPrimary === false) return;

  clearFavoritePress();
  suppressFavoriteClick = false;
  favoritePressState.pointerId = event.pointerId;
  favoritePressState.button = button;
  favoritePressState.longPressTriggered = false;

  // Pointer capture keeps a small finger drift inside the same gesture instead
  // of letting WebView scrolling/media surfaces cancel the long press.
  try { button.setPointerCapture?.(event.pointerId); } catch (_) {}

  favoritePressState.timer = setTimeout(() => {
    if (favoritePressState.pointerId !== event.pointerId || favoritePressState.button !== button) return;
    favoritePressState.timer = null;
    favoritePressState.longPressTriggered = true;
    suppressFavoriteClick = true;
    if (navigator.vibrate) navigator.vibrate(28);
    void toggleSuperStarActivePost();
  }, 550);
});

document.addEventListener('pointerup', event => {
  if (favoritePressState.pointerId !== event.pointerId) return;
  clearFavoritePress();
});

document.addEventListener('pointercancel', event => {
  if (favoritePressState.pointerId !== event.pointerId) return;
  // A browser/system cancellation before the timer means the long press did
  // not complete. Pointer capture + touch-action:none makes this rare.
  clearFavoritePress();
});

document.addEventListener('lostpointercapture', event => {
  if (favoritePressState.pointerId !== event.pointerId) return;
  clearFavoritePress({ releaseCapture: false });
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

function formatPostTimestamp(post) {
  const parsed = Date.parse(post?.createdAt || '');
  const fallbackId = Number(post?.id);
  const timestamp = Number.isFinite(parsed)
    ? parsed
    : (Number.isFinite(fallbackId) && fallbackId > 0 ? fallbackId : NaN);

  if (!Number.isFinite(timestamp)) return String(post?.time || '');

  const date = new Date(timestamp);
  const customPattern = window.JetNoteDateTimeFormat?.customPattern?.();
  if (customPattern) {
    const formatted = window.JetNoteDateTimeFormat?.format?.(date, customPattern);
    if (formatted) return formatted;
  }

  const now = new Date();
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  const isToday = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();

  if (isToday) return `${hh}:${mm} Today`;
  if (date.getFullYear() === now.getFullYear()) return `${hh}:${mm} ${month}/${day}`;
  return `${hh}:${mm} ${date.getFullYear()}/${month}/${day}`;
}

function formatNowForPost() {
  return formatPostTimestamp({ createdAt: new Date().toISOString() });
}

window.addEventListener('jetnote:date-time-pattern-changed', () => {
  if (typeof renderPosts === 'function') renderPosts();
});

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
      else if (result.code === 'image-limit') alert(t('imageLimit'));
      else if (result.code === 'video-limit') alert(t('videoLimit'));
      else if (result.code === 'audio-limit' || result.code === 'video-photo-combined-limit') alert(t('attachmentLimit'));
      else if (result.code === 'save-failed') alert(result.error?.message || t('storageFull'));
      return;
    }
    closePostComposer();
    if (!commitResult.wasEditing) document.getElementById('mainPosts')?.scrollTo({ top: 0 });
  } finally {
    postPublishInFlight = false;
    if (publishButton?.isConnected) publishButton.disabled = false;
  }
}

/* ---------- Name ---------- */
