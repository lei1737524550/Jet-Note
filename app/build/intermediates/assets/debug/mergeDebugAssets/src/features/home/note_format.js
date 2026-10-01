/* Inline note color directives.
   Only #RRGGBB$ and #reset$ are commands. They may appear anywhere in text.
   Commands remain in the persisted source text and are hidden only while rendering. */
const NOTE_COLOR_TOKEN_RE = /#(?:[0-9a-fA-F]{6}|reset)\$/gi;
function parseNoteColorText(value){
  const source=String(value||'').replace(/\r\n?/g,'\n');
  const runs=[]; let color=null; let pos=0; let match;
  NOTE_COLOR_TOKEN_RE.lastIndex=0;
  while((match=NOTE_COLOR_TOKEN_RE.exec(source))!==null){
    if(match.index>pos) runs.push({text:source.slice(pos,match.index),color});
    const token=match[0];
    color=/^#reset\$$/i.test(token)?null:token.slice(0,7).toUpperCase();
    pos=match.index+token.length;
  }
  if(pos<source.length) runs.push({text:source.slice(pos),color});
  return runs;
}
function renderNoteFormattedText(value){
  return parseNoteColorText(value).map(run=>`<span style="color:${run.color || 'var(--jet-note-type-body-foreground-color)'}">${escapeHTML(run.text)}</span>`).join('');
}
function notePlainVisibleText(value){return parseNoteColorText(value).map(x=>x.text).join('');}

/* Legacy colorCommands are read only for old notes that do not contain the new inline tokens.
   New/edited notes keep color directives solely in text so paste, backup and import are lossless. */
let editorColorCommands=[];let editorCurrentColor=null;
function loadEditorColorCommands(post){editorColorCommands=[];editorCurrentColor=null;applyEditorTypingColor();}
function applyEditorTypingColor(){const el=document.getElementById('postComposerText');if(el)el.style.color='var(--jet-note-type-body-foreground-color)';}
function bindEditorColorCommands(){const el=document.getElementById('postComposerText');if(!el||el.dataset.colorCommandsBound)return;el.dataset.colorCommandsBound='1';}
function renderLegacyPostColorCommands(text,commands){
  const source=String(text||'');const sorted=commands.slice().sort((a,b)=>(a.offset||0)-(b.offset||0));let out='',pos=0,color=null;
  for(const c of sorted){const at=Math.max(pos,Math.min(source.length,Number(c.offset)||0));out+=`<span style="color:${color || 'var(--jet-note-type-body-foreground-color)'}">${escapeHTML(source.slice(pos,at))}</span>`;color=c.color&&/^#[0-9A-F]{6}$/i.test(c.color)?c.color:null;pos=at;}
  out+=`<span style="color:${color || 'var(--jet-note-type-body-foreground-color)'}">${escapeHTML(source.slice(pos))}</span>`;return out;
}
function renderPostColorCommands(text,commands){
  const source=String(text||'');
  NOTE_COLOR_TOKEN_RE.lastIndex=0;
  if(NOTE_COLOR_TOKEN_RE.test(source)) return renderNoteFormattedText(source);
  if(Array.isArray(commands)&&commands.length) return renderLegacyPostColorCommands(source,commands);
  return renderNoteFormattedText(source);
}
