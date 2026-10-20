'use strict';
// Guarded source migration in the existing queue; never touches cloud data.
const fs=require('node:fs'),path=require('node:path');const root=path.resolve(__dirname,'..');
const target=path.join(root,'social-queue.html');let s=fs.readFileSync(target,'utf8').replace(/\r\n/g,'\n');
if(s.includes('social-media-review-v1.js'))throw Error('Already applied. Inspect before changing.');
function once(old,next){if(s.split(old).length!==2)throw Error('Unexpected source: '+old.slice(0,90));s=s.replace(old,next);}
function between(a,b,next){let i=s.indexOf(a),j=s.indexOf(b,i+a.length);if(i<0||j<i||s.indexOf(a,i+a.length)!==-1)throw Error('Unexpected boundaries: '+a);s=s.slice(0,i)+next+'\n'+s.slice(j);}
s=s.replace(/1\.3\.0/g,'1.4.0');
once('</head>','<link rel="stylesheet" href="scripts/social-media-review-v1.css?v=1.4.0">\n<script src="scripts/social-media-review-v1.js?v=1.4.0"></script>\n</head>');
once('type="button">POST IT</button>','type="button">REVIEW POST</button>');
once("if (act === 'approve') { b.disabled = true; approveWithCaption(state.line.filter(function (x) { return x.id === id; })[0] || { id: id }, id); }", "if (act === 'approve') { openMediaReview(id, 0); }");
once("      else if (act === 'use-caption')", "      else if (act === 'view-media') { openMediaReview(p.id, Number(b.getAttribute('data-slide')) || 0); }\n      else if (act === 'use-caption')");
once('>EDIT CAPTION</button></div>', '>EDIT CAPTION</button><button class="act primary" type="button" data-act="view-media">VIEW PHOTOS + CAPTION</button></div>');
once("host.innerHTML = '<button class=\"act\" data-act=\"epic\"", "host.innerHTML = '<button class=\"act\" data-act=\"view-media\" data-slide=\"' + i + '\" type=\"button\">VIEW FULL PHOTO</button>' + '<button class=\"act\" data-act=\"epic\"");
between('  function approveWithCaption(p, id) {','  function decide(id, action, reason) {',String.raw`  function reviewValues(d) {
    if(!d.caption)throw Error('Write a caption before approval.');
    var v=SQ.voiceCheck(d.caption),h=SQ.parseHashtags(d.hashtags);
    if(v)throw Error(v);if(!h.ok)throw Error(h.errors.join(' '));
    if((d.caption+'\n\n'+h.tags.join(' ')).length>2200)throw Error('Caption and hashtags exceed 2,200 characters.');
    return h.tags;
  }
  async function reviewCurrent(p) {
    if(DEMO)throw Error('DEMO: nothing is saved or approved.');
    var fresh=await rpc('social_post_get',{p_id:p.id});
    if(!fresh || fresh.id!==p.id || window.SQMediaReview.signature(fresh)!==window.SQMediaReview.signature(p))throw Error('This post changed. Close and reopen it to review the current pictures and caption.');
    if(fresh.status!=='pending')throw Error('Only a pending post can be changed here.');
    return fresh;
  }
  async function reviewSave(p,d) {
    var tags=reviewValues(d);await reviewCurrent(p);
    var r=await rpc('social_post_caption',{p_id:p.id,p_text:d.caption,p_author:'john',p_hashtags:tags});
    if(r && r.ok===false)throw Error('The caption was not saved.');
    var saved=await rpc('social_post_get',{p_id:p.id});
    var expected=Object.assign({},p,{caption_final:d.caption,caption_author:'john',hashtags:tags});
    if(!saved || window.SQMediaReview.signature(saved)!==window.SQMediaReview.signature(expected))throw Error('Save could not be verified or the post changed. Your typed words are still here.');
    if(state.selectedId===p.id){state.captionText=null;state.hashText=null;state.captionPick=null;}
    await loadLine();return saved;
  }
  async function reviewApprove(p,d) {
    var tags=reviewValues(d),fresh=await reviewCurrent(p),hold=window.WGIG && window.WGIG.reviewHold(fresh);
    if(hold)throw Error(hold==='past event'?'This event has already passed. Refresh its content before approval.':hold==='future pin'?'Future-date approval is held until cloud scheduling protection is verified.':'Add actual media and a caption before approval.');
    if(fresh.caption_final && (fresh.caption_final!==d.caption || JSON.stringify(fresh.hashtags||[])!==JSON.stringify(tags)))throw Error('Save the caption you are reviewing before approving.');
    if(!fresh.caption_final){
      if(!(fresh.caption_options||[]).some(function(o){return o.text===d.caption;}) || JSON.stringify(fresh.hashtags||[])!==JSON.stringify(tags))throw Error('Save the edited caption before approving.');
      var saved=await rpc('social_post_caption',{p_id:p.id,p_text:d.caption,p_author:'machine',p_hashtags:tags});
      if(saved && saved.ok===false)throw Error('Caption selection failed. Nothing was approved.');
      var expected=Object.assign({},fresh,{caption_final:d.caption,caption_author:'machine',hashtags:tags});
      fresh=await rpc('social_post_get',{p_id:p.id});
      if(!fresh || window.SQMediaReview.signature(fresh)!==window.SQMediaReview.signature(expected))throw Error('Post changed before approval. Close and review again.');
    }
    var result=await rpc('social_post_decide',{p_id:p.id,p_action:'approve',p_reason:'owner reviewed actual media and caption in queue v1.4'});
    if(result && result.ok===false)throw Error('Approval was rejected.');
    var verified=await rpc('social_post_get',{p_id:p.id});
    if(!verified || verified.status!=='approved' || window.SQMediaReview.signature(verified)!==window.SQMediaReview.signature(Object.assign({},fresh,{status:'approved'})))throw Error('Approval result is not verified. Close and refresh before trying again.');
    await loadLine();return verified;
  }
  function openMediaReview(id,start) {
    var p=state.line.filter(function(x){return x.id===id;})[0];
    if(!p){toast('Refresh the queue to load this post.');return;}
    if(!window.SQMediaReview){toast('Photo review did not load. Refresh this page. Nothing was approved.');return;}
    var pick=state.selectedId===id && state.captionPick!=null?state.captionPick:0;
    var saved=p.caption_final || ((p.caption_options||[])[pick]||{}).text || '';
    var caption=state.selectedId===id && state.captionText!=null?state.captionText:saved;
    var hashes=state.selectedId===id && state.hashText!=null?state.hashText:(p.hashtags||[]).join(' ');
    try{window.SQMediaReview.open({post:p,start:start,caption:caption,hashtags:hashes.split(/\s+/).filter(Boolean),savedCaption:saved,savedHashtags:p.hashtags||[],mediaUrl:SQ.mediaUrl,save:reviewSave,approve:reviewApprove,onClose:function(d,dirty){
      if(dirty){select(id);state.captionText=d.caption;state.hashText=d.hashtags;state.captionPick=null;renderDetail();}
    }});}catch(e){toast(e.message);}
  }
`);
fs.writeFileSync(target,s);
const test=path.join(root,'scripts/test-social-queue.mjs');fs.writeFileSync(test,fs.readFileSync(test,'utf8').replace(/1\.3\.0/g,'1.4.0'));
console.log('Applied media-first review to existing queue v1.4.0. No cloud actions.');
