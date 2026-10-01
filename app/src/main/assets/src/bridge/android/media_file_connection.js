/* Native media storage used by the current app. */
const NativeMedia = {
  available: () => !!window.JetNoteNative?.pickAttachments,
  url(meta) {
    return meta?.path && /^media\/[A-Za-z0-9_.-]+$/.test(meta.path) ? 'https://appassets.androidplatform.net/' + meta.path : '';
  },
  isImage(src) {
    return /^https:\/\/appassets\.androidplatform\.net\/media\/[A-Za-z0-9_.-]+$/.test(src || '');
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
};
function mediaExtension(mime) {
  return ({
    'audio/mpeg':'mp3','audio/wav':'wav','audio/x-wav':'wav','audio/ogg':'ogg','audio/mp4':'m4a','audio/aac':'aac','audio/flac':'flac','image/jpeg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp','image/svg+xml':'svg','video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov','video/x-matroska':'mkv','video/3gpp':'3gp'
  }
  [mime]||'bin');
}
const nativePickResolvers=new Map();
function discardRejectedNativeMedia(meta) {
  const path = meta?.path;
  if (!path || !window.JetNoteNative?.discardMedia) return;
  try { JetNoteNative.discardMedia(path); } catch (_) {}
}

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
  },
  onKeyboardImagePasted(meta){
    if (keyboardImageReceiver) keyboardImageReceiver.accept(meta);
    else discardRejectedNativeMedia(meta);
  },
  onKeyboardImagePasteError(){
    keyboardImageReceiver?.error();
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

let keyboardImageReceiver = null;
window.JetNoteMediaInput = Object.freeze({
  registerKeyboardReceiver(receiver) {
    if (!receiver || typeof receiver.accept !== 'function' || typeof receiver.error !== 'function') {
      throw new TypeError('Keyboard receiver requires accept and error callbacks');
    }
    keyboardImageReceiver = receiver;
    return () => { if (keyboardImageReceiver === receiver) keyboardImageReceiver = null; };
  }
});
