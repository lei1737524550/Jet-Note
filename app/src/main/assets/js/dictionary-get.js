(()=>{
  const previous=document.getElementById('jet-note-audio-results');if(previous)previous.remove();
  const urls=[...new Set([
    ...performance.getEntriesByType('resource').map(x=>x.name),
    ...Array.from(document.querySelectorAll('audio, audio source'),x=>x.currentSrc||x.src)
  ].filter(x=>/^https:\/\//i.test(x)&&/\.(mp3|wav|ogg)(\?|$)/i.test(x)))];
  if(!urls.length){alert('没有找到音频，请先播放一次发音，再点击 Get。');return;}
  const panel=document.createElement('div');panel.id='jet-note-audio-results';
  panel.style='position:fixed;inset:10px;z-index:2147483647;background:white;color:black;padding:20px;overflow:auto;font:16px sans-serif;border:1px solid #bfc1c4;border-radius:14px;box-sizing:border-box';
  const close=document.createElement('button');close.textContent='关闭';close.onclick=()=>panel.remove();panel.appendChild(close);
  const hint=document.createElement('p');hint.textContent='点击音频文件选择保存位置';panel.appendChild(hint);
  urls.forEach(url=>{const link=document.createElement('a');link.href=url;link.textContent=url.split('/').pop();link.style='display:block;margin:24px 0;color:#198754;overflow-wrap:anywhere';panel.appendChild(link);});
  document.body.appendChild(panel);
})();
