(() => {
  const source = window.JetNoteGetSource;
  if (!source) return;
  source.registerType({
    id: 'text',
    label: source.ds('getSourceTypeText', 'getSourceTypeText'),
    matches(url) {
      return /(?:text|json|xml|javascript|stylesheet|source|code|readme)/i.test(url);
    },
    render({list, row, index, bindLongPressSave, colors, ds}) {
      const button = document.createElement('button');
      button.type = 'button';
      const name = (() => { try { return decodeURIComponent(new URL(row.entry.url).pathname.split('/').pop() || row.entry.url); } catch (_) { return row.entry.url; } })();
      button.textContent = (index + 1) + '. ' + name + (row.matched ? '' : ds('nonMatching', ''));
      button.style.cssText = 'display:block;width:100%;padding:11px 0;border:0;background:transparent;font:inherit;text-align:left;overflow-wrap:anywhere;line-height:1.45;color:' + (row.matched ? colors.matched || '#168A45' : colors.unmatched || '#c73737') + ';';
      bindLongPressSave(button, row.entry.url, null);
      list.appendChild(button);
    }
  });
})();
