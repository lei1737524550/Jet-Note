(() => {
  const previous = document.getElementById('jet-note-audio-results');

  if (previous) {
    if (typeof previous.__jetNoteStopPreview === 'function') {
      previous.__jetNoteStopPreview();
    }

    previous.remove();
  }

  const zh = window.JET_NOTE_UI_LANGUAGE !== 'en';

  const urls = new Map();

  const nativeUrls = Array.isArray(window.JET_NOTE_NATIVE_AUDIO_URLS)
    ? window.JET_NOTE_NATIVE_AUDIO_URLS
    : [];

  const capturedAudioUrls = Array.isArray(window.JET_NOTE_CAPTURED_AUDIO_URLS)
    ? window.JET_NOTE_CAPTURED_AUDIO_URLS
    : [];

  const capturedCandidateUrls = Array.isArray(window.JET_NOTE_CAPTURED_CANDIDATE_URLS)
    ? window.JET_NOTE_CAPTURED_CANDIDATE_URLS
    : [];

  const audioHint =
    /(?:\.(?:mp3|m4a|aac|wav|ogg|opus|flac)(?:[?#]|$)|audio|sound|pronun|speech|voice|tts|\/media\/)/i;

  const directAudioHint =
    /(?:\.(?:mp3|m4a|aac|wav|ogg|opus|flac)(?:[?#]|$)|\/(?:audio|sound|pronun|speech|voice|tts)(?:[\/_?=.-]|$))/i;

  const normalize = value => {
    if (typeof value !== 'string') {
      return null;
    }

    let raw = value
      .trim()
      .replace(/&amp;/g, '&')
      .replace(/\\u002F/gi, '/')
      .replace(/\\\//g, '/');

    if (raw.startsWith('//')) {
      raw = 'https:' + raw;
    }

    try {
      const url = new URL(raw, location.href);

      return url.protocol === 'https:'
        ? url.href
        : null;
    } catch (_) {
      return null;
    }
  };

  const add = (value, { allowUnknown = false } = {}) => {
    const url = normalize(value);

    if (!url) {
      return;
    }

    if (!allowUnknown && !audioHint.test(url)) {
      return;
    }

    const existing = urls.get(url);

    // Only an explicit audio-shaped URL gets the green/high-priority state.
    // A resource discovered through playback can still be a binary intermediary.
    const isAudio = Boolean(
      directAudioHint.test(url) ||
      (existing && existing.isAudio)
    );

    urls.set(url, {
      url,
      isAudio
    });
  };

  nativeUrls.forEach(url => {
    add(url, { allowUnknown: true });
  });

  capturedCandidateUrls.forEach(url => {
    add(url, { allowUnknown: true });
  });

  capturedAudioUrls.forEach(url => {
    add(url, { allowUnknown: true });
  });

  try {
    performance
      .getEntriesByType('resource')
      .forEach(entry => {
        add(entry.name);
      });
  } catch (_) {
    // Ignore unavailable Performance API data.
  }

  document
    .querySelectorAll(
      'audio, video, audio source, video source, [src], [data-src], [data-audio], [data-audio-url], [data-url]'
    )
    .forEach(node => {
      add(node.currentSrc);
      add(node.src);

      [
        'src',
        'data-src',
        'data-audio',
        'data-audio-url',
        'data-url'
      ].forEach(name => {
        add(
          node.getAttribute &&
          node.getAttribute(name)
        );
      });
    });

  document
    .querySelectorAll(
      'script[type="application/ld+json"], script[type="application/json"], script:not([src])'
    )
    .forEach(script => {
      const source = (script.textContent || '').slice(0, 500000);

      const matches =
        source.match(/https?:\\?\/\\?\/[^\s"'<>\\]+/g) || [];

      matches.forEach(url => {
        add(url);
      });
    });

  const found = [...urls.values()].sort(
    (a, b) =>
      Number(b.isAudio) - Number(a.isAudio) ||
      a.url.localeCompare(b.url)
  );

  if (!found.length) {
    alert(
      zh
        ? '没有找到音频。请先在网页中完整播放一次发音后，再点击“获取音频”。'
        : 'No audio was found. Play the pronunciation once, then tap “Get Audio”.'
    );

    return;
  }

  const panel = document.createElement('div');

  panel.id = 'jet-note-audio-results';

  // Keep the result sheet above Android's gesture / Home navigation area.
  panel.style =
    'position:fixed;' +
    'top:10px;' +
    'right:10px;' +
    'bottom:calc(env(safe-area-inset-bottom, 0px) + 56px);' +
    'left:10px;' +
    'z-index:2147483647;' +
    'background:#fff;' +
    'color:#202124;' +
    'padding:20px;' +
    'overflow:auto;' +
    'font:16px sans-serif;' +
    'border:1px solid #bfc1c4;' +
    'border-radius:14px;' +
    'box-sizing:border-box;' +
    'box-shadow:0 8px 28px rgba(0,0,0,.18);';

  let playingAudio = null;
  let playingButton = null;

  const stopPreview = () => {
    if (playingAudio) {
      playingAudio.pause();
      playingAudio.currentTime = 0;
    }

    if (playingButton) {
      playingButton.textContent = '▶';

      playingButton.setAttribute(
        'aria-label',
        zh
          ? '播放音频'
          : 'Play audio'
      );
    }

    playingAudio = null;
    playingButton = null;
  };

  panel.__jetNoteStopPreview = stopPreview;

  const close = document.createElement('button');

  close.textContent = zh
    ? '关闭'
    : 'Close';

  close.style =
    'padding:8px 14px;' +
    'border:1px solid #c8cbd0;' +
    'border-radius:10px;' +
    'background:#fff;' +
    'color:#202124;';

  close.onclick = () => {
    stopPreview();
    panel.remove();
  };

  panel.appendChild(close);

  const hint = document.createElement('p');

  hint.textContent = zh
    ? '已找到 ' + found.length + ' 个候选资源；音频资源优先显示。'
    : 'Found ' + found.length + ' candidate resource(s). Audio resources are listed first.';

  hint.style =
    'margin:26px 0 0;' +
    'font-size:16px;' +
    'line-height:1.45;' +
    'color:#202124;';

  panel.appendChild(hint);

  found.forEach((entry, index) => {
    const link = document.createElement('a');

    const url = entry.url;

    const name =
      url
        .split('/')
        .pop()
        .split('?')[0] ||
      url;

    link.href =
      'jetnote-download://audio?url=' +
      encodeURIComponent(url);

    link.textContent =
      (index + 1) +
      '. ' +
      name +
      (
        entry.isAudio
          ? ''
          : (
              zh
                ? '（非音频资源）'
                : ' (non-audio resource)'
            )
      );

    link.style =
      'min-width:0;' +
      'flex:1;' +
      'color:' +
      (entry.isAudio ? '#168a45' : '#c73737') +
      ';overflow-wrap:anywhere;' +
      'line-height:1.45;';

    if (!entry.isAudio) {
      link.style.display = 'block';
      link.style.margin = '20px 0';

      panel.appendChild(link);
      return;
    }

    const row = document.createElement('div');

    row.style =
      'display:flex;' +
      'align-items:center;' +
      'gap:12px;' +
      'margin:16px 0;' +
      'min-height:40px;';

    row.appendChild(link);

    const preview = new Audio(url);

    preview.preload = 'none';

    let previewFailureShown = false;

    const play = document.createElement('button');

    play.type = 'button';
    play.textContent = '▶';

    play.setAttribute(
      'aria-label',
      zh
        ? '播放音频'
        : 'Play audio'
    );

    play.style =
      'flex:0 0 40px;' +
      'width:40px;' +
      'height:40px;' +
      'padding:0;' +
      'border:1px solid #9fcbb0;' +
      'border-radius:12px;' +
      'background:#fff;' +
      'color:#168a45;' +
      'font-size:18px;' +
      'line-height:1;';

    const resetIfCurrent = () => {
      if (playingAudio !== preview) {
        return;
      }

      play.textContent = '▶';

      play.setAttribute(
        'aria-label',
        zh
          ? '播放音频'
          : 'Play audio'
      );

      playingAudio = null;
      playingButton = null;
    };

    const reportPreviewFailure = () => {
      if (previewFailureShown) {
        return;
      }

      previewFailureShown = true;

      resetIfCurrent();

      alert(
        zh
          ? '音频预览失败，请尝试保存后播放。'
          : 'Audio preview failed. Try saving the file and playing it locally.'
      );
    };

    preview.addEventListener(
      'ended',
      resetIfCurrent
    );

    preview.addEventListener(
      'pause',
      () => {
        if (!preview.ended) {
          resetIfCurrent();
        }
      }
    );

    preview.addEventListener(
      'error',
      reportPreviewFailure
    );

    play.onclick = event => {
      event.preventDefault();
      event.stopPropagation();

      if (
        playingAudio === preview &&
        !preview.paused
      ) {
        preview.pause();
        return;
      }

      stopPreview();

      previewFailureShown = false;
      playingAudio = preview;
      playingButton = play;

      preview
        .play()
        .then(() => {
          if (playingAudio === preview) {
            play.textContent = '❚❚';

            play.setAttribute(
              'aria-label',
              zh
                ? '暂停音频'
                : 'Pause audio'
            );
          }
        })
        .catch(reportPreviewFailure);
    };

    row.appendChild(play);
    panel.appendChild(row);
  });

  document.body.appendChild(panel);
})();