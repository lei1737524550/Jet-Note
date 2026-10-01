function renderPostStarButton(post, postId) {
  const state = getPostStarState(post);
  if (state !== 'star' && state !== 'super_star') return '';
  const icon = state === 'super_star' ? 'star_super.svg' : 'star_active.svg';
  return `<button type="button" class="post-head-star-status" data-post-id="${postId}" onclick="cancelPostFavorite(event,this.dataset.postId)" aria-label="${escapeHTML(t('cancelFavorite'))}"><img src="src/shared/icons/${icon}" alt=""></button>`;
}


// State owns the badge; ordering and animation never decide its visibility.
function syncPublishedPostFavoriteBadges(root = document) {
  const records = new Map(posts.map(post => [String(post.id), post]));
  for (const card of root.querySelectorAll('.published-post-surface[data-post-id]')) {
    const post = records.get(String(card.dataset.postId));
    if (!post) continue;
    const state = getPostStarState(post);
    card.classList.toggle('post-state-star', state === 'star');
    card.classList.toggle('post-state-not-star', state !== 'star');
    const actions = card.querySelector('.post-head-actions');
    if (!actions) continue;
    const badge = actions.querySelector('.post-head-star-status');
    const icon = state === 'super_star' ? 'star_super.svg' : state === 'star' ? 'star_active.svg' : null;
    if (!icon) { badge?.remove(); continue; }
    if (badge) badge.querySelector('img')?.setAttribute('src', `src/shared/icons/${icon}`);
    else actions.insertAdjacentHTML('afterbegin', renderPostStarButton(post, escapeHTML(String(post.id))));
  }
}

