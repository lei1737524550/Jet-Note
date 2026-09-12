/* Native streaming storage (B) with IndexedDB Blob compatibility (A). */
const NativeMedia = {
  available: () => !!window.JetNoteNative?.pickAttachments,
  url(meta) {
    return meta?.path && /^media\/[A-Za-z0-9_.-]+$/.test(meta.path) ? 'https://appassets.androidplatform.net/' + meta.path : '';
  },
  isImage(src) {
    return /^data:image\//i.test(src || '') || /^https:\/\/(?:appassets\.androidplatform\.net|jetnote\.local)\/media\/[A-Za-z0-9_.-]+$/.test(src || '');
  },
  async storeBlob(meta, blob) {
    const path = meta.path || 'media/' + meta.id + '.' + mediaExtension(meta.mimeType);
    const token = JetNoteNative.beginMedia(path);
    if (!token) throw Error('Cannot stage media');
    try {
      for (let offset=0; offset<blob.size; offset+=147456) {
        const bytes=new Uint8Array(await blob.slice(offset,offset+147456).arrayBuffer());
        if (!JetNoteNative.appendMedia(token,bytesToBase64(bytes))) throw Error('Cannot write media');
      }
      const result=JSON.parse(JetNoteNative.finishMedia(token,meta.sha256 || ''));
      if(result.error)throw Error(result.error);
      return {
        ...meta,...result,path
      };
    } catch(error) {
      JetNoteNative.cancelMedia(token);
      throw error;
    }
  },
  async ensure(meta) {
    if (this.url(meta)) return meta;
    const stored=await EntryStore.media(meta.id);
    if (this.url(stored)) return {
      ...meta,...stored
    };
    if (!stored?.blob) throw Error('Missing media: '+(meta.originalName||meta.id));
    const converted=await this.storeBlob(meta,stored.blob);
    // Keep the original Blob until the entry transaction is committed; no destructive migration.
    return converted;
  },
  async image(source) {
    if(source.startsWith('data:image/')) {
      const match=/^data:(image\/[A-Za-z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(source);
      if(!match)throw Error('Invalid stored image');
      const bytes=base64ToBytes(match[2]),hash=sha256(bytes);
      return this.storeBlob({
        id:'image-'+hash,type:'image',mimeType:match[1],originalName:null,sha256:hash,size:bytes.length
      },new Blob([bytes],{
        type:match[1]
      }));
    }
    if(!this.isImage(source))throw Error('Image is not stored locally');
    const prefix=source.startsWith('https://appassets.androidplatform.net/')?'https://appassets.androidplatform.net/':'https://jetnote.local/';
    const path=source.slice(prefix.length);
    const result=JSON.parse(JetNoteNative.describeMedia(path));
    if(result.error)throw Error(result.error);
    return result;
  }
};
function mediaExtension(mime) {
  return ({
    'audio/mpeg':'mp3','audio/wav':'wav','audio/x-wav':'wav','audio/ogg':'ogg','audio/mp4':'m4a','audio/aac':'aac','audio/flac':'flac','image/jpeg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp','image/svg+xml':'svg','video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov','video/x-matroska':'mkv','video/3gpp':'3gp'
  }
  [mime]||'bin');
}
const nativePickResolvers=new Map();
window.JetNoteNativeCallbacks={
  onAttachmentsPicked(id,items){
    const p=nativePickResolvers.get(id);
    nativePickResolvers.delete(id);
    p?.resolve(items);
  },
  onAttachmentPickCancelled(id){
    const p=nativePickResolvers.get(id);
    nativePickResolvers.delete(id);
    p?.resolve([]);
  },
  onAttachmentPickError(id,message){
    const p=nativePickResolvers.get(id);
    nativePickResolvers.delete(id);
    p?.reject(Error(message || 'attachment-read-failed'));
  }
};
function pickNativeAttachments(type) {
  return new Promise((resolve,reject)=>{
    const id=entryUuid(); nativePickResolvers.set(id,{
      resolve,reject
    }); try{
      JetNoteNative.pickAttachments(id,type,true);
    }catch(e){
      nativePickResolvers.delete(id); reject(e);
    }
  });
}
async function pickEntryAudio(kind) {
  if(!NativeMedia.available()){
    document.getElementById(kind+'AudioPicker').click();
    return;
  }
  await pickEntryMedia(kind,'audio');
}
async function pickEntryMedia(kind, type) {
  if (!isWorkspaceWritable()) return;
  if (entriesBusy || !entriesReady) return;

  if (type === 'image' && hasDraftVideos()) {
    alert(t('imageVideoExclusive'));
    return;
  }
  if (type === 'video' && postDraftImages.length > 0) {
    alert(t('imageVideoExclusive'));
    return;
  }

  const token = audioLoadToken[kind];
  const selector = type === 'audio'
    ? '[data-add-audio="' + kind + '"]'
    : type === 'video'
      ? '[data-add-video="' + kind + '"]'
      : null;
  const button = selector ? document.querySelector(selector) : null;
  if (button?.disabled) return;
  if (postDraftMediaLoading) return;
  postDraftMediaLoading = true;
  if (button) button.disabled = true;

  try {
    const items = await pickNativeAttachments(type);
    if (token !== audioLoadToken[kind]) return;

    let remaining;
    if (type === 'image') {
      remaining = MAX_MEDIA_IMAGES - postDraftImages.length;
    } else if (type === 'video') {
      remaining = MAX_MEDIA_IMAGES - draftAttachments.post.filter(item => item.type === 'video').length;
    } else {
      remaining = 20 - draftAttachments.post.filter(item => item.type === 'audio').length;
    }

    if (items.length > remaining) {
      alert(t(type === 'image' ? 'imageLimit' : type === 'video' ? 'videoLimit' : 'attachmentLimit'));
    }

    const accepted = items.slice(0, Math.max(0, remaining));
    for (const meta of accepted) {
      draftAttachments[kind].push(meta);
      draftMedia[kind].set(meta.id, meta);
    }

    if (type === 'image') {
      postDraftImages.push(...accepted.map(item => NativeMedia.url(item)));
      renderPostImagePreview();
    } else if (type === 'video') {
      renderPostVideoPreview();
    }

    renderAudioDraft(kind);
    if (typeof syncPostEditorDraft === 'function') syncPostEditorDraft();
  } catch (error) {
    const code = String(error?.message || '');
    const key = code === 'attachment-read-failed' ? 'attachmentReadFailed' : 'attachmentReadFailed';
    alert(t(key));
  } finally {
    postDraftMediaLoading = false;
    if (button) button.disabled = false;
  }
}

