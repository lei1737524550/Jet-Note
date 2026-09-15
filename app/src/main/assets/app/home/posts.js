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
    super_star: Object.freeze({
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
    interaction_timing: Object.freeze({
      post_horizontal_ellipsis_menu_dismiss_delay_ms: 0,
      delete_content_to_border_clear_delay_ms: 140,
      delete_border_clear_to_reflow_delay_ms: 140,
      post_delete_reflow_animation_duration_ms: 320,
      post_reflow_animation: Object.freeze({
        speed_or_duration: 'speed',
        star_duration_ms: 900,
        cancel_star_duration_ms: 900,
        super_star_duration_ms: 900,
        cancel_super_star_duration_ms: 900,
        star_speed_px_per_second: 100,
        cancel_star_speed_px_per_second: 100,
        super_star_speed_px_per_second: 100,
        cancel_super_star_speed_px_per_second: 100
      }),
      post_star_highlight: Object.freeze({
        inset_width_px: 5,
        display_delay_after_reflow_ms: 300,
        normal: Object.freeze({
          change_count: 1,
          sequence: Object.freeze([{color: '#ffff00', duration_ms: 500}])
        }),
        super: Object.freeze({
          change_count: 1,
          sequence: Object.freeze([{color: '#ff0000', duration_ms: 500}])
        })
      })
    }),
    non_star: Object.freeze({
      border_rule: Object.freeze({
        change_count: 0,
        sequence: Object.freeze([{color: '#bfc1c4', duration_ms: 1000}])
      }),
      time_stamp_color: '999da2',
      time_stamp_top_margin: 3,
      time_stamp_bottom_margin: 3
    }),
    star: Object.freeze({
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

const HOME_DISPLAY_DEFAULTS = Object.freeze({
  top_post: true,
  post_composer: true,
  main_posts: true,
  star_post: true
});
let homeDisplayConfig = {...HOME_DISPLAY_DEFAULTS};

function effectiveHomeDisplay()
{
  const configured = {...HOME_DISPLAY_DEFAULTS, ...(homeDisplayConfig || {})};
  const debug = window.DebugConfigurationFeature?.enabled?.() === true;
  if (!debug) return configured;
  return {top_post:false, post_composer:false, main_posts:false, star_post:false};
}

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
      super_star: mergeObject(THREE_POST_ONE_BODY_DEFAULT_CONFIG.top_post.super_star, configured.top_post?.super_star)
    },
    post_composer: mergeObject(THREE_POST_ONE_BODY_DEFAULT_CONFIG.post_composer, configured.post_composer),
    main_posts: {
      ...THREE_POST_ONE_BODY_DEFAULT_CONFIG.main_posts,
      ...configured.main_posts,
      interaction_timing: mergeObject(THREE_POST_ONE_BODY_DEFAULT_CONFIG.main_posts.interaction_timing, configured.main_posts?.interaction_timing),
      non_star: mergeObject(THREE_POST_ONE_BODY_DEFAULT_CONFIG.main_posts.non_star, configured.main_posts?.non_star),
      star: mergeObject(THREE_POST_ONE_BODY_DEFAULT_CONFIG.main_posts.star, configured.main_posts?.star)
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
    window.__jetRuntimeConfig = config;
    welcomePostDefaultString = defaultString || WELCOME_POST_DEFAULT_STRING;
    threePostOneBodyConfig = configuredThreePostOneBody(config);
    homeDisplayConfig = {...HOME_DISPLAY_DEFAULTS, ...(config?.is_display || {})};
    applyThreePostOneBodyConfig();
    renderPosts();
  })
  .catch(() => { /* defaults remain active */ });

function getPostStarState(post) {
  return normalizeStarStateValue(post?.starState);
}

function setPostStarState(post, state) {
  if (!post) return;
  const normalized = state === 'super_star' ? 'super_star' : state === 'star' ? 'star' : 'none';
  post.starState = normalized;
  delete post.star;
}

function postPublishedAt(post) {
  const parsed = Date.parse(post?.createdAt || '');
  if (Number.isFinite(parsed)) return parsed;
  const id = Number(post?.id);
  return Number.isFinite(id) ? id : 0;
}

function getSuperStarPost() {
  return posts.find(post => getPostStarState(post) === 'super_star') || null;
}

function getMainPosts()
{
  const display = effectiveHomeDisplay();
  if (!display.main_posts) return [];
  const visible = posts.filter(post => getPostStarState(post) !== 'super_star');
  const regular = visible.filter(post => getPostStarState(post) !== 'star');
  const star = display.star_post
    ? visible.filter(post => getPostStarState(post) === 'star').sort((a, b) => postPublishedAt(b) - postPublishedAt(a))
    : [];
  return star.concat(regular);
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
  if (state === 'super_star') {
    return threePostOneBodyConfig.top_post?.super_star || THREE_POST_ONE_BODY_DEFAULT_CONFIG.top_post.super_star;
  }
  if (state === 'star') {
    return threePostOneBodyConfig.main_posts?.star || THREE_POST_ONE_BODY_DEFAULT_CONFIG.main_posts.star;
  }
  return threePostOneBodyConfig.main_posts?.non_star || THREE_POST_ONE_BODY_DEFAULT_CONFIG.main_posts.non_star;
}

function configPixelMargin(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(-1000, Math.min(number, 1000));
}

function normalizeRuleChangeCount(value) {
  const count = Number(value);
  if (count === -1) return -1;
  if (Number.isInteger(count) && count > 0) return count;
  return 0;
}

function resolvePostVisualState(state) {
  const config = postVisualConfigForState(state);
  const defaults = state === 'super_star'
    ? THREE_POST_ONE_BODY_DEFAULT_CONFIG.top_post.super_star
    : state === 'star'
      ? THREE_POST_ONE_BODY_DEFAULT_CONFIG.main_posts.star
      : THREE_POST_ONE_BODY_DEFAULT_CONFIG.main_posts.non_star;
  const timeColor = configBorderColor(config.time_stamp_color, configBorderColor(defaults.time_stamp_color, '#999da2'));
  const top = configPixelMargin(config.time_stamp_top_margin, defaults.time_stamp_top_margin);
  const bottom = configPixelMargin(config.time_stamp_bottom_margin, defaults.time_stamp_bottom_margin);

  const result = {
    state,
    timeColor,
    timeTopMargin: top,
    timeBottomMargin: bottom,
    highlight: null
  };

  if (state !== 'star' && state !== 'super_star') return result;

  const highlightConfig = threePostOneBodyConfig.main_posts?.interaction_timing?.post_star_highlight || {};
  const fallbackColor = state === 'super_star' ? '#ff0000' : '#ffff00';
  const fallbackRule = {change_count: 1, sequence: [{color: fallbackColor, duration_ms: 500}]};
  const rule = (state === 'super_star' ? highlightConfig.super : highlightConfig.normal) || fallbackRule;
  const configuredWidth = Number(highlightConfig.inset_width_px);
  const width = Math.max(0, Number.isFinite(configuredWidth) ? configuredWidth : 5);

  result.highlight = {
    width,
    mode: normalizeRuleChangeCount(rule?.change_count),
    sequence: normalizedBorderSequence(rule, fallbackColor),
    fallbackColor
  };
  return result;
}

function postVisualStyle(state) {
  const visual = resolvePostVisualState(state);
  return `--post-state-time-color:${visual.timeColor};--post-state-time-top-margin:${visual.timeTopMargin}px;--post-state-time-bottom-margin:${visual.timeBottomMargin}px`;
}

function normalizedBorderSequence(rule, fallbackColor) {
  const rawSequence = Array.isArray(rule?.sequence) ? rule.sequence : [];
  const sequence = rawSequence.map(item => ({
    color: configBorderColor(item?.color, ''),
    duration_ms: Math.max(0, Math.min(Number(item?.duration_ms) || 0, 86400000))
  })).filter(item => item.color);
  return sequence.length ? sequence : [{color: fallbackColor, duration_ms: 1000}];
}


// Star/Super-Star Shadow Insert is state-derived paint. DOM nodes are
// disposable: Debug toggles, imports and re-renders may replace them at any time.
// This controller is the single owner of highlight paint and animation lifetime.
const postHighlightRuns = new Map();
const postHighlightDeferredIds = new Set();

function cancelPostHighlightRun(key) {
  const run = postHighlightRuns.get(String(key));
  if (run) run.cancelled = true;
  postHighlightRuns.delete(String(key));
}

function cancelAllPostHighlightRuns() {
  for (const run of postHighlightRuns.values()) run.cancelled = true;
  postHighlightRuns.clear();
}

function postHighlightCardFor(post) {
  const state = getPostStarState(post);
  if (state === 'super_star') return document.getElementById('topPostCard');
  if (state === 'star') {
    const id = String(post.id).replace(/["']/g, '\\$&');
    return document.querySelector(`#mainPosts article.post[data-post-id="${id}"]`);
  }
  return null;
}

function applyResolvedHighlight(card, highlight, color) {
  if (!card || !highlight || highlight.width <= 0) return;
  card.style.setProperty('box-shadow', `inset 0 0 0 ${highlight.width}px ${color}`, 'important');
}

function reconcilePostHighlight(post) {
  if (!post) return;
  const key = String(post.id);
  cancelPostHighlightRun(key);

  if (postHighlightDeferredIds.has(key)) return;

  const state = getPostStarState(post);
  const visual = resolvePostVisualState(state);
  const card = postHighlightCardFor(post);
  if (!card || !visual.highlight || visual.highlight.width <= 0) return;

  const highlight = visual.highlight;
  const sequence = highlight.sequence;
  if (!sequence.length) return;

  // count=0 is a semantic persistent state. It is reconstructed from data and
  // config every time a card is rendered; no DOM inline state is authoritative.
  if (highlight.mode === 0) {
    applyResolvedHighlight(card, highlight, sequence[0].color);
    return;
  }

  // Infinite rules are stateful visuals too. A legitimate DOM rebuild starts a
  // fresh run on the replacement node and cancels the old node's run.
  if (highlight.mode === -1) {
    const run = {cancelled: false};
    postHighlightRuns.set(key, run);
    (async () => {
      let index = 0;
      while (!run.cancelled && card.isConnected && getPostStarState(post) === state) {
        const item = sequence[index];
        applyResolvedHighlight(card, highlight, item.color);
        await new Promise(resolve => setTimeout(resolve, Math.max(16, item.duration_ms)));
        index = (index + 1) % sequence.length;
      }
      if (postHighlightRuns.get(key) === run) postHighlightRuns.delete(key);
    })();
  }
}

function reconcileAllPostHighlights() {
  cancelAllPostHighlightRuns();
  for (const post of posts) reconcilePostHighlight(post);
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
  const mode = changeCount === -1 ? -1 : Number.isInteger(changeCount) && changeCount > 0 ? changeCount : 0;
  const root = document.documentElement;

  if (mode === 0 || sequence.length === 1) {
    root.style.setProperty(cssVariable, sequence[0].color);
    return;
  }

  let index = 0;
  let completedPasses = 0;
  const show = () => {
    const item = sequence[index];
    root.style.setProperty(cssVariable, item.color);

    const isLast = index === sequence.length - 1;
    if (mode > 0 && isLast && completedPasses + 1 >= mode) {
      threePostOneBodyBorderTimers.delete(name);
      return;
    }

    const wait = mode === -1 ? Math.max(16, item.duration_ms) : item.duration_ms;
    const timer = setTimeout(() => {
      if (isLast) completedPasses += 1;
      index = (index + 1) % sequence.length;
      show();
    }, wait);
    threePostOneBodyBorderTimers.set(name, timer);
  };
  show();
}

function restartThreePostOneBodyStateBorderRule(state) {
  if (state === 'star') {
    applyThreePostOneBodyBorderRule(
      'main_posts.star',
      threePostOneBodyConfig.main_posts?.star?.border_rule,
      '--three-post-one-body-main-posts-star-border-color'
    );
    return;
  }
  if (state === 'super_star') {
    applyThreePostOneBodyBorderRule(
      'top_post.super_star',
      threePostOneBodyConfig.top_post?.super_star?.border_rule,
      '--three-post-one-body-top-post-super-star-border-color'
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
    'top_post.super_star',
    threePostOneBodyConfig.top_post?.super_star?.border_rule,
    '--three-post-one-body-top-post-super-star-border-color'
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
    'main_posts.star',
    threePostOneBodyConfig.main_posts?.star?.border_rule,
    '--three-post-one-body-main-posts-star-border-color'
  );
}

window.addEventListener('pagehide', () => {
  cancelAllPostHighlightRuns();
  for (const name of [...threePostOneBodyBorderTimers.keys()]) stopThreePostOneBodyBorderRule(name);
});

function renderPublishedPostFooter(post) {
  return `<div class="post-footer-row"><div class="time">${escapeHTML(formatPostTimestamp(post))}</div></div>`;
}

function renderTopPost()
{
  const card = document.getElementById('topPostCard');
  if (!card) return;
  const visible = effectiveHomeDisplay().top_post;
  card.hidden = !visible;
  if (card.parentElement) card.parentElement.hidden = !visible;
  if (!visible)
  {
    releaseAttachmentUrls(card);
    card.innerHTML = '';
    return;
  }
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
  card.setAttribute('style', postVisualStyle('super_star'));
  card.innerHTML = `
    <div class="top-post-layout">
      <div class="top-post-content published-post-surface" data-post-id="${postId}">
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


function renderPosts(options = {}) {
  const list = document.getElementById('mainPosts');
  const composerMount = document.getElementById('postComposerMount');
  if (!list || !composerMount) return;

  const composerHTML = (isWorkspaceWritable() && effectiveHomeDisplay().post_composer) ? `
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
      <article class="post published-post-surface post-state-${getPostStarState(post) === 'star' ? 'star' : 'not-star'} three-posts-one-body__box common_border" data-post-id="${postId}" style="${postVisualStyle(getPostStarState(post))}">
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
  reconcileAllPostHighlights();
  hydrateAttachments(list);
  hydrateVideoAttachments(list);
  bindPublishedInlineImageZoom?.(list);
  if (options.scheduleFit !== false) requestAnimationFrame(fit);
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
    window.JetNoteMediaResourceManager?.releaseScope?.('home','open-post-composer');
    window.JetNoteVideoOverlay?.suspend?.();

    // X -> Editor: lay out the real destination first, then hand the whole
    // WebView to the native FrozenSplitTransition engine. Native captures one
    // immutable bitmap and splits that bitmap; the editor DOM is never cloned
    // or restyled by the transition.
    const transitionRoot = window.__jetRuntimeConfig?.frozen_split_transition
      || window.JetNoteConfig?.frozen_split_transition
      || {};
    const editorTransition = transitionRoot.x_to_editor || {};
    const splitMotionMs = Math.max(0, Number(editorTransition.duration_ms ?? 320));

    // X -> Editor is target-owned: every source uses the same Cover -> Prepare -> Capture transaction.
    const prepareEditor = () => {
      screen.classList.add('open');
      window.__jetSyncNativeVideoVisibility?.();
      document.body.style.overflow = 'hidden';
      ViewportManager.update();
    };
    if (window.JetTargetTransition?.toEditor) {
      void window.JetTargetTransition.toEditor(prepareEditor);
    } else {
      prepareEditor();
    }

    const focusComposer = () => {
      if (!screen.classList.contains('open')) return;
      textarea.focus({preventScroll:true});
      const end = textarea.value.length;
      try { textarea.setSelectionRange(end, end); } catch (_) {}
    };
    setTimeout(() => {
      if (!screen.classList.contains('open')) return;
      focusComposer();
      setTimeout(focusComposer, 80);
    }, splitMotionMs + 30);
    return true;
  } catch (error) {
    console.error('[Editor] open failed', error);
    EditorController.abortOpen?.();
    editingPostId = null;
    return false;
  }
}
// Restore the real editor focus/selection after the frozen bitmap layers are gone.
// The native transition keeps the WebView alive underneath its opaque backdrop.
window.addEventListener('jetnote:frozen-split-complete', event => {
  if (event?.detail?.target !== 'x_to_editor') return;
  const screen = document.getElementById('postComposeScreen');
  const textarea = document.getElementById('postComposerText');
  if (!screen?.classList.contains('open') || !textarea) return;
  requestAnimationFrame(() => {
    textarea.focus({preventScroll:true});
    const end = textarea.value.length;
    try { textarea.setSelectionRange(end, end); } catch (_) {}
    window.JetComposerCaret?.refresh?.();
  });
});

function closePostComposer() {
  if(entriesBusy)return;
  // Editor video is temporary. Stop/release it before the editor DOM is hidden
  // so no decoder, TextureView, seek state or callbacks leak back into the feed.
  const editorVideoPreview = document.getElementById('postVideoPreview');
  releaseVideoAttachmentUrls(editorVideoPreview);
  closeToolbox?.();
  initAudioDraft('post',null);
  const screen = document.getElementById('postComposeScreen');
  const prepareHome = () => {
    screen.classList.remove('open');
    window.__jetSyncNativeVideoVisibility?.();
    document.body.style.overflow = '';
    document.getElementById('postComposerText').value = '';
    editingPostId = null;
    postDraftImages = [];
    renderPostImagePreview();
    renderPostVideoPreview();
    void EditorController.discard();
  };
  if (window.JetTargetTransition?.toHome) {
    void window.JetTargetTransition.toHome(prepareHome);
  } else {
    prepareHome();
  }
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

function removePostDraftImage(indexOrId) {
  const id = String(indexOrId);
  const attachmentIndex = draftAttachments.post.findIndex(item => item?.type === 'image' && String(item.id) === id);
  if (attachmentIndex >= 0) {
    const item = draftAttachments.post[attachmentIndex];
    const url = NativeMedia.url(item);
    draftAttachments.post.splice(attachmentIndex, 1);
    draftMedia.post.delete(id);
    const imageIndex = postDraftImages.indexOf(url);
    if (imageIndex >= 0) postDraftImages.splice(imageIndex, 1);
  } else {
    const legacyIndex = Number(indexOrId);
    if (Number.isInteger(legacyIndex) && legacyIndex >= 0) postDraftImages.splice(legacyIndex, 1);
  }
  renderPostVisualMediaPreview();
  syncPostEditorDraft();
}

function renderPostImagePreview() {
  renderPostVisualMediaPreview();
}

async function handlePostVideos(event) {
  const picker = event.target;
  if (!isWorkspaceWritable()) { picker.value = ''; return; }
  const files = Array.from(picker.files || []);
  picker.value = '';
  const policy = window.JetNotePostAttachmentPolicy;
  await policy?.ready;
  const remaining = policy?.remaining('video', postDraftImages, draftAttachments.post) ?? 0;
  if (remaining <= 0) { alert(t('videoLimit')); return; }
  if (files.length > remaining) alert(t('videoLimit'));
  try {
    for (const file of files.slice(0, remaining)) {
      if (!file.type.startsWith('video/')) throw Error(t('videoOnly'));
      const bytes = new Uint8Array(await file.arrayBuffer());
      const meta = { id: entryUuid(), type:'video', mimeType:file.type || 'video/mp4', originalName:file.name,
        sourceMimeType:file.type || null, lastModified:file.lastModified, size:bytes.length, sha256:sha256(bytes) };
      draftMedia.post.set(meta.id, {...meta, blob:new Blob([bytes], {type:meta.mimeType})});
      draftAttachments.post.push(meta);
    }
    renderPostVisualMediaPreview();
    renderAudioDraft('post');
    syncPostEditorDraft();
  } catch (error) { alert(error.message); }
}

function removePostDraftVideo(id) {
  draftAttachments.post = draftAttachments.post.filter(item => String(item.id) !== String(id));
  draftMedia.post.delete(String(id));
  renderPostVisualMediaPreview();
  renderAudioDraft('post');
  syncPostEditorDraft();
}

function renderPostVideoPreview() {
  renderPostVisualMediaPreview();
}

function renderPostVisualMediaPreview() {
  const box = document.getElementById('postVisualMediaPreview');
  if (!box) return;
  releaseVideoAttachmentUrls(box);

  const representedImages = new Set();
  const visualItems = [];
  for (const item of draftAttachments.post || []) {
    if (item?.type === 'video') {
      visualItems.push({type:'video', item});
    } else if (item?.type === 'image') {
      const src = NativeMedia.url(item);
      representedImages.add(src);
      visualItems.push({type:'image', item, src});
    }
  }
  // Backward compatibility for posts created before image attachments carried
  // IDs. New media always follows draftAttachments order exactly.
  postDraftImages.forEach((src, index) => {
    if (!representedImages.has(src)) visualItems.push({type:'legacy-image', src, index});
  });

  box.innerHTML = visualItems.map(entry => {
    if (entry.type === 'video') {
      const id = escapeHTML(entry.item.id);
      return `<div class="video-attachment-shell compose-video-shell common_border">
        <div class="compose-video-item video-attachment-item native-video-card" data-media-id="${id}">
          <img class="video-poster" alt="" draggable="false">
          <button class="compose-image-remove adaptive-complement-remove" type="button"
                  onclick="event.stopPropagation(); removePostDraftVideo('${id}')" aria-label="${escapeHTML(t('remove'))}">×</button>
        </div>
        <div class="video-progress-track" role="slider" tabindex="0" aria-label="video position" aria-valuemin="0" aria-valuemax="1000" aria-valuenow="0"><div class="video-progress-fill"></div></div>
        <div class="video-inline-time">0:00/0:00</div>
      </div>`;
    }
    const key = entry.item ? `'${escapeHTML(entry.item.id)}'` : String(entry.index);
    return `<div class="compose-image-item common_border"><img src="${escapeHTML(entry.src)}" alt="" onclick="openImageViewer(this.src)">
      <button class="compose-image-remove adaptive-complement-remove" onclick="event.stopPropagation(); removePostDraftImage(${key})" aria-label="remove">×</button></div>`;
  }).join('') + (visualItems.length > 3 ? '<div class="compose-media-more-indicator" aria-hidden="true"><img src="shared/icons/more_vertical.svg" alt=""></div>' : '');

  hydrateVideoAttachments(box, draftMedia.post);
}

let activePostActionId = null;
let activePostActionAnchor = null;
let postHorizontalEllipsisDismissTimer = null;
let postHorizontalEllipsisDismissToken = 0;

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

function postInteractionDelay(name, fallback) {
  const configured = Number(threePostOneBodyConfig.main_posts?.interaction_timing?.[name]);
  if (!Number.isFinite(configured)) return fallback;
  return Math.max(0, Math.min(configured, 60000));
}

function waitForPostInteractionDelay(name, fallback) {
  const delay = postInteractionDelay(name, fallback);
  return delay > 0 ? new Promise(resolve => setTimeout(resolve, delay)) : Promise.resolve();
}

function cancelPostHorizontalEllipsisDismissTimer() {
  postHorizontalEllipsisDismissToken += 1;
  if (postHorizontalEllipsisDismissTimer !== null) {
    clearTimeout(postHorizontalEllipsisDismissTimer);
    postHorizontalEllipsisDismissTimer = null;
  }
}

function schedulePostHorizontalEllipsisDismiss(postId) {
  cancelPostHorizontalEllipsisDismissTimer();
  const token = postHorizontalEllipsisDismissToken;
  const delay = postInteractionDelay('post_horizontal_ellipsis_menu_dismiss_delay_ms', 0);
  const dismiss = () => {
    if (token !== postHorizontalEllipsisDismissToken) return;
    postHorizontalEllipsisDismissTimer = null;
    if (String(activePostActionId) === String(postId)) closePostActionPanel();
  };
  if (delay <= 0) {
    dismiss();
    return;
  }
  // T=0 is the user's star/unstar action, not the end of reflow/highlight/save.
  postHorizontalEllipsisDismissTimer = setTimeout(dismiss, delay);
}

const POST_UI_SOUND_PATHS = Object.freeze({
  star: 'shared/sounds/star.ogg',
  super_star: 'shared/sounds/super_star.ogg',
  cancel_star: 'shared/sounds/cancel_star.ogg',
  open_trash: 'shared/sounds/open_trash.ogg',
  delete_it: 'shared/sounds/delete_it.ogg',
  send_post: 'shared/sounds/send_post.ogg',
  error: 'shared/sounds/error.ogg'
});

function playPostUiSound(name) {
  const source = POST_UI_SOUND_PATHS[name];
  if (!source) return;
  try {
    const audio = new Audio(source);
    audio.preload = 'auto';
    audio.play().catch(() => {});
  } catch (_) {}
}

function closePostActionPanel() {
  cancelPostHorizontalEllipsisDismissTimer();
  const panel = document.getElementById('postActionPanel');
  if (panel) panel.classList.remove('open');
  activePostActionId = null;
  activePostActionAnchor = null;
  // Re-evaluate the native TextureView only after the HTML overlay has closed.
  window.__jetSyncNativeVideoVisibility?.();
}

function syncPostStarAction() {
  const button = document.getElementById('postStarAction');
  if (!button) return;

  const post = posts.find(item => String(item.id) === String(activePostActionId));
  const state = getPostStarState(post);
  button.classList.toggle('active', state === 'star');
  button.classList.toggle('super-active', state === 'super_star');
  button.setAttribute('aria-pressed', state === 'none' ? 'false' : 'true');
  button.setAttribute('data-star-state', state);
  const icon = button.querySelector('.post-action-star');
  if (icon) icon.src = state === 'super_star' ? 'shared/icons/star_super.svg' : state === 'star' ? 'shared/icons/star_active.svg' : 'shared/icons/star.svg';
}

let postReflowTransactionActive = false;

function nextAnimationFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve));
}

// Star/Super-Star camera -------------------------------------------------------
// The post being acted on is the camera target for the entire reflow. The hard
// invariant is that the target may never leave the visual viewport. Whenever
// document bounds permit it, keep the target's visual centre on the viewport
// centre; near the top/bottom bounds, clamp the camera while preserving full
// target visibility. This applies equally to star, super-star and both cancel
// paths because they all pass through animatePostReflow().
function postReflowCameraViewport() {
  const viewport = window.visualViewport;
  return {
    top: viewport?.offsetTop || 0,
    height: Math.max(1, viewport?.height || window.innerHeight || document.documentElement.clientHeight || 1)
  };
}

function postReflowCameraTarget(postId) {
  if (postId === null || postId === undefined) return null;
  const id = String(postId);
  return postReflowCards().find(item => item.id === id)?.card || null;
}

function followPostReflowCamera(postId) {
  const card = postReflowCameraTarget(postId);
  if (!card || !card.isConnected) return false;

  const rect = card.getBoundingClientRect();
  const viewport = postReflowCameraViewport();
  const viewportCenter = viewport.top + viewport.height / 2;
  const targetCenter = rect.top + rect.height / 2;
  const maxScrollY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

  // Centre first. Clamping at document edges is the only reason the target may
  // not be exactly centred. scrollTo is synchronous in Android WebView, so the
  // next painted frame already uses the corrected camera position.
  let desiredScrollY = Math.max(0, Math.min(maxScrollY, window.scrollY + targetCenter - viewportCenter));
  window.scrollTo(window.scrollX, desiredScrollY);

  // Re-read after clamping and enforce the absolute no-out-of-frame condition.
  // This also handles a target taller than the usable viewport as gracefully as
  // possible by pinning its nearest edge rather than allowing camera drift.
  const corrected = card.getBoundingClientRect();
  const visibleTop = viewport.top;
  const visibleBottom = viewport.top + viewport.height;
  if (corrected.top < visibleTop) {
    desiredScrollY = Math.max(0, window.scrollY + corrected.top - visibleTop);
    window.scrollTo(window.scrollX, desiredScrollY);
  } else if (corrected.bottom > visibleBottom) {
    desiredScrollY = Math.min(maxScrollY, window.scrollY + corrected.bottom - visibleBottom);
    window.scrollTo(window.scrollX, desiredScrollY);
  }
  return true;
}

function startPostReflowCamera(postId) {
  if (postId === null || postId === undefined) return () => {};
  let active = true;
  let frame = 0;
  const tick = () => {
    if (!active) return;
    followPostReflowCamera(postId);
    frame = requestAnimationFrame(tick);
  };
  followPostReflowCamera(postId);
  frame = requestAnimationFrame(tick);
  return () => {
    active = false;
    if (frame) cancelAnimationFrame(frame);
    // Final stable composition: target centred whenever document bounds allow.
    followPostReflowCamera(postId);
  };
}

function postReflowCards() {
  const cards = [];
  document.querySelectorAll('#mainPosts article.post[data-post-id]').forEach(card => {
    cards.push({id: String(card.dataset.postId), card, index: cards.length, surface: 'main'});
  });
  const topCard = document.getElementById('topPostCard');
  const topContent = topCard?.querySelector('.top-post-content[data-post-id]');
  if (topCard && topContent) {
    cards.push({id: String(topContent.dataset.postId), card: topCard, index: -1, surface: 'top'});
  }
  return cards;
}

function capturePostReflowRects() {
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const rects = new Map();
  const indexes = new Map();
  const surfaces = new Map();
  for (const item of postReflowCards()) {
    indexes.set(item.id, item.index);
    surfaces.set(item.id, item.surface);
    const r = item.card.getBoundingClientRect();
    // Keep off-screen cards too. Star speed is defined in viewport pixels per
    // second, so an active Post far below the viewport must retain its full First
    // position instead of falling back to an effectively instantaneous reorder.
    rects.set(item.id, r);
  }
  return {rects, indexes, surfaces, viewportHeight, scrollX: window.scrollX, scrollY: window.scrollY};
}

function resolvePostReflowTiming(actionName, movements, activePostId = null, fallback = 900) {
  const config = threePostOneBodyConfig.main_posts?.interaction_timing?.post_reflow_animation || {};
  const choice = String(config.speed_or_duration || 'duration').trim().toLowerCase();
  const maximumDistance = movements.reduce((maximum, item) => Math.max(maximum, Number(item.distance) || 0), 0);

  let commonDurationMs = 0;
  if (choice === 'speed') {
    const configuredReferenceSpeed = Number(config[`${actionName}_speed_px_per_second`]);
    if (Number.isFinite(configuredReferenceSpeed) && configuredReferenceSpeed > 0 && maximumDistance > 0) {
      // Jet Note maximum-distance shared-duration model:
      // D_max = max(D_i), T = D_max / V_ref, T_i = T, V_i = D_i / T.
      // The configured speed belongs only to the farthest-moving Post in this
      // transaction. Every shorter movement derives its speed from the shared T.
      commonDurationMs = (maximumDistance / configuredReferenceSpeed) * 1000;
    }
  } else {
    const configuredDuration = Number(config[`${actionName}_duration_ms`]);
    commonDurationMs = Math.max(0, Number.isFinite(configuredDuration) ? configuredDuration : fallback);
  }

  return movements.map(item => ({
    ...item,
    duration: commonDurationMs,
    effectiveSpeedPxPerSecond: commonDurationMs > 0
      ? (Number(item.distance) || 0) / (commonDurationMs / 1000)
      : 0
  }));
}

async function animatePostReflow(snapshot, actionName, activePostId = null, fallback = 900) {
  if (!snapshot) return;
  window.scrollTo(snapshot.scrollX, snapshot.scrollY);

  // FLIP cards can live in different stacking contexts. In particular, Main
  // Posts is intentionally isolated, so a large z-index on an active Main card
  // cannot outrank a sibling Top Post by itself. Promote the active card's whole
  // surface for the duration of the transaction; the active card still outranks
  // passive cards inside that surface below. This prevents one/few-frame paint
  // flashes where a passive Post crosses over the Post the user just acted on.
  const activeId = activePostId === null || activePostId === undefined ? null : String(activePostId);
  const activeSurfaceItem = activeId === null ? null : postReflowCards().find(item => item.id === activeId);
  const promotedSurface = activeSurfaceItem?.surface === 'main'
    ? document.getElementById('mainPosts')
    : activeSurfaceItem?.surface === 'top'
      ? document.querySelector('.home-actions')
      : null;
  const previousSurfacePosition = promotedSurface?.style.position || '';
  const previousSurfaceZIndex = promotedSurface?.style.zIndex || '';
  if (promotedSurface) {
    if (getComputedStyle(promotedSurface).position === 'static') promotedSurface.style.position = 'relative';
    promotedSurface.style.zIndex = '20000';
  }
  const restorePromotedSurface = () => {
    if (!promotedSurface) return;
    promotedSurface.style.zIndex = previousSurfaceZIndex;
    promotedSurface.style.position = previousSurfacePosition;
  };

  const prepared = [];
  for (const item of postReflowCards()) {
    const postId = item.id;
    const before = snapshot.rects.get(postId);
    if (!before) continue;
    const after = item.card.getBoundingClientRect();

    const beforeSurface = snapshot.surfaces?.get(postId);
    const beforeIndex = snapshot.indexes?.get(postId);
    const changedSurface = beforeSurface !== item.surface;
    const changedSlot = item.surface === 'main' && Number.isInteger(beforeIndex) && beforeIndex !== item.index;
    if (!changedSurface && !changedSlot) continue;

    const dx = before.left - after.left;
    const dy = before.top - after.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    const distance = Math.hypot(dx, dy);
    if (distance <= 0) continue;

    const isActivePost = activePostId !== null && postId === String(activePostId);
    const card = item.card;

    // z-index is ineffective on a static box. Make every moving card positioned,
    // and give the actively stard card an unambiguous animation plane above
    // all passive reflow cards. This is especially important for Main -> Top moves.
    const previousPosition = card.style.position;
    const previousZIndex = card.style.zIndex;
    const previousTransition = card.style.transition;
    const previousTransform = card.style.transform;
    const previousWillChange = card.style.willChange;
    card.style.position = 'relative';
    card.style.zIndex = isActivePost ? '10000' : '1000';
    card.style.willChange = 'transform';
    card.style.transition = 'none';
    card.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    prepared.push({postId, card, dx, dy, distance, previousPosition, previousZIndex, previousTransition, previousTransform, previousWillChange});
  }

  if (!prepared.length) {
    restorePromotedSurface();
    return;
  }
  const timedPrepared = resolvePostReflowTiming(actionName, prepared, activePostId, fallback).filter(item => item.duration > 0);
  if (!timedPrepared.length) {
    followPostReflowCamera(activePostId);
    restorePromotedSurface();
    return;
  }
  const stopCameraFollow = startPostReflowCamera(activePostId);

  // Transactional FLIP barrier for Android WebView:
  // 1) synchronously commit every inverse transform, then
  // 2) cross two compositor frame boundaries before Play.
  // This prevents the rebuilt Last layout from leaking as a one-frame image.
  void document.documentElement.offsetHeight;
  await nextAnimationFrame();
  // Re-read one animated box after the first frame. This keeps the inverse state
  // materialized in layout/compositing before transition is enabled.
  void timedPrepared[0].card.getBoundingClientRect().top;
  await nextAnimationFrame();

  const waits = timedPrepared.map(item => new Promise(resolve => {
    const {card, duration} = item;
    let finished = false;
    const cleanup = () => {
      if (finished) return;
      finished = true;
      card.removeEventListener('transitionend', onEnd);
      clearTimeout(timer);
      card.style.transition = item.previousTransition;
      card.style.transform = item.previousTransform;
      card.style.willChange = item.previousWillChange;
      card.style.zIndex = item.previousZIndex;
      card.style.position = item.previousPosition;
      resolve();
    };
    const onEnd = event => {
      if (event.target === card && event.propertyName === 'transform') cleanup();
    };
    card.addEventListener('transitionend', onEnd);
    card.style.transition = `transform ${duration}ms linear`; // constant px/s requires linear interpolation
    card.style.transform = 'translate3d(0, 0, 0)';
    const timer = setTimeout(cleanup, duration + 120);
  }));
  try {
    await Promise.all(waits);
  } finally {
    stopCameraFollow();
    restorePromotedSurface();
  }
}

function postStarHighlightDisplayDelayMs() {
  const value = Number(threePostOneBodyConfig.main_posts?.interaction_timing?.post_star_highlight?.display_delay_after_reflow_ms);
  return Math.max(0, Number.isFinite(value) ? value : 300);
}

async function highlightStarPost(postId, superStar) {
  const post = posts.find(item => String(item.id) === String(postId));
  if (!post) return;
  const visual = resolvePostVisualState(superStar ? 'super_star' : 'star');
  const highlight = visual.highlight;
  if (!highlight || highlight.width <= 0) return;

  // Persistent and infinite modes are owned by the reconciler, never by this
  // interaction path. This prevents two competing animation loops.
  if (highlight.mode <= 0) {
    reconcilePostHighlight(post);
    return;
  }

  const card = postHighlightCardFor(post);
  if (!card) return;
  const key = String(post.id);
  cancelPostHighlightRun(key);
  const run = {cancelled: false};
  postHighlightRuns.set(key, run);
  const originalShadow = card.style.getPropertyValue('box-shadow');
  const originalPriority = card.style.getPropertyPriority('box-shadow');

  for (let pass = 0; pass < highlight.mode && !run.cancelled; pass += 1) {
    for (const item of highlight.sequence) {
      if (run.cancelled || !card.isConnected) break;
      applyResolvedHighlight(card, highlight, item.color);
      if (item.duration_ms > 0) await new Promise(resolve => setTimeout(resolve, item.duration_ms));
    }
  }

  if (postHighlightRuns.get(key) === run) postHighlightRuns.delete(key);
  if (run.cancelled || !card.isConnected) return;
  if (originalShadow) card.style.setProperty('box-shadow', originalShadow, originalPriority);
  else card.style.removeProperty('box-shadow');
}

async function commitStarStateChange(previous, reflowActionName, activePostId, highlight = null) {
  const snapshot = capturePostReflowRects();
  if (highlight?.postId !== undefined && highlight?.postId !== null) postHighlightDeferredIds.add(String(highlight.postId));
  syncPostStarAction();

  const beforeMainIds = previous
    .filter(post => getPostStarState(post) !== 'super_star')
    .sort((a, b) => {
      const as = getPostStarState(a) === 'star', bs = getPostStarState(b) === 'star';
      if (as !== bs) return as ? -1 : 1;
      return as ? postPublishedAt(b) - postPublishedAt(a) : 0;
    })
    .map(post => String(post.id));
  const afterMainIds = getMainPosts().map(post => String(post.id));
  const sameMainGeometry = beforeMainIds.length === afterMainIds.length
    && beforeMainIds.every((id, index) => id === afterMainIds[index]);

  if (sameMainGeometry) {
    // No list slot changed. Rebuilding innerHTML here used to briefly remove the
    // Post and expose the frame/background underneath, even though no movement
    // was required. Update only state-dependent paint on the existing cards.
    document.querySelectorAll('#mainPosts article.post[data-post-id]').forEach(card => {
      const post = posts.find(item => String(item.id) === String(card.dataset.postId));
      if (!post) return;
      const state = getPostStarState(post);
      card.classList.toggle('post-state-star', state === 'star');
      card.classList.toggle('post-state-not-star', state !== 'star');
      card.setAttribute('style', postVisualStyle(state));
    });
    reconcileAllPostHighlights();
    // Even when no slot changes, the acted-on Post remains the camera target.
    followPostReflowCamera(activePostId);
  } else {
    // Rebuild only when the list really reorders. fit() remains outside FLIP so
    // layout cannot change underneath a moving Post and leak an intermediate frame.
    renderPosts({scheduleFit: false});
    await animatePostReflow(snapshot, reflowActionName, activePostId, 900);
    requestAnimationFrame(fit);
  }
  if (highlight) {
    const highlightId = String(highlight.postId);
    const delay = postStarHighlightDisplayDelayMs();
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
    postHighlightDeferredIds.delete(highlightId);
    await highlightStarPost(highlight.postId, highlight.superStar);
  }
  const saved = await savePosts();
  if (!saved) {
    if (highlight?.postId !== undefined && highlight?.postId !== null) postHighlightDeferredIds.delete(String(highlight.postId));
    posts = previous;
    renderPosts();
    syncPostStarAction();
    return false;
  }
  return true;
}

async function toggleStarActivePost() {
  if (!isWorkspaceWritable() || activePostActionId === null || postReflowTransactionActive) return;
  const actionPostId = String(activePostActionId);
  const post = posts.find(item => String(item.id) === actionPostId);
  if (!post) return;

  const previous = structuredClone(posts);
  const state = getPostStarState(post);
  const nextState = state === 'none' ? 'star' : 'none';
  setPostStarState(post, nextState);
  if (nextState === 'star') restartThreePostOneBodyStateBorderRule('star');

  // Sound is direct interaction feedback: start it before persistence/render work.
  playPostUiSound(nextState === 'star' ? 'star' : 'cancel_star');
  schedulePostHorizontalEllipsisDismiss(actionPostId);

  // Keep the action surface visible after the state changes so the user can
  // perceive the result. The delay is a home-post setting in config.json.
  postReflowTransactionActive = true;
  let saved = false;
  try {
    saved = await commitStarStateChange(
      previous,
      nextState === 'star' ? 'star' : (state === 'super_star' ? 'cancel_super_star' : 'cancel_star'),
      actionPostId,
      nextState === 'star' ? {postId: actionPostId, superStar: false} : null
    );
  } finally {
    postReflowTransactionActive = false;
  }
  if (!saved) return;
}

async function toggleSuperStarActivePost() {
  if (!isWorkspaceWritable() || activePostActionId === null || postReflowTransactionActive) return;
  const actionPostId = String(activePostActionId);
  const post = posts.find(item => String(item.id) === actionPostId);
  if (!post) return;

  const previous = structuredClone(posts);
  // Long-press is an idempotent "make this the Super Star" action.
  for (const item of posts) {
    if (item !== post && getPostStarState(item) === 'super_star') setPostStarState(item, 'none');
  }
  setPostStarState(post, 'super_star');
  restartThreePostOneBodyStateBorderRule('super_star');

  playPostUiSound('super_star');
  schedulePostHorizontalEllipsisDismiss(actionPostId);
  postReflowTransactionActive = true;
  let saved = false;
  try {
    saved = await commitStarStateChange(
      previous,
      'super_star',
      actionPostId,
      {postId: actionPostId, superStar: true}
    );
  } finally {
    postReflowTransactionActive = false;
  }
  if (!saved) return;

  // Preserve the existing Super Star home-return behavior, but only after the
  // configured result-display interval has completed.
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

  // Menus must not inherit live media/pointer state from the feed.
  window.JetNoteMediaResourceManager?.releaseScope?.('home','post-action-panel');
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
  syncPostStarAction();
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
  playPostUiSound('open_trash');
  openDeleteConfirm('post', postId, anchorRect);
}

const starPressState = {
  pointerId: null,
  button: null,
  timer: null,
  longPressTriggered: false
};
let suppressStarClick = false;

function clearStarPress({ releaseCapture = true } = {}) {
  if (starPressState.timer !== null) {
    clearTimeout(starPressState.timer);
    starPressState.timer = null;
  }
  if (releaseCapture && starPressState.button && starPressState.pointerId !== null) {
    try {
      if (starPressState.button.hasPointerCapture?.(starPressState.pointerId)) {
        starPressState.button.releasePointerCapture(starPressState.pointerId);
      }
    } catch (_) {}
  }
  starPressState.pointerId = null;
  starPressState.button = null;
  starPressState.longPressTriggered = false;
}

document.addEventListener('pointerdown', event => {
  const button = event.target.closest('#postStarAction[data-post-action="star"]');
  if (!button || event.button > 0 || event.isPrimary === false) return;

  clearStarPress();
  suppressStarClick = false;
  starPressState.pointerId = event.pointerId;
  starPressState.button = button;
  starPressState.longPressTriggered = false;

  // Pointer capture keeps a small finger drift inside the same gesture instead
  // of letting WebView scrolling/media surfaces cancel the long press.
  try { button.setPointerCapture?.(event.pointerId); } catch (_) {}

  starPressState.timer = setTimeout(() => {
    if (starPressState.pointerId !== event.pointerId || starPressState.button !== button) return;
    starPressState.timer = null;
    starPressState.longPressTriggered = true;
    suppressStarClick = true;
    if (navigator.vibrate) navigator.vibrate(28);
    void toggleSuperStarActivePost();
  }, 550);
});

document.addEventListener('pointerup', event => {
  if (starPressState.pointerId !== event.pointerId) return;
  clearStarPress();
});

document.addEventListener('pointercancel', event => {
  if (starPressState.pointerId !== event.pointerId) return;
  // A browser/system cancellation before the timer means the long press did
  // not complete. Pointer capture + touch-action:none makes this rare.
  clearStarPress();
});

document.addEventListener('lostpointercapture', event => {
  if (starPressState.pointerId !== event.pointerId) return;
  clearStarPress({ releaseCapture: false });
});

document.addEventListener('contextmenu', event => {
  if (event.target.closest('#postStarAction')) event.preventDefault();
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
    if (action === 'star') {
      if (suppressStarClick) { suppressStarClick = false; return; }
      void toggleStarActivePost();
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
  const isCreatingPost = EditorController.state !== EditorController.State.EDITING;
  if (isCreatingPost) playPostUiSound('send_post');
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
