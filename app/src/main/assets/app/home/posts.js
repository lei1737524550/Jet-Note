const POSTS_KEY = 'qzone_text_posts_v1';

const DEFAULT_POSTS = [];

let posts = loadPosts();
let editingPostId = null;
let postDraftImages = [];
const expandedPostIds = new Set();
const COLLAPSED_POST_LINE_LIMIT = 8;
const POST_FADE_CHARACTER_LIMIT = 6;

const THREE_POST_ONE_BODY_DEFAULT_CONFIG = Object.freeze({
  vertical_move_px: -32,
  surface_vertical_gap_px: 6,
  font_size_px: 17,
  top_post: Object.freeze({
    super_star: Object.freeze({
      border_rule: Object.freeze({
        change_count: 0,
        sequence: Object.freeze([{color: '#bfc1c4', duration_ms: 1000}])
      }),
      time_stamp_color: '999da2',
      time_stamp_top_margin: 10,
      time_stamp_bottom_margin: 3
    })
  }),
  post_composer: Object.freeze({
    border_rule: Object.freeze({
      change_count: 0,
      sequence: Object.freeze([{color: '#00dddd', duration_ms: 1000}])
    })
  }),
  main_posts: Object.freeze({
    interaction_timing: Object.freeze({
      // Fallback only: used if the real Home config cannot provide this value.
      // The normally effective value is in: app/src/main/assets/config/home.json
      //   main_posts.interaction_timing.post_horizontal_ellipsis_menu_dismiss_delay_ms
      post_horizontal_ellipsis_menu_dismiss_delay_ms: 100,
      delete_content_to_border_clear_delay_ms: 140,
      delete_border_clear_to_reflow_delay_ms: 140,
      post_delete_reflow_animation_duration_ms: 320,
      post_reflow_animation: Object.freeze({
        speed_or_duration: 'speed',
        star: Object.freeze({ duration_ms: 150, speed_px_per_second: 3600 }),
        cancel_star: Object.freeze({ duration_ms: 150, speed_px_per_second: 3600 }),
        super_star: Object.freeze({ duration_ms: 150, speed_px_per_second: 3600 }),
        cancel_super_star: Object.freeze({ duration_ms: 150, speed_px_per_second: 3600 })
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
        change_count: 0,
        sequence: Object.freeze([{color: '#bfc1c4', duration_ms: 1000}])
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
    top_post: {
      ...THREE_POST_ONE_BODY_DEFAULT_CONFIG.top_post,
      ...configured.top_post,
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

fetch('config.json', {cache: 'no-store'})
  .then(response => response.ok ? response.json() : Promise.reject(new Error('config.json load failed')))
  .then(config => {
    window.__jetRuntimeConfig = config;
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
  const previous = getPostStarState(post);
  const normalized = state === 'super_star' ? 'super_star' : state === 'star' ? 'star' : 'none';
  post.starState = normalized;

  // Ordinary favorites are ordered by the moment they ENTER the favorite area,
  // not by the Post publication timestamp. Re-favoriting therefore moves the
  // Post back to the top of the ordinary favorite area.
  if (normalized === 'star' && previous !== 'star') {
    post.starredAt = new Date().toISOString();
  }

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

function comparePostDisplayOrder(a, b) {
  const timeDifference = postPublishedAt(b) - postPublishedAt(a);
  if (timeDifference !== 0) return timeDifference;

  // Equal timestamps are deterministic: the lexicographically larger ID is
  // displayed first. IDs remain identity/tie-break data; timestamps are still
  // the primary ordering rule.
  return String(b?.id ?? '').localeCompare(String(a?.id ?? ''));
}

function getMainPosts()
{
  const display = effectiveHomeDisplay();
  if (!display.main_posts) return [];
  const visible = posts.filter(post => getPostStarState(post) !== 'super_star');
  const regular = visible
    .filter(post => getPostStarState(post) !== 'star')
    .sort(comparePostDisplayOrder);
  const star = display.star_post
    ? visible.filter(post => getPostStarState(post) === 'star').sort((a, b) => {
        const aStarred = Date.parse(a?.starredAt || '');
        const bStarred = Date.parse(b?.starredAt || '');
        const aHasStarredAt = Number.isFinite(aStarred);
        const bHasStarredAt = Number.isFinite(bStarred);
        if (aHasStarredAt && bHasStarredAt && aStarred !== bStarred) return bStarred - aStarred;
        if (aHasStarredAt !== bHasStarredAt) return aHasStarredAt ? -1 : 1;
        // Legacy favorites do not have starredAt. Keep their old deterministic
        // publication-time order until the user favorites them again.
        return comparePostDisplayOrder(a, b);
      })
    : [];
  return star.concat(regular);
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
  const id = String(post.id).replace(/["']/g, '\\$&');
  if (state === 'super_star') return document.querySelector(`#topPostCard[data-post-id="${id}"] .post-surface[data-post-role="top"]`);
  if (state === 'star') return document.querySelector(`#mainPosts .post-surface[data-post-id="${id}"]`);
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
  root.style.setProperty(
    '--post-surface-vertical-gap',
    `${configVerticalPixelOffset(threePostOneBodyConfig.surface_vertical_gap_px, THREE_POST_ONE_BODY_DEFAULT_CONFIG.surface_vertical_gap_px)}px`
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

function postExpandIcon(expanded) {
  const file = expanded ? 'collapse_toward_center.svg' : 'expand_broad_v.svg';
  return `<img src="shared/icons/${file}" alt="" aria-hidden="true">`;
}

function renderPublishedPostHeader(post, postId) {
  const expanded = expandedPostIds.has(String(post.id));
  return `<div class="post-head post-head-minimal">
    <div class="time">${escapeHTML(formatPostTimestamp(post))}</div>
    <div class="post-head-actions">
      <button class="post-text-toggle" type="button" data-post-id="${postId}"
              onclick="togglePublishedPostText(this.dataset.postId)"
              aria-label="${escapeHTML(t(expanded ? 'collapsePostText' : 'expandPostText'))}" aria-expanded="${expanded}" hidden>
        ${postExpandIcon(expanded)}
      </button>
      ${isWorkspaceWritable() ? `<button class="more" data-post-id="${postId}" onclick="openPostActionPanel(event, this.dataset.postId)" aria-label="${escapeHTML(t('moreActions'))}">${moreMenuIcon()}</button>` : ''}
    </div>
  </div>`;
}

// ── Unified Post Surface ───────────────────────────────────────────────────
// There is one Post surface model on Home. "top", "main" and "composer" are
// roles, not separate component species. Role-specific markup is additive and
// must not create a second ownership model for Post identity/geometry.
const POST_SURFACE_ROLE = Object.freeze({ MAIN:'main', TOP:'top', COMPOSER:'composer' });

function renderPostSurface(post, role = POST_SURFACE_ROLE.MAIN) {
  if (role === POST_SURFACE_ROLE.COMPOSER) {
    return `
      <div class="post post-surface post-role-composer post-composer three-posts-one-body__box common_border"
           data-post-role="composer">
        <button class="post-composer-main" type="button" data-editor-open="create" data-i18n="share">${escapeHTML(t('share'))}</button>
        <button class="post-composer-media-button" onclick="openPostComposerWithImagePicker()" aria-label="${escapeHTML(t('addImage'))}"><img src="shared/icons/image.svg" alt=""></button>
        <button class="post-composer-media-button post-composer-audio-button" onclick="openPostComposerWithAudioPicker()" aria-label="${escapeHTML(t('addAudio'))}"><img src="shared/icons/audio.svg" alt=""></button>
        <button class="post-composer-media-button" onclick="openPostComposerWithVideoPicker()" aria-label="${escapeHTML(t('addVideo'))}"><img src="shared/icons/video.svg" alt=""></button>
      </div>`;
  }

  if (!post) return '';
  const state = getPostStarState(post);
  const postId = escapeHTML(String(post.id));
  const images = Array.isArray(post.images) ? post.images : [];
  const attachments = renderAttachments(post.attachments);
  const media = renderPublishedVisualMediaHTML(images, post.attachments);
  const text = `<div class="post-text-drawer"><div class="text-content">${escapeHTML(post.text || '')}</div></div>`;
  const clear = '<div class="post-content-clear" aria-hidden="true"></div>';
  const roleClass = role === POST_SURFACE_ROLE.TOP ? 'post-role-top' : 'post-role-main';
  const stateClass = state === 'star' ? 'star' : 'not-star';

  // Main and Top deliberately share the exact same Post DOM. Top is a role/state,
  // never a second component tree. This keeps media/content containing blocks,
  // padding and menu geometry identical across a promotion/demotion transaction.
  return `
    <article class="post post-surface published-post-surface ${roleClass} post-state-${stateClass} three-posts-one-body__box common_border"
             data-post-role="${role}" data-post-id="${postId}" style="${postVisualStyle(role === POST_SURFACE_ROLE.TOP ? 'super_star' : state)}">
      ${renderPublishedPostHeader(post, postId)}
      ${attachments}${text}${clear}${media}
    </article>`;
}

function postTextVisualLines(element) {
  const textNode = element?.firstChild;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE || !textNode.data) return [];
  const lines = [];
  let offset = 0;
  for (const character of Array.from(textNode.data)) {
    const nextOffset = offset + character.length;
    const range = document.createRange();
    range.setStart(textNode, offset);
    range.setEnd(textNode, nextOffset);
    const rect = range.getClientRects()[0];
    if (rect && rect.height > 0) {
      let line = lines[lines.length - 1];
      if (!line || Math.abs(line.top - rect.top) > 2) {
        line = {top: rect.top, start: offset, end: nextOffset};
        lines.push(line);
      } else {
        line.end = nextOffset;
      }
    }
    offset = nextOffset;
  }
  return lines;
}

function applyCollapsedPostText(element) {
  const fullText = element.dataset.fullText ?? element.textContent ?? '';
  element.textContent = fullText;
  const lines = postTextVisualLines(element);
  const article = element.closest('.published-post-surface');
  const button = article?.querySelector('.post-text-toggle');
  const postId = String(article?.dataset.postId || '');
  const overLimit = lines.length > COLLAPSED_POST_LINE_LIMIT;
  if (button) button.hidden = !overLimit;
  if (!overLimit || expandedPostIds.has(postId)) return;

  const lastLine = lines[COLLAPSED_POST_LINE_LIMIT - 1];
  const visibleText = fullText.slice(0, lastLine.end).replace(/[\r\n]+$/u, '');
  const characters = Array.from(visibleText);
  const lineCharacters = Array.from(fullText.slice(lastLine.start, lastLine.end));
  const availableFadeCount = lineCharacters.filter(character => !/[\r\n]/u.test(character)).length;
  const fadeCount = Math.min(POST_FADE_CHARACTER_LIMIT, availableFadeCount);
  const fadeStart = Math.max(0, characters.length - fadeCount);
  const fragment = document.createDocumentFragment();
  fragment.append(document.createTextNode(characters.slice(0, fadeStart).join('')));
  characters.slice(fadeStart).forEach((character, index, faded) => {
    const span = document.createElement('span');
    const channel = Math.round(255 * (index + 1) / faded.length);
    span.className = 'post-text-fade-character';
    span.style.color = `rgb(${channel}, ${channel}, ${channel})`;
    span.textContent = character;
    fragment.append(span);
  });
  element.replaceChildren(fragment);
}

let postTextHydrationGeneration = 0;
function hydratePublishedPostText(root = document, synchronous = false) {
  const generation = ++postTextHydrationGeneration;
  root.querySelectorAll('.published-post-surface .text-content').forEach(element => {
    element.dataset.fullText = element.textContent || '';
  });
  const apply = () => {
    if (generation !== postTextHydrationGeneration) return;
    root.querySelectorAll('.published-post-surface .text-content').forEach(applyCollapsedPostText);
  };
  if (synchronous) { apply(); return; }
  if (document.fonts?.ready) document.fonts.ready.then(() => requestAnimationFrame(apply));
  else requestAnimationFrame(apply);
}

function postTextDrawerDurationMs() {
  const configured = Number(window.__jetRuntimeConfig?.date_time_viewer_fold_animation?.letters_duration_ms);
  return Math.max(0, Number.isFinite(configured) ? configured : 300);
}

function waitForPostTextDrawer(drawer, duration) {
  if (duration <= 0) return Promise.resolve();
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      drawer.removeEventListener('transitionend', onEnd);
      clearTimeout(timer);
      resolve();
    };
    const onEnd = event => {
      if (event.target === drawer && event.propertyName === 'height') finish();
    };
    drawer.addEventListener('transitionend', onEnd);
    const timer = setTimeout(finish, duration + 100);
  });
}

async function togglePublishedPostText(postId) {
  const key = String(postId);
  const article = [...document.querySelectorAll('.published-post-surface')]
    .find(card => String(card.dataset.postId) === key);
  const drawer = article?.querySelector('.post-text-drawer');
  const text = drawer?.querySelector('.text-content');
  const button = article?.querySelector('.post-text-toggle');
  if (!drawer || !text || !button || drawer.dataset.animating === 'true') return;

  drawer.dataset.animating = 'true';
  const opening = !expandedPostIds.has(key);
  const duration = postTextDrawerDurationMs();
  const startHeight = drawer.getBoundingClientRect().height;
  const fullText = text.dataset.fullText ?? text.textContent ?? '';
  drawer.style.transition = 'none';
  drawer.style.height = `${startHeight}px`;
  drawer.style.overflow = 'hidden';

  if (opening) {
    expandedPostIds.add(key);
    text.textContent = fullText;
  } else {
    expandedPostIds.delete(key);
  }
  button.setAttribute('aria-expanded', String(opening));
  button.setAttribute('aria-label', t(opening ? 'collapsePostText' : 'expandPostText'));
  button.innerHTML = postExpandIcon(opening);

  // Measure the destination only after restoring the complete text. Collapse uses
  // exactly eight editor-compatible line boxes; expansion uses the full scroll height.
  const lineHeight = parseFloat(getComputedStyle(text).lineHeight) || 26.35;
  const targetHeight = opening ? text.scrollHeight : lineHeight * COLLAPSED_POST_LINE_LIMIT;
  void drawer.offsetHeight;
  drawer.style.transition = `height ${duration}ms cubic-bezier(.22,.72,.22,1)`;
  requestAnimationFrame(() => { drawer.style.height = `${targetHeight}px`; });
  await waitForPostTextDrawer(drawer, duration);

  if (!opening) applyCollapsedPostText(text);
  drawer.style.transition = '';
  drawer.style.height = '';
  drawer.style.overflow = '';
  drawer.dataset.animating = 'false';
  window.JetNoteScrollbar?.refresh?.();
}
function renderTopPost() {
  const card = document.getElementById('topPostCard');
  if (!card) return;
  const post = getSuperStarPost();
  const visible = effectiveHomeDisplay().top_post && !!post;
  card.hidden = !visible;
  if (card.parentElement) card.parentElement.hidden = !visible;
  releaseAttachmentUrls(card);
  if (!visible) {
    card.className = 'top-post-mount';
    card.dataset.postRole = 'top';
    card.removeAttribute('data-post-id');
    card.removeAttribute('style');
    card.innerHTML = '';
    return;
  }
  card.className = 'top-post-mount';
  card.dataset.postRole = 'top';
  card.dataset.postId = String(post.id);
  card.removeAttribute('style');
  card.innerHTML = renderPostSurface(post, POST_SURFACE_ROLE.TOP);
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


// ── Three Posts, One Body: Main Posts rendering ───────────────────────────

function renderPosts(options = {}) {
  const list = document.getElementById('mainPosts');
  const composerMount = document.getElementById('postComposerMount');
  if (!list || !composerMount) return;

  const composerHTML = (isWorkspaceWritable() && effectiveHomeDisplay().post_composer)
    ? renderPostSurface(null, POST_SURFACE_ROLE.COMPOSER)
    : '';

  const postsHTML = getMainPosts().map(post =>
    renderPostSurface(post, POST_SURFACE_ROLE.MAIN)
  ).join('');

  releaseAttachmentUrls(list);
  const debugPostHTML = window.DebugConfigurationFeature?.render?.() || '';
  // Reflow transactions must not recreate the Composer. It is not part of the
  // star/FLIP geometry, and replacing it can invalidate the page origin before
  // the inverse transform is installed. Normal renders still refresh it.
  if (options.preserveComposer !== true) composerMount.innerHTML = composerHTML;
  list.innerHTML = debugPostHTML + postsHTML;
  // A reorder rebuilds video DOM before async thumbnail hydration. Reapply the
  // FIRST media box synchronously, in the same task as innerHTML, so there is
  // never a paint where the replacement Video Post has zero media height.
  try { window.__jetApplyPostMovementVideoGeometry?.(list); } catch (_) {}
  renderTopPost();
  try { window.__jetApplyPostMovementVideoGeometry?.(document); } catch (_) {}
  reconcileAllPostHighlights();
  hydrateAttachments(list);
  hydrateVideoAttachments(list);
  bindPublishedInlineImageZoom?.(list);
  hydratePublishedPostText(document, options.stabilizePostText === true);
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

// ── Post Composer ─────────────────────────────────────────────────────────

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
        <div class="video-progress-track" role="slider" tabindex="0" aria-label="${escapeHTML(t('videoPosition'))}" aria-valuemin="0" aria-valuemax="1000" aria-valuenow="0"><div class="video-progress-fill"></div></div>
        <div class="video-inline-time">0:00/0:00</div>
      </div>`;
    }
    const key = entry.item ? `'${escapeHTML(entry.item.id)}'` : String(entry.index);
    return `<div class="compose-image-item common_border"><img src="${escapeHTML(entry.src)}" alt="" onclick="openImageViewer(this.src)">
      <button class="compose-image-remove adaptive-complement-remove" onclick="event.stopPropagation(); removePostDraftImage(${key})" aria-label="${escapeHTML(t('remove'))}">×</button></div>`;
  }).join('') + (visualItems.length > 3 ? '<div class="compose-media-more-indicator" aria-hidden="true"><img src="shared/icons/more_vertical.svg" alt=""></div>' : '');

  hydrateVideoAttachments(box, draftMedia.post);
}

let activePostActionId = null;
let activePostActionAnchor = null;
let activePostActionPostOffset = null;
let activePostActionAnchorOffset = null;
let postHorizontalEllipsisDismissTimer = null;
let postHorizontalEllipsisDismissToken = 0;

// ── Horizontal Ellipsis Menu Family ───────────────────────────────────────
// Menu geometry follows its Post; it does not own Post movement or viewport.

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

function holdHorizontalEllipsisMenuAfterPostMovement(postId) {
  cancelPostHorizontalEllipsisDismissTimer();
  const token = postHorizontalEllipsisDismissToken;
  // 100 ms here is only the fallback used when the configured value is missing/invalid.
  // The normally effective value lives near the top of:
  // app/src/main/assets/config/home.json -> main_posts.interaction_timing
  const delay = postInteractionDelay('post_horizontal_ellipsis_menu_dismiss_delay_ms', 100);
  // This function is called only after Post movement and the visual settle
  // barrier have completed. First paint the menu at its final Post
  // relative coordinate, then start the configured dismiss clock.  A small RAF follower
  // remains active during the hold so a late WebView compositor frame
  // cannot detach the menu from the Post.
  return new Promise(resolve => {
    let frameId = 0;
    let timerId = null;
    const follow = () => {
      if (token !== postHorizontalEllipsisDismissToken) {
        if (timerId !== null) clearTimeout(timerId);
        resolve();
        return;
      }
      syncPostActionPanelToPost(postId);
      frameId = requestAnimationFrame(follow);
    };
    syncPostActionPanelToPost(postId);
    requestAnimationFrame(() => {
      if (token !== postHorizontalEllipsisDismissToken) { resolve(); return; }
      syncPostActionPanelToPost(postId);
      frameId = requestAnimationFrame(follow);
      timerId = setTimeout(() => {
        if (frameId) cancelAnimationFrame(frameId);
        if (token === postHorizontalEllipsisDismissToken && String(activePostActionId) === String(postId)) {
          closePostActionPanel();
        }
        resolve();
      }, Math.max(0, delay));
    });
  });
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
  activePostActionPostOffset = null;
  activePostActionAnchorOffset = null;
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

// ── Post Movement / FLIP visual continuity ────────────────────────────────
// Ownership boundary:
//   Post Movement owns Post transforms and timing.
//   Horizontal Ellipsis Menu follows the moving Post only.
// Star/Super-Star movement never writes viewport scroll.
let postMovementTransactionActive = false;
let postMovementProbeAction = null;
// Zero-flash FLIP transaction phase.  This is deliberately separate from the
// business star state: only one geometry transaction may own the render tree.
const postMovementTransaction = { state: 'idle', action: null, postId: null, token: 0 };
function setPostMovementTransactionPhase(state, action = null, postId = null) {
  postMovementTransaction.state = state;
  if (action !== null) postMovementTransaction.action = action;
  if (postId !== null) postMovementTransaction.postId = String(postId);
  document.documentElement.dataset.postFlipPhase = state;
}

function nextAnimationFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve));
}

function syncPostActionPanelToPost(postId) {
  if (postId === null || postId === undefined) return;
  const panel = document.getElementById('postActionPanel');
  if (!panel?.classList.contains('open')) return;
  if (String(activePostActionId) !== String(postId)) return;

  // The menu is anchored to this Post's horizontal ellipsis, not to the Post
  // card. renderPosts() may replace the ellipsis DOM when a Post crosses
  // Top/Main, so resolve the CURRENT anchor by postId on every frame. Because
  // getBoundingClientRect() includes the ancestor FLIP transform, this keeps the
  // original menu<->ellipsis vector intact throughout both upward and downward
  // movement, viewport scrolling and the final hold.
  const id = String(postId);
  const anchor = document.querySelector(`.more[data-post-id="${CSS.escape(id)}"]`);
  if (!anchor || !anchor.isConnected) return;

  const rect = anchor.getBoundingClientRect();
  activePostActionAnchor = {
    left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
    width: rect.width, height: rect.height
  };

  if (activePostActionAnchorOffset) {
    panel.style.setProperty('left', Math.round(rect.left + activePostActionAnchorOffset.left) + 'px', 'important');
    panel.style.setProperty('right', 'auto', 'important');
    panel.style.setProperty('top', Math.round(rect.top + activePostActionAnchorOffset.top) + 'px', 'important');
    panel.style.setProperty('transform', 'none', 'important');
    return;
  }

  positionMenuLeftOfAnchor(panel, activePostActionAnchor);
}

async function waitForPostMovementVisualSettle(postId) {
  // "Movement ended" means not merely transitionend: compositor settling can
  // still change the screen-space position on following frames.
  // Require three consecutive stable painted frames before starting the 300 ms hold.
  let stableFrames = 0;
  let previous = null;
  for (let frame = 0; frame < 30 && stableFrames < 3; frame += 1) {
    await nextAnimationFrame();
    syncPostActionPanelToPost(postId);
    const id = postId == null ? null : String(postId);
    const card = id == null ? null : collectPostMovementCards().find(item => item.id === id)?.card;
    const rect = card?.getBoundingClientRect();
    // Camera movement belongs to the user and is deliberately excluded from the
    // Post visual-settle test. Scrolling during PLAY must not trigger correction.
    const current = rect ? [rect.left, rect.top, rect.right, rect.bottom] : [];
    const stable = previous && current.length === previous.length && current.every((v, i) => Math.abs(v - previous[i]) < 0.5);
    stableFrames = stable ? stableFrames + 1 : 0;
    previous = current;
  }
  syncPostActionPanelToPost(postId);
}

async function warmPostMovementFrames(durationMs = 300) {
  const started = performance.now();
  while (performance.now() - started < durationMs) await nextAnimationFrame();
}

function startHorizontalEllipsisMenuFollow(postId) {
  if (postId === null || postId === undefined) return () => {};
  let active = true;
  let frame = 0;
  const tick = () => {
    if (!active) return;
    // Menu follows the transformed ellipsis only; this loop never writes scrollY.
    syncPostActionPanelToPost(postId);
    frame = requestAnimationFrame(tick);
  };
  syncPostActionPanelToPost(postId);
  frame = requestAnimationFrame(tick);
  return () => {
    active = false;
    if (frame) cancelAnimationFrame(frame);
    syncPostActionPanelToPost(postId);
  };
}

function collectPostMovementCards() {
  const cards = [];
  document.querySelectorAll('#mainPosts article.post[data-post-id]').forEach(card => {
    cards.push({id: String(card.dataset.postId), card, index: cards.length, surface: 'main'});
  });
  const topCard = document.getElementById('topPostCard');
  const topPost = topCard?.querySelector('article.post[data-post-role="top"][data-post-id]');
  if (topPost) {
    cards.push({id: String(topPost.dataset.postId), card: topPost, index: -1, surface: 'top'});
  }
  return cards;
}

function capturePostMovementSnapshot(activePostId = null, captureCrossSurfaceGroup = false, crossSurfaceIds = null) {
  const rects = new Map();
  const indexes = new Map();
  const surfaces = new Map();
  const crossSurfaceProxies = new Map();
  const items = collectPostMovementCards();

  // FIRST is one atomic snapshot of the WHOLE transaction, not just the clicked Post.
  // This matters for Super Star: one transaction can contain three simultaneous bodies:
  //   A) previous Super Star: Top -> Main,
  //   B) clicked Post: Main -> Top,
  //   C) every remaining Main Post: Main slot -> Main slot.
  // All three must share exactly the same FIRST frame.
  for (const item of items) {
    indexes.set(item.id, item.index);
    surfaces.set(item.id, item.surface);
    const r = item.card.getBoundingClientRect();
    rects.set(item.id, r);
    if (String(item.id) === String(activePostActionId)) {
    }
  }

  // Super Star is a multi-body cross-surface transaction. Capture a paint snapshot for
  // EVERY participant now. After render we keep proxies only for Posts that actually
  // crossed Top/Main; unused proxies are removed synchronously before the first paint.
  // This prevents the old Super Star from flashing while the new Super Star is animated.
  if (captureCrossSurfaceGroup) {
    for (const item of items) {
      if (crossSurfaceIds && !crossSurfaceIds.has(String(item.id))) continue;
      const first = rects.get(item.id);
      if (!first) continue;
      const clone = item.card.cloneNode(true);

      // A cross-surface proxy is appended directly under <body>.  Merely cloning the
      // DOM is not a visual snapshot: many card/image rules depend on ancestors such as
      // #topPostCard / #mainPosts.  Once detached from that CSS context the clone can
      // reflow internally (the large yellow image was the clearest symptom), even when
      // the outer proxy itself uses scale(1).  Freeze the complete computed appearance
      // while the source is still in its FIRST context, then move that frozen picture.
      const sourceNodes = [item.card, ...item.card.querySelectorAll('*')];
      const cloneNodes = [clone, ...clone.querySelectorAll('*')];
      for (let i = 0; i < Math.min(sourceNodes.length, cloneNodes.length); i++) {
        const cs = getComputedStyle(sourceNodes[i]);
        const dst = cloneNodes[i];
        for (let j = 0; j < cs.length; j++) {
          const prop = cs[j];
          dst.style.setProperty(prop, cs.getPropertyValue(prop), cs.getPropertyPriority(prop));
        }
        // Stop independent media/content animation inside the flying snapshot.
        dst.style.animation = 'none';
        dst.style.transition = 'none';
      }
      clone.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
      clone.removeAttribute('id');
      clone.setAttribute('aria-hidden', 'true');
      clone.dataset.flipProxyFor = item.id;
      // Cross-surface paint proxies live above every real Post. The acted-on Post
      // owns the highest movement layer for the complete transaction.
      clone.style.zIndex = String(item.id) === String(activePostActionId) ? '2001' : '2000';
      const originDocumentLeft = first.left + window.scrollX;
      const originDocumentTop = first.top + window.scrollY;
      Object.assign(clone.style, {
        position: 'absolute', left: `${originDocumentLeft}px`, top: `${originDocumentTop}px`,
        width: `${first.width}px`, height: `${first.height}px`, margin: '0',
        boxSizing: 'border-box', pointerEvents: 'none', transformOrigin: '0 0',
        transform: 'translate3d(0,0,0)', transition: 'none', willChange: 'transform'
      });
      document.body.appendChild(clone);
      clone.getBoundingClientRect();
      crossSurfaceProxies.set(item.id, {
        id: item.id,
        clone,
        originDocumentLeft,
        originDocumentTop,
        fromSurface: item.surface
      });
    }
  }

  const composer = document.getElementById('postComposerMount');
  const composerRect = composer?.getBoundingClientRect?.() || null;

  // Logical finite sequence used only for block partitioning. Geometry remains
  // authoritative for movement: an item may keep the same sequence index and
  // still move because another Body changes the surrounding layout.
  const topItem = items.find(item => item.surface === 'top');
  const mainItems = items.filter(item => item.surface === 'main').sort((a, b) => a.index - b.index);
  const topologySequence = [];
  if (topItem) topologySequence.push(String(topItem.id));
  if (composer) topologySequence.push('__post_composer__');
  topologySequence.push(...mainItems.map(item => String(item.id)));

  return {rects, indexes, surfaces, crossSurfaceProxies, composerRect, topologySequence};
}

function resolvePostMovementTiming(actionName, movements, activePostId = null, fallback = 900) {
  const config = threePostOneBodyConfig.main_posts?.interaction_timing?.post_reflow_animation || {};
  const choice = String(config.speed_or_duration || 'duration').trim().toLowerCase();
  const distances = movements.map(item => Number(item.distance) || 0).filter(distance => distance > 0);
  const minimumDistance = distances.length ? Math.min(...distances) : 0;
  const activeMovement = activePostId == null
    ? null
    : movements.find(item => String(item.postId) === String(activePostId));
  const activeDistance = Number(activeMovement?.distance) || 0;
  // Star, Cancel Star, Super Star and Cancel Super Star all bind configured
  // V_small to the Post the user acted on. If that Post has no measurable
  // displacement, fall back to the minimum effective displacement.
  const actedPostTimingAction = actionName === 'star' || actionName === 'cancel_star'
    || actionName === 'super_star' || actionName === 'cancel_super_star';
  const referenceDistance = actedPostTimingAction && activeDistance > 0 ? activeDistance : minimumDistance;

  let commonDurationMs = 0;
  if (choice === 'speed') {
    const configuredReferenceSpeed = Number(config[actionName]?.speed_px_per_second);
    if (Number.isFinite(configuredReferenceSpeed) && configuredReferenceSpeed > 0 && referenceDistance > 0) {
      // T=D_ref/V_small. Every participant shares T and derives V_i=D_i/T,
      // so all Posts still start and finish the movement together.
      commonDurationMs = (referenceDistance / configuredReferenceSpeed) * 1000;
    }
  } else {
    const configuredDuration = Number(config[actionName]?.duration_ms);
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

async function animatePostMovement(snapshot, actionName, activePostId = null, fallback = 900) {
  if (!snapshot) return;
  postMovementProbeAction = actionName;
  const activeId = activePostId == null ? null : String(activePostId);
  const currentItems = collectPostMovementCards();
  const currentById = new Map(currentItems.map(item => [item.id, item]));
  const proxies = snapshot.crossSurfaceProxies || new Map();
  const crossSurface = new Map();

  // LAST is captured for the whole transaction before any PLAY begins.
  // Decide which bodies crossed a render surface. Those bodies use their FIRST clones;
  // same-surface bodies use strict FLIP transforms on the real nodes.
  for (const [id, proxy] of proxies) {
    const target = currentById.get(id);
    if (target && proxy.fromSurface !== target.surface) {
      const last = target.card.getBoundingClientRect();
      const destinationDocumentLeft = last.left + window.scrollX;
      const destinationDocumentTop = last.top + window.scrollY;
      const oldVisibility = target.card.style.visibility;
      target.card.style.visibility = 'hidden';
      crossSurface.set(id, {
        proxy,
        target,
        destinationDocumentLeft,
        destinationDocumentTop,
        oldVisibility
      });
    } else if (proxy.clone?.isConnected) {
      proxy.clone.remove();
    }
  }

  // Camera/world motion intentionally does not exist here. Each Post owns only
  // its own FIRST->LAST FLIP; the viewport and postMainLayoutWorld are never transformed.

  const topCurrent = currentItems.find(item => item.surface === 'top');
  const mainCurrent = currentItems.filter(item => item.surface === 'main').sort((a, b) => a.index - b.index);
  const afterTopologySequence = [];
  if (topCurrent) afterTopologySequence.push(String(topCurrent.id));
  if (document.getElementById('postComposerMount')) afterTopologySequence.push('__post_composer__');
  afterTopologySequence.push(...mainCurrent.map(item => String(item.id)));
  const blockMembership = window.JetNoteOrderPreservedBlocks?.membership?.(
    snapshot.topologySequence || [], afterTopologySequence
  ) || new Map();
  const fixedBottomUp = window.JetNoteOrderPreservedBlocks?.fixedBottomUpSuffix?.(
    snapshot.topologySequence || [], afterTopologySequence
  ) || {ids:new Set()};

  const prepared = [];
  for (const item of currentItems) {
    // Post Movement is identity/topology owned, not geometry owned. Compare the
    // finite before/after sequence from the bottom upward. Every matched identity
    // is the fixed suffix and MUST NOT receive FLIP even if a temporary layout
    // measurement differs while A/B are being rebuilt. Example ABC -> BAC: C is
    // fixed; only A and B participate. This prevents C from being transformed by
    // both the DOM reflow and FLIP, which made it jitter during Super Star moves.
    if (fixedBottomUp.ids?.has(String(item.id))) continue;
    const first = snapshot.rects.get(item.id);
    if (!first) continue;
    const last = item.card.getBoundingClientRect();
    const beforeSurface = snapshot.surfaces?.get(item.id);
    const beforeIndex = snapshot.indexes?.get(item.id);
    const changedSurface = beforeSurface !== item.surface;
    const changedSlot = item.surface === 'main' && Number.isInteger(beforeIndex) && beforeIndex !== item.index;

    // Inside the topology-approved changing prefix, geometry decides the exact
    // FLIP displacement. Geometry never re-admits an ID from the fixed suffix.
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    const distance = Math.hypot(dx, dy);
    if (distance < 0.5) continue;

    const card = item.card;
    const previousPosition = card.style.position;
    const previousTransition = card.style.transition;
    const previousTransform = card.style.transform;
    const previousWillChange = card.style.willChange;
    const previousZIndex = card.style.zIndex;

    // Cross-surface real nodes are hidden, but receive the same FLIP geometry so menu
    // anchoring and transaction timing remain coherent. Main residual Posts are visible.
    card.style.position = 'relative';
    card.style.willChange = 'transform';
    card.style.transition = 'none';
    card.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    if (String(item.id) === activeId) card.style.zIndex = '2001';
    prepared.push({postId:item.id, card, dx, dy, distance, changedSurface, changedSlot,
      preservedBlock: blockMembership.get(String(item.id)) ?? null,
      previousPosition, previousTransition, previousTransform, previousWillChange, previousZIndex});
  }

  // The Composer is part of the visible Post Movement even though it is not a
  // persisted Post.  FIRST was captured before renderPosts(); LAST exists now.
  // FLIP it exactly like every other moving body so the destination layout cannot
  // appear to open a hole instantaneously before the Posts arrive.
  const composer = document.getElementById('postComposerMount');
  if (composer && snapshot.composerRect && !fixedBottomUp.ids?.has('__post_composer__')) {
    // The composer follows the same finite-sequence rule. If it belongs to the
    // fixed bottom-up suffix, it is not admitted into FLIP by geometry alone.
    const first = snapshot.composerRect;
    const last = composer.getBoundingClientRect();
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    const distance = Math.hypot(dx, dy);
    if (distance >= 0.5) {
      const previousPosition = composer.style.position;
      const previousTransition = composer.style.transition;
      const previousTransform = composer.style.transform;
      const previousWillChange = composer.style.willChange;
      const previousZIndex = composer.style.zIndex;
      composer.style.position = 'relative';
      composer.style.willChange = 'transform';
      composer.style.transition = 'none';
      composer.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      prepared.push({
        postId: '__post_composer__', card: composer, dx, dy, distance,
        changedSurface: false, isLayoutBody: true,
        preservedBlock: blockMembership.get('__post_composer__') ?? null,
        previousPosition, previousTransition, previousTransform, previousWillChange, previousZIndex
      });
    }
  }

  const cleanupAll = () => {
    for (const {proxy, target, oldVisibility} of crossSurface.values()) {
      if (target.card?.isConnected) target.card.style.visibility = oldVisibility;
      if (proxy.clone?.isConnected) proxy.clone.remove();
    }
    for (const [id, proxy] of proxies) if (proxy.clone?.isConnected) proxy.clone.remove();
  };

  if (!prepared.length) { cleanupAll(); postMovementProbeAction = null; return; }
  const timedPrepared = resolvePostMovementTiming(actionName, prepared, activePostId, fallback).filter(x => x.duration > 0);
  if (!timedPrepared.length) { cleanupAll(); postMovementProbeAction = null; return; }

  // One shared transaction duration is already produced by resolvePostMovementTiming.
  // Commit ALL inverses before WebView gets a paint opportunity.
  for (const item of timedPrepared) item.card.getBoundingClientRect();
  void document.documentElement.offsetHeight;

  // INVERT is now fully written.  Do not PLAY on the first animation frame.
  // rAF #1 lets Chromium/WebView commit the inverted FIRST-looking frame; rAF #2
  // starts PLAY.  This prevents an uninverted LAST layout from becoming the first
  // visible frame of the transaction.
  setPostMovementTransactionPhase('invert-armed');
  const stopMenuFollower = startHorizontalEllipsisMenuFollow(activePostId);
  await nextAnimationFrame();
  setPostMovementTransactionPhase('invert-presented');
  await nextAnimationFrame();
  setPostMovementTransactionPhase('play');

  // UI Language contract: Star/Cancel Star/Super Star/Cancel Super Star all
  // apply V_small to the acted-on Post. Every body shares T and therefore keeps
  // its derived constant speed V_i = D_i / T.
  const easing = 'linear';
  const waits = [];

  // Body A/B: every Top<->Main crossing gets its own shared-element proxy.
  // This includes BOTH the displaced old Super Star and the newly clicked Super Star.
  for (const [id, group] of crossSurface) {
    const timing = timedPrepared.find(x => x.postId === id);
    if (!timing) continue;
    const {clone, originDocumentLeft, originDocumentTop} = group.proxy;
    // Translation-only shared-element FLIP. Keep the FIRST geometry frozen for the
    // entire flight: Superstar movement must not zoom/stretch while crossing surfaces.
    // The real LAST node stays hidden until cleanup, so the proxy is the sole visual
    // owner during movement. Its fixed width/height were captured in FIRST.
    const tx = group.destinationDocumentLeft - originDocumentLeft;
    const ty = group.destinationDocumentTop - originDocumentTop;
    waits.push(new Promise(resolve => {
      let done = false;
      const finish = () => { if (done) return; done = true; clone.removeEventListener('transitionend', onEnd); clearTimeout(timer); resolve(); };
      const onEnd = e => { if (e.target === clone && e.propertyName === 'transform') finish(); };
      clone.addEventListener('transitionend', onEnd);
      clone.style.transition = `transform ${timing.duration}ms ${easing}`;
      clone.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
      var timer = setTimeout(finish, timing.duration + 120);
    }));
  }

  // Body C + hidden real A/B: all real nodes PLAY on the exact same frame/duration.
  for (const item of timedPrepared) {
    waits.push(new Promise(resolve => {
      const {card, duration} = item;
      let done = false;
      const finish = () => {
        if (done) return; done = true; card.removeEventListener('transitionend', onEnd); clearTimeout(timer);
        card.style.transition = item.previousTransition; card.style.transform = item.previousTransform;
        card.style.willChange = item.previousWillChange; card.style.position = item.previousPosition;
        card.style.zIndex = item.previousZIndex;
        resolve();
      };
      const onEnd = e => { if (e.target === card && e.propertyName === 'transform') finish(); };
      card.addEventListener('transitionend', onEnd);
      card.style.transition = `transform ${duration}ms ${easing}`;
      card.style.transform = 'translate3d(0,0,0)';
      var timer = setTimeout(finish, duration + 120);
    }));
  }

  try {
    await Promise.all(waits);
  } finally {
    cleanupAll();
    stopMenuFollower();
    postMovementProbeAction = null;
    setPostMovementTransactionPhase('cleanup');
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

// ── Star / Super Star state transaction ──────────────────────────────────

async function commitStarStateChange(previous, postMovementActionName, activePostId, highlight = null) {
  const topology = window.JetNoteFlipTopology?.classify(previous, posts, postMovementActionName)
    || {kind:'normal', crossIds:[]};
  const isCrossSurfaceSuperAction = topology.kind === 'super_two_body' || topology.kind === 'super_three_body';
  // Prepare compositor ownership BEFORE FIRST measurement.  Preparation is allowed
  // to consume a frame; LAST render is not.  Once FIRST is captured, LAST render,
  // LAST read and INVERT write stay in one uninterrupted JS task.
  postMovementTransaction.token += 1;
  setPostMovementTransactionPhase('prepare', postMovementActionName, activePostId);
  let releaseLayerPreparation = () => {};
  if (topology.kind === 'super_two_body' && window.JetNoteSuperStarTwoBodyFlip?.prepare) {
    releaseLayerPreparation = await window.JetNoteSuperStarTwoBodyFlip.prepare(collectPostMovementCards());
  }
  setPostMovementTransactionPhase('first-read');
  // Three-body is the validated v7 reference: preserve its capture-all behavior.
  // Two-body captures ONLY its single crossing body; the remaining list stays real DOM.
  const proxyIds = topology.kind === 'super_two_body' ? new Set(topology.crossIds.map(String)) : null;
  const snapshot = capturePostMovementSnapshot(activePostId, isCrossSurfaceSuperAction, proxyIds);
  if (highlight?.postId !== undefined && highlight?.postId !== null) postHighlightDeferredIds.add(String(highlight.postId));
  syncPostStarAction();

  const beforeMainIds = previous
    .filter(post => getPostStarState(post) !== 'super_star')
    .sort((a, b) => {
      const as = getPostStarState(a) === 'star', bs = getPostStarState(b) === 'star';
      if (as !== bs) return as ? -1 : 1;
      return as ? comparePostDisplayOrder(a, b) : 0;
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
    // No viewport correction: a Post state change must never move the page scroll position.
  } else {
    // Disable Chromium scroll anchoring BEFORE rebuilding the list. Otherwise WebView
    // may silently shift the viewport between FIRST and LAST when nodes move above
    // the viewport. That viewport movement can be painted before FLIP applies its inverse.
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflowAnchor = html.style.overflowAnchor;
    const previousBodyOverflowAnchor = body?.style.overflowAnchor || '';
    html.style.overflowAnchor = 'none';
    if (body) body.style.overflowAnchor = 'none';
    // Android's TextureView is outside WebView composition. Freeze it BEFORE the
    // DOM rebuild; otherwise a Video Post can visibly lag/jump while its HTML body FLIPs.
    try { window.__jetBeginPostMovementVideoFreeze?.(); } catch (_) {}
    // Freeze geometry synchronously and start the reorder immediately.
    // Do not insert artificial paint-frame waits before Star/Super-Star movement.
    try {
      // Rebuild only when the list really reorders. Post Movement never reads,
      // stores or writes the user's camera position.
      setPostMovementTransactionPhase('last-write');
      renderPosts({scheduleFit: false, preserveComposer: true, stabilizePostText: true});
      // This read intentionally forces the real LAST layout synchronously.  There
      // must be no await/rAF/timer between LAST write and animatePostMovement(),
      // whose synchronous prefix immediately writes every INVERT transform.
      setPostMovementTransactionPhase('last-read');
      await animatePostMovement(snapshot, postMovementActionName, activePostId, 900);
      await nextAnimationFrame();
      await waitForPostMovementVisualSettle(activePostId);
    } finally {
      try { window.__jetEndPostMovementVideoFreeze?.(); } catch (_) {}
      html.style.overflowAnchor = previousHtmlOverflowAnchor;
      if (body) body.style.overflowAnchor = previousBodyOverflowAnchor;
    }
  }

  if (sameMainGeometry) await waitForPostMovementVisualSettle(activePostId);
  releaseLayerPreparation();
  setPostMovementTransactionPhase('idle');

  // The menu belongs visually to the acted-on Post. Keep it attached for the
  // complete movement, then leave the final state visible for the configured delay before
  // dismissing it. Scheduling here (rather than at pointer-up) makes the delay
  // relative to the actual end of reflow for star, super-star and both cancels.
  syncPostActionPanelToPost(activePostId);
  await holdHorizontalEllipsisMenuAfterPostMovement(activePostId);

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
  if (!isWorkspaceWritable() || activePostActionId === null || postMovementTransactionActive) return;
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

  // Keep the action surface visible after the state changes so the user can
  // perceive the result. The delay is a home-post setting in config.json.
  postMovementTransactionActive = true;
  let saved = false;
  try {
    saved = await commitStarStateChange(
      previous,
      nextState === 'star' ? 'star' : (state === 'super_star' ? 'cancel_super_star' : 'cancel_star'),
      actionPostId,
      nextState === 'star' ? {postId: actionPostId, superStar: false} : null
    );
  } finally {
    postMovementTransactionActive = false;
  }
  if (!saved) return;
}

async function toggleSuperStarActivePost() {
  if (!isWorkspaceWritable() || activePostActionId === null || postMovementTransactionActive) return;
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
  postMovementTransactionActive = true;
  let saved = false;
  try {
    saved = await commitStarStateChange(
      previous,
      'super_star',
      actionPostId,
      {postId: actionPostId, superStar: true}
    );
  } finally {
    postMovementTransactionActive = false;
  }
  if (!saved) return;

  // Super Star completion has no camera ownership; the user's live position remains.
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
  activePostActionAnchorOffset = {
    left: panel.offsetLeft - rect.left,
    top: panel.offsetTop - rect.top
  };
  const postCard = anchor.closest('article.post') || anchor.closest('#topPostCard');
  const postRect = postCard?.getBoundingClientRect();
  if (postRect) {
    activePostActionPostOffset = {
      left: panel.offsetLeft - postRect.left,
      top: panel.offsetTop - postRect.top
    };
  } else {
    activePostActionPostOffset = null;
  }
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
  }, 275);
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

  if (isToday) return `${hh}:${mm} ${t('today')}`;
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

function addToolVisualToPost(meta) {
  const composer = document.getElementById('postComposeScreen');
  if (!composer?.classList.contains('open')) return 'composer-not-open';
  if (!meta || !['image','video'].includes(meta.type) || !meta.id || !meta.path) return 'invalid-media';
  if (draftAttachments.post.some(item => String(item.id) === String(meta.id))) return 'duplicate';
  const policy = window.JetNotePostAttachmentPolicy;
  if (policy?.conflict(meta.type, postDraftImages, draftAttachments.post)) return 'conflict';
  if ((policy?.remaining(meta.type, postDraftImages, draftAttachments.post) ?? 0) <= 0) return 'limit';
  draftAttachments.post.push(meta);
  draftMedia.post.set(meta.id, meta);
  if (meta.type === 'image') postDraftImages.push(NativeMedia.url(meta));
  renderPostVisualMediaPreview();
  renderAudioDraft('post');
  syncPostEditorDraft();
  return 'added';
}
window.addToolVisualToPost = addToolVisualToPost;

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
    // Clear every composer-owned media container immediately after a successful
    // publish/save. Do not wait for the home transition callback: a new editor
    // session can otherwise observe the previous session's in-memory media.
    postDraftImages = [];
    initAudioDraft('post', null);
    renderPostImagePreview();
    renderPostVideoPreview();
    closePostComposer();
    if (!commitResult.wasEditing) document.getElementById('mainPosts')?.scrollTo({ top: 0 });
  } finally {
    postPublishInFlight = false;
    if (publishButton?.isConnected) publishButton.disabled = false;
  }
}

/* ---------- Name ---------- */