const HOME_COMPOSER_LABEL_KEY = 'jetnote.home.composer.label';
function homeComposerLabel(){
  const creationEntryPrefix = '#552323$';
  try {
    const saved = localStorage.getItem(HOME_COMPOSER_LABEL_KEY);
    const savedPlain = String(saved ?? '').replace(/^#[0-9a-f]{6}\$/i, '');
    const isBundledDefault = saved === null || savedPlain === 'Write something...' || savedPlain === '写点什么…' || savedPlain === '写点什么...';
    const label = isBundledDefault ? t('share') : saved;
    return /^#552323\$/i.test(label) ? label : creationEntryPrefix + String(label).replace(/^#[0-9a-f]{6}\$/i, '');
  } catch (_) {
    const label = t('share');
    return /^#552323\$/i.test(label) ? label : creationEntryPrefix + String(label).replace(/^#[0-9a-f]{6}\$/i, '');
  }
}
function renderHomeComposerLabel(){ return renderNoteFormattedText(homeComposerLabel()); }

function postExpandIcon(expanded) {
  const file = expanded ? 'collapse_toward_center.svg' : 'expand_broad_v.svg';
  return `<img src="src/shared/icons/${file}" alt="" aria-hidden="true">`;
}

function renderPublishedPostHeader(post, postId) {
  const expanded = expandedPostIds.has(String(post.id));
  const headerTitle = post.title ? `<div class="post-title note-typography">${escapeHTML(post.title)}</div>` : '<div class="post-title post-title-empty" aria-hidden="true"></div>';
  const headerAudio = renderAttachments((Array.isArray(post.attachments) ? post.attachments : []).filter(item => item?.type === 'audio'));
  const headerStar = renderPostStarButton(post, postId);
  return `<div class="post-head post-head-minimal">
    ${headerTitle}
    <div class="post-head-actions">
      ${headerStar}
      ${headerAudio ? `<div class="post-head-audio">${headerAudio}</div>` : ''}
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
        <div class="post-composer-main note-typography" role="note">${renderHomeComposerLabel()}</div>
        <div class="post-composer-tools" aria-label="${escapeHTML(t('composerTools'))}">
          <div class="post-composer-tool-row post-composer-tool-row-top">
            <button class="post-composer-media-button home-create-button" type="button" onclick="openPostComposer()" aria-label="${escapeHTML(t('post_composer.new_post_title'))}"><img src="src/shared/icons/home_create_pencil.svg" alt=""></button>
            <button class="post-composer-media-button home-book-button" type="button" data-home-book-action aria-label="${escapeHTML(t('archive.page_title'))}"><img src="src/shared/icons/book.svg" alt=""></button>
            <button class="post-composer-media-button home-settings-button" type="button" onclick="openSettings()" aria-label="" data-ui-aria-label="home.settings_accessibility_label"><img src="src/shared/icons/settings_gear.svg" alt=""></button>
          </div>
        </div>
      </div>`;
  }

  if (!post) return '';
  const state = getPostStarState(post);
  const postId = escapeHTML(String(post.id));
  const images = Array.isArray(post.images) ? post.images : [];
  // Audio belongs to the compact header controls; visual/other media stay in the body.
  const media = renderPublishedVisualMediaHTML(images, post.attachments);
  const displayText = post.text || '';
  const text = `<div class="post-text-drawer"><div class="text-content note-typography note-text">${renderPostColorCommands(displayText, post.colorCommands)}</div></div>`;
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
      ${text}${clear}${media}
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
  const fullHtml = element.dataset.fullHtml || '';
  element.textContent = fullText;
  const lines = postTextVisualLines(element);
  const article = element.closest('.published-post-surface');
  const button = article?.querySelector('.post-text-toggle');
  const postId = String(article?.dataset.postId || '');
  const overLimit = lines.length > COLLAPSED_POST_LINE_LIMIT;
  if (button) button.hidden = !overLimit;
  if (!overLimit || expandedPostIds.has(postId)) {
    if (fullHtml) element.innerHTML = fullHtml;
    return;
  }

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

const postTextHydrationGenerations = new WeakMap();
function hydratePublishedPostText(root = document, synchronous = false) {
  const generation = (postTextHydrationGenerations.get(root) || 0) + 1;
  postTextHydrationGenerations.set(root, generation);
  root.querySelectorAll('.published-post-surface .text-content').forEach(element => {
    // Never let a color left on a recycled/legacy text container leak into a new note.
    element.style.removeProperty('color');
    element.dataset.fullText = element.textContent || '';
    element.dataset.fullHtml = element.innerHTML || '';
  });
  const apply = () => {
    if (generation !== postTextHydrationGenerations.get(root)) return;
    root.querySelectorAll('.published-post-surface .text-content').forEach(applyCollapsedPostText);
  };
  if (synchronous) { apply(); return; }
  if (document.fonts?.ready) document.fonts.ready.then(() => requestAnimationFrame(apply));
  else requestAnimationFrame(apply);
}

function postTextDrawerDurationMs() {
  const configured = Number(window.__jetRuntimeConfig?.post_text_drawer_animation?.duration_ms);
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
  const article = document.querySelector(
    `.published-post-surface[data-post-id="${CSS.escape(key)}"]`
  );
  const drawer = article?.querySelector('.post-text-drawer');
  const text = drawer?.querySelector('.text-content');
  const button = article?.querySelector('.post-text-toggle');
  if (!drawer || !text || !button || drawer.dataset.animating === 'true') return;

  drawer.dataset.animating = 'true';
  const opening = !expandedPostIds.has(key);
  const duration = postTextDrawerDurationMs();
  const startRect = drawer.getBoundingClientRect();
  const startHeight = startRect.height;
  const fullText = text.dataset.fullText ?? text.textContent ?? '';
  // Lock the inline geometry for the whole drawer animation. Height may animate,
  // but text must never reflow to a different width midway through expansion.
  drawer.style.width = `${startRect.width}px`;
  drawer.style.maxWidth = `${startRect.width}px`;
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
  drawer.style.width = '';
  drawer.style.maxWidth = '';
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
    card.className = 'top-post-mount common_border';
    card.dataset.postRole = 'top';
    card.removeAttribute('data-post-id');
    card.removeAttribute('style');
    card.innerHTML = '';
    return;
  }
  card.className = 'top-post-mount common_border';
  card.dataset.postRole = 'top';
  card.dataset.postId = String(post.id);
  card.removeAttribute('style');
  card.innerHTML = renderPostSurface(post, POST_SURFACE_ROLE.TOP);
  hydrateAttachments(card);
  hydrateVideoAttachments(card);
  bindPublishedInlineImageZoom?.(card);
}

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
  hydrateAttachments(list);
  hydrateVideoAttachments(list);
  bindPublishedInlineImageZoom?.(list);
  hydratePublishedPostText(document, options.stabilizePostText === true);
  fitPublishedPostRows();
  NoteTimestampSpacing.bind();
  if (document.getElementById('archiveScreen')?.classList.contains('open')) renderArchive();
  if (options.scheduleFit !== false) requestAnimationFrame(fit);
}

