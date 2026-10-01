/* Current-version note service composition root. */
let entriesReady = false;
let entriesBusy = false;
const noteService = createNoteService({
  repository: EntryStore,
  state: {get: () => posts, replace: replacePosts},
  rules: JetNotePostRules,
  uuid: entryUuid
});
function stableEntry(record) { return noteService.normalize(record); }
function nextEntryId() {
  return posts.reduce((next, post) =>
    Number.isSafeInteger(post.id) ? Math.max(next, post.id + 1) : next, Date.now());
}
async function initializeEntries() {
  await noteService.initialize();
  entriesReady = true;
}
async function persistEntries(media = []) { await noteService.persist(media); }
