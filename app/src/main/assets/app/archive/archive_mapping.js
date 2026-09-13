/* Maps internal post records to the post-only .jnote v2 exchange model. */
const ArchiveMapping={
  async toCanonical(record,resolveMedia,resolveImage){
    const attachments=[],byPath=new Map();
    function add(meta){
      const old=byPath.get(meta.path);
      if(old){
        if(old.sha256!==meta.sha256)throw Error('Conflicting media path');
        return old;
      }
      byPath.set(meta.path,meta);
      attachments.push(meta);
      return meta;
    }
    for(const meta of record.attachments||[])add(await resolveMedia(meta));
    const raw=structuredClone(record);
    delete raw.archiveExtra;
    delete raw.archiveFields;
    async function imageRef(source){
      let meta=attachments.find(x=>x.type==='image'&&NativeMedia.url(x)===source);
      if(!meta)meta=add(await resolveImage(source));
      return 'jet-note-media:'+meta.id;
    }
    if(Array.isArray(raw.images)){
      const refs=[];
      for(const source of raw.images)refs.push(await imageRef(source));
      raw.images=refs;
    }
    return {
      ...(record.archiveFields||{
      }),id:record.uuid,type:'post',text:record.text||'',createdAt:record.createdAt??null,updatedAt:record.updatedAt??null,starState:normalizeStarStateValue(record.starState),attachments,extra:{
        ...(record.archiveExtra||record.extra||{
        }),jetNoteRecord:raw
      }
    };
  },
  fromCanonical(list,resolveMedia){
    if(!Array.isArray(list)||list.length>10000)throw Error('Invalid posts array');
    const ids=new Set(),media=new Map();
    let numericId=Date.now();
    const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
    const posts=list.map(entry=>{
      if(!object(entry)||!['string','number'].includes(typeof entry.id)||!String(entry.id)||String(entry.id).length>100||entry.type!=='post'||typeof entry.text!=='string'||!Array.isArray(entry.attachments))throw Error('Invalid Post');
      const stableId=String(entry.id); if(ids.has(stableId))throw Error('Duplicate Post ID'); ids.add(stableId);
      for(const key of ['createdAt','updatedAt'])if(entry[key]!=null&&(typeof entry[key]!=='string'||!Number.isFinite(Date.parse(entry[key]))))throw Error('Invalid timestamp');
      const attachments=[],refs=new Map(),paths=new Map(),ownIds=new Set();
      for(const attachment of entry.attachments){
        if(!object(attachment)||typeof attachment.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(attachment.id)||ownIds.has(attachment.id)||typeof attachment.type!=='string'||!attachment.type||typeof attachment.mimeType!=='string'||!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(attachment.mimeType)||!/^media\/[A-Za-z0-9_.-]+$/.test(attachment.path)||attachment.path.includes('..'))throw Error('Invalid Attachment');
        if(attachment.type==='image'&&!attachment.mimeType.startsWith('image/'))throw Error('Invalid image MIME');
        const stored=resolveMedia(attachment),old=media.get(attachment.id); if(old&&old.sha256!==stored.sha256)throw Error('Conflicting Attachment ID');
        ownIds.add(attachment.id); media.set(attachment.id,stored); const{
          blob,...meta
        }
        =stored; attachments.push(meta);
        if(attachment.type==='image'){
          const source=stored.imageSource||NativeMedia.url(stored); refs.set(attachment.id,source); paths.set('https://appassets.androidplatform.net/'+attachment.path,source); paths.set('https://jetnote.local/'+attachment.path,source);
        }
      }
      const native=object(entry.extra?.jetNoteRecord); let raw=native?structuredClone(entry.extra.jetNoteRecord):{
        text:entry.text,time:entry.createdAt||'',images:entry.attachments.filter(a=>a.type==='image').map(a=>refs.get(a.id))
      };
      function ref(value){
        if(typeof value!=='string')throw Error('Invalid image reference'); if(value.startsWith('jet-note-media:')){
          const source=refs.get(value.slice(15)); if(!source)throw Error('Missing image'); return source;
        }
        if(paths.has(value))return paths.get(value); if(/^data:image\//i.test(value))return value; throw Error('Unresolved image');
      }
      if(Array.isArray(raw.images))raw.images=raw.images.map(ref); else raw.images=[];
      if(typeof raw.text!=='string'||raw.images.some(source=>!NativeMedia.isImage(source)))throw Error('Invalid post content');
      raw.uuid=stableId; raw.createdAt=entry.createdAt??null; raw.updatedAt=entry.updatedAt??null; raw.time=typeof raw.time==='string'?raw.time:(entry.createdAt||'');
      if(entry.starState==='super_starred'||entry.starState==='starred'||entry.starState==='none')raw.starState=entry.starState;
      raw=normalizePostStarStateRecord(raw,{allowLegacyFavorite:true});
      raw.archiveExtra={
        ...(entry.extra||{
        })
      }; delete raw.archiveExtra.jetNoteRecord;
      raw.archiveFields={
        ...entry
      }; for(const key of ['id','type','text','createdAt','updatedAt','starState','attachments','extra'])delete raw.archiveFields[key];
      raw.attachments=attachments.map(item=>{
        const copy={
          ...item
        }; delete copy.imageSource; return copy;
      });
      if(!Number.isSafeInteger(raw.id)||raw.id<0){
        raw.legacyId=raw.legacyId??raw.id; raw.id=numericId++;
      }
      return stableEntry(raw);
    });
    return{
      posts,media:[...media.values()].map(item=>{
        const copy={
          ...item
        }; delete copy.imageSource; return copy;
      })
    };
  }
};
