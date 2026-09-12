const DEFAULT_BACKGROUND = {rgb:{r:255,g:255,b:255}};
let currentBackground = structuredClone(DEFAULT_BACKGROUND);

const AppearanceRepository = {
  databasePromise:null,
  database(){
    if(this.databasePromise)return this.databasePromise;
    this.databasePromise=new Promise((resolve,reject)=>{
      const request=indexedDB.open('jet_note_appearance',1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('settings'))request.result.createObjectStore('settings');};
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(new Error('Appearance database blocked'));
    });
    return this.databasePromise;
  },
  async getBackground(){
    const db=await this.database();
    return new Promise((resolve,reject)=>{const tx=db.transaction('settings','readonly');const req=tx.objectStore('settings').get('background');tx.oncomplete=()=>resolve(req.result);tx.onabort=tx.onerror=()=>reject(tx.error||new Error('Background read failed'));});
  },
  async putBackground(value){
    const db=await this.database();
    return new Promise((resolve,reject)=>{const tx=db.transaction('settings','readwrite');tx.objectStore('settings').put(value,'background');tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||new Error('Background save failed'));});
  }
};
function clampRgb(value,fallback){const n=Number(value);return Number.isInteger(n)&&n>=0&&n<=255?n:fallback;}
function normalizeBackground(value){
  const rgb=(value&&typeof value==='object'&&value.rgb&&typeof value.rgb==='object')?value.rgb:{};
  return {rgb:{r:clampRgb(rgb.r,255),g:clampRgb(rgb.g,255),b:clampRgb(rgb.b,255)}};
}
function applyBackground(value){
  currentBackground=normalizeBackground(value);const {r,g,b}=currentBackground.rgb;const color=`rgb(${r},${g},${b})`;
  document.documentElement.style.setProperty('--page-background',color);
  document.documentElement.style.setProperty('--page-background-image','none');
  const theme=document.querySelector('meta[name="theme-color"]');if(theme)theme.content=color;
}
function refreshAppearanceSettings(){
  const {r,g,b}=currentBackground.rgb;
  for(const [id,val] of [['backgroundR',r],['backgroundG',g],['backgroundB',b]]){const el=document.getElementById(id);if(el&&document.activeElement!==el)el.value=val;}
}
async function saveRgbBackground(showStatus=true){
  const values=['backgroundR','backgroundG','backgroundB'].map(id=>Number(document.getElementById(id)?.value));
  if(values.some(v=>!Number.isInteger(v)||v<0||v>255)){alert(t('invalidRgb'));return false;}
  const next={rgb:{r:values[0],g:values[1],b:values[2]}};
  try{await AppearanceRepository.putBackground(next);applyBackground(next);refreshAppearanceSettings();const status=document.getElementById('appearanceStatus');if(showStatus&&status)status.textContent=t('backgroundSaved');return true;}
  catch(error){console.error('Background save failed',error);alert(t('storageFull'));return false;}
}
applyBackground(DEFAULT_BACKGROUND);
AppearanceRepository.getBackground().then(value=>{applyBackground(value);refreshAppearanceSettings();}).catch(error=>console.warn('Background restore failed',error));


/* Color View is the single color utility. One current color drives the HSV
   picker, RGB/HEX editor, preview text, application background action, and
   exported color value. */
