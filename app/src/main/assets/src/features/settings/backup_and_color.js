const JetNoteBackup = (() => {
  let pendingImport = null;

  function mediaPath(value) {
    if (typeof value !== 'string') return '';
    const direct = value.match(/^media\/([A-Za-z0-9_.-]+)$/);
    if (direct) return direct[0];
    const appAssets = value.match(/^https:\/\/appassets\.androidplatform\.net\/(media\/[A-Za-z0-9_.-]+)$/);
    return appAssets ? appAssets[1] : '';
  }

  function collectMedia(postsValue) {
    const found = new Map();
    const visit = value => {
      if (typeof value === 'string') {
        const path = mediaPath(value);
        if (path) found.set(path, {path});
        return;
      }
      if (!value || typeof value !== 'object') return;
      if (!Array.isArray(value)) {
        const path = mediaPath(value.path);
        if (path) found.set(path, {path});
      }
      for (const child of Array.isArray(value) ? value : Object.values(value)) visit(child);
    };
    visit(postsValue);
    return [...found.values()];
  }

  // Archive metadata is durable; player objects and old device URLs are not.
  function restoreMediaReferences(postsValue) {
    const records = new Map();
    for (const post of postsValue) {
      const imageUrls = new Map();
      post.attachments = (post.attachments || []).map(value => {
        const item = {...value};
        const path = mediaPath(item.path) || mediaPath(item.url) || mediaPath(item.src);
        if (!item.id || !path) throw Error('Attachment has no durable media reference');
        if (typeof item.url === 'string') imageUrls.set(item.url, NativeMedia.url({path}));
        if (typeof item.src === 'string') imageUrls.set(item.src, NativeMedia.url({path}));
        for (const key of ['blob', 'url', 'src', 'uri', 'objectUrl', 'blobUrl']) delete item[key];
        item.path = path;
        const previous = records.get(item.id);
        if (previous && (previous.path !== path || previous.sha256 !== item.sha256 ||
            previous.size !== item.size || previous.mimeType !== item.mimeType || previous.type !== item.type)) {
          throw Error('Conflicting attachment ID: ' + item.id);
        }
        records.set(item.id, item);
        return item;
      });
      post.images = (post.images || []).map(src => {
        const path = mediaPath(src);
        if (path) return NativeMedia.url({path});
        if (imageUrls.has(src)) return imageUrls.get(src);
        // Older archives may contain inline images; retain their bytes.
        if (/^data:image\//i.test(src)) return src;
        throw Error('Image has no durable media reference');
      });
    }
    return [...records.values()];
  }

  function currentMediaPaths(postsValue) {
    return new Set(collectMedia(postsValue).map(item => item.path));
  }

  async function exportArchive() {
    if (!window.JetNoteNative?.exportJetNote) throw Error('Native archive support unavailable');
    const snapshot = await EntryStore.read();
    // archived is part of the persistent Post schema, not transient UI state.
    // Always materialize it so every exported Post has an explicit true/false value.
    const exportPosts = structuredClone(snapshot?.posts || []).map(post => ({
      ...post,
      archived: post?.archived === true
    }));
    // Older/browser-picked attachments may own bytes only in IndexedDB.
    // Materialize those bytes, never fetch an expired object URL or device URI.
    for (const post of exportPosts) {
      for (let i = 0; i < (post.attachments || []).length; i++) {
        const item = post.attachments[i];
        if (mediaPath(item.path)) continue;
        const record = await EntryStore.media(item.id);
        const durable = mediaPath(record?.path) || mediaPath(item.url) || mediaPath(item.src);
        if (durable) post.attachments[i] = {...record, ...item, path: durable};
        else if (record?.blob instanceof Blob) {
          const source = {...record, ...item};
          delete source.path;
          const stored = await NativeMedia.storeBlob(source, record.blob);
          post.attachments[i] = {...stored, ...item, path: stored.path};
        }
      }
    }
    restoreMediaReferences(exportPosts);
    const payload = {
      appVersion: 'current',
      posts: exportPosts,
      composerLabel: (()=>{ try { return localStorage.getItem(HOME_COMPOSER_LABEL_KEY); } catch (_) { return null; } })()
    };
    JetNoteNative.exportJetNote(JSON.stringify(payload));
  }

  function chooseArchive() {
    if (!window.JetNoteNative?.importJetNote) throw Error('Native archive support unavailable');
    JetNoteNative.importJetNote();
  }

  return {export: exportArchive, choose: chooseArchive, collectMedia, currentMediaPaths, restoreMediaReferences,
    _setPending(value){ pendingImport=value; }, _getPending(){ return pendingImport; }, _clear(){ pendingImport=null; }};
})();

window.JetNoteBackupNative = {
  _validatedChunks: [],
  onImportValidatedChunkStart() { this._validatedChunks = []; },
  onImportValidatedChunk(chunk) { this._validatedChunks.push(String(chunk || '')); },
  onImportValidatedChunkEnd() {
    try {
      const binary = atob(this._validatedChunks.join(''));
      const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
      const data = JSON.parse(new TextDecoder('utf-8').decode(bytes));
      this._validatedChunks = [];
      this.onImportValidated(data);
    } catch (error) {
      this._validatedChunks = [];
      this.onImportFailed('Import payload decode failed: ' + error.message);
    }
  },
  onExportFinished(ok, message) {
    if (!ok) alert(t('exportFailed') + (message || t('unknownError')));
  },

  async onImportValidated(data) {
    try {
      if (!data?.token || !Array.isArray(data.posts)) throw Error('Invalid import manifest');
      const before = await EntryStore.read();
      const restoredPosts = data.posts.map(stableEntry);
      const media = JetNoteBackup.restoreMediaReferences(restoredPosts);
      JetNoteBackup._setPending({
        token: data.token,
        posts: restoredPosts,
        media,
        composerLabel: typeof data.composerLabel === 'string' ? data.composerLabel : null,
        hasComposerLabel: data.hasComposerLabel === true,
        oldMedia: JetNoteBackup.currentMediaPaths(before?.posts || [])
      });
      JetNoteNative.commitImportMedia(data.token);
    } catch (error) {
      if (data?.token) JetNoteNative.rollbackImport(data.token);
      JetNoteBackup._clear();
      alert(t('importFailed') + error.message);
    }
  },

  async onMediaCommitted(token) {
    const pending = JetNoteBackup._getPending();
    if (!pending || pending.token !== token) {
      JetNoteNative.rollbackImport(token);
      return;
    }
    try {
      const nextPosts = pending.posts;
      await EntryStore.commit(nextPosts, pending.media);
      // Verify the actual IndexedDB state before declaring the import complete.
      // This catches partial/aborted WebView transactions instead of showing a false success.
      const persisted = await EntryStore.read();
      const persistedPosts = Array.isArray(persisted?.posts) ? persisted.posts : [];
      if (persistedPosts.length !== nextPosts.length) {
        throw Error(t('importVerifyCountMismatch', {expected: nextPosts.length, actual: persistedPosts.length}));
      }
      const signature = post => JSON.stringify(post);
      for (let i = 0; i < nextPosts.length; i++) {
        if (signature(persistedPosts[i]) !== signature(nextPosts[i])) {
          throw Error(t('importVerifyPostMismatch', {index: i + 1}));
        }
      }
      // From here on the database owns these files. UI failures must not roll
      // back files referenced by an already committed transaction.
      pending.committed = true;
      JetNoteNative.finalizeImport(token);
      replacePosts(nextPosts);
      try {
        if (pending.hasComposerLabel) {
          pending.composerLabel ? localStorage.setItem(HOME_COMPOSER_LABEL_KEY,pending.composerLabel) : localStorage.removeItem(HOME_COMPOSER_LABEL_KEY);
        }
      } catch (_) {}
      renderPosts();
      const keep = JetNoteBackup.currentMediaPaths(nextPosts);
      for (const path of pending.oldMedia) {
        if (!keep.has(path)) {
          try { JetNoteNative.discardMedia(path); } catch (_) {}
        }
      }
      JetNoteBackup._clear();
      alert(t('importDone'));
    } catch (error) {
      if (!pending.committed) JetNoteNative.rollbackImport(token);
      JetNoteBackup._clear();
      alert((pending.committed ? t('importSavedRefreshFailed') : t('importFailed')) + error.message);
    }
  },

  onImportFailed(message) {
    JetNoteBackup._clear();
    alert(t('importFailed') + (message || t('unknownError')));
  }
};

function chooseV3Backup(){ JetNoteBackup.choose(); }
function importV3Backup(){ /* Native SAF import owns .jnote selection. */ }
window.JetNoteBackup = JetNoteBackup;
window.chooseV3Backup = chooseV3Backup;
window.importV3Backup = importV3Backup;
function initColorViewer(){}

const ColorViewTool = (() => {
  let initialized = false;
  let hue = 0;
  let saturation = 1;
  let value = 1;
  let currentRgb = {r:255,g:0,b:0};
  let numericMode = 'hex';
  let labels = {
    hex:'HEX Format',
    decimal:'DEC Format',
    copy:'Copy',
    copied:'Copied',
    copyFailed:'Copy failed'
  };
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
    const button=document.getElementById('colorViewCopyButton');
    if(button){
      button.textContent=labels.copy;
      button.classList.remove('is-copied');
    }
    const status=document.getElementById('colorViewStatus');
    if(status){status.textContent='';status.style.removeProperty('color');}
    return copyFeedbackGeneration;
  }

  function showCopiedFeedback(generation) {
    if(generation!==copyFeedbackGeneration)return;
    const button=document.getElementById('colorViewCopyButton');
    if(!button)return;
    button.textContent=labels.copied;
    button.classList.add('is-copied');
    copyFeedbackTimers.push(setTimeout(()=>{
      if(generation!==copyFeedbackGeneration)return;
      button.textContent=labels.copy;
      button.classList.remove('is-copied');
      copyFeedbackTimers=[];
    },1000));
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
  // Cache the SVG path once. Color dragging is a hot path, so avoid a DOM
  // lookup on every pointer event and write the fill immediately.
  let colorViewFunnyPath=null;
  function setPreviewTextColor(rgb) {
    if (!colorViewFunnyPath || !colorViewFunnyPath.isConnected) {
      colorViewFunnyPath=document.getElementById('colorViewFunnyPath');
    }
    if (colorViewFunnyPath) colorViewFunnyPath.style.fill=rgbCss(rgb);
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
    const selector=document.getElementById('colorViewRadixSwitch');
    const hexButton=document.getElementById('colorViewHexButton');
    const decimalButton=document.getElementById('colorViewDecimalButton');
    const hexActive=numericMode==='hex';
    const decimalActive=numericMode==='decimal';
    if(selector) {
      selector.classList.toggle('format-selected-hex',hexActive);
      selector.classList.toggle('format-selected-decimal',decimalActive);
    }
    if(hexButton) {
      hexButton.textContent=labels.hex;
      hexButton.classList.toggle('is-active',hexActive);
      hexButton.setAttribute('aria-pressed',String(hexActive));
    }
    if(decimalButton) {
      decimalButton.textContent=labels.decimal;
      decimalButton.classList.toggle('is-active',decimalActive);
      decimalButton.setAttribute('aria-pressed',String(decimalActive));
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

    // Modern Android WebView: Pointer Events give the cleanest drag behavior.
    if (typeof window.PointerEvent === 'function') {
      el.addEventListener('pointerdown',event=>{
        dragging=true;
        try { if(el.setPointerCapture) el.setPointerCapture(event.pointerId); } catch(_) {}
        update(event,el);
      });
      el.addEventListener('pointermove',event=>{if(dragging)update(event,el);});
      const finish=event=>{
        if(!dragging)return;
        dragging=false;
        try { if(el.releasePointerCapture) el.releasePointerCapture(event.pointerId); } catch(_) {}
      };
      el.addEventListener('pointerup',finish);
      el.addEventListener('pointercancel',finish);
      return;
    }

    // Older Android System WebView fallback. Touch events are translated into
    // the same clientX/clientY shape used by the picker math. Mouse support is
    // retained for desktop/debug environments.
    const touchPoint=event=>{
      const list=event.touches&&event.touches.length?event.touches:event.changedTouches;
      const touch=list&&list[0];
      return touch?{clientX:touch.clientX,clientY:touch.clientY}:null;
    };
    const onTouchStart=event=>{
      const point=touchPoint(event);
      if(!point)return;
      dragging=true;
      if(event.cancelable)event.preventDefault();
      update(point,el);
    };
    const onTouchMove=event=>{
      if(!dragging)return;
      const point=touchPoint(event);
      if(!point)return;
      if(event.cancelable)event.preventDefault();
      update(point,el);
    };
    const onTouchEnd=()=>{dragging=false;};
    el.addEventListener('touchstart',onTouchStart,{passive:false});
    el.addEventListener('touchmove',onTouchMove,{passive:false});
    el.addEventListener('touchend',onTouchEnd,false);
    el.addEventListener('touchcancel',onTouchEnd,false);

    el.addEventListener('mousedown',event=>{dragging=true;update(event,el);});
    window.addEventListener('mousemove',event=>{if(dragging)update(event,el);});
    window.addEventListener('mouseup',()=>{dragging=false;});
  }

  async function loadUiLanguage() {
    try {
      const get=window.JetNoteUiLanguage?.get;
      if (get) {
        const pairs=await Promise.all([
          get('color_view.format_hex','HEX Format'),
          get('color_view.format_decimal','DEC Format'),
          get('color_view.copy','Copy'),
          get('color_view.copied','Copied'),
          get('color_view.copy_failed','Copy failed')
        ]);
        const [hexLabel,decimalLabel,copyLabel,copied,copyFailed]=pairs;
        labels={hex:hexLabel,decimal:decimalLabel,copy:copyLabel,copied,copyFailed};
      }
      const copyButton=document.getElementById('colorViewCopyButton'); if(copyButton)copyButton.textContent=labels.copy;
      refreshModeSelector();
      await window.JetNoteUiLanguage?.apply?.(document);
    } catch(error) { console.warn('Color View UI language failed',error); }
  }


  function setNumericMode(mode) {
    if(mode!=='hex' && mode!=='decimal') return;
    clearCopyFeedback();
    commitColorInputs(true);
    numericMode=mode;
    writeColorInputs(currentRgb,true);
    refreshModeSelector();
   
    refreshExportDisplay();
  }

  function exportText() {
    return numericMode==='hex' ? rgbToHex(currentRgb) : `${currentRgb.r},${currentRgb.g},${currentRgb.b}`;
  }

  function refreshExportDisplay(force=false) {
    const valueEl=document.getElementById('colorViewExportValue');
    if(!valueEl) return;
    if(force || document.activeElement!==valueEl) valueEl.value=exportText();
  }

  function parseExportEditorValue(raw) {
    const text=String(raw??'').trim();
    if(!text) return null;

    // A leading # is an explicit HEX signal. Support the common #RGB and
    // #RRGGBB forms; the display is normalized back to #RRGGBB on blur.
    if(text.startsWith('#')) {
      const body=text.slice(1).trim();
      if(/^[0-9a-fA-F]{3}$/.test(body)) {
        return {
          mode:'hex',
          rgb:{
            r:parseInt(body[0]+body[0],16),
            g:parseInt(body[1]+body[1],16),
            b:parseInt(body[2]+body[2],16)
          }
        };
      }
      if(/^[0-9a-fA-F]{6}$/.test(body)) {
        return {
          mode:'hex',
          rgb:{r:parseInt(body.slice(0,2),16),g:parseInt(body.slice(2,4),16),b:parseInt(body.slice(4,6),16)}
        };
      }
      return null;
    }

    // A half-width comma is an explicit DEC signal. Full-width comma is also
    // accepted because it is easy to enter from a CJK keyboard.
    if(text.includes(',') || text.includes('，')) {
      const parts=text.split(/[,，]/).map(part=>part.trim());
      if(parts.length!==3 || parts.some(part=>!/^[0-9]{1,3}$/.test(part))) return null;
      const values=parts.map(Number);
      if(values.some(value=>!Number.isInteger(value)||value<0||value>255)) return null;
      return {mode:'decimal',rgb:{r:values[0],g:values[1],b:values[2]}};
    }

    // Three obvious decimal bytes separated by spaces/slashes/semicolons are
    // also treated as DEC. This makes "129 239 112" behave like 129,239,112.
    const decimalParts=text.split(/[\s/;]+/).filter(Boolean);
    if(decimalParts.length===3 && decimalParts.every(part=>/^[0-9]{1,3}$/.test(part))) {
      const values=decimalParts.map(Number);
      if(values.every(value=>Number.isInteger(value)&&value>=0&&value<=255)) {
        return {mode:'decimal',rgb:{r:values[0],g:values[1],b:values[2]}};
      }
    }

    // A plain 6-character hexadecimal value containing A-F is unambiguous.
    if(/^[0-9a-fA-F]{6}$/.test(text) && /[a-fA-F]/.test(text)) {
      return {mode:'hex',rgb:{r:parseInt(text.slice(0,2),16),g:parseInt(text.slice(2,4),16),b:parseInt(text.slice(4,6),16)}};
    }
    return null;
  }

  function inferExportEditorMode(raw) {
    const text=String(raw??'').trim();
    if(!text) return null;
    if(text.startsWith('#')) return 'hex';
    if(text.includes(',') || text.includes('，')) return 'decimal';
    const decimalParts=text.split(/[\s/;]+/).filter(Boolean);
    if(decimalParts.length===3 && decimalParts.every(part=>/^[0-9]{1,3}$/.test(part))) {
      const values=decimalParts.map(Number);
      if(values.every(value=>Number.isInteger(value)&&value>=0&&value<=255)) return 'decimal';
    }
    if(/^[0-9a-fA-F]{1,6}$/.test(text) && /[a-fA-F]/.test(text)) return 'hex';
    return null;
  }

  function commitFromExportEditor(normalize=false) {
    const valueEl=document.getElementById('colorViewExportValue');
    if(!valueEl) return false;

    // Switch the left HEX/DEC selector as soon as the syntax reveals intent,
    // even while the user is still typing an incomplete color.
    const inferredMode=inferExportEditorMode(valueEl.value);
    if(inferredMode && inferredMode!==numericMode) {
      numericMode=inferredMode;
      writeColorInputs(currentRgb,true);
      refreshModeSelector();
    }

    const parsed=parseExportEditorValue(valueEl.value);
    if(!parsed) {
      if(normalize) refreshExportDisplay(true);
      return false;
    }
    numericMode=parsed.mode;
    commitFromRgb(parsed.rgb,true);
    refreshModeSelector();
    if(normalize) refreshExportDisplay(true);
    return true;
  }

  async function copyExportColor() {
    // Copy exactly what the export row currently displays. The generation token
    // invalidates stale async clipboard feedback when HEX/DEC changes mid-copy.
    const generation=clearCopyFeedback();
    const valueEl=document.getElementById('colorViewExportValue');
    const text=(valueEl?.value || exportText()).trim();
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
      document.getElementById('colorViewHexButton')?.addEventListener('click',()=>setNumericMode('hex'));
      document.getElementById('colorViewDecimalButton')?.addEventListener('click',()=>setNumericMode('decimal'));
      document.getElementById('colorViewCopyButton')?.addEventListener('click',copyExportColor);
      const exportEditor=document.getElementById('colorViewExportValue');
      if(exportEditor) {
        exportEditor.addEventListener('input',()=>commitFromExportEditor(false));
        exportEditor.addEventListener('change',()=>commitFromExportEditor(true));
        exportEditor.addEventListener('blur',()=>commitFromExportEditor(true));
        exportEditor.addEventListener('keydown',event=>{
          if(event.key!=='Enter') return;
          event.preventDefault();
          commitFromExportEditor(true);
          exportEditor.blur();
        });
      }
    }
    loadUiLanguage();
    loadCopyFeedbackConfig();
    writeColorInputs(currentRgb,true); refreshModeSelector(); commitFromRgb(currentRgb,true); refreshExportDisplay(true);
  }

  return {init};
})();


initColorViewer=function(){ColorViewTool.init();};
