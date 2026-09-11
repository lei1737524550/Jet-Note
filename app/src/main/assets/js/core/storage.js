/* Single-workspace storage adapter. */
const GlobalStorage = {
  getItem(key){ try{return localStorage.getItem(key);}catch(e){console.warn('Storage read failed',e);return null;} },
  setItem(key,value){ localStorage.setItem(key,value); },
  removeItem(key){ localStorage.removeItem(key); }
};

const AppStorage = {
  getItem(key){
    try{
      const value=localStorage.getItem(key);
      if(value!==null)return value;
      // One-time migration from builds that stored the real user workspace under a mode prefix.
      const legacy=localStorage.getItem(`jet_note_mode:user:${key}`);
      if(legacy!==null){ localStorage.setItem(key,legacy); return legacy; }
      return null;
    }catch(error){ console.warn('Storage read failed',error); return null; }
  },
  setItem(key,value){ localStorage.setItem(key,value); },
  removeItem(key){ localStorage.removeItem(key); localStorage.removeItem(`jet_note_mode:user:${key}`); }
};

function isWorkspaceWritable(){ return true; }
