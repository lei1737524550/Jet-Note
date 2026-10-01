const VOLUME_ICON =
  '<img src="src/shared/icons/volume.svg" alt="" aria-hidden="true">';

const activeAudioPlayers = [];

let audioPlaybackConfigPromise = null;


function loadAudioPlaybackConfig() {
  if (audioPlaybackConfigPromise) {
    return audioPlaybackConfigPromise;
  }

  audioPlaybackConfigPromise = fetch('config.json', {
    cache: 'no-store'
  })
    .then(response => {
      if (!response.ok) {
        throw new Error('audio config unavailable');
      }

      return response.json();
    })
    .then(value => {
      const limit = value?.audioPlayback?.maxConcurrentPlayingAudios;

      if (!Number.isInteger(limit) || limit < -1) {
        throw new Error(
          'Invalid audioPlayback.maxConcurrentPlayingAudios'
        );
      }

      return {
        maxConcurrentPlayingAudios: limit
      };
    })
    .catch(error => {
      // Allow a later playback attempt to retry loading config.json.
      audioPlaybackConfigPromise = null;
      throw error;
    });

  return audioPlaybackConfigPromise;
}


function removeActiveAudio(audio) {
  const index = activeAudioPlayers.findIndex(
    entry => entry.audio === audio
  );

  if (index >= 0) {
    activeAudioPlayers.splice(index, 1);
  }
}


function resetAudioButton(item) {
  const play = item?.querySelector('.audio-token-play');

  if (!play) {
    return;
  }

  play.classList.remove('playing', 'looping');
  play.setAttribute('aria-label', t('audioPlay'));
}


function destroyAudioPlayer(item) {
  if (!item) {
    return;
  }

  const manager = window.JetNoteMediaResourceManager;
  const resourceId = item.__jetAudioResourceId;

  item.__jetAudioResourceId = null;

  if (resourceId) {
    manager?.release?.(resourceId, 'audio-destroy');
  }

  const audio = item.querySelector('audio');

  if (audio) {
    audio.__jetDisposing = true;
    removeActiveAudio(audio);

    try {
      audio.pause();
    } catch (_) {}

    audio.loop = false;

    try {
      if (audio.src.startsWith('blob:')) {
        URL.revokeObjectURL(audio.src);
      }

      audio.removeAttribute('src');
      audio.load();
    } catch (_) {}

    audio.remove();
  }

  resetAudioButton(item);
}


function reclaimAudioSlots(limit, exceptItem = null) {
  if (limit === -1) {
    return;
  }

  while (true) {
    const candidates = activeAudioPlayers.filter(
      entry => entry.item !== exceptItem
    );

    if (candidates.length < limit) {
      break;
    }

    const oldest = candidates[0];

    if (!oldest) {
      break;
    }

    destroyAudioPlayer(oldest.item);
  }
}