const ColorViewTool = (() => {
  let initialized = false;
  let hue = 0;
  let saturation = 1;
  let value = 1;
  let currentRgb = {r:255,g:0,b:0};
  let numericMode = 'decimal';
  let labels = {
    setBackground:'Set Background',
    toHex:'HEX',
    toDecimal:'Decimal',
    exportColor:'Export Color'
  };

  function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }
  function clampByte(value, fallback = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(255, Math.round(n)));
  }
  function byteToHex(v){ return clampByte(v).toString(16).toUpperCase().padStart(2,'0'); }
  function rgbToHex(rgb){ return `#${byteToHex(rgb.r)}${byteToHex(rgb.g)}${byteToHex(rgb.b)}`; }

  function hsvToRgb(h, s, v) {
    const hh = ((Number(h) % 360) + 360) % 360;
    const ss = clamp(s,0,1), vv = clamp(v,0,1);
    const c = vv * ss, x = c * (1 - Math.abs(((hh / 60) % 2) - 1)), m = vv - c;
    let rp=0,gp=0,bp=0;
    if (hh < 60) [rp,gp,bp]=[c,x,0];
    else if (hh < 120) [rp,gp,bp]=[x,c,0];
    else if (hh < 180) [rp,gp,bp]=[0,c,x];
    else if (hh < 240) [rp,gp,bp]=[0,x,c];
    else if (hh < 300) [rp,gp,bp]=[x,0,c];
    else [rp,gp,bp]=[c,0,x];
    return {r:Math.round((rp+m)*255),g:Math.round((gp+m)*255),b:Math.round((bp+m)*255)};
  }

  function rgbToHsv(r,g,b) {
    const rr=clampByte(r)/255, gg=clampByte(g)/255, bb=clampByte(b)/255;
    const max=Math.max(rr,gg,bb), min=Math.min(rr,gg,bb), d=max-min;
    let h=0;
    if (d !== 0) {
      if (max===rr) h=60*(((gg-bb)/d)%6);
      else if (max===gg) h=60*(((bb-rr)/d)+2);
      else h=60*(((rr-gg)/d)+4);
    }
    if (h<0) h+=360;
    return {h, s:max===0?0:d/max, v:max};
  }

  function rgbCss({r,g,b}) { return `rgb(${r},${g},${b})`; }
  function setPreviewTextColor(rgb) {
    const css=rgbCss(rgb);
    for (const id of ['colorViewTextPreview1','colorViewTextPreview2']) {
      const el=document.getElementById(id); if (el) el.style.color=css;
    }
  }

  function configureInputForMode(el) {
    if (!el) return;
    if (numericMode==='hex') {
      el.type='text'; el.inputMode='text'; el.removeAttribute('min'); el.removeAttribute('max'); el.maxLength=2;
    } else {
      el.type='number'; el.inputMode='numeric'; el.min='0'; el.max='255'; el.removeAttribute('maxlength');
    }
  }

  function writeColorInputs(rgb, force=false) {
    for (const [id,v] of [['colorViewR',rgb.r],['colorViewG',rgb.g],['colorViewB',rgb.b]]) {
      const el=document.getElementById(id); if (!el) continue;
      configureInputForMode(el);
      if (force || document.activeElement!==el) el.value = numericMode==='hex' ? byteToHex(v) : String(v);
    }
  }

  function paintPicker() {
    const field=document.getElementById('colorViewField');
    const fieldHandle=document.getElementById('colorViewFieldHandle');
    const hueBar=document.getElementById('colorViewHue');
    const hueHandle=document.getElementById('colorViewHueHandle');
    const hueCaret=document.getElementById('colorViewHueCaret');
    if (field) {
      field.style.background=`linear-gradient(to top, #000 0%, rgba(0,0,0,0) 100%), linear-gradient(to right, #fff 0%, hsl(${hue} 100% 50%) 100%)`;
      field.setAttribute('aria-valuetext', `S ${Math.round(saturation*100)}%, V ${Math.round(value*100)}%`);
    }
    if (fieldHandle) { fieldHandle.style.left=`${saturation*100}%`; fieldHandle.style.top=`${(1-value)*100}%`; }
    if (hueBar) hueBar.setAttribute('aria-valuenow', String(Math.round(hue)));
    const left=`${hue/360*100}%`;
    if (hueHandle) hueHandle.style.left=left;
    if (hueCaret) hueCaret.style.left=left;
  }

  function refreshModeButton() {
    const button=document.getElementById('colorViewModeToggleButton');
    if(button) button.textContent = numericMode==='decimal' ? labels.toHex : labels.toDecimal;
  }

  function commitFromHsv(nextH=hue,nextS=saturation,nextV=value) {
    hue=((clamp(nextH,0,360)%360)+360)%360;
    saturation=clamp(nextS,0,1); value=clamp(nextV,0,1);
    currentRgb=hsvToRgb(hue,saturation,value);
    paintPicker(); writeColorInputs(currentRgb); setPreviewTextColor(currentRgb);
  }

  function commitFromRgb(rgb, normalizeInputs=true) {
    const next={r:clampByte(rgb.r,currentRgb.r),g:clampByte(rgb.g,currentRgb.g),b:clampByte(rgb.b,currentRgb.b)};
    const hsv=rgbToHsv(next.r,next.g,next.b);
    if (hsv.s>0 && hsv.v>0) hue=hsv.h;
    saturation=hsv.s; value=hsv.v; currentRgb=next;
    paintPicker();
    if (normalizeInputs) writeColorInputs(next,true);
    setPreviewTextColor(next);
  }

  function parseDisplayedValue(raw) {
    const text=String(raw??'').trim();
    if (!text) return null;
    if (numericMode==='hex') {
      if(!/^[0-9a-fA-F]{1,2}$/.test(text)) return null;
      return parseInt(text,16);
    }
    if(!/^\d{1,3}$/.test(text)) return null;
    const n=Number(text); return Number.isInteger(n)&&n>=0&&n<=255?n:null;
  }

  function readColorInputs() {
    const values=['colorViewR','colorViewG','colorViewB'].map(id=>parseDisplayedValue(document.getElementById(id)?.value));
    if(values.some(v=>v===null)) return null;
    return {r:values[0],g:values[1],b:values[2]};
  }
  function commitColorInputs(normalize=true) {
    const raw=readColorInputs(); if(!raw) { writeColorInputs(currentRgb,true); return false; }
    commitFromRgb(raw,normalize); return true;
  }

  function updateSvFromPointer(event,field) {
    const rect=field.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    commitFromHsv(hue, clamp((event.clientX-rect.left)/rect.width,0,1), 1-clamp((event.clientY-rect.top)/rect.height,0,1));
  }
  function updateHueFromPointer(event,bar) {
    const rect=bar.getBoundingClientRect(); if (!rect.width) return;
    commitFromHsv(clamp((event.clientX-rect.left)/rect.width,0,1)*360,saturation,value);
  }
  function bindPointerDrag(el, update) {
    let dragging=false;
    el.addEventListener('pointerdown',event=>{dragging=true;el.setPointerCapture?.(event.pointerId);update(event,el);});
    el.addEventListener('pointermove',event=>{if(dragging)update(event,el);});
    const finish=event=>{if(!dragging)return;dragging=false;try{el.releasePointerCapture?.(event.pointerId);}catch(_){}};
    el.addEventListener('pointerup',finish); el.addEventListener('pointercancel',finish);
  }

  async function loadConfig() {
    try {
      const config = window.JetTopBar?.loadConfig
        ? await window.JetTopBar.loadConfig()
        : await fetch('config.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('config load failed');return r.json();});
      const one=document.getElementById('colorViewTextPreview1'), two=document.getElementById('colorViewTextPreview2');
      if(one && typeof config.colorview_string_1==='string') one.textContent=config.colorview_string_1;
      if(two && typeof config.colorview_string_2==='string') two.textContent=config.colorview_string_2;
      if(typeof config.colorview_set_background_button_text==='string') labels.setBackground=config.colorview_set_background_button_text;
      if(typeof config.colorview_switch_to_hex_button_text==='string') labels.toHex=config.colorview_switch_to_hex_button_text;
      if(typeof config.colorview_switch_to_decimal_button_text==='string') labels.toDecimal=config.colorview_switch_to_decimal_button_text;
      if(typeof config.colorview_export_color_button_text==='string') labels.exportColor=config.colorview_export_color_button_text;
      const setButton=document.getElementById('colorViewSetBackgroundButton'); if(setButton)setButton.textContent=labels.setBackground;
      const exportButton=document.getElementById('colorViewExportButton'); if(exportButton)exportButton.textContent=labels.exportColor;
      refreshModeButton();
    } catch(error) { console.warn('Color View config failed',error); }
  }

  async function setBackground() {
    const next={rgb:{...currentRgb}};
    try {
      await AppearanceRepository.putBackground(next);
      applyBackground(next);
      const status=document.getElementById('colorViewStatus'); if(status)status.textContent='Background set';
    } catch(error) {
      console.error('Background save failed',error); alert(t('storageFull'));
    }
  }

  function toggleNumericMode() {
    commitColorInputs(true);
    numericMode = numericMode==='decimal' ? 'hex' : 'decimal';
    writeColorInputs(currentRgb,true); refreshModeButton();
  }

  function exportText() {
    return numericMode==='hex' ? rgbToHex(currentRgb) : `${currentRgb.r},${currentRgb.g},${currentRgb.b}`;
  }

  async function exportColor() {
    const text=exportText();
    let copied=false;
    try { if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);copied=true;} } catch(_) {}
    if(!copied){
      try {
        const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();copied=document.execCommand('copy');ta.remove();
      } catch(_) {}
    }
    const status=document.getElementById('colorViewStatus'); if(status)status.textContent=copied ? text : `Color: ${text}`;
  }

  function init() {
    const field=document.getElementById('colorViewField'), hueBar=document.getElementById('colorViewHue');
    if (!field || !hueBar) return;
    if (!initialized) {
      initialized=true;
      bindPointerDrag(field,updateSvFromPointer); bindPointerDrag(hueBar,updateHueFromPointer);
      field.addEventListener('keydown',event=>{
        let s=saturation,v=value,handled=true;
        if(event.key==='ArrowLeft')s-=.01; else if(event.key==='ArrowRight')s+=.01;
        else if(event.key==='ArrowUp')v+=.01; else if(event.key==='ArrowDown')v-=.01; else handled=false;
        if(handled){event.preventDefault();commitFromHsv(hue,s,v);}
      });
      hueBar.addEventListener('keydown',event=>{if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;event.preventDefault();commitFromHsv(hue+(event.key==='ArrowRight'?2:-2),saturation,value);});

      for (const id of ['colorViewR','colorViewG','colorViewB']) {
        const input=document.getElementById(id); if(!input)continue;
        input.addEventListener('input',()=>{const raw=readColorInputs();if(raw)commitFromRgb(raw,false);});
        input.addEventListener('change',()=>commitColorInputs(true));
        input.addEventListener('blur',()=>commitColorInputs(true));
        input.addEventListener('keydown',event=>{if(event.key!=='Enter')return;event.preventDefault();commitColorInputs(true);input.blur();});
      }
      document.getElementById('colorViewSetBackgroundButton')?.addEventListener('click',setBackground);
      document.getElementById('colorViewModeToggleButton')?.addEventListener('click',toggleNumericMode);
      document.getElementById('colorViewExportButton')?.addEventListener('click',exportColor);
    }
    loadConfig();
    writeColorInputs(currentRgb,true); refreshModeButton(); commitFromRgb(currentRgb,true);
  }

  return {init};
})();

function initializeColorViewTool() {
  ColorViewTool.init();
}
