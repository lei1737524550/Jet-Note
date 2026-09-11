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
