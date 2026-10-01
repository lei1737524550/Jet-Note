// Requires playwright + its Chromium runtime. No Android/API simulation here.
// Run from ZIP root: node tests/action_group.playwright.cjs
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const assets=path.resolve(__dirname,'../src/main/assets');
const read=p=>fs.readFileSync(path.join(assets,p),'utf8');
const styles=[...read('index.html').matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(m=>m[0]).join('\n');
const server=http.createServer((req,res)=>{
  if(req.url==='/fixture') {res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><base href="/">'+styles+'<div id="threePostsOneBody"></div>');return;}
  const file=path.resolve(assets,'.'+decodeURIComponent(req.url.split('?')[0]));
  if(!file.startsWith(assets+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  const ext=path.extname(file);res.setHeader('Content-Type',({'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'})[ext]||'application/octet-stream');
  res.end(fs.readFileSync(file));
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.goto(`http://127.0.0.1:${server.address().port}/fixture`);
    await page.addScriptTag({content:`const expandedPostIds=new Set();function t(x){return x}function escapeHTML(x){return String(x)}function isWorkspaceWritable(){return true}function getPostStarState(p){return p.starState||'none'}`});
    await page.addScriptTag({content:read('src/shared/media/audio_player.js')});
    await page.addScriptTag({content:read('src/features/home/components/post_menu_icon.js')});
    await page.addScriptTag({content:read('src/features/home/main_notes_renderer.js').split('// ── Unified Post Surface')[0]});
    await page.evaluate(()=>{
      const cases=[['plain',false,false,false],['audio',true,false,false],['expand',false,true,false],['all',true,true,true],['top',true,true,true],['multi-audio',true,true,true]];
      document.querySelector('#threePostsOneBody').innerHTML=cases.map(([name,audio,expand,star],i)=>{
        const attachments=audio?[{id:'audio-'+i,type:'audio'}]:[];
        if(name==='multi-audio')attachments.push({id:'audio-extra',type:'audio'});
        return `<article class="post published-post-surface" data-case="${name}" ${name==='top'?'id="topPostCard"':''}>${renderPublishedPostHeader({id:i,title:name,attachments,starState:star?'star':'none'},String(i))}</article>`;
      }).join('');
      document.querySelectorAll('[data-case="expand"] .post-text-toggle,[data-case="all"] .post-text-toggle,[data-case="top"] .post-text-toggle,[data-case="multi-audio"] .post-text-toggle').forEach(b=>b.hidden=false);
    });
    for(const width of [320,390,480]){
      await page.setViewportSize({width,height:844});
      const results=await page.evaluate(()=>[...document.querySelectorAll('[data-case]')].map(card=>{
        const controls=[...card.querySelectorAll('.post-head-actions > button,.audio-token-play')].filter(e=>e.getClientRects().length);
        return {name:card.dataset.case,controls:controls.map(el=>{
          const r=el.getBoundingClientRect(),glyph=el.querySelector('img,svg')?.getBoundingClientRect();
          return {width:r.width,height:r.height,cx:r.x+r.width/2,cy:r.y+r.height/2,gx:glyph&&glyph.x+glyph.width/2,gy:glyph&&glyph.y+glyph.height/2};
        })};
      }));
      for(const result of results){
        const y=result.controls[0].cy;
        for(const c of result.controls){
          assert.equal(c.width,32,`${width}/${result.name} width`);assert.equal(c.height,32);
          assert.ok(Math.abs(c.cy-y)<0.1,`${width}/${result.name} centerY`);
          assert.ok(Math.abs(c.gx-c.cx)<0.1,`${width}/${result.name} glyph centerX`);
          assert.ok(Math.abs(c.gy-c.cy)<0.1,`${width}/${result.name} glyph centerY`);
        }
      }
      console.log('PASS action-group geometry at',width,'px');
    }
  } finally {await browser?.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
