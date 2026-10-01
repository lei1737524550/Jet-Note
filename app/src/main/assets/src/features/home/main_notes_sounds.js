const POST_UI_SOUND_PATHS = Object.freeze({
  archive: 'src/features/home/sounds/archive.mp3',
  unarchive: 'src/features/home/sounds/unarchive.mp3',
  star: 'src/features/home/sounds/star.ogg',
  super_star: 'src/features/home/sounds/super_star.ogg',
  cancel_star: 'src/features/home/sounds/cancel_star_error_open_trash.ogg',
  open_trash: 'src/features/home/sounds/cancel_star_error_open_trash.ogg',
  delete_it: 'src/features/home/sounds/delete_it.ogg',
  editor_open: 'src/features/home/sounds/editor_send.mp3',
  send_post: 'src/features/home/sounds/editor_send.mp3',
  error: 'src/features/home/sounds/cancel_star_error_open_trash.ogg'
});

// Keep reusable audio elements alive for UI sounds. This removes the decode/load
// delay from editor_send.mp3 and keeps the shared editor/send sound alive while
// the editor is closing immediately after a successful publish.
const POST_UI_SOUND_CACHE = new Map();
function getPostUiSound(name) {
  const source = POST_UI_SOUND_PATHS[name];
  if (!source) return null;
  let audio = POST_UI_SOUND_CACHE.get(name);
  if (!audio) {
    audio = new Audio(source);
    audio.preload = 'auto';
    try { audio.load(); } catch (_) {}
    POST_UI_SOUND_CACHE.set(name, audio);
  }
  return audio;
}
function preloadPostUiSounds(...names) {
  names.forEach(name => getPostUiSound(name));
}
function playPostUiSound(name) {
  let audio;
  const failed = error => {
    // Do not interrupt note saving for optional sound feedback, but retain a
    // useful diagnostic instead of swallowing autoplay/decode/path failures.
    console.warn('[Post UI sound] playback failed', name, POST_UI_SOUND_PATHS[name], error);
    return false;
  };
  try {
    audio = getPostUiSound(name);
    if (!audio) return Promise.resolve(false);
    audio.pause();
    // Some WebViews cannot seek before metadata is ready. That must not
    // prevent the first play() call, which starts at zero on a fresh element.
    try { audio.currentTime = 0; } catch (_) {}
    const promise = audio.play();
    return Promise.resolve(promise).then(() => true, failed);
  } catch (error) {
    return Promise.resolve(failed(error));
  }
}
// The two interaction-critical sounds are tiny and should be ready before the
// first tap. Other sounds remain lazy-loaded.
preloadPostUiSounds('editor_open', 'send_post');
