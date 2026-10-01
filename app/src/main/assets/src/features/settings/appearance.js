const DEFAULT_BACKGROUND = {rgb:{r:174,g:209,b:148}};
const DEFAULT_BODY = {rgb:{r:210,g:233,b:194}};
const APPEARANCE_CACHE_KEYS = {
  background:'jet_note_appearance_background_cache',
  body:'jet_note_appearance_body_cache'
};
let currentBackground = structuredClone(DEFAULT_BACKGROUND);
let currentBody = structuredClone(DEFAULT_BODY);
let appearanceDefaults = {
  background:structuredClone(DEFAULT_BACKGROUND),
  body:structuredClone(DEFAULT_BODY)
};

function clampRgb(value,fallback){const n=Number(value);return Number.isInteger(n)&&n>=0&&n<=255?n:fallback;}
function normalizeBackground(value){
  const rgb=(value&&typeof value==='object'&&value.rgb&&typeof value.rgb==='object')?value.rgb:{};
  return {rgb:{r:clampRgb(rgb.r,255),g:clampRgb(rgb.g,255),b:clampRgb(rgb.b,255)}};
}
function readAppearanceCache(key){
  try {
    const raw=localStorage.getItem(key);
    if(!raw)return null;
    const parsed=JSON.parse(raw);
    const rgb=parsed?.rgb;
    if(!rgb || ![rgb.r,rgb.g,rgb.b].every(value=>Number.isInteger(value)&&value>=0&&value<=255))return null;
    return normalizeBackground(parsed);
  } catch(_) { return null; }
}
function writeAppearanceCache(key,value){
  try { localStorage.setItem(key,JSON.stringify(normalizeBackground(value))); }
  catch(_) {}
}
function colorHexToAppearance(value,fallback){
  const match=String(value||'').trim().match(/^#?([0-9a-f]{6})$/i);
  if(!match)return structuredClone(fallback);
  const hex=match[1];
  return {rgb:{r:parseInt(hex.slice(0,2),16),g:parseInt(hex.slice(2,4),16),b:parseInt(hex.slice(4,6),16)}};
}
async function loadAppearanceDefaults(){
  try {
    const response=await fetch('config.json',{cache:'no-store'});
    if(!response.ok)throw new Error(`config.json ${response.status}`);
    const configured=await response.json();
    appearanceDefaults={
      background:colorHexToAppearance(configured?.global_set_background,DEFAULT_BACKGROUND),
      body:colorHexToAppearance(configured?.global_set_body,DEFAULT_BODY)
    };
  } catch(error) { console.warn('Appearance defaults unavailable',error); }
  return appearanceDefaults;
}
function applyBackground(value){
  currentBackground=normalizeBackground(value);const {r,g,b}=currentBackground.rgb;const color=`rgb(${r},${g},${b})`;
  document.documentElement.style.setProperty('--page-background',color);
  document.documentElement.style.setProperty('--page-background-image','none');
  const bodyColor=`rgb(${currentBody.rgb.r},${currentBody.rgb.g},${currentBody.rgb.b})`;
  // Publish the two canonical appearance colors synchronously. `setting_*`
  // deliberately binds to the Body source directly, so opening Settings never
  // depends on an asynchronous config-resolution pass to paint module boxes.
  document.documentElement.style.setProperty('--jet-note-current-background',color);
  document.documentElement.style.setProperty('--jet-note-current-body-background',bodyColor);
  // Resolve other Jet Note visual types from the same two sources. Components can
  // still opt into current_background/current_body through config.json.
  window.JetNoteType?.apply?.(color,bodyColor).catch?.(error=>console.warn('Jet Note type appearance failed',error));
  const theme=document.querySelector('meta[name="theme-color"]');if(theme)theme.content=color;
}
function applyBody(value){
  currentBody=normalizeBackground(value);
  applyBackground(currentBackground);
}


// Never paint the configured green default before the saved appearance has
// been read. That old eager paint produced a full-screen green startup flash.
// A synchronous mirror gives later launches the real last-used colors on the
// first WebView frame; a fresh install stays on base.css white until
// IndexedDB has resolved, then applies the authoritative colors once.
const cachedBackground=readAppearanceCache(APPEARANCE_CACHE_KEYS.background);
const cachedBody=readAppearanceCache(APPEARANCE_CACHE_KEYS.body);
if(cachedBody)currentBody=cachedBody;
if(cachedBackground)applyBackground(cachedBackground);
loadAppearanceDefaults().then(async defaults=>{
  // global_set_background / global_set_body are authoritative. Color View no
  // longer mutates application appearance; it is only a picker/formatter.
  currentBody=normalizeBackground(defaults.body);
  currentBackground=normalizeBackground(defaults.background);
  writeAppearanceCache(APPEARANCE_CACHE_KEYS.body,currentBody);
  writeAppearanceCache(APPEARANCE_CACHE_KEYS.background,currentBackground);
  applyBackground(currentBackground);
}).catch(error=>console.warn('Appearance restore failed',error));