function bindAudioLongPress(item, play) {
  if (play.__jetAudioLongPressBound) {
    return;
  }

  play.__jetAudioLongPressBound = true;

  let timer = null;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let longPressReady = false;
  let suppressClick = false;

  const cancel = () => {
    if (timer != null) {
      clearTimeout(timer);
    }

    timer = null;
    pointerId = null;
  };

  play.addEventListener('pointerdown', event => {
    if (
      event.pointerType === 'mouse' &&
      event.button !== 0
    ) {
      return;
    }

    suppressClick = false;
    cancel();
    longPressReady = false;

    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;

    timer = setTimeout(() => {
      timer = null;
      longPressReady = true;
      suppressClick = true;

      try {
        navigator.vibrate?.(30);
      } catch (_) {}
    }, 550);
  });

  play.addEventListener('pointermove', event => {
    if (
      event.pointerId !== pointerId ||
      timer == null
    ) {
      return;
    }

    const distance = Math.hypot(
      event.clientX - startX,
      event.clientY - startY
    );

    if (distance > 12) {
      cancel();
    }
  });

  play.addEventListener('pointerup', event => {
    if (event.pointerId !== pointerId) {
      return;
    }

    const shouldLoop = longPressReady;

    cancel();
    longPressReady = false;

    if (!shouldLoop) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    void startAudioPlayer(item, true);
  });

  play.addEventListener('pointercancel', () => {
    cancel();
    longPressReady = false;
  });

  play.addEventListener('contextmenu', event => {
    event.preventDefault();
  });

  play.addEventListener(
    'click',
    event => {
      if (!suppressClick) {
        return;
      }

      suppressClick = false;

      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true
  );
}


function createAudioPlayer(item) {
  const record = item?.__jetAudioRecord;

  if (!item || !record) {
    return null;
  }

  let audio = item.querySelector('audio');

  if (audio) {
    return audio;
  }

  audio = document.createElement('audio');
  audio.preload = 'metadata';
  audio.src =
    NativeMedia.url(record) ||
    URL.createObjectURL(record.blob);

  item.appendChild(audio);

  const manager = window.JetNoteMediaResourceManager;

  item.__jetAudioResourceId = manager?.register?.({
    id: `audio:${item.dataset.mediaId || Math.random()}:${Date.now()}`,
    kind: 'audio',
    scope: manager.scopeFor(item),
    owner: item,

    release: () => {
      if (audio.__jetDisposing) {
        return;
      }

      audio.__jetDisposing = true;
      removeActiveAudio(audio);

      try {
        audio.pause();
      } catch (_) {}

      audio.loop = false;

      try {
        if (audio.src.startsWith('blob:')) {
          URL.revokeObjectURL(audio.src);
        }

        audio.removeAttribute('src');
        audio.load();
      } catch (_) {}

      try {
        audio.remove();
      } catch (_) {}

      resetAudioButton(item);
      item.__jetAudioResourceId = null;
    }
  });

  const play = item.querySelector('.audio-token-play');

  audio.addEventListener('play', () => {
    if (audio.__jetDisposing) {
      return;
    }

    play?.classList.add('playing');
    play?.classList.toggle('looping', audio.loop);
    play?.setAttribute('aria-label', t('audioPause'));
  });

  audio.addEventListener('pause', () => {
    if (!audio.__jetStarting) {
      removeActiveAudio(audio);
    }

    if (!audio.__jetDisposing) {
      resetAudioButton(item);
    }
  });

  audio.addEventListener('ended', () => {
    removeActiveAudio(audio);
    resetAudioButton(item);
  });

  audio.addEventListener('error', () => {
    if (audio.__jetDisposing) {
      return;
    }

    destroyAudioPlayer(item);
    alert(t('audioCannotPlay'));
  });

  return audio;
}


async function startAudioPlayer(item, looping = false) {
  let playbackConfig;

  try {
    playbackConfig = await loadAudioPlaybackConfig();
  } catch (_) {
    alert(t('audioCannotPlay'));
    return;
  }

  const audio = createAudioPlayer(item);

  if (!audio) {
    return;
  }

  if (!audio.paused && !audio.ended) {
    if (looping && !audio.loop) {
      audio.loop = true;

      item
        .querySelector('.audio-token-play')
        ?.classList.add('looping');

      return;
    }

    audio.loop = false;
    audio.pause();
    return;
  }

  const limit =
    playbackConfig.maxConcurrentPlayingAudios;

  if (limit === 0) {
    return;
  }

  reclaimAudioSlots(limit, item);

  // Reserve the slot before play() settles so rapid playback requests
  // cannot both pass the concurrency check while audio is still paused.
  removeActiveAudio(audio);

  activeAudioPlayers.push({
    item,
    audio,
    startedAt: Date.now()
  });

  audio.__jetStarting = true;
  audio.loop = looping;

  if (audio.ended) {
    try {
      audio.currentTime = 0;
    } catch (_) {}
  }

  try {
    await audio.play();
  } catch (_) {
    if (!audio.__jetDisposing) {
      destroyAudioPlayer(item);
      alert(t('audioCannotPlay'));
    }
  } finally {
    audio.__jetStarting = false;

    if (
      audio.paused &&
      !audio.__jetDisposing
    ) {
      removeActiveAudio(audio);
    }
  }
}


function renderAttachments(items, editable = false) {
  const attachments = items || [];

  const audio = attachments.filter(
    item => item.type === 'audio'
  );

  const other = attachments.filter(
    item =>
      item.type !== 'audio' &&
      item.type !== 'image' &&
      item.type !== 'video'
  );

  if (!audio.length && !other.length) {
    return '';
  }

  const audioHTML = audio
    .map(
      (item, index) => `
        <div
          class="audio-token attachment-item common_border"
          data-media-id="${escapeHTML(item.id)}"
        >
          <button
            class="audio-token-play common_border"
            type="button"
            aria-label="${escapeHTML(t('audioPlay'))}"
            title="${escapeHTML(item.originalName || t('audioPlay'))}"
          >
            ${VOLUME_ICON}
          </button>

          <audio preload="metadata"></audio>

          ${
            editable
              ? `
                <button
                  class="audio-token-remove"
                  type="button"
                  aria-label="${escapeHTML(t('remove'))}"
                >
                  <img
                    src="src/shared/icons/close_x.svg"
                    alt=""
                    aria-hidden="true"
                  >
                </button>
              `
              : ''
          }
        </div>
      `
    )
    .join('');

  const otherHTML = other
    .map(
      item => `
        <span
          class="attachment-unknown attachment-item common_border"
          data-media-id="${escapeHTML(item.id)}"
        >
          ${escapeHTML(item.type || 'file')}
        </span>
      `
    )
    .join('');

  return `
    <div class="attachment-strip">
      ${audioHTML}
      ${otherHTML}
    </div>
  `;
}


function releaseAttachmentUrls(container) {
  if (!container) {
    return;
  }

  container
    .querySelectorAll('.audio-token')
    .forEach(destroyAudioPlayer);

  releaseVideoAttachmentUrls(container);
}


async function hydrateAttachments(
  container,
  staged = new Map()
) {
  void loadAudioPlaybackConfig();

  const items = [
    ...container.querySelectorAll('.attachment-item')
  ];

  await Promise.all(
    items.map(async item => {
      const audio = item.querySelector('audio');
      const play = item.querySelector(
        '.audio-token-play'
      );

      if (!audio || !play) {
        return;
      }

      try {
        const mediaId = item.dataset.mediaId;

        const record =
          staged.get(mediaId) ||
          await EntryStore.media(mediaId);

        if (!audio.isConnected) {
          return;
        }

        if (!record) {
          throw new Error('Missing attachment');
        }

        item.__jetAudioRecord = record;

        audio.remove();

        play.onclick = () => {
          void startAudioPlayer(item, false);
        };

        bindAudioLongPress(item, play);
      } catch (_) {
        play.onclick = () => {
          alert(t('audioCannotPlay'));
        };

        play.classList.add('unavailable');
      }
    })
  );
}


