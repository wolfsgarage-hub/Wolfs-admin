'use strict';
// Source-only repair. No cloud calls, stored-caption changes, approvals or publishing.
const fs = require('node:fs');
const path = require('node:path');
const VOICE = [
  'CAPTION VOICE v39.1: Write a normal note from Wolf to people who like cars. Do not perform a blue-collar persona or write an ad.',
  'Use ordinary words and natural contractions. Usually one to three sentences. There is no minimum word count. A single useful sentence is enough.',
  'Start with one specific, supported detail or the owner\'s actual point. Do not narrate every object, pile up adjectives, or turn the build into a metaphor.',
  'Do not force a hook, punch line, question, slogan, engagement request or call to action. A plain observation may simply end. Ask something only when there is a real question. Sell only when the owner explicitly asks for a sales post.',
  'Avoid canned car-caption lines: owns the show, steals the show, kissing the pavement, my kind of trouble, does it for me, good folks good trucks, this is what showing up looks like, built different, not just a car, rolling art, pure attitude, craftsmanship meets, turning heads, every detail tells a story, real metal real work. Do not substitute another slogan for them.',
  'Do not invent Wolf\'s feelings, visit, conversation, ownership, work performed or firsthand experience. Do not infer that different photos show the same vehicle. A make, year, engine, owner, location or event needs an explicit reliable note, not a guess from appearance.',
  'Use normal capitalization. Do not fake casualness with all lowercase, forced slang, profanity, exclamation marks or strings of clipped slogan fragments.',
  'No emojis, long dashes or curved quotes. Public name Wolf, never John, Jonathan or Prez. No unverified handles, private information, plates, promises, prices or dates.',
  'Example of removing hype, not text to copy: "That brown GMC owns the show!" becomes "That brown GMC sits right." Only mention an engine bay when its connection to that vehicle is established.',
  'Before returning, read the caption as something said out loud. Remove the sentence that sounds written to get engagement. Keep only what is useful or honestly observable. Hashtags belong in the separate field.'
].join('\n');

