/*
 * Jet Note post attachment policy
 * --------------------------------
 * Single source of truth for per-Post attachment limits.  The effective
 * config.json may come from the APK defaults or Debug Configuration runtime
 * override; fetch('config.json', {cache:'no-store'}) therefore intentionally
 * stays on the same runtime configuration chain as the rest of Jet Note.
 */
window.JetNotePostAttachmentPolicy = (() => {
  const DEFAULTS = Object.freeze({
    audio_max_quantity: 20,
    video_max_quantity: 9,
    photo_max_quantity: 9,
    video_photo_coexistence: true,
    video_photo_combined_max_quantity: 9,
  });

  let current = {...DEFAULTS};

  function nonNegativeInteger(value, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(0, Math.trunc(number));
  }

  function normalize(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    return Object.freeze({
      audio_max_quantity: nonNegativeInteger(source.audio_max_quantity, DEFAULTS.audio_max_quantity),
      video_max_quantity: nonNegativeInteger(source.video_max_quantity, DEFAULTS.video_max_quantity),
      photo_max_quantity: nonNegativeInteger(source.photo_max_quantity, DEFAULTS.photo_max_quantity),
      video_photo_coexistence: source.video_photo_coexistence === true,
      video_photo_combined_max_quantity: nonNegativeInteger(
        source.video_photo_combined_max_quantity,
        DEFAULTS.video_photo_combined_max_quantity,
      ),
    });
  }

  const ready = fetch('config.json', {cache: 'no-store'})
    .then(response => response.ok ? response.json() : Promise.reject(new Error('config.json load failed')))
    .then(config => {
      current = normalize(config?.post_attachment);
      return current;
    })
    .catch(error => {
      console.warn('[PostAttachmentPolicy] using built-in defaults', error);
      current = Object.freeze({...DEFAULTS});
      return current;
    });

  function snapshot() {
    return current;
  }

  function counts(images = [], attachments = []) {
    const safeAttachments = Array.isArray(attachments) ? attachments : [];
    return {
      photo: Array.isArray(images) ? images.length : 0,
      video: safeAttachments.filter(item => item?.type === 'video').length,
      audio: safeAttachments.filter(item => item?.type === 'audio').length,
    };
  }

  function remaining(type, images = [], attachments = []) {
    const policy = snapshot();
    const count = counts(images, attachments);
    if (type === 'audio') return Math.max(0, policy.audio_max_quantity - count.audio);
    if (type === 'image') {
      let value = Math.max(0, policy.photo_max_quantity - count.photo);
      if (!policy.video_photo_coexistence && count.video > 0) return 0;
      if (policy.video_photo_coexistence) {
        value = Math.min(value, Math.max(0, policy.video_photo_combined_max_quantity - count.photo - count.video));
      }
      return value;
    }
    if (type === 'video') {
      let value = Math.max(0, policy.video_max_quantity - count.video);
      if (!policy.video_photo_coexistence && count.photo > 0) return 0;
      if (policy.video_photo_coexistence) {
        value = Math.min(value, Math.max(0, policy.video_photo_combined_max_quantity - count.photo - count.video));
      }
      return value;
    }
    return 0;
  }

  function conflict(type, images = [], attachments = []) {
    const policy = snapshot();
    if (policy.video_photo_coexistence) return false;
    const count = counts(images, attachments);
    return (type === 'image' && count.video > 0) || (type === 'video' && count.photo > 0);
  }

  function validateDraft(draft) {
    const policy = snapshot();
    const count = counts(draft?.images, draft?.attachments);
    if (count.audio > policy.audio_max_quantity) return {ok:false, code:'audio-limit'};
    if (count.video > policy.video_max_quantity) return {ok:false, code:'video-limit'};
    if (count.photo > policy.photo_max_quantity) return {ok:false, code:'image-limit'};
    if (!policy.video_photo_coexistence && count.video > 0 && count.photo > 0) {
      return {ok:false, code:'image-video-exclusive'};
    }
    if (policy.video_photo_coexistence && count.video + count.photo > policy.video_photo_combined_max_quantity) {
      return {ok:false, code:'video-photo-combined-limit'};
    }
    return {ok:true};
  }

  return Object.freeze({
    DEFAULTS,
    ready,
    get: snapshot,
    counts,
    remaining,
    conflict,
    validateDraft,
  });
})();
