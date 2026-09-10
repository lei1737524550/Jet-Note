(()=>{
  const previous=document.getElementById('jet-note-audio-results');if(previous)previous.remove();
  const zh=window.JET_NOTE_UI_LANGUAGE!=='en';
  const urls=new Map();
  const nativeUrls=Array.isArray(window.JET_NOTE_NATIVE_AUDIO_URLS)?window.JET_NOTE_NATIVE_AUDIO_URLS:[];
  const capturedAudioUrls=Array.isArray(window.JET_NOTE_CAPTURED_AUDIO_URLS)?window.JET_NOTE_CAPTURED_AUDIO_URLS:[];
  const capturedCandidateUrls=Array.isArray(window.JET_NOTE_CAPTURED_CANDIDATE_URLS)?window.JET_NOTE_CAPTURED_CANDIDATE_URLS:[];
  const audioHint=/(?:\.(?:mp3|m4a|aac|wav|ogg|opus|flac)(?:[?#]|$)|audio|sound|pronun|speech|voice|tts|\/media\/)/i;
  const directAudioHint=/(?:\.(?:mp3|m4a|aac|wav|ogg|opus|flac)(?:[?#]|$)|\/(?:audio|sound|pronun|speech|voice|tts)(?:[\/_?=.-]|$))/i;
  const normalize=value=>{
    if(typeof value!=='string')return null;
    let raw=value.trim().replace(/&amp;/g,'&').replace(/\\u002F/gi,'/').replace(/\\\//g,'/');
    if(raw.startsWith('//'))raw='https:'+raw;
    try{const url=new URL(raw,location.href);return url.protocol==='https:'?url.href:null;}catch(_){return null;}
  };
  const add=(value,{allowUnknown=false}={})=>{
    const url=normalize(value);if(!url||(!allowUnknown&&!audioHint.test(url)))return;
    const existing=urls.get(url);
    // Only an explicit audio-shaped URL gets the green/high-priority state.
    // A resource discovered through playback can still be a binary intermediary.
    const isAudio=Boolean(directAudioHint.test(url)||(existing&&existing.isAudio));
    urls.set(url,{url,isAudio});
  };

  nativeUrls.forEach(url=>add(url,{allowUnknown:true}));
  capturedCandidateUrls.forEach(url=>add(url,{allowUnknown:true}));
  capturedAudioUrls.forEach(url=>add(url,{allowUnknown:true}));
  try{performance.getEntriesByType('resource').forEach(entry=>add(entry.name));}catch(_){ }
  document.querySelectorAll('audio,video,audio source,video source,[src],[data-src],[data-audio],[data-audio-url],[data-url]').forEach(node=>{
    add(node.currentSrc);add(node.src);
    ['src','data-src','data-audio','data-audio-url','data-url'].forEach(name=>add(node.getAttribute&&node.getAttribute(name)));
  });
  document.querySelectorAll('script[type="application/ld+json"],script[type="application/json"],script:not([src])').forEach(script=>{
    const source=(script.textContent||'').slice(0,500000);
    const matches=source.match(/https?:\\?\/\\?\/[^\s"'<>\\]+/g)||[];
    matches.forEach(url=>add(url));
  });

  const found=[...urls.values()].sort((a,b)=>Number(b.isAudio)-Number(a.isAudio)||a.url.localeCompare(b.url));
  if(!found.length){
    alert(zh?'没有找到音频。请先在网页中完整播放一次发音后，再点击“获取音频”。':'No audio was found. Play the pronunciation once, then tap “Get Audio”.');
    return;
  }
  const panel=document.createElement('div');panel.id='jet-note-audio-results';
  panel.style='position:fixed;inset:10px;z-index:2147483647;background:#fff;color:#202124;padding:20px;overflow:auto;font:16px sans-serif;border:1px solid #bfc1c4;border-radius:14px;box-sizing:border-box;box-shadow:0 8px 28px rgba(0,0,0,.18)';
  const close=document.createElement('button');close.textContent=zh?'关闭':'Close';close.style='padding:8px 14px;border:1px solid #c8cbd0;border-radius:10px;background:#fff;color:#202124';close.onclick=()=>panel.remove();panel.appendChild(close);
  const hint=document.createElement('p');hint.textContent=zh?'已找到 '+found.length+' 个候选资源；音频资源优先显示。':'Found '+found.length+' candidate resource(s). Audio resources are listed first.';panel.appendChild(hint);
  found.forEach((entry,index)=>{
    const link=document.createElement('a'),url=entry.url,name=url.split('/').pop().split('?')[0]||url;
    link.href='jetnote-download://audio?url='+encodeURIComponent(url);
    link.textContent=(index+1)+'. '+name+(entry.isAudio?'':(zh?'（非音频资源）':' (non-audio resource)'));
    link.style='display:block;margin:20px 0;color:'+(entry.isAudio?'#168a45':'#c73737')+';overflow-wrap:anywhere;line-height:1.45';
    panel.appendChild(link);
  });
  document.body.appendChild(panel);
})();
