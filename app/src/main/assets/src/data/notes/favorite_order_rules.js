/* Pure post rules. Inject timestamps; callers own rendering and persistence. */
(function (root) {
'use strict';
function normalizeStarStateValue(value){
  if(value === 'super_star') return 'super_star';
  if(value === 'star') return 'star';
  return 'none';
}

function normalizePostStarStateRecord(record){
  const result={...record};
  result.starState=normalizeStarStateValue(result.starState);
  return result;
}
function enforceSingleSuperStar(records){
  const list=(Array.isArray(records)?records:[]).map(item=>normalizePostStarStateRecord(item));
  const supers=list.filter(item=>item.starState==='super_star');
  if(supers.length<=1)return list;
  const score=item=>{
    const updated=Date.parse(item.updatedAt||'');
    if(Number.isFinite(updated))return updated;
    const created=Date.parse(item.createdAt||'');
    if(Number.isFinite(created))return created;
    const id=Number(item.id);
    return Number.isFinite(id)?id:0;
  };
  let winner=supers[0];
  for(const item of supers.slice(1))if(score(item)>score(winner))winner=item;
  for(const item of list)if(item!==winner&&item.starState==='super_star')item.starState='none';
  return list;
}
function getPostStarState(post) {
  return normalizeStarStateValue(post?.starState);
}

function setPostStarState(post, state, now) {
  if (!post) return;
  const previous = getPostStarState(post);
  const normalized = state === 'super_star' ? 'super_star' : state === 'star' ? 'star' : 'none';
  post.starState = normalized;

  // Ordinary favorites are ordered by the moment they ENTER the favorite area,
  // not by the Post publication timestamp. Re-favoriting therefore moves the
  // Post back to the top of the ordinary favorite area.
  if (normalized === 'star' && previous !== 'star') {
    post.favoritedAt = now;
  }

}

function postPublishedAt(post) {
  const parsed = Date.parse(post?.createdAt || '');
  if (Number.isFinite(parsed)) return parsed;
  const id = Number(post?.id);
  return Number.isFinite(id) ? id : 0;
}

function comparePostDisplayOrder(a, b) {
  const timeDifference = postPublishedAt(b) - postPublishedAt(a);
  if (timeDifference !== 0) return timeDifference;

  // Equal timestamps are deterministic: the lexicographically larger ID is
  // displayed first. IDs remain identity/tie-break data; timestamps are still
  // the primary ordering rule.
  return String(b?.id ?? '').localeCompare(String(a?.id ?? ''));
}

function compareFavoriteDisplayOrder(a, b) {
  const aStarred = Date.parse(a?.favoritedAt || '');
  const bStarred = Date.parse(b?.favoritedAt || '');
  const aHasFavoritedAt = Number.isFinite(aStarred);
  const bHasFavoritedAt = Number.isFinite(bStarred);
  if (aHasFavoritedAt && bHasFavoritedAt && aStarred !== bStarred) return bStarred - aStarred;
  if (aHasFavoritedAt !== bHasFavoritedAt) return aHasFavoritedAt ? -1 : 1;
  return comparePostDisplayOrder(a, b);
}

function orderedMainPosts(sourcePosts, display) {
  if (!display.main_posts) return [];
  const visible = sourcePosts.filter(post => getPostStarState(post) !== 'super_star');
  const regular = visible
    .filter(post => getPostStarState(post) !== 'star')
    .sort(comparePostDisplayOrder);
  const star = display.star_post
    ? visible.filter(post => getPostStarState(post) === 'star').sort(compareFavoriteDisplayOrder)
    : [];
  return star.concat(regular);
}


function changeStar(records, id, action, now) {
  const next = records.map(record => ({...record}));
  const post = next.find(item => String(item.id) === String(id));
  if (!post) return null;
  const previous = getPostStarState(post);
  const state = action === 'super_star' ? 'super_star' : previous === 'none' ? 'star' : 'none';
  if (state === 'super_star') {
    for (const other of next) if (other !== post && getPostStarState(other) === 'super_star') setPostStarState(other, 'none', now);
  }
  setPostStarState(post, state, now);
  const movement = action === 'super_star' ? 'super_star' : state === 'star' ? 'star' : previous === 'super_star' ? 'cancel_super_star' : 'cancel_star';
  return {posts: next, state, movement};
}
root.JetNotePostRules = Object.freeze({normalizeStarStateValue, normalizePostStarStateRecord,
  enforceSingleSuperStar, getPostStarState, postPublishedAt, comparePostDisplayOrder,
  compareFavoriteDisplayOrder, orderedMainPosts, changeStar});
})(globalThis);
