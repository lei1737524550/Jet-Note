/*
 * Jet Note post attachment policy
 * --------------------------------
 * Single source of truth for per-Post attachment limits.  The effective
 * config.json may come from the APK defaults or Debug Configuration runtime
 * override; fetch('config.json', {cache:'no-store'}) therefore intentionally
 * stays on the same runtime configuration chain as the rest of Jet Note.
 */
window.JetNotePostAttachmentPolicy = (() => {
  let current = null;

  const ready = fetch('config/media.json', {cache: 'no-store'})
    .then(response => {
      if (!response.ok) throw new Error(`config/media.json: HTTP ${response.status}`);
      return response.json();
    })
    .then(config => {
      const policy = config.post_attachment;
      for (const key of ['audio_max_quantity', 'video_max_quantity',
        'photo_max_quantity', 'video_photo_combined_max_quantity']) {
        if (!Number.isInteger(policy?.[key]) || policy[key] < 0) {
          throw new Error(`Invalid config/media.json: post_attachment.${key}`);
        }
      }
      if (typeof policy.video_photo_coexistence !== 'boolean') {
        throw new Error('Invalid config/media.json: post_attachment.video_photo_coexistence');
      }
      // Jet Note uses a single-audio model. Keep this invariant independent
      // of stale runtime configuration from older installations.
      current = Object.freeze({...policy, audio_max_quantity: 1});
      return current;
    });

  function snapshot() {
    if (!current) throw new Error('Post attachment configuration is not loaded');
    return current;
  }

  function counts(images = [], attachments = []) {
    const safeAttachments = Array.isArray(attachments) ? attachments : [];
    
    return {
      photo: safeAttachments.filter(item => item?.type === 'image').length,
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
    ready,
    get: snapshot,
    counts,
    remaining,
    conflict,
    validateDraft,
  });
})();
