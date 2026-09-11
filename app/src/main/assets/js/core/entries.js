/* Post records and attachment metadata share one IndexedDB transaction. */
const EntryStore={
  db:null,migration:null,
  async open(){
    if(this.db)return this.db;
    this.db=await new Promise((resolve,reject)=>{
      const databaseName='jet_note_entries';
      const request=indexedDB.open(databaseName,1);
      request.onupgradeneeded=()=>{request.result.createObjectStore('state');request.result.createObjectStore('media',{keyPath:'id'});};
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
      try{tx.objectStore('state').put({posts:nextPosts,migration:this.migration},'entries');for(const record of media)tx.objectStore('media').put(record);}catch(error){tx.abort();reject(error);}
    });
  },
  async removeUnreferencedMedia(ids){
    const db=await this.open();return new Promise((resolve,reject)=>{
      const tx=db.transaction('media','readwrite'),store=tx.objectStore('media'),req=store.getAllKeys();
      req.onsuccess=()=>{for(const id of req.result)if(!ids.has(String(id)))store.delete(id);};
      tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('Media cleanup aborted'));tx.onerror=()=>{};
    });
  }
};
let entriesReady=false,entriesBusy=false;
function entryUuid(){
  const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
}
function stableEntry(record){
  const result={...record};
  if(!result.uuid)result.uuid=typeof result.id==='string'?result.id:entryUuid();
  if(!Number.isSafeInteger(result.id)){result.legacyId=result.legacyId??result.id;result.id=Date.now()+stableEntry.sequence++;}
  if(result.attachments?.some(a=>a.type==='image'))result.images=[...new Set([...(result.images||[]),...result.attachments.filter(a=>a.type==='image').map(a=>NativeMedia.url(a)).filter(Boolean)])];
  if(!('createdAt' in result))result.createdAt=Number.isSafeInteger(record.id)&&record.id>946684800000&&record.id<4102444800000?new Date(record.id).toISOString():null;
  if(!('updatedAt' in result))result.updatedAt=null;
  if(!Array.isArray(result.attachments))result.attachments=[];
  delete result.type;delete result.title;delete result.bodyHtml;delete result.content;
  return result;
}
stableEntry.sequence=0;
function nextEntryId(){return Math.max(Date.now(),...posts.map(p=>Number.isSafeInteger(p.id)?p.id+1:0));}
async function initializeEntries(){
  let state=await EntryStore.read();
  const localPosts=posts.map(stableEntry);
  EntryStore.migration=state?.migration||null;
  let nextPosts=Array.isArray(state?.posts)?state.posts.map(stableEntry):localPosts;
  if(!EntryStore.migration?.postsOnly){
    const byUuid=new Map(nextPosts.map((item,index)=>[item.uuid,index]));
    for(const raw of localPosts){
      let index=byUuid.get(raw.uuid);
      if(index===undefined&&Number.isSafeInteger(raw.id))index=nextPosts.findIndex(item=>item.id===raw.id||item.legacyId===raw.id);
      if(index<0||index===undefined){byUuid.set(raw.uuid,nextPosts.length);nextPosts.push(raw);}
      else if(Date.parse(raw.updatedAt)>(Date.parse(nextPosts[index].updatedAt)||0))nextPosts[index]={...raw,id:nextPosts[index].id,uuid:nextPosts[index].uuid};
    }
    const used=new Set();let next=Date.now();
    for(const item of nextPosts){if(!Number.isSafeInteger(item.id)||used.has(item.id)){item.legacyId=item.legacyId??item.id;while(used.has(next))next++;item.id=next++;}used.add(item.id);}
    EntryStore.migration={...(EntryStore.migration||{}),postsOnly:true};
    await EntryStore.commit(nextPosts);
    const mediaIds=new Set(nextPosts.flatMap(item=>(item.attachments||[]).map(a=>String(a.id))));
    await EntryStore.removeUnreferencedMedia(mediaIds);
  }
  // Remove the retired feature from current state and its former local key.
  AppStorage.removeItem('qzone_logs_v1');
  posts=nextPosts;entriesReady=true;
  if(window.JetNoteNative?.frontendReady)JetNoteNative.frontendReady();
}
async function persistEntries(media=[]){await EntryStore.commit(posts,media);}
