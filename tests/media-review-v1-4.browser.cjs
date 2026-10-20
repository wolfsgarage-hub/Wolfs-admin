'use strict';
// Real Chromium + actual JPEG decoding. All cloud RPCs are intercepted fixtures.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),os=require('node:os');
const {chromium}=require('playwright');const ROOT=path.resolve(__dirname,'..');
const demo=JSON.parse(fs.readFileSync(path.join(ROOT,'data/social-queue-demo.json'),'utf8'));
const original={...demo.line.line[0],id:'fixture-media-review',status:'pending',caption_final:'That truck sits right.',caption_author:'john',pinned_date:null,hashtags:['#wolfsgarage'],story_media:{path:'data/demo/car/slide-1.jpg',w:1080,h:1920},tags:{user_tags:[],collaborators:[],handles_used:[]}};
let post,server,browser,saveFail=false,unloadable=false,noModule=false;const calls=[],errors=[],checks=[];
const clone=x=>JSON.parse(JSON.stringify(x));function pass(s){checks.push(s);console.log('PASS '+s);}
function mime(p){return p.endsWith('.html')?'text/html':p.endsWith('.css')?'text/css':/\.(js|cjs)$/.test(p)?'application/javascript':p.endsWith('.json')?'application/json':p.endsWith('.jpg')?'image/jpeg':p.endsWith('.png')?'image/png':'application/octet-stream';}
(async()=>{try{
  post=clone(original);
  server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');if(u.pathname==='/broken.jpg'||u.pathname==='/cover-only.mp4'){res.writeHead(404).end('missing fixture');return;}
    if(u.pathname==='/corrupt.jpg'){res.writeHead(200,{'content-type':'image/jpeg'}).end('not an image');return;}
    const p=path.resolve(ROOT,'.'+decodeURIComponent(u.pathname));if(!p.startsWith(ROOT+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){res.writeHead(404).end();return;}
    if(noModule&&u.pathname.endsWith('social-media-review-v1.js')){res.writeHead(503).end();return;}res.setHeader('content-type',mime(p));res.end(fs.readFileSync(p));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:'chrome',headless:true});const ctx=await browser.newContext({viewport:{width:1366,height:768}});
  await ctx.addInitScript(()=>{try{localStorage.setItem('wgEvAdminKey','fixture-only');}catch{}});
  await ctx.route('https://pcqoivjzcokgdtlvoona.supabase.co/**',async route=>{let req=route.request(),a=new URL(req.url()).pathname.split('/').pop(),body={};try{body=JSON.parse(req.postData()||'{}');}catch{}calls.push({a,body});let r={},status=200;
    if(a==='social_line')r={...demo.line,line:[post],settings:{...demo.line.settings,live_publishing:'off'}};
    else if(a==='social_runs'||a==='social_handles')r=[];
    else if(a==='social_post_get')r=clone(post);
    else if(a==='social_post_caption'){if(saveFail){status=500;r={message:'fixture save failure'};}else{assert.equal(body.p_id,post.id);post.caption_final=body.p_text;post.caption_author=body.p_author;post.hashtags=body.p_hashtags;r={ok:true};}}
    else if(a==='social_post_decide'){assert.equal(body.p_action,'approve');assert.equal(body.p_id,post.id);post.status='approved';r={ok:true};}
    else{errors.push('Unexpected live-action request '+a);status=403;r={error:'forbidden in test'};}
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(r)});});
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{errors.push('Unexpected dialog');d.dismiss();});
  async function open(){await page.goto(base+'/social-queue.html');await page.waitForSelector('#capText');await page.locator('[data-act="approve"]').click();await page.waitForSelector('#wg-media-review[open]');}
  async function decoded(){await page.waitForFunction(()=>{let i=document.querySelector('#mr-stage img');return i&&i.complete&&i.naturalWidth>0&&document.getElementById('mr-media-status').textContent.includes('viewed');});}
  async function all(){await decoded();while(await page.locator('#mr-next').isEnabled()){await page.locator('#mr-next').click();await decoded();}}
  const writes=()=>calls.filter(x=>['social_post_caption','social_post_decide'].includes(x.a));
  for(const [w,h] of [[1366,768],[1229,608],[1024,600],[412,915],[360,640],[852,393],[412,450]]){
    post=clone(original);await page.setViewportSize({width:w,height:h});await open();await decoded();
    const geom=await page.evaluate(()=>{let d=document.getElementById('wg-media-review'),i=document.querySelector('#mr-stage img'),c=document.getElementById('mr-caption'),ir=i.getBoundingClientRect(),cr=c.getBoundingClientRect();return {natural:i.naturalWidth,fit:getComputedStyle(i).objectFit,imageVisible:ir.top>=0&&ir.bottom<=innerHeight+1&&ir.width>120&&ir.height>30,captionVisible:cr.top<innerHeight&&cr.bottom>0,overflow:d.scrollWidth>d.clientWidth+1};});
    assert.ok(geom.natural>100);assert.equal(geom.fit,'contain');assert.ok(geom.imageVisible);assert.ok(geom.captionVisible);assert.equal(geom.overflow,false);
    assert.equal(await page.locator('#mr-approve').isDisabled(),true);assert.equal(await page.locator('#mr-confirm').isDisabled(),true);
    await page.locator('#mr-caption').fill('A draft edit beside the actual photo.');assert.equal(await page.locator('#mr-stage img').isVisible(),true);
    if(w===1366)await page.screenshot({path:path.join(os.tmpdir(),'wg-media-review-desktop.png')});if(w===412&&h===915)await page.screenshot({path:path.join(os.tmpdir(),'wg-media-review-phone.png')});
    await page.locator('#mr-close').click();await page.waitForSelector('#wg-media-review',{state:'detached'});assert.equal(await page.locator('#capText').inputValue(),'A draft edit beside the actual photo.');
    pass('actual picture and editable caption visible at '+w+'x'+h+'; closing preserves edits');
  }
  assert.equal(writes().length,0);pass('opening, viewing and navigating do not save or approve');
  post=clone(original);await page.setViewportSize({width:1366,height:768});await open();await decoded();
  await page.locator('#mr-enlarge').click();assert.equal(await page.locator('.mr-copy').isVisible(),false);assert.equal(await page.locator('#mr-stage img').isVisible(),true);await page.locator('#mr-enlarge').click();assert.equal(await page.locator('#mr-caption').isVisible(),true);pass('full-photo mode keeps the entire picture and returns to caption');
  await all();assert.ok((await page.locator('#mr-media-status').innerText()).includes('4 of 4 viewed'));assert.equal(await page.locator('#mr-approve').isDisabled(),true);await page.locator('#mr-confirm').check();assert.equal(await page.locator('#mr-approve').isEnabled(),true);pass('every slide plus Story must load and be shown, then require explicit confirmation');
  await page.locator('#mr-caption').fill('A saved caption beside real media.');assert.equal(await page.locator('#mr-approve').isDisabled(),true);assert.equal(await page.locator('#mr-confirm').isChecked(),false);saveFail=true;await page.locator('#mr-save').click();await page.waitForFunction(()=>document.getElementById('mr-message').textContent.includes('500'));assert.equal(await page.locator('#mr-caption').inputValue(),'A saved caption beside real media.');assert.equal(post.status,'pending');saveFail=false;pass('changed caption clears confirmation; failed save preserves it');
  await page.locator('#mr-save').click();await page.waitForFunction(()=>document.getElementById('mr-message').textContent.startsWith('Caption saved'));assert.equal(post.caption_final,'A saved caption beside real media.');assert.equal(post.status,'pending');assert.equal(calls.filter(x=>x.a==='social_post_decide').length,0);pass('verified caption save does not approve');
  await page.locator('#mr-confirm').check();await page.locator('#mr-approve').click();await page.waitForFunction(()=>document.getElementById('mr-post').textContent.includes('approved'));assert.equal(calls.filter(x=>x.a==='social_post_decide').length,1);assert.equal(post.status,'approved');pass('only explicit confirmation and approval write one fixture approval');await page.locator('#mr-close').click();
  post=clone(original);await open();await all();await page.locator('#mr-confirm').check();post.media[1].path='data/demo/community/slide-1.jpg';const n=calls.filter(x=>x.a==='social_post_decide').length;await page.locator('#mr-approve').click();await page.waitForFunction(()=>document.getElementById('mr-message').textContent.includes('post changed'));assert.equal(calls.filter(x=>x.a==='social_post_decide').length,n);pass('a changed cloud picture invalidates approval before any write');await page.locator('#mr-close').click();
  for(const file of ['broken.jpg','corrupt.jpg']){post=clone(original);post.media=[{path:base+'/'+file,cover_path:'data/demo/car/slide-1.jpg'}];post.story_media=null;await open();await page.waitForFunction(()=>document.getElementById('mr-media-status').textContent.includes('NOT LOADED'));assert.equal(await page.locator('#mr-confirm').isDisabled(),true);assert.equal(await page.locator('#mr-approve').isDisabled(),true);assert.ok((await page.locator('#mr-stage').innerText()).includes('Approval is blocked'));await page.locator('#mr-close').click();pass(file+': a good cover or HTTP 200 cannot substitute for a decoded picture');}
  post=clone(original);post.media=[];post.story_media=null;await open();assert.ok((await page.locator('#mr-stage').innerText()).includes('No pictures attached'));assert.equal(await page.locator('#mr-approve').isDisabled(),true);await page.locator('#mr-close').click();pass('no media means no approval');
  post=clone(original);post.media=[{kind:'video',path:base+'/cover-only.mp4',cover_path:'data/demo/car/slide-1.jpg'}];post.story_media=null;await open();await page.waitForFunction(()=>document.getElementById('mr-media-status').textContent.includes('NOT LOADED'));assert.equal(await page.locator('#mr-confirm').isDisabled(),true);await page.locator('#mr-close').click();pass('a video cover does not count as watching the actual video');
  noModule=true;post=clone(original);await page.route('**/scripts/social-media-review-v1.js*',route=>route.fulfill({status:503,body:''}));await page.goto(base+'/social-queue.html');await page.waitForSelector('#capText');await page.locator('[data-act="approve"]').click();assert.ok((await page.locator('#msg').textContent()).includes('Nothing was approved'));assert.equal(calls.filter(x=>x.a==='social_post_decide').length,n);pass('missing review module fails closed');
  assert.ok(!calls.some(x=>['social_setting_set','wg-ig-publish','social_post_upsert'].includes(x.a)));assert.deepEqual(errors,[]);pass('no live-setting, publishing, media-upload or new-post calls');
  const out={passed:checks.length,failed:0,browser:browser.version(),media:'actual repository JPEG files decoded by Chrome',cloud:'intercepted fixtures only',liveApprovals:0,checks};fs.writeFileSync(path.join(os.tmpdir(),'wg-media-review-report.json'),JSON.stringify(out,null,2));console.log(JSON.stringify(out));
}catch(e){console.error(e.stack);process.exitCode=1;}finally{if(browser)await browser.close();if(server)server.close();}})();