function once(s, old, next, label) {
  if (s.split(old).length !== 2) throw new Error('Source changed; refused patch: ' + (label || old.slice(0,80)));
  return s.replace(old, next);
}
function between(s, start, end, next) {
  const a=s.indexOf(start), b=s.indexOf(end,a+start.length);
  if (a<0 || b<a || s.indexOf(start,a+start.length)!==-1) throw new Error('Source boundary changed: '+start);
  return s.slice(0,a)+next+'\n'+s.slice(b);
}
function studio(s) {
  if(s.includes('CAPTION VOICE v39.1') && s.includes('v39.1.0</span>')) return s;
  s=once(s,'v39.0.0</span>','v39.1.0</span>');
  s=s.replace(/(scripts\/instagram-(?:workflow|studio)-v39\.js\?v=)39\.0\.0/g,'$139.1.0');
  s=once(s,'"Voice: blue-collar, direct, no fluff, no corporate speak."','"Voice: a person talking about the actual car or work, not a brand performing a persona."');
  s=once(s,'"- Caption written for search (Instagram is a search engine), front-load keywords a hot rodder would type."','"- Caption: ordinary language about supported details. No keyword stuffing."');
  s=once(s,'"- Drive saves and shares, and a clear call to action (shop link in bio, a confirmed upcoming booth, or follow)."','"- Do not add a caption call to action unless the owner explicitly needs one. The visual outro does not require a sales pitch in the caption."');
  s=once(s,'the full caption, search-friendly, no hashtags inside it','a natural caption, no forced hook or call to action, no hashtags inside it');
  s=once(s,'the specific call to action (this should reinforce the final brand-outro beat)','leave empty unless a real action is requested by the owner');
  const boundary='    return parts.join(';
  s=once(s,boundary,'    parts.push('+JSON.stringify(VOICE)+');\n'+boundary,'shared Studio voice');
  const batch=VOICE+'\nWrite a caption using only the attached photo and verified owner notes. Usually under 50 words, with no minimum. Give exactly five distinct relevant hashtag suggestions, not claimed research. Return ONLY valid JSON: {"caption":"caption without hashtags","hashtags":["#wolfsgarage","#tag2","#tag3","#tag4","#tag5"],"format_used":"Photo post"}.';
  const re=/    var prompt="Write a Wolf's Garage Instagram photo post[^\n]+\n/;
  if(!re.test(s))throw new Error('Batch prompt changed');
  return s.replace(re,'    var prompt='+JSON.stringify(batch)+';\n');
}
function queue(s) {
  if(s.includes('caption-editor-v1.3') && s.includes('content="1.3.0"'))return s;
  s=s.replace(/1\.2\.0/g,'1.3.0');
  s=once(s,'#detailCol{position:sticky;top:12px}','#detailCol{position:sticky;top:12px;max-height:calc(100vh - 24px);max-height:calc(100dvh - 24px);overflow-y:auto;overflow-x:hidden;scrollbar-gutter:stable;scroll-padding-block:16px}');
  s=once(s,'.detail{background:', '/* caption-editor-v1.3: bounded desktop scroll, normal document flow on phones. */\n#detailCol{min-width:0;min-height:0}\n#detailCol:focus-visible{outline:2px solid var(--bone);outline-offset:2px}\n.caption-editor{scroll-margin-block:16px}\n.caption-editor .btns{margin-bottom:14px}\n.caption-editor textarea{min-height:110px}\n.caption-options{margin-top:14px}\n.caption-options .opt{margin-top:6px}\n.detail-jump{margin:8px 0 12px}\n.detail{background:');
  s=once(s,'<div id="detailCol">','<div id="detailCol" tabindex="0" role="region" aria-label="Post details and caption editor">');
  s=between(s,'    return \'<div class="field"><label>Caption - pick one or write your own', '\n  }\n  function renderDetail()', `    return '<section class="caption-editor" aria-labelledby="captionHeading">' +
      '<div class="field"><label id="captionHeading" for="capText">Your caption' + (p.caption_author ? ' · saved: ' + esc(p.caption_author === 'john' ? 'your words' : 'generated') : ' · nothing saved yet') + '</label>' +
      '<textarea id="capText" aria-describedby="capHelp" placeholder="Write it how you would say it.">' + esc(current) + '</textarea>' +
      '<div class="hint" id="capHelp">Save updates this draft only. It does not approve or publish the post.</div></div>' +
      '<div class="field"><label for="hashText">Hashtags (0 to 5)</label><input type="text" id="hashText" value="' + esc(hashRaw) + '" placeholder="#wolfsgarage #pnwcars">' +
      '<div class="hint' + (hv.ok ? '' : ' bad') + '" id="hashHint">' + esc(hv.ok ? (hv.tags.length + ' tag' + (hv.tags.length === 1 ? '' : 's')) : hv.errors.join(' · ')) + '</div></div>' +
      '<div class="btns"><button class="act primary" data-act="use-caption" type="button">SAVE CAPTION</button>' +
      '<button class="act" data-act="reset-caption" type="button">RESET EDITS</button></div>' +
      '<details class="caption-options"><summary>Suggested captions (' + opts.length + ')</summary>' + radios + '</details>' +
      '<details><summary>Photo notes</summary><div class="hint">' + esc(Object.keys(p.facts || {}).filter(function(k){var v=p.facts[k];return v && k!== 'shoot_note' && (Array.isArray(v)||typeof v!=='object');}).map(function(k){return k+'='+ (Array.isArray(p.facts[k])?p.facts[k].join('/'):p.facts[k]);}).join(' · ') || 'No verified notes supplied.') + '</div></details></section>';`);
  s=once(s,'      \'<div class="slides" id="slides">\'', '      \'<div class="btns detail-jump"><button class="act" type="button" data-act="focus-caption">EDIT CAPTION</button></div>\' +\n      \'<div class="slides" id="slides">\'');
  s=once(s,"else if (act === 'edit') { select(id); var dc = $('detailCol'); if (dc.scrollIntoView) { dc.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }", "else if (act === 'edit') { select(id); focusCaption(); }");
  s=once(s,"      if (act === 'use-caption')", "      if (act === 'focus-caption') { focusCaption(); }\n      else if (act === 'use-caption')");
  s=once(s,'  function select(id) { state.selectedId = id; renderLine(); renderDetail(); }', `  function focusCaption() {
    requestAnimationFrame(function () {
      var t=$('capText'); if(!t)return;
      t.scrollIntoView({block:'center',behavior:'auto'});
      try{t.focus({preventScroll:true});}catch(e){t.focus();}
    });
  }
  function select(id) { var changed=state.selectedId!==id; state.selectedId = id; renderLine(); renderDetail(); if(changed)$('detailCol').scrollTop=0; }`);
  return s;
}
function apply(root) {
  const files={};
  for(const [name,fn] of [['index.html',studio],['social-queue.html',queue]])files[name]=fn(fs.readFileSync(path.join(root,name),'utf8'));
  const assemblerName='scripts/assemble-studio-v39.cjs';
  let a=fs.readFileSync(path.join(root,assemblerName),'utf8');
  if(!a.includes('caption-editor-v39-1.cjs')){
    a=once(a,"const current=fs.readFileSync", "const previousRelease=html; html=require('./caption-editor-v39-1.cjs').studio(html);\nconst current=fs.readFileSync");
    a=once(a,'if(current!==base && current!==html)','if(current!==base && current!==previousRelease && current!==html)');
  }
  files[assemblerName]=a;
  files['scripts/test-social-queue.mjs']=fs.readFileSync(path.join(root,'scripts/test-social-queue.mjs'),'utf8').replace(/1\.2\.0/g,'1.3.0');
  for(const [name,content] of Object.entries(files))fs.writeFileSync(path.join(root,name),content);
  return Object.keys(files);
}
module.exports={VOICE,studio,queue,apply};
if(require.main===module)console.log(JSON.stringify({updated:apply(path.resolve(__dirname,'..'))}));
