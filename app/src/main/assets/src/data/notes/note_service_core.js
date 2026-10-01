/* Current-version note service. IndexedDB is the single source of truth. */
window.createNoteService = function ({ repository, state, rules, uuid, now = Date.now }) {
  let sequence = 0;

  function normalize(record) {
    const result = rules.normalizePostStarStateRecord(record || {});
    if (!result.uuid) result.uuid = uuid();
    if (!Number.isSafeInteger(result.id)) result.id = now() + sequence++;
    if (!Array.isArray(result.attachments)) result.attachments = [];
    if (!Array.isArray(result.images)) result.images = [];
    if (!('createdAt' in result)) result.createdAt = new Date().toISOString();
    if (!('updatedAt' in result)) result.updatedAt = result.createdAt;
    return result;
  }

  async function initialize() {
    const saved = await repository.read();
    const nextPosts = rules.enforceSingleSuperStar(
      Array.isArray(saved?.posts) ? saved.posts.map(normalize) : []
    );
    state.replace(nextPosts);
  }

  async function persist(media = []) {
    const next = rules.enforceSingleSuperStar(state.get());
    await repository.commit(next, media);
    state.replace(next);
  }

  return Object.freeze({ initialize, persist, normalize });
};
