(() => {
  const source = window.JetNoteGetSource;
  if (!source) return;
  source.registerType({
    id: 'video',
    label: source.ds('getSourceTypeVideo', 'getSourceTypeVideo'),
    matches(url) { return /(?:video|movie|stream|playlist)/i.test(url); },
    render({list, row, index, bindLongPressSave, colors, ds}) {
      const holder = document.createElement('div');
      holder.style.cssText = 'display:flex;align-items:center;gap:12px;margin:12px 0;';
      if (row.matched) {
        const previewButton = document.createElement('button');
        previewButton.type = 'button';
        previewButton.style.cssText = 'flex:0 0 92px;width:92px;height:68px;padding:0;border:1px solid #d4d7da;border-radius:10px;background:#111;overflow:hidden;position:relative;';
        const video = document.createElement('video');
        video.src = row.entry.url;
        video.muted = true;
        video.playsInline = true;
        video.preload = 'metadata';
        video.style.cssText = 'display:block;width:100%;height:100%;object-fit:cover;pointer-events:none;';
        previewButton.appendChild(video);
        previewButton.onclick = event => { event.preventDefault(); event.stopPropagation(); source.promoteViewer(); if (typeof openVideoViewer === 'function') openVideoViewer(row.entry.url, 0); };
        holder.appendChild(previewButton);
      }
      const button = document.createElement('button');
      button.type = 'button';
      const name = (() => { try { return decodeURIComponent(new URL(row.entry.url).pathname.split('/').pop() || row.entry.url); } catch (_) { return row.entry.url; } })();
      button.textContent = (index + 1) + '. ' + name + (row.matched ? '' : ds('nonMatching', ''));
      button.style.cssText = 'min-width:0;flex:1;padding:0;border:0;background:transparent;font:inherit;text-align:left;overflow-wrap:anywhere;line-height:1.45;color:' + (row.matched ? colors.matched || '#168A45' : colors.unmatched || '#c73737') + ';';
      bindLongPressSave(button, row.entry.url, row.matched && typeof openVideoViewer === 'function' ? () => { source.promoteViewer(); openVideoViewer(row.entry.url, 0); } : null);
      holder.appendChild(button);
      list.appendChild(holder);
    }
  });
})();
