/* WG Social Queue media review v1.4.0. No approval on open, load or navigation. */
(function (root) {
  'use strict';
  var active = null;
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function stable(x) { if (Array.isArray(x)) return '['+x.map(stable).join(',')+']'; if(x && typeof x==='object')return '{'+Object.keys(x).sort().map(function(k){return JSON.stringify(k)+':'+stable(x[k]);}).join(',')+'}'; return JSON.stringify(x); }
  function signature(p) { var o={}; ['id','status','caption_final','caption_author','caption_options','hashtags','media','story_media','tags','facts','pinned_date'].forEach(function(k){o[k]=p[k]==null?null:p[k];}); return stable(o); }
  function mediaList(p) { var m=(p.media||[]).map(function(x,i){return {asset:x,label:'Photo '+(i+1)+' of '+p.media.length};}); if(p.story_media)m.push({asset:p.story_media,label:'Story attachment'}); return m; }
  function isVideo(m) { return /video/i.test(String(m.kind||m.media_type||m.type||m.content_type||'')) || /\.(mp4|mov|webm|m4v)(?:[?#]|$)/i.test(String(m.path||'')); }
  function safeUrl(path,resolve) { if(!path || typeof path!=='string')throw Error('No media file is attached.'); var u=new URL(resolve(path),location.href); if(u.protocol!=='https:' && !(u.origin===location.origin && u.protocol==='http:'))throw Error('This media address cannot be previewed safely.'); if(u.username||u.password)throw Error('Invalid media address.'); return u.href; }
  function open(opts) {
    if(active) { active.focus(); return; }
    if(!root.HTMLDialogElement || !HTMLDialogElement.prototype.showModal)throw Error('This browser cannot open the media review. Nothing was approved.');
    var post=clone(opts.post),items=mediaList(post),seen=new Set(),index=Math.max(0,Math.min(Number(opts.start)||0,items.length-1));
    var savedCaption=String(opts.savedCaption==null?opts.caption||'':opts.savedCaption),savedTags=(opts.savedHashtags||opts.hashtags||[]).join(' '),epoch=0,busy=false,loaded=false,observer=null,timer=null;
    var dialog=document.createElement('dialog');dialog.id='wg-media-review';dialog.className='mr-dialog';dialog.setAttribute('aria-labelledby','mr-title');
    dialog.innerHTML='<div class="mr-header"><div><h2 id="mr-title">REVIEW THIS POST</h2><p id="mr-post"></p></div><button type="button" id="mr-close" class="act">CLOSE</button></div>'+
      '<div class="mr-body"><section class="mr-gallery" aria-label="Actual post media"><div id="mr-stage" class="mr-stage"></div><div class="mr-media-tools"><button type="button" class="act" id="mr-prev">PREVIOUS</button><span id="mr-count"></span><button type="button" class="act" id="mr-next">NEXT</button><button type="button" class="act" id="mr-enlarge">FULL PHOTO</button></div><p id="mr-media-status" role="status"></p></section>'+
      '<section class="mr-copy" aria-label="Caption and approval"><label for="mr-caption">CAPTION</label><textarea id="mr-caption" spellcheck="true"></textarea><label for="mr-tags">HASHTAGS</label><input id="mr-tags" type="text"><div class="btns"><button type="button" class="act" id="mr-save">SAVE CAPTION</button></div><p class="hint">Saving edits this draft only. It does not approve or publish it.</p><p id="mr-message" role="status" aria-live="polite"></p><label class="mr-confirm"><input type="checkbox" id="mr-confirm"> I have reviewed the pictures and this caption.</label><button type="button" class="act primary" id="mr-approve" disabled>APPROVE THIS POST</button><p class="hint">Approval puts this post in the existing publishing line. Opening this screen does not change publishing settings.</p></section></div>';
    document.body.appendChild(dialog);active=dialog;
    function el(id){return dialog.querySelector('#'+id);}
    el('mr-post').textContent=post.id+' | '+post.status;
    el('mr-caption').value=String(opts.caption||'');el('mr-tags').value=(opts.hashtags||[]).join(' ');
    function draft(){return {caption:el('mr-caption').value.trim(),hashtags:el('mr-tags').value.trim()};}
    function dirty(){var d=draft();return d.caption!==savedCaption.trim() || d.hashtags!==savedTags.trim();}
    function note(text){el('mr-message').textContent=text;}
    function controls(){
      var pending=post.status==='pending',all=items.length>0&&seen.size===items.length&&loaded;
      el('mr-prev').disabled=busy||index<=0;el('mr-next').disabled=busy||index>=items.length-1;
      el('mr-save').disabled=busy||!pending||!dirty();el('mr-caption').readOnly=busy||!pending;el('mr-tags').readOnly=busy||!pending;
      el('mr-confirm').disabled=busy||!pending||!all||dirty();
      el('mr-approve').disabled=busy||!pending||!all||dirty()||!el('mr-confirm').checked||!draft().caption;
      el('mr-close').disabled=busy;el('mr-enlarge').disabled=busy||!items.length;
      el('mr-count').textContent=items.length?(index+1)+' / '+items.length:'0 / 0';
      if(!pending)note('This post is '+post.status+'. Review only; no approval or edits from this screen.');
    }
    function unconfirm(){el('mr-confirm').checked=false;controls();}
    function cleanup(){epoch++;clearTimeout(timer);if(observer)observer.disconnect();var v=el('mr-stage').querySelector('video');if(v){v.pause();v.removeAttribute('src');v.load();}}
    function draw(){
      cleanup();var n=epoch;loaded=false;unconfirm();var stage=el('mr-stage');stage.replaceChildren();
      if(!items.length){stage.textContent='No pictures attached. Approval is blocked.';el('mr-media-status').textContent='Attach actual media before approval.';controls();return;}
      var item=items[index],asset=item.asset||{},video=isVideo(asset),media=document.createElement(video?'video':'img');
      function fail(){if(n!==epoch)return;clearTimeout(timer);loaded=false;seen.delete(index);unconfirm();stage.replaceChildren();var p=document.createElement('p');p.textContent='This '+(video?'video':'picture')+' did not load. Approval is blocked.';var retry=document.createElement('button');retry.type='button';retry.className='act';retry.textContent='RETRY MEDIA';retry.onclick=draw;stage.append(p,retry);el('mr-media-status').textContent=item.label+' | NOT LOADED';}
      function mark(){if(n!==epoch||!dialog.open||document.visibilityState!=='visible')return;var rect=media.getBoundingClientRect(),visible=Math.max(0,Math.min(innerHeight,rect.bottom)-Math.max(0,rect.top));if(!rect.height||visible<rect.height*.5)return;if(video){if(media.readyState<2||!media.videoWidth||media.paused)return;}else if(!media.complete||!media.naturalWidth||!media.naturalHeight)return;clearTimeout(timer);loaded=true;seen.add(index);el('mr-media-status').textContent=item.label+' | '+seen.size+' of '+items.length+' viewed'+(video?' | Video playing':'');controls();}
      el('mr-media-status').textContent=item.label+' | '+(video?'Play the actual video to review it.':'Loading actual picture...');
      media.addEventListener('error',fail);if(video){media.controls=true;media.playsInline=true;media.preload='metadata';media.addEventListener('playing',mark);}else{media.alt=item.label+' for '+post.id;media.addEventListener('load',function(){Promise.resolve(media.decode?media.decode():null).then(function(){requestAnimationFrame(mark);}).catch(fail);});}
      try{media.src=safeUrl(asset.path,opts.mediaUrl);}catch(e){fail();return;}
      stage.appendChild(media);if('IntersectionObserver' in root){observer=new IntersectionObserver(mark,{threshold:[0,.5,1]});observer.observe(media);}else{stage.onscroll=mark;}
      timer=setTimeout(function(){if(n===epoch&&!loaded&&!video)fail();},20000);
      controls();
    }
    function changed(){unconfirm();note(dirty()?'Unsaved caption changes. Save before approving.':'');}
    el('mr-caption').addEventListener('input',changed);el('mr-tags').addEventListener('input',changed);
    el('mr-confirm').addEventListener('change',controls);
    el('mr-prev').onclick=function(){if(index>0&&!busy){index--;draw();}};el('mr-next').onclick=function(){if(index<items.length-1&&!busy){index++;draw();}};
    el('mr-enlarge').onclick=function(){var on=dialog.classList.toggle('mr-expanded');this.textContent=on?'PHOTO + CAPTION':'FULL PHOTO';};
    el('mr-save').onclick=async function(){if(busy||post.status!=='pending'||!dirty())return;busy=true;controls();note('Saving this caption...');try{var d=draft(),updated=await opts.save(clone(post),d);post=clone(updated);savedCaption=d.caption;savedTags=d.hashtags;note('Caption saved. Review it with the pictures before approving.');}catch(e){note(e.message||'Save failed. Your edits are still here.');}finally{busy=false;unconfirm();}};
    el('mr-approve').onclick=async function(){if(this.disabled||busy||post.status!=='pending'||!items.length||seen.size!==items.length||!loaded||dirty()||!el('mr-confirm').checked)return;busy=true;controls();note('Checking the current post before approval...');try{var updated=await opts.approve(clone(post),draft());post=clone(updated);note('Approved. Publishing settings were not changed.');el('mr-post').textContent=post.id+' | '+post.status;}catch(e){note(e.message||'Approval could not be verified. Check the queue before retrying.');}finally{busy=false;unconfirm();}};
    dialog.addEventListener('cancel',function(e){if(busy)e.preventDefault();});
    dialog.addEventListener('close',function(){var d=draft();cleanup();if(opts.onClose)opts.onClose(d,dirty());dialog.remove();if(active===dialog)active=null;});
    el('mr-close').onclick=function(){if(!busy)dialog.close();};
    dialog.showModal();draw();
  }
  root.SQMediaReview={version:'1.4.0',open:open,signature:signature,mediaList:mediaList,isVideo:isVideo};
})(window);
