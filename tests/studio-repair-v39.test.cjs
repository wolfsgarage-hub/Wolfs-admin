/* Run from repository root with Node and linkedom@0.18.12 installed for tests.
 * No network calls, Firebase sign-in, real storage, or social writes are made.
 */
'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { parseHTML } = require('linkedom');
const patch = require('../scripts/studio-repair-v39.js');
const original = require('node:child_process').execFileSync('git', ['show', 'e4660bb529ad594831970bc5bd9a43cf4f1d0f4a:index.html'], {cwd:require('node:path').join(__dirname,'..'),encoding:'utf8'}).replace(/\r\n/g,'\n');
const html = patch.apply(original);
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m => !m[1].includes('src=') && !m[1].includes('application/json'));
const last = scripts[scripts.length - 1][2];
const expose = '\nwindow.__test = {callClaude,getKey,saveDraft,saveDrafts,getDrafts,renderPackage,buildSystem};\n';
const cut = last.lastIndexOf('})();');
const studio = last.slice(0,cut) + expose + last.slice(cut);
const pkg = {hook:'Real shop work',format_used:'Build recap',why_it_works:'Shows the work',content_type:'reel',beats:[{time:'0-3s',direction:'Show the existing work',on_screen_text:'Real work',is_brand_outro:false},{time:'3-6s',direction:'Show the detail',on_screen_text:'wolfsgarage.com',is_brand_outro:true}],caption:'Real shop work. Get back in the garage.',hashtags:['#WolfsGarage','#HotRods','#ShopWork','#CustomKulture','#Portland'],audio:'Choose licensed audio',cta:'Visit wolfsgarage.com'};
function fixture(initial = []) {
  const {document,Event} = parseHTML(html);
  const data = new Map(initial), notices = [], calls = [], timers = new Map();
  let clipboard = '', failWrite = false, next = 0, response = async () => ({ok:true,status:200,json:async()=>({content:[{type:'text',text:JSON.stringify(pkg)}]})});
  const storage = {getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>{if(failWrite)throw new Error('Quota');data.set(k,String(v));},removeItem:k=>data.delete(k)};
  const navigator = {clipboard:{writeText:async s=>{clipboard=s;}}};
  const window = {document,navigator,scrollTo:()=>{}};
  const sandbox = {window,document,navigator,localStorage:storage,location:{origin:'https://wolfsgarage-hub.github.io'},toast:s=>notices.push(s),alert:s=>notices.push(s),confirm:()=>true,console,AbortController,TypeError,fetch:(url,options)=>{calls.push({url,options});return response(url,options);},setTimeout:(fn,ms)=>{const id=++next;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)};
  vm.runInNewContext(studio,sandbox);
  return {api:window.__test,document,data,notices,calls,timers,Event,setResponse:fn=>{response=fn;},setFailWrite:v=>{failWrite=v;},getClipboard:()=>clipboard};
}
const tick = () => new Promise(resolve=>setImmediate(resolve));
async function click(f,id) {f.document.getElementById(id).dispatchEvent(new f.Event('click'));for(let i=0;i<5;i++)await tick();}
const tests=[];
function test(name,fn){tests.push([name,fn]);}
test('all inline scripts parse',()=>{assert.equal(scripts.length,3);scripts.forEach(m=>new vm.Script(m[2]));});
test('source drift stops the repair',()=>{assert.throws(()=>patch.apply(original.replace('v38</span>','v99</span>')),/Source changed/);});
test('stale booth date and incorrect handle removed',()=>{assert.ok(!/June 13|JUNE 13|@wolfsgarage/.test(html));assert.ok(html.includes('@_wolfsgarage'));});
test('no provider API key accepted; shared WG token reused',()=>{const f=fixture();f.data.set('wgpost:key','sk-not-a-real-key');f.data.set('wgProxyToken','fixture-proxy-token');assert.equal(f.api.getKey(),'fixture-proxy-token');});
test('HTTP 403 preserves previous package and restores button without retry',async()=>{const f=fixture();f.document.getElementById('studio-topic').value='Test topic';f.document.getElementById('studio-package-out').innerHTML='<p>Previous package</p>';f.setResponse(async()=>({ok:false,status:403}));await click(f,'studio-generate');assert.equal(f.calls.length,1);assert.match(f.document.getElementById('studio-request-status').textContent,/403/);assert.match(f.document.getElementById('studio-package-out').textContent,/Previous package/);assert.equal(f.document.getElementById('studio-generate').disabled,false);});
test('HTTP 429 and 503 have specific errors and no retry',async()=>{for(const status of [429,503]){const f=fixture();f.setResponse(async()=>({ok:false,status}));await assert.rejects(f.api.callClaude('s','u',[],20),status===429?/rate-limited/:/unavailable/);assert.equal(f.calls.length,1);}});
test('timeout aborts at 60 seconds and releases request lock',async()=>{const f=fixture();f.setResponse((u,o)=>new Promise((res,rej)=>o.signal.addEventListener('abort',()=>rej(Object.assign(new Error('aborted'),{name:'AbortError'})))));const promise=f.api.callClaude('s','u',[],20);const timer=[...f.timers.values()].find(t=>t.ms===60000);assert.ok(timer);timer.fn();await assert.rejects(promise,/60 seconds/);assert.equal(f.timers.size,0);});
test('concurrent generation is blocked',async()=>{const f=fixture();let finish;f.setResponse(()=>new Promise(r=>{finish=r;}));const first=f.api.callClaude('s','u',[],20);await assert.rejects(f.api.callClaude('s','u',[],20),/already running/);finish({ok:true,json:async()=>({content:[{type:'text',text:'OK'}]})});assert.equal(await first,'OK');assert.equal(f.calls.length,1);});
test('truncated and empty replies fail safely',async()=>{for(const data of [{stop_reason:'max_tokens',content:[]},{content:[]}]){const f=fixture();f.setResponse(async()=>({ok:true,json:async()=>data}));await assert.rejects(f.api.callClaude('s','u',[],20),/cut short|no text/);}});
test('malformed generation keeps existing output',async()=>{const f=fixture();f.document.getElementById('studio-topic').value='Test';f.document.getElementById('studio-package-out').textContent='Preserve me';f.setResponse(async()=>({ok:true,json:async()=>({content:[{type:'text',text:'not json'}]})}));await click(f,'studio-generate');assert.equal(f.document.getElementById('studio-package-out').textContent,'Preserve me');});
test('valid mocked package renders with combined copy',async()=>{const f=fixture();f.document.getElementById('studio-topic').value='Test';await click(f,'studio-generate');assert.match(f.document.getElementById('studio-package-out').textContent,/Real shop work/);f.document.querySelector('[data-copy="all"]').dispatchEvent(new f.Event('click'));await tick();assert.equal(f.getClipboard(),pkg.caption+'\n\n'+pkg.hashtags.join(' '));assert.match(f.document.getElementById('studio-request-status').textContent,/Nothing was published/);});
test('storage failure never claims draft success',()=>{const f=fixture();f.setFailWrite(true);f.api.saveDraft(pkg);assert.ok(f.notices.some(s=>s.includes('NOT saved')));assert.ok(!f.notices.some(s=>s.startsWith('Saved to')));assert.equal(f.data.has('wgcs:drafts'),false);});
test('corrupt stored drafts are preserved',()=>{const f=fixture();f.data.set('wgcs:drafts','{broken');f.api.saveDraft(pkg);assert.equal(f.data.get('wgcs:drafts'),'{broken');assert.ok(f.notices.some(s=>s.includes('Nothing was overwritten')));});
test('duplicate draft save creates one record',()=>{const f=fixture();f.api.saveDraft(pkg);f.api.saveDraft(pkg);assert.equal(JSON.parse(f.data.get('wgcs:drafts')).length,1);});
test('initial connection status does not claim success',()=>{const f=fixture();assert.match(f.document.getElementById('studio-key-status').textContent,/Not tested/);});
test('setup makes no unsupported local-file-only token promise',()=>{assert.ok(!html.includes('Token below is ONLY needed'));assert.ok(!html.includes('proxy token (usually leave blank)'));assert.match(html,/Saved tokens do not carry between different origins or browsers/);});
test('both existing shared aliases are sent without copying into Studio storage',async()=>{for(const key of ['wgProxyToken','wg:proxytok']){const f=fixture([[key,'fixture-shared-token']]);assert.equal(f.document.getElementById('studio-key-field').value,'');await f.api.callClaude('s','u',[],20);assert.equal(f.calls[0].options.headers['x-wg-token'],'fixture-shared-token');assert.equal(f.data.has('wgpost:key'),false);}});
test('connection test uses shared token without persisting an override',async()=>{const f=fixture([['wgProxyToken','fixture-shared-token']]);f.setResponse(async()=>({ok:true,json:async()=>({content:[{type:'text',text:'WG_DIAGNOSTIC_OK'}]})}));await click(f,'studio-test-key');assert.equal(f.calls.length,1);assert.equal(f.data.has('wgpost:key'),false);assert.match(f.document.getElementById('studio-key-status').textContent,/Connection verified/);});
test('unsaved token change blocks test without requests or storage writes',async()=>{const f=fixture([['wgProxyToken','fixture-shared-token']]);f.document.getElementById('studio-key-field').value='fixture-new-token';await click(f,'studio-test-key');assert.equal(f.calls.length,0);assert.equal(f.data.has('wgpost:key'),false);assert.match(f.document.getElementById('studio-key-status').textContent,/No request was sent/);});
test('clearing Studio override preserves shared token and reports fallback',async()=>{const f=fixture([['wgpost:key','fixture-override'],['wgProxyToken','fixture-shared']]);f.document.getElementById('studio-key-field').value='';await click(f,'studio-save-key');assert.equal(f.data.has('wgpost:key'),false);assert.equal(f.data.get('wgProxyToken'),'fixture-shared');assert.equal(f.api.getKey(),'fixture-shared');assert.match(f.document.getElementById('studio-key-status').textContent,/shared WG proxy token/);});
test('403 explains token presence without exposing credentials or response body',async()=>{for(const token of ['', 'fixture-secret-token']){const f=fixture(token?[['wgpost:key',token]]:[]);f.setResponse(async()=>({ok:false,status:403,headers:{get:()=> '01a1457b-436a-7960-ab62-bfe5578df307'},json:async()=>({error:'never display this body'})}));await assert.rejects(f.api.callClaude('s','u',[],20),e=>{assert.match(e.message,token?/A saved WG proxy token was sent/:/No WG proxy token was sent/);assert.match(e.message,/Request ID: 01a1457b-436a-7960-ab62-bfe5578df307/);assert.ok(!e.message.includes('fixture-secret-token'));assert.ok(!e.message.includes('never display'));return true;});assert.equal(f.calls.length,1);}});
test('untrusted correlation header is not displayed',async()=>{const f=fixture();f.setResponse(async()=>({ok:false,status:403,headers:{get:()=>'<b>untrusted-header</b>'}}));await assert.rejects(f.api.callClaude('s','u',[],20),e=>!e.message.includes('untrusted-header'));});
test('provider keys in every alias are omitted from requests',async()=>{const f=fixture([['wgpost:key','sk-studio'],['wgProxyToken','sk-shared'],['wg:proxytok','sk-legacy']]);await f.api.callClaude('s','u',[],20);assert.equal(f.calls[0].options.headers['x-wg-token'],undefined);});
test('preview cannot call retired queue writer',()=>{const section=html.slice(html.indexOf('async function pushToApprovalQueue'),html.indexOf('async function saveSocialPost'));assert.match(section,/return false/);assert.ok(!section.includes('fetch('));});
module.exports = {fixture,click};
if (require.main === module) (async()=>{let fail=0;for(const [name,fn] of tests){try{await fn();console.log('PASS '+name);}catch(e){fail++;console.log('FAIL '+name+': '+e.message);}}console.log(JSON.stringify({passed:tests.length-fail,failed:fail,total:tests.length}));process.exitCode=fail?1:0;})();
