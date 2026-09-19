/* Post records and attachment metadata share one IndexedDB transaction. */

function normalizeStarStateValue(value){
  if(value === 'super_star' || value === 'super_starred') return 'super_star';
  if(value === 'star' || value === 'starred') return 'star';
  return 'none';
}

function normalizePostStarStateRecord(record,{allowLegacyStar=true}={}){
  const result={...record};
  let state='none';
  if(result.starState==='super_star'||result.starState==='star'||result.starState==='none'){
    state=result.starState;
  }else if(allowLegacyStar&&(result.starState==='super_starred'||result.starState==='starred')){
    state=normalizeStarStateValue(result.starState);
  }else if(allowLegacyStar&&(result.star===true||result.favorite===true)){
    state='star';
  }
  result.starState=normalizeStarStateValue(state);
  // Migrate the old field name without changing the recorded moment of the favorite action.
  if(!result.favoritedAt && result.starredAt) result.favoritedAt=result.starredAt;
  delete result.starredAt;
  delete result.star;
  delete result.favorite;
  return result;
}
function enforceSingleSuperStar(records){
  const list=(Array.isArray(records)?records:[]).map(item=>normalizePostStarStateRecord(item));
  const supers=list.filter(item=>item.starState==='super_star');
  if(supers.length<=1)return list;
  const score=item=>{
    const updated=Date.parse(item.updatedAt||'');
    if(Number.isFinite(updated))return updated;
    const created=Date.parse(item.createdAt||'');
    if(Number.isFinite(created))return created;
    const id=Number(item.id);
    return Number.isFinite(id)?id:0;
  };
  let winner=supers[0];
  for(const item of supers.slice(1))if(score(item)>score(winner))winner=item;
  for(const item of list)if(item!==winner&&item.starState==='super_star')item.starState='none';
  return list;
}
const EntryStore={
  db:null,migration:null,
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
      try{tx.objectStore('state').put({posts:nextPosts,migration:this.migration},'entries');for(const record of media)tx.objectStore('media').put(record);}catch(error){tx.abort();reject(error);}
    });
  },
  async readDraft(){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('drafts');const req=tx.objectStore('drafts').get('active');tx.oncomplete=()=>resolve(req.result||null);tx.onabort=()=>reject(tx.error);});},
  async saveDraft(draft,media=[]){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction(['drafts','media'],'readwrite');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('Draft save aborted'));tx.onerror=()=>{};try{tx.objectStore('drafts').put(draft,'active');for(const record of media)tx.objectStore('media').put(record);}catch(error){tx.abort();reject(error);}});},
  async clearDraft(){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction(['state','drafts','media'],'readwrite'),state=tx.objectStore('state'),drafts=tx.objectStore('drafts'),media=tx.objectStore('media'),entries=state.get('entries'),keys=media.getAllKeys();drafts.delete('active');keys.onsuccess=()=>{const used=new Set((entries.result?.posts||[]).flatMap(item=>(item.attachments||[]).map(a=>String(a.id))));for(const id of keys.result)if(!used.has(String(id)))media.delete(id);};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('Draft clear aborted'));tx.onerror=()=>{};});},
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
  const result=normalizePostStarStateRecord(record);
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
    const activeDraft=await EntryStore.readDraft();
    const mediaIds=new Set([...nextPosts.flatMap(item=>(item.attachments||[]).map(a=>String(a.id))),...((activeDraft?.attachments||[]).map(a=>String(a.id)))]);
    await EntryStore.removeUnreferencedMedia(mediaIds);
  }
  // Remove the retired feature from current state and its former local key.
  AppStorage.removeItem('qzone_logs_v1');
  nextPosts=enforceSingleSuperStar(nextPosts);
  await EntryStore.commit(nextPosts);
  posts=nextPosts;entriesReady=true;
}
async function persistEntries(media=[]){posts=enforceSingleSuperStar(posts);await EntryStore.commit(posts,media);}
