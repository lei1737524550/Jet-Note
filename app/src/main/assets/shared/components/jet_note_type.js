(function(){
  'use strict';

  const CURRENT_BACKGROUND_TOKEN = 'current_background';
  const CURRENT_BODY_TOKEN = 'current_body';
  let componentPromise = null;
  let latestBackground = 'rgb(255,255,255)';
  let latestBody = 'rgb(255,255,255)';

  function loadComponentConfig(){
    if(!componentPromise){
      componentPromise=fetch('shared/components/jet_note_type.json',{cache:'no-store'}).then(response=>{
        if(!response.ok) throw new Error(`Jet Note type component config unavailable: ${response.status}`);
        return response.json();
      });
    }
    return componentPromise;
  }

  function normalizeColor(value,fallback){
    const text=String(value??'').trim();
    if(!text) return fallback;
    if(text===CURRENT_BACKGROUND_TOKEN) return latestBackground;
    if(text===CURRENT_BODY_TOKEN) return latestBody;
    if(/^[0-9a-fA-F]{6}$/.test(text)) return `#${text}`;
    if(/^[a-z_][a-z0-9_-]*$/i.test(text) && !CSS.supports('color',text)) return fallback;
    return text;
  }

  function setVar(name,value){
    if(value) document.documentElement.style.setProperty(name,value);
  }

  function readPath(object,path){
    return path.reduce((value,key)=>value && typeof value==='object' ? value[key] : undefined,object);
  }

  function rgbChannels(color){
    const text=String(color||'').trim();
    const rgbMatch=text.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/i);
    if(rgbMatch) return rgbMatch.slice(1,4).map(value=>Math.max(0,Math.min(255,Number(value))));
    const hexMatch=text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if(!hexMatch)return null;
    const hex=hexMatch[1].length===3 ? hexMatch[1].split('').map(char=>char+char).join('') : hexMatch[1];
    return [0,2,4].map(index=>parseInt(hex.slice(index,index+2),16));
  }

  function bodyForegroundColor(type){
    const contrast=type?.body_content_automatic_contrast||{};
    const channels=rgbChannels(latestBody)||[255,255,255];
    const [red,green,blue]=channels.map(channel=>channel/255);
    const relativeLuminance=(0.2126*red)+(0.7152*green)+(0.0722*blue);
    const configuredThreshold=Number(contrast.relative_luminance_threshold);
    const threshold=Number.isFinite(configuredThreshold) ? Math.max(0,Math.min(1,configuredThreshold)) : 0.5;
    const raw=relativeLuminance>threshold
      ? contrast.light_background_foreground_color
      : contrast.dark_background_foreground_color;
    const fallback=relativeLuminance>threshold ? '#111111' : '#f5f5f5';
    return normalizeColor(raw,fallback);
  }

  async function apply(currentBackground=latestBackground,currentBody=latestBody){
    latestBackground=String(currentBackground||latestBackground).trim()||latestBackground;
    latestBody=String(currentBody||latestBody).trim()||latestBody;
    const type=await loadComponentConfig();
    const backgrounds=type.jet_note_type_background||{};
    const borders=type.jet_note_type_border_color||{};

    setVar('--jet-note-type-body-foreground-color',bodyForegroundColor(type));

    const backgroundMap={
      '--jet-note-type-settings-set-background':['settings','set_background'],
      '--jet-note-type-edit-post-background':['edit_post'],
      '--jet-note-type-tools-background':['tools','fallback'],
      '--jet-note-type-page-action-bar-background':['page_action_bar'],
      '--jet-note-type-three-post-set-background':['three_post_one_body','set_background'],
      '--jet-note-type-three-post-set-body':['three_post_one_body','set_body'],
      '--jet-note-type-three-post-internal-control-background':['three_post_one_body','internal_controls'],
      '--jet-note-type-edit-post-right-side-tool-button-background':['edit_post_right_side_tool_buttons','normal_background'],
      '--jet-note-type-edit-post-right-side-tools-expanded-button-background':['edit_post_right_side_tool_buttons','tools_expanded_background'],
      '--jet-note-type-settings-set-body':['settings','set_body']
    };
    const borderMap={
      '--jet-note-type-settings-border-color':['settings'],
      '--jet-note-type-edit-post-border-color':['edit_post'],
      '--jet-note-type-tools-border-color':['tools','fallback'],
      '--jet-note-type-page-action-bar-border-color':['page_action_bar']
    };

    for(const [cssVar,path] of Object.entries(backgroundMap)){
      setVar(cssVar,normalizeColor(readPath(backgrounds,path),latestBackground));
    }
    for(const [cssVar,path] of Object.entries(borderMap)){
      setVar(cssVar,normalizeColor(readPath(borders,path),'#bfc1c4'));
    }

    setVar('--page-action-bar-background',getComputedStyle(document.documentElement).getPropertyValue('--jet-note-type-page-action-bar-background').trim()||latestBackground);
    setVar('--page-action-bar-border-color',getComputedStyle(document.documentElement).getPropertyValue('--jet-note-type-page-action-bar-border-color').trim()||'#bfc1c4');
    window.dispatchEvent(new CustomEvent('jetnote:type-appearance-changed',{detail:{background:latestBackground}}));
  }

  function currentBackground(){ return latestBackground; }
  function toolSlot(toolId){
    const match=String(toolId||'').match(/(?:config_)?tool_(\d+)$/i);
    return match ? `tool_${match[1]}` : 'fallback';
  }
  async function resolveToolValue(groupName,toolId,fallback){
    const type=await loadComponentConfig();
    const group=type?.[groupName]?.tools||{};
    const raw=group?.[toolSlot(toolId)] ?? group?.fallback;
    return normalizeColor(raw,fallback);
  }
  async function toolBackground(toolId){
    return resolveToolValue('jet_note_type_background',toolId,latestBackground);
  }
  async function toolBorderColor(toolId){
    return resolveToolValue('jet_note_type_border_color',toolId,'#bfc1c4');
  }

  window.JetNoteType={apply,currentBackground,toolBackground,toolBorderColor,CURRENT_BACKGROUND_TOKEN,CURRENT_BODY_TOKEN,loadComponentConfig};
})();
