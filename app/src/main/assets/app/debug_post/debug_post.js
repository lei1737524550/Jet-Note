(function(){
  'use strict';

  const DEBUG_MODE_STORAGE_KEY = 'jet_note_debug_enabled_v1';
  const README_URL = 'README.txt';
  const DEFAULT_SEARCH_CONFIG = Object.freeze({
    enabled:true,
    text_color_rule:{change_count:-1,sequence:[{color:'#FF0000',duration_ms:200},{color:'#FF8C00',duration_ms:200},{color:'#FFD700',duration_ms:200},{color:'#00A000',duration_ms:200}]},
    case_sensitive:false
  });
  let readmeText = '';
  let readmeLoadStarted = false;
  let searchConfig = {...DEFAULT_SEARCH_CONFIG};

  function escapeHtml(value){
    return typeof escapeHTML === 'function'
      ? escapeHTML(String(value ?? ''))
      : String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function escapeRegExp(value){ return String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }

  function loadSearchConfig(){
    try {
      const raw = window.JetNoteNative?.getRuntimeConfigJson?.();
      const parsed = raw ? JSON.parse(raw) : null;
      const cfg = parsed?.debug_post_search || {};
      const rawRule=cfg.text_color_rule || DEFAULT_SEARCH_CONFIG.text_color_rule;
      const sequence=Array.isArray(rawRule?.sequence) && rawRule.sequence.length ? rawRule.sequence.map(step=>({color:String(step?.color||'#000000'),duration_ms:Math.max(20,Number(step?.duration_ms)||200)})) : DEFAULT_SEARCH_CONFIG.text_color_rule.sequence;
      const changeCount=Number.isInteger(Number(rawRule?.change_count)) ? Number(rawRule.change_count) : -1;
      searchConfig = {enabled:cfg.enabled!==false,case_sensitive:cfg.case_sensitive===true,text_color_rule:{change_count:changeCount,sequence}};
    } catch (_) { searchConfig = {...DEFAULT_SEARCH_CONFIG}; }
    applySearchAnimationCss();
  }

  function applySearchAnimationCss(){
    const id='debugPostSearchAnimationStyle';
    let style=document.getElementById(id);
    if(!style){ style=document.createElement('style'); style.id=id; document.head.appendChild(style); }
    const rule=searchConfig.text_color_rule;
    const sequence=rule.sequence;
    const total=sequence.reduce((sum,step)=>sum+step.duration_ms,0);
    let elapsed=0;
    const steps=sequence.map(step=>{const at=(elapsed*100/total).toFixed(4);elapsed+=step.duration_ms;return `${at}%{color:${step.color}}`;}).join('');
    const count=rule.change_count<0?'infinite':Math.max(1,rule.change_count);
    const finalColor=rule.change_count===0?sequence[0].color:sequence[sequence.length-1].color;
    style.textContent=rule.change_count===0?`.debug-post-search-match{color:${finalColor};font-weight:700}`:`@keyframes debugPostSearchRainbow{${steps}100%{color:${sequence[sequence.length-1].color}}}.debug-post-search-match{animation:debugPostSearchRainbow ${total}ms steps(1,end) ${count};animation-fill-mode:forwards;font-weight:700}`;
  }

  function applyDebugUiBorderCss(){
    let rule=null; try{const raw=window.JetNoteNative?.getRuntimeConfigJson?.();rule=raw?JSON.parse(raw)?.debug_ui_border_rule:null}catch(_){}
    const seq=Array.isArray(rule?.sequence)&&rule.sequence.length?rule.sequence:[{color:'#FF0000',duration_ms:200},{color:'#FF8C00',duration_ms:200},{color:'#FFD700',duration_ms:200},{color:'#00A000',duration_ms:200}];
    const total=seq.reduce((n,x)=>n+Math.max(20,Number(x.duration_ms)||200),0);let elapsed=0;const frames=seq.map(x=>{const at=(elapsed*100/total).toFixed(3);elapsed+=Math.max(20,Number(x.duration_ms)||200);return `${at}%{border-color:${x.color}}`}).join('');
    let st=document.getElementById('debugUiBorderRuleStyle');if(!st){st=document.createElement('style');st.id='debugUiBorderRuleStyle';document.head.appendChild(st)}
    const count=Number(rule?.change_count);const iter=count<0?'infinite':Math.max(1,Number.isFinite(count)?count:1);st.textContent=`@keyframes debugUiSharedBorder{${frames}100%{border-color:${seq[seq.length-1].color}}}.debug-configuration-post,.debug-ui-dynamic-border{animation:debugUiSharedBorder ${total}ms steps(1,end) ${iter};animation-fill-mode:forwards}`;
  }

  async function ensureReadmeLoaded(){
    if(readmeLoadStarted) return;
    readmeLoadStarted=true;
    try{
      const nativeText=window.JetNoteNative?.getRuntimeReadmeText?.();
      if(typeof nativeText==='string' && nativeText.length){readmeText=nativeText; if(DebugConfigurationFeature.enabled() && typeof renderPosts==='function') renderPosts(); return;}
      const response=await fetch(README_URL,{cache:'no-store'});
      if(!response.ok) throw new Error(`README load failed: ${response.status}`);
      readmeText=await response.text();
    }catch(error){
      readmeText='README unavailable';
      console.warn(error);
    }
    if(DebugConfigurationFeature.enabled() && typeof renderPosts==='function') renderPosts();
  }

  class BaseNonPersistentPostRenderer { render(){ return ''; } }

  class DebugTextPostRenderer extends BaseNonPersistentPostRenderer {
    constructor({filename,text}){ super(); this.filename=filename; this.text=String(text??''); }
    render(){
      const id=this.filename==='README.txt'?'readme':this.filename;
      const edit=`<button class="more debug-configuration-post-edit-button" type="button" data-debug-configuration-post-action="edit" data-debug-post-id="${id}" aria-label="Edit ${escapeHtml(this.filename)}" title="Edit ${escapeHtml(this.filename)}"><img src="shared/icons/edit_pencil.svg" alt="" aria-hidden="true"></button>`;
      return `<article class="post debug-configuration-post common_border" data-debug-configuration-post="true" data-debug-post-id="${id}">
        <div class="debug-configuration-post-header"><div class="debug-configuration-post-filename">${escapeHtml(this.filename)}</div>${edit}</div>
        <div class="debug-configuration-post-json-preview" data-debug-post-preview="${id}">${escapeHtml(this.text)}</div>
      </article>`;
    }
  }

  class BaseFullScreenTextEditorController {
    constructor({screenElementId,textareaElementId}){ this.screenElementId=screenElementId; this.textareaElementId=textareaElementId; }
    get screenElement(){return document.getElementById(this.screenElementId)} get textareaElement(){return document.getElementById(this.textareaElementId)}
    isOpen(){return Boolean(this.screenElement?.classList.contains('open'))}
    openWithText(initialText){
      const screen=this.screenElement, textarea=this.textareaElement;
      if(!screen||!textarea) throw new Error('Debug configuration editor view is incomplete.');
      if(screen.parentElement!==document.body) document.body.appendChild(screen);
      textarea.value=String(initialText??''); window.JetNoteVideoOverlay?.suspend?.(); screen.classList.add('open'); screen.setAttribute('aria-hidden','false'); document.body.style.overflow='hidden'; window.__jetSyncNativeVideoVisibility?.(); window.ViewportManager?.update?.();
      const focus=()=>{textarea.focus({preventScroll:true}); try{textarea.setSelectionRange(textarea.value.length,textarea.value.length)}catch(_){}}; focus(); setTimeout(focus,80);
    }
    closeWithoutSaving(){ const screen=this.screenElement;if(!screen)return;this.textareaElement?.blur?.();screen.classList.remove('open');screen.setAttribute('aria-hidden','true');document.body.style.overflow='';window.__jetSyncNativeVideoVisibility?.(); }
  }

  class DebugConfigurationEditorController extends BaseFullScreenTextEditorController {
    constructor(){super({screenElementId:'debugConfigurationEditorScreen',textareaElementId:'debugConfigurationJsonTextarea'});this.hasBoundTextareaEvents=false;this.isSavingConfiguration=false;this.currentPostId='config.json';this.latestSyntaxResult={valid:true,errors:[]}}
    get validationErrorBox(){return document.getElementById('debugConfigurationValidationError')} get validationErrorMessage(){return this.validationErrorBox?.querySelector('.debug-configuration-validation-error-message')||null}
    bindTextareaEventsOnce(){
      if(this.hasBoundTextareaEvents)return;
      const t=this.textareaElement;if(!t)return;
      t.addEventListener('input',()=>{this.clearValidationError();this.latestSyntaxResult=this.currentPostId!=='readme'?this.validateConfigurationJson(t.value):{valid:true,errors:[]};this.refreshSearchHighlights()});
      t.addEventListener('scroll',()=>this.syncSearchHighlightScroll(),{passive:true});
      this.hasBoundTextareaEvents=true
    }
    openDebugPost(postId,text){
      this.currentPostId=postId==='readme'?'readme':String(postId||'config.json');this.bindTextareaEventsOnce();this.clearValidationError();
      super.openWithText(text);
      this.latestSyntaxResult=this.currentPostId!=='readme'?this.validateConfigurationJson(String(text??'')):{valid:true,errors:[]};
      const i=document.getElementById('debugEditorSearchInput');if(i)i.value='';
      this.clearSearchHighlights();
    }
    clearValidationError(){const b=this.validationErrorBox;if(!b)return;b.hidden=true;if(this.validationErrorMessage)this.validationErrorMessage.textContent=''}
    showValidationError(message){const b=this.validationErrorBox;if(!b)return;if(this.validationErrorMessage)this.validationErrorMessage.textContent=String(message||'Invalid JSON.');b.hidden=false;b.scrollIntoView?.({block:'nearest',behavior:'smooth'})}
    validateConfigurationJson(text){const validator=window.JsonSyntaxValidator;if(!validator?.validate)return{valid:false,errors:[{type:'validator_unavailable',message:'JSON syntax validator is unavailable.',start:0,end:1}]};return validator.validate(text,{requireObjectRoot:true})}
    get searchHighlightLayer(){return document.getElementById('debugConfigurationSearchHighlightLayer')}
    get searchTextRegion(){return this.textareaElement?.closest('.debug-configuration-editor-text-region')||null}
    captureFocusState(){
      const active=document.activeElement, textarea=this.textareaElement, input=document.getElementById('debugEditorSearchInput');
      if(active===textarea)return{element:textarea,start:textarea.selectionStart,end:textarea.selectionEnd,direction:textarea.selectionDirection};
      if(active===input)return{element:input,start:input.selectionStart,end:input.selectionEnd,direction:input.selectionDirection};
      return{element:active};
    }
    restoreFocusState(state){
      if(!state?.element?.isConnected)return;
      if(state.element===this.textareaElement||state.element===document.getElementById('debugEditorSearchInput')){
        state.element.focus({preventScroll:true});
        try{state.element.setSelectionRange(state.start,state.end,state.direction||'none')}catch(_){}
      }
    }
    clearSearchHighlights(){
      const layer=this.searchHighlightLayer, region=this.searchTextRegion;
      if(layer){
        layer.textContent='';
        layer.style.transform='translate(0,0)';
        layer.style.width='';
        layer.style.height='';
      }
      region?.classList.remove('search-highlights-active');
    }
    syncSearchHighlightScroll(){
      const t=this.textareaElement,layer=this.searchHighlightLayer;if(!t||!layer)return;
      layer.style.transform=`translate(${-t.scrollLeft}px,${-t.scrollTop}px)`;
    }
    collectLiteralMatches(text,query){
      if(!query)return[];
      const source=searchConfig.case_sensitive?text:text.toLocaleLowerCase();
      const needle=searchConfig.case_sensitive?query:query.toLocaleLowerCase();
      const matches=[];let from=0;
      while(from<=source.length-needle.length){
        const at=source.indexOf(needle,from);if(at<0)break;
        matches.push([at,at+query.length]);
        from=at+Math.max(1,query.length);
      }
      return matches;
    }
    renderAllSearchMatches(query){
      const textarea=this.textareaElement,layer=this.searchHighlightLayer,region=this.searchTextRegion;
      if(!textarea||!layer||!region)return 0;
      const text=textarea.value,matches=this.collectLiteralMatches(text,query);
      layer.replaceChildren();
      if(!matches.length){region.classList.remove('search-highlights-active');return 0}
      const fragment=document.createDocumentFragment();let cursor=0;
      for(const [start,end] of matches){
        if(start>cursor)fragment.append(document.createTextNode(text.slice(cursor,start)));
        const mark=document.createElement('span');mark.className='debug-post-search-match';mark.textContent=text.slice(start,end);fragment.append(mark);cursor=end;
      }
      if(cursor<text.length)fragment.append(document.createTextNode(text.slice(cursor)));
      layer.append(fragment);

      /* The mirror is a full-document surface, not a viewport-sized surface.
         The parent text-region is the viewport and performs the clipping.
         Keeping the mirror at textarea.scrollWidth/scrollHeight prevents long
         documents from being visually truncated when it is translated on scroll. */
      layer.style.width=`${Math.max(textarea.clientWidth,textarea.scrollWidth)}px`;
      layer.style.height=`${Math.max(textarea.clientHeight,textarea.scrollHeight)}px`;
      region.classList.add('search-highlights-active');
      this.syncSearchHighlightScroll();
      return matches.length;
    }
    renderDiagnosticRanges(errors){
      const textarea=this.textareaElement,layer=this.searchHighlightLayer,region=this.searchTextRegion;if(!textarea||!layer||!region)return;
      const text=textarea.value,ranges=(errors||[]).map(e=>[Math.max(0,Math.min(text.length,e.start||0)),Math.max(0,Math.min(text.length,e.end||((e.start||0)+1)))]).filter(r=>r[1]>r[0]).sort((a,b)=>a[0]-b[0]);
      const merged=[];for(const r of ranges){const last=merged[merged.length-1];if(last&&r[0]<=last[1])last[1]=Math.max(last[1],r[1]);else merged.push(r.slice())}
      layer.replaceChildren();const f=document.createDocumentFragment();let cursor=0;for(const [start,end] of merged){if(start>cursor)f.append(document.createTextNode(text.slice(cursor,start)));const mark=document.createElement('span');mark.className='debug-post-search-match debug-json-syntax-error-match';mark.textContent=text.slice(start,end);f.append(mark);cursor=end}if(cursor<text.length)f.append(document.createTextNode(text.slice(cursor)));layer.append(f);
      layer.style.width=`${Math.max(textarea.clientWidth,textarea.scrollWidth)}px`;layer.style.height=`${Math.max(textarea.clientHeight,textarea.scrollHeight)}px`;region.classList.add('search-highlights-active');this.syncSearchHighlightScroll();
    }
    refreshSearchHighlights(){
      const input=document.getElementById('debugEditorSearchInput');
      if(!input?.value){this.clearSearchHighlights();return}
      this.renderAllSearchMatches(input.value);
    }
    searchInEditor(){
      const input=document.getElementById('debugEditorSearchInput'),textarea=this.textareaElement;
      if(!input||!textarea||searchConfig.enabled===false)return;
      const state=this.captureFocusState(),query=input.value;
      if(query)this.renderAllSearchMatches(query);else this.clearSearchHighlights();
      this.restoreFocusState(state);
    }

    async saveCurrentPostAndClose(){if(this.isSavingConfiguration)return;const t=this.textareaElement,b=this.screenElement?.querySelector('.debug-configuration-editor-save-button');if(!t)return;this.clearValidationError();if(this.currentPostId!=='readme'){const focusState=this.captureFocusState(),scrollTop=t.scrollTop,scrollLeft=t.scrollLeft,result=this.latestSyntaxResult||this.validateConfigurationJson(t.value);if(!result.valid){playPostUiSound?.('error');this.renderDiagnosticRanges(result.errors);const first=result.errors?.[0];this.showValidationError(`${result.errors.length} JSON syntax error${result.errors.length===1?'':'s'}. ${first?.message||'Invalid JSON.'}`);t.scrollTop=scrollTop;t.scrollLeft=scrollLeft;this.syncSearchHighlightScroll();this.restoreFocusState(focusState);return}}playPostUiSound?.('send_post');this.isSavingConfiguration=true;if(b)b.disabled=true;try{const n=window.JetNoteNative;if(!n)throw new Error('Runtime bridge is unavailable.');if(this.currentPostId==='readme'){if(typeof n.setRuntimeReadmeText!=='function'||!n.setRuntimeReadmeText(t.value))throw new Error('Unable to save README.txt.');readmeText=t.value}else{if(typeof n.setRuntimeConfigSectionJson!=='function'||!n.setRuntimeConfigSectionJson(this.currentPostId,t.value))throw new Error(`Unable to save ${this.currentPostId}.`)}this.closeWithoutSaving();if(typeof n.relaunchForConfigReload==='function'){n.relaunchForConfigReload();return}location.reload()}catch(error){this.showValidationError(error?.message||'Unable to save Debug Post.')}finally{this.isSavingConfiguration=false;if(b?.isConnected)b.disabled=false}}
  }
  let editor=null; function getEditor(){if(!editor)editor=new DebugConfigurationEditorController();editor.bindTextareaEventsOnce();return editor}


  const DebugConfigurationFeature={
    enabled(){return localStorage.getItem(DEBUG_MODE_STORAGE_KEY)==='1'},
    async setEnabled(value){
      const next=Boolean(value);
      if(next){
        localStorage.setItem(DEBUG_MODE_STORAGE_KEY,'1');
        this.refreshSettings({animate:true,show:true});
        ensureReadmeLoaded();
        if(typeof renderPosts==='function')renderPosts();
        return;
      }
      if(!this.enabled())return;
      await this.closeDebugSettingsWithReflow();
      localStorage.setItem(DEBUG_MODE_STORAGE_KEY,'0');
      this.refreshSettings({animate:false,show:false});
      if(typeof renderPosts==='function')renderPosts();
    },
    getConfigurationSectionFiles(){try{const raw=window.JetNoteNative?.listRuntimeConfigSectionFilesJson?.();const names=raw?JSON.parse(raw):[];return Array.isArray(names)?names.filter(name=>typeof name==='string'&&name.endsWith('.json')):[]}catch(_){return[]}},
    getCurrentConfigurationSectionJson(section){try{return window.JetNoteNative?.getRuntimeConfigSectionJson?.(section)||'{}'}catch(_){return'{}'}},
    getCurrentConfigurationJson(){try{return window.JetNoteNative?.getRuntimeConfigJson?.()||'{}'}catch(_){return'{}'}},
    render(){
      if(!this.enabled())return'';
      loadSearchConfig();ensureReadmeLoaded();
      const configurationPosts=this.getConfigurationSectionFiles().map(filename=>new DebugTextPostRenderer({filename,text:this.getCurrentConfigurationSectionJson(filename)}).render()).join('');
      return configurationPosts+new DebugTextPostRenderer({filename:'README.txt',text:readmeText||'Loading README…'}).render();
    },
    openEditor(event,postId){event?.preventDefault?.();event?.stopPropagation?.();const id=postId==='readme'?'readme':String(postId||'config.json');const text=id==='readme'?readmeText:this.getCurrentConfigurationSectionJson(id);getEditor().openDebugPost(id,text)},
    closeEditor(){if(!editor?.isOpen())return false;editor.closeWithoutSaving();return true}, isEditorOpen(){return Boolean(editor?.isOpen())},
    saveJsonToDownloads(){const status=document.getElementById('debugSettingsStatus');if(status)status.textContent='';try{const n=window.JetNoteNative;if(!n||typeof n.saveEffectiveConfigJsonToDownloads!=='function')throw new Error('Config export bridge is unavailable.');const ok=n.saveEffectiveConfigJsonToDownloads();if(!ok&&status)status.textContent='Unable to save config.json.'}catch(error){if(status)status.textContent=error?.message||'Unable to save config.json.'}},
    getDebugSettingsAnimationConfig(){let cfg={};try{const raw=window.JetNoteNative?.getRuntimeConfigJson?.();cfg=raw?JSON.parse(raw)?.debug_settings_expand_animation||{}:{}}catch(_){}const choice=String(cfg.speed_or_duration||'speed').toLowerCase()==='duration'?'duration':'speed';return{speed_or_duration:choice,duration_ms:Math.max(0,Number(cfg.duration_ms)||900),speed_px_per_second:Math.max(1,Number(cfg.speed_px_per_second)||10)}},
    getDebugSettingsCloseConfig(){let cfg={};try{const raw=window.JetNoteNative?.getRuntimeConfigJson?.();cfg=raw?JSON.parse(raw)?.debug_settings_close_animation||{}:{}}catch(_){}const choice=String(cfg.speed_or_duration||'speed').toLowerCase()==='duration'?'duration':'speed';return{speed_or_duration:choice,duration_ms:Math.max(0,Number(cfg.duration_ms)||900),speed_px_per_second:Math.max(1,Number(cfg.speed_px_per_second)||10),end_hold_duration_ms:Math.max(0,Number(cfg.end_hold_duration_ms)||200),remaining_settings_reflow_duration_ms:Math.max(0,Number(cfg.remaining_settings_reflow_duration_ms)||700)}},
    debugSettingCards(){return Array.from(document.querySelectorAll('[data-debug-setting-card="true"]'))},
    debugSettingsMovementEntries(cards){const viewportBottom=Math.max(0,window.innerHeight||document.documentElement.clientHeight||0);return cards.map(card=>{const rect=card.getBoundingClientRect();const dy=viewportBottom-rect.bottom;return{card,dy,distance:Math.abs(dy)}})},
    resolveMaximumDistanceAnimationPlan(entries,cfg){const maximumDistance=entries.reduce((maximum,item)=>Math.max(maximum,Number(item.distance)||0),0);let sharedDuration=0;if(cfg.speed_or_duration==='speed'){if(maximumDistance>0&&cfg.speed_px_per_second>0)sharedDuration=maximumDistance/cfg.speed_px_per_second*1000}else sharedDuration=cfg.duration_ms;return entries.map(item=>({...item,duration:sharedDuration,effectiveSpeedPxPerSecond:sharedDuration>0?item.distance/(sharedDuration/1000):0}))},
    debugSettingsAnimationPlan(cards,closing=false){const cfg=this.getDebugSettingsAnimationConfig();return this.resolveMaximumDistanceAnimationPlan(this.debugSettingsMovementEntries(cards),cfg)},
    followDebugMovement(plan,animations){const body=document.querySelector('.settings-body');if(!body||!plan.length||!animations.length)return;const reference=plan.reduce((best,item)=>(Number(item.distance)||0)>(Number(best?.distance)||-1)?item:best,null);if(!reference?.card)return;let frame=0;const tick=()=>{const active=animations.some(animation=>animation.playState==='running'||animation.playState==='pending');if(!active){frame=0;return}const viewport=body.getBoundingClientRect(),rect=reference.card.getBoundingClientRect();const visibleHeight=Math.max(0,viewport.height);const maxScroll=Math.max(0,body.scrollHeight-body.clientHeight);let desired=body.scrollTop+(rect.top+rect.height/2-(viewport.top+visibleHeight/2));desired=Math.max(0,Math.min(maxScroll,desired));if(rect.height<=visibleHeight){if(rect.top<viewport.top)desired=Math.max(0,body.scrollTop-(viewport.top-rect.top));else if(rect.bottom>viewport.bottom)desired=Math.min(maxScroll,body.scrollTop+(rect.bottom-viewport.bottom))}if(Math.abs(desired-body.scrollTop)>.25)body.scrollTop=desired;frame=requestAnimationFrame(tick)};frame=requestAnimationFrame(tick)},
    animateDebugSettingCard(card,show,duration,startDy){card.getAnimations?.().forEach(animation=>animation.cancel());if(show){card.hidden=false;card.classList.add('debug-ui-dynamic-border');if(!duration)return null;return card.animate([{transform:`translate3d(0,${startDy}px,0)`,opacity:0},{transform:'translate3d(0,0,0)',opacity:1}],{duration,easing:'linear',fill:'none'})}card.classList.remove('debug-ui-dynamic-border');if(!duration){card.hidden=true;return null}return card.animate([{transform:'translate3d(0,0,0)',opacity:1},{transform:`translate3d(0,${startDy}px,0)`,opacity:0}],{duration,easing:'linear',fill:'forwards'})},
    async closeDebugSettingsWithReflow(){
      const cards=this.debugSettingCards().filter(card=>!card.hidden);
      const closeCfg=this.getDebugSettingsCloseConfig();
      const plan=this.debugSettingsAnimationPlan(cards,true);
      const closeAnimations=plan.map(item=>this.animateDebugSettingCard(item.card,false,item.duration,item.dy)).filter(Boolean);
      this.followDebugMovement(plan,closeAnimations);
      await Promise.all(closeAnimations.map(animation=>animation.finished.catch(()=>{})));
      // Enable and Cancel are exact reverse transactions: no close-only hold.

      const body=document.querySelector('.settings-body');
      const remaining=body?Array.from(body.children).filter(element=>element instanceof HTMLElement&&!cards.includes(element)&&!element.hidden):[];
      const before=new Map(remaining.map(element=>[element,element.getBoundingClientRect()]));
      cards.forEach(card=>{card.getAnimations?.().forEach(animation=>animation.cancel());card.hidden=true;card.classList.remove('debug-ui-dynamic-border');card.style.transform='';card.style.clipPath='';card.style.opacity=''});
      void body?.offsetHeight;
      const moving=[];
      remaining.forEach(element=>{
        const first=before.get(element),last=element.getBoundingClientRect();
        const dx=first.left-last.left,dy=first.top-last.top;
        if(Math.abs(dx)<.5&&Math.abs(dy)<.5)return;
        element.getAnimations?.().forEach(animation=>animation.cancel());
        moving.push(element.animate([{transform:`translate3d(${dx}px,${dy}px,0)`},{transform:'translate3d(0,0,0)'}],{duration:(plan[0]?.duration||0),easing:'linear',fill:'none'}).finished.catch(()=>{}));
      });
      await Promise.all(moving);
    },
    refreshSettings(options={}){const b=document.getElementById('enableDebugButton');if(!b)return;const on=options.show??this.enabled(),animate=options.animate===true;const cards=this.debugSettingCards();if(animate&&on){cards.forEach(card=>{card.hidden=false;card.classList.add('debug-ui-dynamic-border')});void document.documentElement.offsetHeight;const plan=this.debugSettingsAnimationPlan(cards,false);const animations=plan.map(item=>this.animateDebugSettingCard(item.card,true,item.duration,item.dy)).filter(Boolean);this.followDebugMovement(plan,animations)}else cards.forEach(card=>{if(!animate){card.getAnimations?.().forEach(animation=>animation.cancel());card.hidden=!on;card.classList.toggle('debug-ui-dynamic-border',on)}});applyDebugUiBorderCss();b.classList.remove('debug-enabled');const l=b.querySelector('.settings-choice-main');const enableDebugLabel=window.JetNoteLanguage?.value?.('ui_strings.settings.enable_debug','Enable Debug')||'Enable Debug';if(l)l.textContent=enableDebugLabel;else b.textContent=enableDebugLabel;b.setAttribute('aria-pressed',String(on));b.disabled=Boolean(on);b.setAttribute('aria-disabled',String(Boolean(on)))},
    bind(){getEditor();loadSearchConfig();if(this.enabled())ensureReadmeLoaded();this.refreshSettings();if(document.documentElement.dataset.debugConfigurationFeatureEventsBound==='true')return;document.documentElement.dataset.debugConfigurationFeatureEventsBound='true';document.addEventListener('pointerdown',event=>{if(event.target.closest('[data-debug-configuration-editor-action="search"]'))event.preventDefault()});document.addEventListener('click',event=>{if(event.target.closest('#colorViewCancelDebugButton')){event.preventDefault();void this.setEnabled(false);return}const action=event.target.closest('[data-debug-configuration-post-action]')?.dataset.debugConfigurationPostAction;if(action==='edit'){const postId=event.target.closest('[data-debug-configuration-post-action]')?.dataset.debugPostId;this.openEditor(event,postId);return}const ea=event.target.closest('[data-debug-configuration-editor-action]')?.dataset.debugConfigurationEditorAction;if(!ea)return;const c=getEditor();if(ea==='search'){event.preventDefault();c.searchInEditor()}else if(ea==='cancel'){event.preventDefault();c.closeWithoutSaving()}else if(ea==='save'){event.preventDefault();void c.saveCurrentPostAndClose()}});document.addEventListener('keydown',event=>{if(event.target?.id==='debugEditorSearchInput'&&event.key==='Enter'){event.preventDefault();getEditor().searchInEditor()}})}
  };
  window.DebugConfigurationFeature=DebugConfigurationFeature;window.DebugPostFeature=DebugConfigurationFeature;window.DebugConfigurationPostRenderer=DebugTextPostRenderer;window.DebugConfigurationEditorController=DebugConfigurationEditorController;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>DebugConfigurationFeature.bind(),{once:true});else DebugConfigurationFeature.bind();
})();
