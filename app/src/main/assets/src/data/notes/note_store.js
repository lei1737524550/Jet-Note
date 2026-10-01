/* IndexedDB repository for the current JetNote data model. */
const EntryStore={
  db:null,
  async open(){
    if(this.db)return this.db;
    this.db=await new Promise((resolve,reject)=>{
      const databaseName='jet_note_entries';
      const request=indexedDB.open(databaseName,2);
      request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('state'))db.createObjectStore('state');if(!db.objectStoreNames.contains('media'))db.createObjectStore('media',{keyPath:'id'});if(!db.objectStoreNames.contains('drafts'))db.createObjectStore('drafts');};
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Database upgrade blocked'));
    });
    this.db.onversionchange=()=>{this.db.close();this.db=null;};return this.db;
  },
  async read(){
    const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('state');const req=tx.objectStore('state').get('entries');tx.oncomplete=()=>resolve(req.result);tx.onabort=()=>reject(tx.error);});
  },
  async media(id){
    const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('media');const req=tx.objectStore('media').get(id);tx.oncomplete=()=>resolve(req.result);tx.onabort=()=>reject(tx.error);});
  },
  async commit(nextPosts,media=[]){
    const db=await this.open();return new Promise((resolve,reject)=>{
      const tx=db.transaction(['state','media'],'readwrite');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('Transaction aborted'));tx.onerror=()=>{};
      try{tx.objectStore('state').put({posts:nextPosts},'entries');for(const record of media)tx.objectStore('media').put(record);}catch(error){tx.abort();reject(error);}
    });
  },
  async readDraft(){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('drafts');const req=tx.objectStore('drafts').get('active');tx.oncomplete=()=>resolve(req.result||null);tx.onabort=()=>reject(tx.error);});},
  async saveDraft(draft,media=[]){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction(['drafts','media'],'readwrite');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('Draft save aborted'));tx.onerror=()=>{};try{tx.objectStore('drafts').put(draft,'active');for(const record of media)tx.objectStore('media').put(record);}catch(error){tx.abort();reject(error);}});},
  async clearDraft(){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction(['state','drafts','media'],'readwrite'),state=tx.objectStore('state'),drafts=tx.objectStore('drafts'),media=tx.objectStore('media'),entries=state.get('entries'),keys=media.getAllKeys();drafts.delete('active');keys.onsuccess=()=>{const used=new Set((entries.result?.posts||[]).flatMap(item=>(item.attachments||[]).map(a=>String(a.id))));for(const id of keys.result)if(!used.has(String(id)))media.delete(id);};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('Draft clear aborted'));tx.onerror=()=>{};});}
};
