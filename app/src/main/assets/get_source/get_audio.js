(() => {
  const source = window.JetNoteGetSource;
  if (!source) return;
  source.registerType({
    id: 'audio',
    label: source.ds('getSourceTypeAudio', 'getSourceTypeAudio'),
    matches(url) {
      return /(?:audio|sound|pronun|speech|voice|tts)(?:[\/_?=.-]|$)/i.test(url);
    },
    render({panel, list, row, index, bindLongPressSave, colors, ds}) {
      const holder = document.createElement('div');
      holder.style.cssText = 'display:flex;align-items:center;gap:12px;margin:10px 0;min-height:42px;';
      const button = document.createElement('button');
      button.type = 'button';
      const name = (() => { try { return decodeURIComponent(new URL(row.entry.url).pathname.split('/').pop() || row.entry.url); } catch (_) { return row.entry.url; } })();
      button.textContent = (index + 1) + '. ' + name + (row.matched ? '' : ds('nonMatching', ''));
      button.style.cssText = 'min-width:0;flex:1;padding:0;border:0;background:transparent;font:inherit;text-align:left;overflow-wrap:anywhere;line-height:1.45;color:' + (row.matched ? colors.matched || '#168A45' : colors.unmatched || '#c73737') + ';';
      bindLongPressSave(button, row.entry.url, row.matched && source.canAddToPost?.() ? () => { location.href = 'jetnote-add://audio?url=' + encodeURIComponent(row.entry.url); } : null);
      holder.appendChild(button);

      if (row.matched) {
        const preview = document.createElement('button');
        preview.type = 'button';
        preview.style.cssText = 'flex:0 0 40px;width:40px;height:40px;padding:8px;border:1px solid #9fcbb0;border-radius:12px;background:transparent;color:' + (colors.matched || '#168A45') + ';';
        const setIcon = playing => {
          preview.innerHTML = playing ? (window.JET_NOTE_PAUSE_ICON_SVG || '') : (window.JET_NOTE_PLAY_ICON_SVG || '');
          const svg = preview.firstElementChild;
          if (svg) { svg.style.width = '22px'; svg.style.height = '22px'; svg.style.display = 'block'; }
        };
        setIcon(false);
        const audio = new Audio(row.entry.url);
        audio.preload = 'none';
        const reset = () => { setIcon(false); if (panel.__jetNotePlayingAudio === audio) { panel.__jetNotePlayingAudio = null; panel.__jetNotePlayingButton = null; } };
        panel.__jetNoteResetPlayingButton = target => { if (target === preview) setIcon(false); };
        audio.addEventListener('ended', reset);
        audio.addEventListener('pause', () => { if (!audio.ended) reset(); });
        preview.onclick = event => {
          event.preventDefault(); event.stopPropagation();
          if (panel.__jetNotePlayingAudio === audio && !audio.paused) { audio.pause(); return; }
          if (panel.__jetNotePlayingAudio) { try { panel.__jetNotePlayingAudio.pause(); panel.__jetNotePlayingAudio.currentTime = 0; } catch (_) {} }
          if (panel.__jetNotePlayingButton && panel.__jetNotePlayingButton !== preview && typeof panel.__jetNoteResetPlayingButton === 'function') panel.__jetNoteResetPlayingButton(panel.__jetNotePlayingButton);
          panel.__jetNotePlayingAudio = audio;
          panel.__jetNotePlayingButton = preview;
          audio.play().then(() => setIcon(true)).catch(() => { reset(); alert(ds('previewFailed', '')); });
        };
        holder.appendChild(preview);
      }
      list.appendChild(holder);
    }
  });
})();
