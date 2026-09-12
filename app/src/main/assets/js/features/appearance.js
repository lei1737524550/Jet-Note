const DEFAULT_BACKGROUND = {rgb:{r:174,g:209,b:148}};
const DEFAULT_BODY = {rgb:{r:210,g:233,b:194}};
let currentBackground = structuredClone(DEFAULT_BACKGROUND);
let currentBody = structuredClone(DEFAULT_BODY);
let appearanceDefaults = {
  background:structuredClone(DEFAULT_BACKGROUND),
  body:structuredClone(DEFAULT_BODY),
  picker:{rgb:{r:0,g:0,b:0}}
};

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
  },
  async getBody(){
    const db=await this.database();
    return new Promise((resolve,reject)=>{const tx=db.transaction('settings','readonly');const req=tx.objectStore('settings').get('body');tx.oncomplete=()=>resolve(req.result);tx.onabort=tx.onerror=()=>reject(tx.error||new Error('Body read failed'));});
  },
  async putBody(value){
    const db=await this.database();
    return new Promise((resolve,reject)=>{const tx=db.transaction('settings','readwrite');tx.objectStore('settings').put(value,'body');tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||new Error('Body save failed'));});
  }
};
function clampRgb(value,fallback){const n=Number(value);return Number.isInteger(n)&&n>=0&&n<=255?n:fallback;}
function normalizeBackground(value){
  const rgb=(value&&typeof value==='object'&&value.rgb&&typeof value.rgb==='object')?value.rgb:{};
  return {rgb:{r:clampRgb(rgb.r,255),g:clampRgb(rgb.g,255),b:clampRgb(rgb.b,255)}};
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
    const configured=(await response.json())?.appearance_default_colors||{};
    appearanceDefaults={
      background:colorHexToAppearance(configured.background,DEFAULT_BACKGROUND),
      body:colorHexToAppearance(configured.body,DEFAULT_BODY),
      picker:colorHexToAppearance(configured.color_view_picker_after_reset,{rgb:{r:0,g:0,b:0}})
    };
  } catch(error) { console.warn('Appearance defaults unavailable',error); }
  return appearanceDefaults;
}
function applyBackground(value){
  currentBackground=normalizeBackground(value);const {r,g,b}=currentBackground.rgb;const color=`rgb(${r},${g},${b})`;
  document.documentElement.style.setProperty('--page-background',color);
  document.documentElement.style.setProperty('--page-background-image','none');
  // Resolve every Jet Note visual type from one background source. Components can
  // opt into current_background in config.json without each page duplicating logic.
  const bodyColor=`rgb(${currentBody.rgb.r},${currentBody.rgb.g},${currentBody.rgb.b})`;
  window.JetNoteType?.apply?.(color,bodyColor).catch?.(error=>console.warn('Jet Note type appearance failed',error));
  const theme=document.querySelector('meta[name="theme-color"]');if(theme)theme.content=color;
}
function applyBody(value){
  currentBody=normalizeBackground(value);
  applyBackground(currentBackground);
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
loadAppearanceDefaults().then(defaults=>Promise.all([AppearanceRepository.getBackground(),AppearanceRepository.getBody()])
  .then(([background,body])=>{currentBody=normalizeBackground(body||defaults.body);applyBackground(background||defaults.background);refreshAppearanceSettings();}))
  .catch(error=>console.warn('Appearance restore failed',error));


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
    setBody:'Set Body',
    reset:'Reset',
    hex:'HEX',
    decimal:'DEC',
    exportColor:'Export Color',
    copy:'Copy',
    backgroundSet:'Background set',
    bodySet:'Body color set',
    resetComplete:'Background and body reset',
    copied:'Copied',
    copyFailed:'Copy failed'
  };
  let exportVisible = false;
  let copyFeedbackGeneration = 0;
  let copyFeedbackTimers = [];
  let copyFeedbackConfig = {
    copiedFirstTransitionColor:'#34A853',
    copiedSecondTransitionColor:'#F9AB00',
    copiedFinalRestingColor:'#111111',
    firstTransitionColorDisplayDurationMs:250,
    secondTransitionColorDisplayDurationMs:250
  };

  async function loadCopyFeedbackConfig() {
    try {
      const response=await fetch('config.json',{cache:'no-store'});
      if(!response.ok)return;
      const config=await response.json();
      const value=config?.color_view_copy_feedback_transition;
      if(!value || typeof value!=='object')return;
      copyFeedbackConfig={
        copiedFirstTransitionColor:String(value.copied_first_transition_color||copyFeedbackConfig.copiedFirstTransitionColor),
        copiedSecondTransitionColor:String(value.copied_second_transition_color||copyFeedbackConfig.copiedSecondTransitionColor),
        copiedFinalRestingColor:String(value.copied_final_resting_color||copyFeedbackConfig.copiedFinalRestingColor),
        firstTransitionColorDisplayDurationMs:Math.max(0,Number(value.first_transition_color_display_duration_ms)||250),
        secondTransitionColorDisplayDurationMs:Math.max(0,Number(value.second_transition_color_display_duration_ms)||250)
      };
    } catch(_) {}
  }

  function clearCopyFeedback() {
    copyFeedbackGeneration += 1;
    for(const timer of copyFeedbackTimers) clearTimeout(timer);
    copyFeedbackTimers=[];
    const status=document.getElementById('colorViewStatus');
    if(status){status.textContent='';status.style.removeProperty('color');}
    return copyFeedbackGeneration;
  }

  function showCopiedFeedback(generation) {
    if(generation!==copyFeedbackGeneration)return;
    const status=document.getElementById('colorViewStatus');
    if(!status)return;
    status.textContent=labels.copied;
    status.style.color=copyFeedbackConfig.copiedFirstTransitionColor;
    const firstDelay=copyFeedbackConfig.firstTransitionColorDisplayDurationMs;
    const secondDelay=copyFeedbackConfig.secondTransitionColorDisplayDurationMs;
    copyFeedbackTimers.push(setTimeout(()=>{
      if(generation!==copyFeedbackGeneration)return;
      status.style.color=copyFeedbackConfig.copiedSecondTransitionColor;
    },firstDelay));
    copyFeedbackTimers.push(setTimeout(()=>{
      if(generation!==copyFeedbackGeneration)return;
      status.style.color=copyFeedbackConfig.copiedFinalRestingColor;
    },firstDelay+secondDelay));
  }

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
  function formatColorValue(rgb){
    return numericMode==='hex' ? rgbToHex(rgb) : `${rgb.r},${rgb.g},${rgb.b}`;
  }
  function refreshSavedColorDisplays(){
    const backgroundValue=document.getElementById('colorViewBackgroundValue');
    const bodyValue=document.getElementById('colorViewBodyValue');
    if(backgroundValue)backgroundValue.textContent=formatColorValue(currentBackground.rgb);
    if(bodyValue)bodyValue.textContent=formatColorValue(currentBody.rgb);
  }

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

  function refreshModeSelector() {
    const hexButton=document.getElementById('colorViewHexButton');
    const decimalButton=document.getElementById('colorViewDecimalButton');
    if(hexButton) {
      const active=numericMode==='hex';
      hexButton.textContent=labels.hex;
      hexButton.classList.toggle('is-active',active);
      hexButton.setAttribute('aria-pressed',String(active));
    }
    if(decimalButton) {
      const active=numericMode==='decimal';
      decimalButton.textContent=labels.decimal;
      decimalButton.classList.toggle('is-active',active);
      decimalButton.setAttribute('aria-pressed',String(active));
    }
  }

  function commitFromHsv(nextH=hue,nextS=saturation,nextV=value) {
    clearCopyFeedback();
    hue=((clamp(nextH,0,360)%360)+360)%360;
    saturation=clamp(nextS,0,1); value=clamp(nextV,0,1);
    currentRgb=hsvToRgb(hue,saturation,value);
    paintPicker(); writeColorInputs(currentRgb); setPreviewTextColor(currentRgb); refreshExportDisplay();
  }

  function commitFromRgb(rgb, normalizeInputs=true) {
    clearCopyFeedback();
    const next={r:clampByte(rgb.r,currentRgb.r),g:clampByte(rgb.g,currentRgb.g),b:clampByte(rgb.b,currentRgb.b)};
    const hsv=rgbToHsv(next.r,next.g,next.b);
    if (hsv.s>0 && hsv.v>0) hue=hsv.h;
    saturation=hsv.s; value=hsv.v; currentRgb=next;
    paintPicker();
    if (normalizeInputs) writeColorInputs(next,true);
    setPreviewTextColor(next);
    refreshExportDisplay();
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

  async function loadUiLanguage() {
    try {
      const get=window.JetNoteUiLanguage?.get;
      if (get) {
        const pairs=await Promise.all([
          get('color_view.preview_sample_1','天地玄黄 宇宙洪荒 龟龙麟凤 日月星辰'),
          get('color_view.preview_sample_2','ABCDEFGHIJKLMNOPQRSTUVWXYZ'),
          get('color_view.set_background','Set Background'),
          get('color_view.set_body','Set Body'),
          get('color_view.reset','Reset'),
          get('color_view.format_hex','HEX'),
          get('color_view.format_decimal','DEC'),
          get('color_view.export_color','Export Color'),
          get('color_view.copy','Copy'),
          get('color_view.background_set','Background set'),
          get('color_view.body_set','Body color set'),
          get('color_view.reset_complete','Background and body reset'),
          get('color_view.copied','Copied'),
          get('color_view.copy_failed','Copy failed')
        ]);
        const [preview1,preview2,setBackgroundLabel,setBodyLabel,resetLabel,hexLabel,decimalLabel,exportLabel,copyLabel,backgroundSet,bodySet,resetComplete,copied,copyFailed]=pairs;
        const one=document.getElementById('colorViewTextPreview1'), two=document.getElementById('colorViewTextPreview2');
        if(one) one.textContent=preview1;
        if(two) two.textContent=preview2;
        labels={setBackground:setBackgroundLabel,setBody:setBodyLabel,reset:resetLabel,hex:hexLabel,decimal:decimalLabel,exportColor:exportLabel,copy:copyLabel,backgroundSet,bodySet,resetComplete,copied,copyFailed};
      }
      const setButton=document.getElementById('colorViewSetBackgroundButton'); if(setButton)setButton.textContent=labels.setBackground;
      const setBodyButton=document.getElementById('colorViewSetBodyButton'); if(setBodyButton)setBodyButton.textContent=labels.setBody;
      const resetButton=document.getElementById('colorViewResetButton'); if(resetButton)resetButton.textContent=labels.reset;
      const exportButton=document.getElementById('colorViewExportButton'); if(exportButton)exportButton.textContent=labels.exportColor;
      const copyButton=document.getElementById('colorViewCopyButton'); if(copyButton)copyButton.textContent=labels.copy;
      refreshModeSelector();
      refreshSavedColorDisplays();
      await window.JetNoteUiLanguage?.apply?.(document);
    } catch(error) { console.warn('Color View UI language failed',error); }
  }

  async function setBackground() {
    clearCopyFeedback();
    const next={rgb:{...currentRgb}};
    try {
      await AppearanceRepository.putBackground(next);
      applyBackground(next);
      refreshSavedColorDisplays();
      const status=document.getElementById('colorViewStatus'); if(status)status.textContent=labels.backgroundSet;
    } catch(error) {
      console.error('Background save failed',error); alert(t('storageFull'));
    }
  }

  async function setBody() {
    clearCopyFeedback();
    const next={rgb:{...currentRgb}};
    try {
      await AppearanceRepository.putBody(next);
      applyBody(next);
      refreshSavedColorDisplays();
      const status=document.getElementById('colorViewStatus'); if(status)status.textContent=labels.bodySet;
    } catch(error) {
      console.error('Body save failed',error); alert(t('storageFull'));
    }
  }

  async function resetAppearance() {
    clearCopyFeedback();
    try {
      const defaults=await loadAppearanceDefaults();
      await Promise.all([
        AppearanceRepository.putBackground(defaults.background),
        AppearanceRepository.putBody(defaults.body)
      ]);
      currentBody=normalizeBackground(defaults.body);
      applyBackground(defaults.background);
      commitFromRgb(defaults.picker.rgb,true);
      refreshSavedColorDisplays();
      const status=document.getElementById('colorViewStatus'); if(status)status.textContent=labels.resetComplete;
    } catch(error) {
      console.error('Appearance reset failed',error); alert(t('storageFull'));
    }
  }

  function setNumericMode(mode) {
    if(mode!=='hex' && mode!=='decimal') return;
    clearCopyFeedback();
    commitColorInputs(true);
    numericMode=mode;
    writeColorInputs(currentRgb,true);
    refreshModeSelector();
    refreshSavedColorDisplays();
    refreshExportDisplay();
  }

  function exportText() {
    return numericMode==='hex' ? rgbToHex(currentRgb) : `${currentRgb.r},${currentRgb.g},${currentRgb.b}`;
  }

  function refreshExportDisplay() {
    if(!exportVisible) return;
    const row=document.getElementById('colorViewExportRow');
    const valueEl=document.getElementById('colorViewExportValue');
    if(row) row.hidden=false;
    if(valueEl) valueEl.textContent=exportText();
  }

  function exportColor() {
    clearCopyFeedback();
    exportVisible=!exportVisible;
    const row=document.getElementById('colorViewExportRow');
    const button=document.getElementById('colorViewExportButton');
    if(row) row.hidden=!exportVisible;
    if(button) button.setAttribute('aria-expanded',String(exportVisible));
    if(exportVisible) refreshExportDisplay();
  }

  async function copyExportColor() {
    // Copy exactly what the export row currently displays. The generation token
    // invalidates stale async clipboard feedback when HEX/DEC changes mid-copy.
    const generation=clearCopyFeedback();
    const valueEl=document.getElementById('colorViewExportValue');
    const text=(valueEl?.textContent || exportText()).trim();
    let copied=false;
    try { if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);copied=true;} } catch(_) {}
    if(!copied){
      try {
        const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();copied=document.execCommand('copy');ta.remove();
      } catch(_) {}
    }
    if(generation!==copyFeedbackGeneration)return;
    if(copied) showCopiedFeedback(generation);
    else {
      const status=document.getElementById('colorViewStatus');
      if(status){status.textContent=labels.copyFailed;status.style.color=copyFeedbackConfig.copiedFinalRestingColor;}
    }
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
      document.getElementById('colorViewSetBodyButton')?.addEventListener('click',setBody);
      document.getElementById('colorViewResetButton')?.addEventListener('click',resetAppearance);
      document.getElementById('colorViewHexButton')?.addEventListener('click',()=>setNumericMode('hex'));
      document.getElementById('colorViewDecimalButton')?.addEventListener('click',()=>setNumericMode('decimal'));
      document.getElementById('colorViewExportButton')?.addEventListener('click',exportColor);
      document.getElementById('colorViewCopyButton')?.addEventListener('click',copyExportColor);
    }
    loadUiLanguage();
    loadCopyFeedbackConfig();
    writeColorInputs(currentRgb,true); refreshModeSelector(); commitFromRgb(currentRgb,true); refreshSavedColorDisplays(); refreshExportDisplay();
  }

  return {init};
})();

function initializeColorViewTool() {
  ColorViewTool.init();
}
