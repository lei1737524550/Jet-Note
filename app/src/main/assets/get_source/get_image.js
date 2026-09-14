(() => {
  const source = window.JetNoteGetSource;
  if (!source) return;
  source.registerType({
    id: 'image',
    label: source.ds('getSourceTypeImage', 'getSourceTypeImage'),
    matches(url) { return /(?:image|img|photo|picture|thumbnail|avatar)/i.test(url); },
    render({list, row, index, bindLongPressSave, colors, ds}) {
      const holder = document.createElement('div');
      holder.style.cssText = 'display:flex;align-items:center;gap:12px;margin:12px 0;';
      if (row.matched) {
        const imageButton = document.createElement('button');
        imageButton.type = 'button';
        imageButton.style.cssText = 'flex:0 0 92px;width:92px;height:68px;padding:0;border:1px solid #d4d7da;border-radius:10px;background:' + (window.JET_NOTE_GET_SOURCE_BODY_COLOR || 'rgb(255,255,255)') + ';overflow:hidden;';
        const image = document.createElement('img');
        image.src = row.entry.url;
        image.alt = '';
        image.loading = 'lazy';
        image.style.cssText = 'display:block;width:100%;height:100%;object-fit:cover;';
        imageButton.appendChild(image);
        imageButton.onclick = event => { event.preventDefault(); event.stopPropagation(); source.promoteViewer(); if (typeof openImageViewer === 'function') openImageViewer(row.entry.url); };
        holder.appendChild(imageButton);
      }
      const button = document.createElement('button');
      button.type = 'button';
      const name = (() => { try { return decodeURIComponent(new URL(row.entry.url).pathname.split('/').pop() || row.entry.url); } catch (_) { return row.entry.url; } })();
      button.textContent = (index + 1) + '. ' + name + (row.matched ? '' : ds('nonMatching', ''));
      button.style.cssText = 'min-width:0;flex:1;padding:0;border:0;background:transparent;font:inherit;text-align:left;overflow-wrap:anywhere;line-height:1.45;color:' + (row.matched ? colors.matched || '#168A45' : colors.unmatched || '#c73737') + ';';
      bindLongPressSave(button, row.entry.url, row.matched && typeof openImageViewer === 'function' ? () => { source.promoteViewer(); openImageViewer(row.entry.url); } : null);
      holder.appendChild(button);
      list.appendChild(holder);
    }
  });
})();
