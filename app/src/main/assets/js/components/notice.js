/* All page alert() calls use the Jet Note visual language. */
const JetNoteNotice=(()=>{
  let queue=[],open=false;
  const root=document.createElement('div');root.className='jet-notice-backdrop';root.innerHTML=`<section class="jet-notice" role="alertdialog" aria-modal="true" aria-labelledby="jetNoticeTitle"><div class="jet-notice-mark">i</div><h2 id="jetNoticeTitle">提示</h2><p id="jetNoticeMessage"></p><button id="jetNoticeOk" type="button">知道了</button></section>`;document.body.appendChild(root);
  const message=root.querySelector('#jetNoticeMessage'),title=root.querySelector('#jetNoticeTitle'),ok=root.querySelector('#jetNoticeOk');
  function show(){if(open||!queue.length)return;open=true;const item=queue.shift();title.textContent=typeof t==='function'?t('notice'):'提示';message.textContent=String(item);root.classList.add('open');requestAnimationFrame(()=>ok.focus());}
  function close(){if(!open)return;root.classList.remove('open');open=false;setTimeout(show,100);}
  ok.addEventListener('click',close);root.addEventListener('click',event=>{if(event.target===root)close();});
  document.addEventListener('keydown',event=>{if(open&&(event.key==='Escape'||event.key==='Enter')){event.preventDefault();close();}});
  window.alert=value=>{queue.push(value??'');show();};
  return{close,isOpen:()=>open};
})();
