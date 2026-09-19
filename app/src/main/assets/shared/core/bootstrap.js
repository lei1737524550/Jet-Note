(async function initializeJetNote(){
  try{ await initializeLanguage?.(); await initializeEntries(); }
  catch(error){
    const message=error?.message||String(error);document.body.innerHTML=`<main style="padding:24px;font-family:sans-serif;line-height:1.6;background:#fff;min-height:100vh"><section style="max-width:560px;margin:48px auto;padding:20px;border:1px solid #c8cdd2;border-radius:16px;background:#fff"><strong style="color:#b3261e">Data initialization failed</strong><div style="margin-top:10px;overflow-wrap:anywhere">${message}</div><div style="margin-top:10px;color:#7a7f84;font-size:13px">Existing data was not deleted. Close the app and try again.</div></section></main>`;console.error(error);return;
  }
  renderPosts();applyLanguage();
  window.JetNoteStartupBrowserEntry?.markReady?.();
  // Signal only after the successful render path. Two animation frames make the
  // diagnostic mean 'the rendered UI reached a paint opportunity', not merely
  // 'data initialization finished'. Native splash timing does not wait for this.
  const notifyNativeFrontendRendered=()=>{
    if(window.JetNoteNative?.frontendReady)JetNoteNative.frontendReady();
  };
  if(typeof requestAnimationFrame==='function'){
    requestAnimationFrame(()=>requestAnimationFrame(notifyNativeFrontendRendered));
  } else {
    setTimeout(notifyNativeFrontendRendered,0);
  }
})();
