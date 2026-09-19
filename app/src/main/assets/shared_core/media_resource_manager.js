/* Jet Note shared media lifecycle manager.
 * UI modules own rendering; this module owns teardown bookkeeping.
 */
(function(){
  const records=new Map();
  let serial=0;
  function safe(fn){try{return fn?.();}catch(error){console.warn('[MediaResourceManager] cleanup failed',error);}}
  function register(options={}){
    const id=options.id||`media-${++serial}`;
    if(records.has(id))release(id,'replace');
    records.set(id,{id,scope:options.scope||'home',kind:options.kind||'media',owner:options.owner||null,release:options.release||null,cleanups:new Set()});
    return id;
  }
  function addCleanup(id,fn){const r=records.get(id);if(r&&typeof fn==='function')r.cleanups.add(fn);return fn;}
  function release(id,reason='release'){
    const r=records.get(id);if(!r)return false;
    records.delete(id); // delete first: cleanup is idempotent/re-entrancy safe
    for(const fn of [...r.cleanups])safe(()=>fn(reason));
    safe(()=>r.release?.(reason));
    r.cleanups.clear();
    return true;
  }
  function releaseOwner(owner,reason='owner-release'){
    for(const r of [...records.values()])if(r.owner===owner)release(r.id,reason);
  }
  function releaseScope(scope,reason='scope-release'){
    for(const r of [...records.values()])if(r.scope===scope)release(r.id,reason);
  }
  function releaseAll(reason='release-all'){for(const r of [...records.values()])release(r.id,reason);}
  function scopeFor(node){return node?.closest?.('.post-compose-screen')?'editor':'home';}
  window.JetNoteMediaResourceManager=Object.freeze({register,addCleanup,release,releaseOwner,releaseScope,releaseAll,scopeFor,size:()=>records.size});
  window.addEventListener('pagehide',()=>releaseAll('pagehide'));
  window.addEventListener('beforeunload',()=>releaseAll('beforeunload'));
})();
