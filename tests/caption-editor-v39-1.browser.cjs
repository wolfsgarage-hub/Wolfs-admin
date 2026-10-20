'use strict';
// Real Chromium rendering and input. All model/cloud traffic is intercepted with fixtures.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..');
const patch=require('../scripts/caption-editor-v39-1.cjs');
const current=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const oldQueue=cp.execFileSync('git',['show','d6d740954dbb7d7cdc83cd9eb84717e28f906209:social-queue.html'],{cwd:ROOT,encoding:'utf8'});
const panel=current.match(/<section class="panel" id="panel-studio">[\s\S]*?<\/section>/)[0];
const studio=[...current.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].find(m=>m[2].includes('var LS_DRAFTS = "wgcs:drafts"'))[2];
const styles=[...current.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[0]).join('\n');
const harness='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">'+styles+'<style>.panel#panel-studio{display:block;max-width:1100px;margin:auto}</style></head><body>'+panel+'<script>window.toast=function(){};</script><script src="/scripts/instagram-workflow-v39.js"></script><script src="/scripts/instagram-studio-v39.js"></script><script>'+studio+'</script></body></html>';
const demo=JSON.parse(fs.readFileSync(path.join(ROOT,'data/social-queue-demo.json'),'utf8'));
const fixture={...demo.line,settings:{...demo.line.settings,live_publishing:'off'},line:Array.from({length:14},(_,i)=>({...demo.line.line[0],id:'fixture-'+String(i+1).padStart(2,'0'),status:'pending',line_order:i,caption_final:'',caption_author:null,approved_at:null,tags:{user_tags:[],collaborators:[],handles_used:[]},caption_options:[{register:'hit',text:'Fixture option one.'},{register:'question',text:'Fixture option two.'},{register:'shoutout',text:'Fixture option three.'}]}))};
const model={hook:'Brown truck.',format_used:'Photo story',why_it_works:'The actual detail is the subject.',content_type:'carousel',beats:Array.from({length:4},(_,i)=>({time:'Slide '+(i+1),direction:'Show the supplied photo.',on_screen_text:i===3?'wolfsgarage.com':'',is_brand_outro:i===3})),caption:'That truck sits right.',hashtags:['#wolfsgarage','#trucks','#hotrods','#carcommunity','#customcars'],audio:'Use audio you have rights to.',cta:''};
let browser,server,saveFails=false;const calls=[],failures=[],checks=[];
function pass(name){checks.push(name);console.log('PASS '+name);}
function contentType(p){return p.endsWith('.js')||p.endsWith('.cjs')?'application/javascript':p.endsWith('.html')?'text/html':p.endsWith('.json')?'application/json':p.endsWith('.jpg')?'image/jpeg':p.endsWith('.png')?'image/png':'application/octet-stream';}
async function visibleInViewport(page,selector){return page.locator(selector).evaluate(el=>{let r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.top>=-1&&r.bottom<=innerHeight+1;});}
(async()=>{try{
  const launch={headless:true};
  if(process.env.WG_TEST_SPARTICUZ==='1'){const m=require('@sparticuz/chromium'),c=m.default||m;launch.args=c.args;launch.executablePath=await c.executablePath();}
  browser=await chromium.launch(launch);
  server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');let body,p;if(u.pathname==='/__old__.html'){body=oldQueue;res.setHeader('content-type','text/html');}else if(u.pathname==='/__studio__.html'){body=harness;res.setHeader('content-type','text/html');}else{p=path.resolve(ROOT,'.'+decodeURIComponent(u.pathname));if(!p.startsWith(ROOT+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){res.writeHead(404).end();return;}body=fs.readFileSync(p);res.setHeader('content-type',contentType(p));}res.end(body);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const context=await browser.newContext({viewport:{width:1229,height:608}});
  await context.addInitScript(()=>{localStorage.setItem('wgEvAdminKey','fixture-only');localStorage.setItem('wgProxyToken','fixture-only');const original=window.setInterval;window.__queuePolls=[];window.setInterval=function(f,ms,...a){if(ms===60000)window.__queuePolls.push(f);return original(f,ms,...a);};});
  await context.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());
    if(u.origin===base){await route.continue();return;}
    if(u.hostname==='pcqoivjzcokgdtlvoona.supabase.co'){
      const action=u.pathname.split('/').pop();let body={};try{body=JSON.parse(req.postData()||'{}');}catch{}
      calls.push({action,body});let out,status=200;
      if(action==='social_line')out=fixture;
      else if(action==='social_runs')out=[];
      else if(action==='social_handles')out=[];
      else if(action==='social_post_caption'){
        if(saveFails){status=500;out={message:'fixture failure'};}else{let p=fixture.line.find(x=>x.id===body.p_id);assert.ok(p);p.caption_final=body.p_text;p.caption_author=body.p_author;p.hashtags=body.p_hashtags;out={ok:true};}
      }else if(action==='anthropic-proxy')out={content:[{type:'text',text:JSON.stringify(model)}],stop_reason:'end_turn'};
      else {failures.push('Unexpected cloud action: '+action);status=403;out={error:'blocked in test'};}
      await route.fulfill({status,contentType:'application/json',body:JSON.stringify(out)});return;
    }
    await route.fulfill({status:204,body:''});
  });
  const page=await context.newPage();page.on('pageerror',e=>failures.push(e.message));page.on('dialog',d=>{failures.push('Unexpected dialog: '+d.type());d.dismiss();});
  await page.goto(base+'/__old__.html');await page.waitForSelector('#capText');
  const old=await page.locator('#detailCol').evaluate(e=>({height:e.getBoundingClientRect().height,view:innerHeight,overflow:getComputedStyle(e).overflowY}));assert.ok(old.height>old.view);assert.equal(old.overflow,'visible');pass('reproduces oversized sticky panel without its own vertical scrollbar in v1.2.0');
  for(const [width,height] of [[1229,608],[1366,768],[1024,600],[412,915],[360,640],[852,393],[412,450]]){
    await page.setViewportSize({width,height});await page.goto(base+'/social-queue.html');await page.waitForSelector('#capText');
    await page.locator('[data-act="edit"][data-id="fixture-07"]').click();
    await page.waitForFunction(()=>document.activeElement&&document.activeElement.id==='capText');
    assert.equal(await visibleInViewport(page,'#capText'),true,'caption in viewport '+width+'x'+height);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'no horizontal overflow');
    assert.equal(await page.locator('.caption-options').evaluate(e=>e.open),false);
    await page.locator('[data-act="use-caption"]').scrollIntoViewIfNeeded();assert.equal(await visibleInViewport(page,'[data-act="use-caption"]'),true,'save reachable');
    if(width>=1024){const dims=await page.locator('#detailCol').evaluate(e=>({h:e.clientHeight,view:innerHeight,scroll:e.scrollHeight,overflow:getComputedStyle(e).overflowY}));assert.ok(dims.h<=height-24+1);assert.ok(dims.scroll>dims.h);assert.equal(dims.overflow,'auto');await page.locator('#detailCol').evaluate(e=>e.scrollTop=0);const r=await page.locator('#detailCol').boundingBox();await page.mouse.move(r.x+r.width/2,Math.max(20,r.y+60));await page.mouse.wheel(0,450);await page.waitForFunction(()=>document.getElementById('detailCol').scrollTop>0);}
    pass('caption, save and scroll reachable at '+width+'x'+height);
  }
  await page.setViewportSize({width:1229,height:608});await page.goto(base+'/social-queue.html');await page.waitForSelector('#capText');await page.locator('[data-act="edit"][data-id="fixture-07"]').click();await page.locator('#capText').fill('That brown GMC sits right.');
  await page.locator('[data-act="use-caption"]').click();await page.waitForFunction(()=>document.getElementById('msg').textContent.includes('Saved your words'));
  const saved=calls.filter(x=>x.action==='social_post_caption').at(-1);assert.equal(saved.body.p_id,'fixture-07');assert.equal(saved.body.p_author,'john');assert.equal(saved.body.p_text,'That brown GMC sits right.');assert.equal(fixture.line[6].status,'pending');pass('explicit caption save updates only the selected pending fixture');
  saveFails=true;await page.locator('#capText').fill('Keep this edit when saving fails.');await page.locator('[data-act="use-caption"]').click();await page.waitForFunction(()=>document.getElementById('msg').textContent.includes('Save failed'));assert.equal(await page.locator('#capText').inputValue(),'Keep this edit when saving fails.');saveFails=false;pass('failed save preserves typed caption');
  await page.locator('#capText').focus();await page.evaluate(()=>window.__queuePolls.forEach(f=>f()));await page.waitForTimeout(150);assert.equal(await page.locator('#capText').inputValue(),'Keep this edit when saving fails.');pass('queue poll preserves an active edit');
  await page.locator('.caption-options summary').click();await page.locator('input[name="capopt"][value="1"]').check();await page.waitForFunction(()=>document.getElementById('msg').textContent.includes('Saved option'));assert.equal(calls.filter(x=>x.action==='social_post_caption').at(-1).body.p_author,'machine');pass('existing explicit option-pick behavior preserved');
  await page.locator('[data-act="focus-caption"]').click();await page.waitForFunction(()=>document.activeElement.id==='capText');assert.equal(await visibleInViewport(page,'#capText'),true);pass('edit-caption shortcut focuses the actual textbox');
  if(process.env.WG_TEST_SCREENSHOT){await page.screenshot({path:process.env.WG_TEST_SCREENSHOT,fullPage:false});}
  await page.goto(base+'/__studio__.html');await page.waitForFunction(()=>!!window.WGStudioBridge);
  await page.locator('#studio-media-input').setInputFiles(path.join(ROOT,'data/demo/car/slide-1.jpg'));await page.waitForSelector('.studio-thumb');await page.locator('#studio-topic').fill('Describe the supplied truck without hype.');await page.locator('#studio-generate').click();await page.waitForSelector('#studio-save-draft');
  let payload=JSON.stringify(calls.filter(c=>c.action==='anthropic-proxy').at(-1).body);assert.ok(payload.includes('CAPTION VOICE v39.1'));assert.ok(!payload.includes('front-load keywords'));assert.ok(!payload.includes('Drive saves and shares'));pass('normal Studio generation sends plain voice rules without keyword or CTA pressure');
  await page.evaluate(async()=>{await window.WGStudioBridge.generatePhoto({kind:'image',base64:'eA==',mediaType:'image/jpeg',w:1080,h:1080});});payload=JSON.stringify(calls.filter(c=>c.action==='anthropic-proxy').at(-1).body);assert.ok(payload.includes('CAPTION VOICE v39.1'));assert.ok(!payload.includes('End with one natural community action'));assert.ok(payload.includes('no minimum'));pass('batch photo generation uses the same voice rules');
  assert.deepEqual(failures,[]);assert.ok(!calls.some(x=>['social_post_decide','social_setting_set','wg-ig-publish','social_post_upsert'].includes(x.action)));assert.ok(fixture.line.every(p=>p.status==='pending'));pass('no approval, publishing, setting, media-upload or post-insert calls');
  const summary={browser:browser.version(),passed:checks.length,failed:0,model:'fixture responses only; outgoing prompts asserted',cloud:'intercepted fixtures only',checks};
  console.log(JSON.stringify(summary));if(process.env.WG_TEST_REPORT)fs.writeFileSync(process.env.WG_TEST_REPORT,JSON.stringify(summary,null,2));
}catch(e){console.error(e.stack);process.exitCode=1;}finally{if(browser)await browser.close();if(server)server.close();}})();
