let posts = [];
// All replacements pass through this boundary. Views choose when to render so FLIP
// measurement and inverse transforms remain in the same JavaScript task.
function replacePosts(nextPosts) {
  if (!Array.isArray(nextPosts)) throw new TypeError('Post state must be an array');
  posts = nextPosts;
}
