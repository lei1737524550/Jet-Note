const THREE_POST_ONE_BODY_DEFAULT_CONFIG = Object.freeze({
  surface_vertical_gap_px: 6,
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
      // Hardcoded layout value; keep geometry local to this module.
      //   main_posts.interaction_timing.post_horizontal_ellipsis_menu_dismiss_delay_ms
      post_horizontal_ellipsis_menu_dismiss_delay_ms: 100,
      delete_content_to_border_clear_delay_ms: 100,
      delete_border_clear_to_reflow_delay_ms: 140,
      post_delete_reflow_animation_duration_ms: 320,
      post_reflow_animation: Object.freeze({
        speed_or_duration: 'speed',
        star: Object.freeze({ duration_ms: 150, speed_px_per_second: 3600 }),
        cancel_star: Object.freeze({ duration_ms: 150, speed_px_per_second: 3600 }),
        super_star: Object.freeze({ duration_ms: 150, speed_px_per_second: 3600 }),
        cancel_super_star: Object.freeze({ duration_ms: 150, speed_px_per_second: 3600 })
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
function configBorderColor(value, fallback = '#bfc1c4') {
  const raw = String(value || '').trim();
  return /^#?[0-9a-f]{6}$/i.test(raw) ? `#${raw.replace(/^#/, '')}` : fallback;
}

function configVerticalPixelOffset(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(-1000, Math.min(number, 1000));
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
    timeBottomMargin: bottom
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
  for (const name of [...threePostOneBodyBorderTimers.keys()]) stopThreePostOneBodyBorderRule(name);
});

