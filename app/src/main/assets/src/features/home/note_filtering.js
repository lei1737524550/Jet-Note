/* Compatibility functions used by existing views and native-facing scripts. */
function normalizeStarStateValue(...args) { return JetNotePostRules.normalizeStarStateValue(...args); }
function normalizePostStarStateRecord(...args) { return JetNotePostRules.normalizePostStarStateRecord(...args); }
function enforceSingleSuperStar(...args) { return JetNotePostRules.enforceSingleSuperStar(...args); }
function getPostStarState(...args) { return JetNotePostRules.getPostStarState(...args); }
function postPublishedAt(...args) { return JetNotePostRules.postPublishedAt(...args); }
function comparePostDisplayOrder(...args) { return JetNotePostRules.comparePostDisplayOrder(...args); }
function compareFavoriteDisplayOrder(...args) { return JetNotePostRules.compareFavoriteDisplayOrder(...args); }
function orderedMainPosts(sourcePosts = posts, display = effectiveHomeDisplay()) {
  return JetNotePostRules.orderedMainPosts(sourcePosts.filter(post => !post?.archived), display);
}
function getSuperStarPost() {
  return posts.find(post => !post?.archived && getPostStarState(post) === 'super_star') || null;
}

function getMainPosts() {
  return orderedMainPosts();
}

