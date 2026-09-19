(() => {
  const source = window.JetNoteGetSource;
  if (!source) return;

  const playableCache = new Map();
  const validatePlayableVideo = url => {
    if (playableCache.has(url)) return playableCache.get(url);
    const task = new Promise(resolve => {
      const video = document.createElement('video');
      let settled = false;
      const finish = ok => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        video.onloadedmetadata = video.onloadeddata = video.oncanplay = video.onerror = null;
        try { video.pause(); video.removeAttribute('src'); video.load(); } catch (_) {}
        resolve(Boolean(ok));
      };
      const timer = setTimeout(() => finish(false), 6500);
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        // HAVE_METADATA plus a finite/stream duration proves that the browser's
        // media stack recognized the candidate as video. Wait for frame data
        // where possible so the result can show an actual frame thumbnail.
        if (video.videoWidth > 0 && video.videoHeight > 0) finish(true);
      };
      video.onloadeddata = () => finish(video.videoWidth > 0 && video.videoHeight > 0);
      video.oncanplay = () => finish(video.videoWidth > 0 && video.videoHeight > 0);
      video.onerror = () => finish(false);
      try { video.src = url; video.load(); } catch (_) { finish(false); }
    });
    playableCache.set(url, task);
    return task;
  };

  source.registerType({
    id: 'video',
    label: source.ds('getSourceTypeVideo', 'Video'),
    matches(url) { return /(?:video|movie|stream|playlist|\.m3u8(?:$|[?#]))/i.test(url); },
    validate: validatePlayableVideo,
    render({list, row, index, bindLongPressSave, colors}) {
      const holder = document.createElement('div');
      holder.style.cssText = 'display:flex;align-items:center;gap:12px;margin:12px 0;';

      const previewButton = document.createElement('button');
      previewButton.type = 'button';
      previewButton.style.cssText = 'flex:0 0 92px;width:92px;height:68px;padding:0;border:1px solid #d4d7da;border-radius:10px;background:#111;overflow:hidden;position:relative;';
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.style.cssText = 'display:block;width:100%;height:100%;object-fit:cover;pointer-events:none;';
      video.addEventListener('loadedmetadata', () => {
        try {
          if (Number.isFinite(video.duration) && video.duration > 0.08) video.currentTime = 0.05;
        } catch (_) {}
      }, {once:true});
      video.src = row.entry.url;
      previewButton.appendChild(video);
      previewButton.onclick = event => {
        event.preventDefault(); event.stopPropagation();
        source.promoteViewer();
        if (typeof openVideoViewer === 'function') openVideoViewer(row.entry.url, 0);
      };
      holder.appendChild(previewButton);

      const button = document.createElement('button');
      button.type = 'button';
      const name = (() => { try { return decodeURIComponent(new URL(row.entry.url).pathname.split('/').pop() || row.entry.url); } catch (_) { return row.entry.url; } })();
      button.textContent = (index + 1) + '. ' + name;
      button.style.cssText = 'min-width:0;flex:1;padding:0;border:0;background:transparent;font:inherit;text-align:left;overflow-wrap:anywhere;line-height:1.45;color:' + (colors.matched || '#168A45') + ';';
      bindLongPressSave(button, row.entry.url, source.canAddToPost?.() ? () => { location.href = 'jetnote-add://video?url=' + encodeURIComponent(row.entry.url); } : null);
      holder.appendChild(button);
      list.appendChild(holder);
    }
  });
})();
