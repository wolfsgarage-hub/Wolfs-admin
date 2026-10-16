/* Wolf's Garage Studio v39-preview.2. Applies only to the reviewed v38 source.
 * The original index.html and all production settings remain unchanged.
 * Browser preview and Node test/build use the same transformation.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WGStudioRepair = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function between(source, start, end, replacement) {
    var a = source.indexOf(start), b = source.indexOf(end, a + start.length);
    if (a < 0 || b < a || source.indexOf(start, a + start.length) !== -1) {
      throw new Error('Source changed. Repair stopped at: ' + start);
    }
    return source.slice(0, a) + replacement + '\n\n' + source.slice(b);
  }
  function once(source, oldText, newText) {
    if (source.split(oldText).length !== 2) throw new Error('Source changed. Exact replacement refused: ' + oldText.slice(0,60));
    return source.replace(oldText, newText);
  }
  function requestCode() {
    var studioRequest = null;
    function studioStatus(message) {
      var node = $('studio-request-status');
      if (!node) {
        node = document.createElement('div'); node.id = 'studio-request-status';
        node.setAttribute('role', 'status'); node.setAttribute('aria-live', 'polite');
        node.style.cssText = 'margin:12px 0;line-height:1.5;overflow-wrap:anywhere';
        $('studio-generate').insertAdjacentElement('afterend', node);
      }
      node.textContent = message;
    }
    function errorMessage(status, hasToken) {
      if (status === 401 || status === 403) return 'Generation access blocked (HTTP ' + status + ') for ' + location.origin + '. ' + (hasToken ? 'A saved WG proxy token was sent, but access was denied.' : 'No WG proxy token was sent.') + ' Use your established admin address. Saved tokens are specific to this browser and origin. This status alone does not identify a token or server configuration fault. Do not enter a provider API key.';
      if (status === 429) return 'Generation is rate-limited. Wait, then try once. No automatic retry was sent.';
      if (status === 413) return 'The selected media is too large. Remove a few shots and try again.';
      if (status >= 500) return 'The generation service is unavailable (HTTP ' + status + '). Your previous package is still here.';
      return 'Generation failed (HTTP ' + status + '). Check the service configuration.';
    }
    async function callClaude(system, userText, images, maxTokens) {
      if (studioRequest) throw new Error('A request is already running. Wait for it to finish.');
      if ((images || []).length > 10) throw new Error('Use at most 10 shots per package.');
      var content = (images || []).map(function (im) {
        if (!im || typeof im.base64 !== 'string' || !im.base64) throw new Error('A selected shot is unreadable. Remove it and add it again.');
        return {type:'image',source:{type:'base64',media_type:im.mediaType || 'image/jpeg',data:im.base64}};
      });
      content.push({type:'text',text:userText});
      var headers = {'Content-Type':'application/json'}, token = getKey();
      if (token) headers['x-wg-token'] = token;
      var controller = new AbortController(); studioRequest = controller;
      var timeout = setTimeout(function () { controller.abort(); }, 60000);
      try {
        var response = await fetch(ANTHROPIC_PROXY, {method:'POST',headers:headers,signal:controller.signal,
          body:JSON.stringify({model:MODEL,max_tokens:maxTokens || 2600,system:system,messages:[{role:'user',content:content}]})});
        if (!response.ok) {
          // Only expose a validated correlation ID, never response bodies or credentials.
          var requestId = response.headers && response.headers.get('sb-request-id');
          var reference = typeof requestId === 'string' && /^[a-f0-9-]{36}$/i.test(requestId) ? ' Request ID: ' + requestId + '.' : '';
          throw new Error(errorMessage(response.status, !!token) + reference);
        }
        var data;
        try { data = await response.json(); } catch (e) { throw new Error('The service returned an unreadable response. Your previous package is unchanged.'); }
        if (data.error) throw new Error('The service reported an upstream error. Check the generation service logs.');
        if (data.stop_reason === 'max_tokens') throw new Error('The reply was cut short. Choose fewer scenes and try once. Your previous package is unchanged.');
        var blocks = Array.isArray(data.content) ? data.content : [];
        var text = blocks.filter(function (b) { return b && b.type === 'text' && typeof b.text === 'string'; }).map(function (b) { return b.text; }).join('\n');
        if (!text.trim()) throw new Error('The service returned no text. Your previous package is unchanged.');
        return text;
      } catch (e) {
        if (e.name === 'AbortError') throw new Error('Generation timed out after 60 seconds. No automatic retry was sent. Your notes and previous package are unchanged.');
        if (e instanceof TypeError) throw new Error('Could not reach the generation service. Check your connection and the service origin policy.');
        throw e;
      } finally { clearTimeout(timeout); studioRequest = null; }
    }
  }
  function draftCode() {
    var draftReadError = false;
    function getDrafts() {
      draftReadError = false;
      try {
        var raw = localStorage.getItem(LS_DRAFTS);
        var items = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(items) || items.some(function (d) { return !d || typeof d !== 'object' || !d.pkg; })) throw new Error('Invalid draft data');
        return items;
      } catch (e) { draftReadError = true; return []; }
    }
    function saveDrafts(items) {
      getDrafts();
      if (draftReadError) { tellUser('Existing drafts cannot be read. Nothing was overwritten.'); return false; }
      try {
        var value = JSON.stringify(items);
        localStorage.setItem(LS_DRAFTS, value);
        if (localStorage.getItem(LS_DRAFTS) !== value) throw new Error('Verification failed');
        return true;
      } catch (e) { tellUser('Draft NOT saved. Browser storage is full or unavailable. Copy the caption before closing.'); return false; }
    }
    function saveDraft(pkg) {
      var items = getDrafts();
      if (draftReadError) { tellUser('Existing drafts cannot be read. Nothing was overwritten.'); return; }
      var match = JSON.stringify(pkg);
      if (items.some(function (d) { return JSON.stringify(d.pkg) === match; })) { tellUser('This package is already in Drafts.'); return; }
      items.unshift({id:uid(),ts:Date.now(),title:(pkg.format_used || 'Post') + ' for ' + selGoal,pkg:pkg});
      if (!saveDrafts(items)) return;
      renderDrafts(); tellUser('Saved to Drafts on this device.');
    }
  }
  function setupCode() {
    function wireSetup() {
      var field = $('studio-key-field'), status = $('studio-key-status');
      function savedOverride() { var token = (getLS(LS_KEY) || '').trim(); return /^sk-/i.test(token) ? '' : token; }
      // Do not copy a shared queue token into a separate Studio override.
      field.value = savedOverride();
      function note() { status.textContent = 'Not tested. ' + (savedOverride() ? 'A Studio WG proxy token is saved.' : getKey() ? 'Using an existing shared WG proxy token on this origin. The Studio override is blank.' : 'No WG proxy token is saved on this origin. Access depends on the service policy for this address.') + ' Save any token changes, then use TEST CONNECTION to check generation. A connection test makes one small generation request.'; }
      function saveToken() {
        var token = field.value.trim();
        if (/^sk-/i.test(token)) { status.textContent = 'Do not save an Anthropic or OpenAI API key here. This field accepts only the existing WG proxy token.'; return false; }
        try {
          if (token) localStorage.setItem(LS_KEY, token);
          else localStorage.removeItem(LS_KEY);
          if ((localStorage.getItem(LS_KEY) || '') !== token) throw new Error('not saved');
          return true;
        } catch (e) { status.textContent = 'Token was not saved. Browser storage is unavailable.'; return false; }
      }
      note();
      $('studio-save-key').addEventListener('click', function () { if (saveToken()) { note(); tellUser('Studio token setting saved. Shared queue tokens were not changed.'); } });
      $('studio-test-key').textContent = 'TEST CONNECTION';
      $('studio-test-key').addEventListener('click', async function () {
        var button = this;
        if (button.disabled) return;
        if (field.value.trim() !== savedOverride()) { status.textContent = 'Save or discard the token change before testing. No request was sent.'; return; }
        button.disabled = true; status.textContent = 'Checking the generation service...';
        try {
          var text = await callClaude('Connectivity test. Reply exactly WG_DIAGNOSTIC_OK.', 'Reply WG_DIAGNOSTIC_OK.', [], 32);
          if (text.trim() !== 'WG_DIAGNOSTIC_OK') throw new Error('The service responded, but did not pass the connection check.');
          status.textContent = 'Connection verified. Generation returned the expected reply.';
        } catch (e) { status.textContent = e.message; }
        finally { button.disabled = false; }
      });
    }
  }
  function generateCode() {
    function wireGenerate() {
      $('studio-add-media').addEventListener('click', function () { $('studio-media-input').click(); });
      $('studio-media-input').addEventListener('change', function () { addFiles(this.files); this.value = ''; });
      $('studio-generate').addEventListener('click', async function () {
        var button = this;
        if (button.disabled) return;
        var topic = $('studio-topic').value.trim();
        if (!topic && !mediaItems.length) { tellUser('Add a shot or describe the post'); return; }
        if (mediaItems.length > 10) { tellUser('Use at most 10 shots per package.'); return; }
        button.disabled = true;
        var label = button.textContent; button.textContent = 'BUILDING...';
        studioStatus('Building your package. The previous result stays here until the new one is ready.');
        try {
          var text = await callClaude(buildSystem(), topic ? 'Topic: ' + topic : 'Build the post from the attached shots. Describe only what is visible.', mediaItems.map(function (m) { return {base64:m.base64,mediaType:m.mediaType}; }), selScenes === 'auto' ? 2800 : Math.min(4200,1800 + Number(selScenes) * 220));
          var pkg = parseJSON(text);
          if (!pkg || typeof pkg.caption !== 'string' || !pkg.caption.trim() || !Array.isArray(pkg.beats) || !pkg.beats.length || pkg.beats.length > 10 || pkg.beats.some(function(b){return !b || typeof b.direction !== 'string';}) || !Array.isArray(pkg.hashtags) || pkg.hashtags.length !== MAX_HASHTAGS || pkg.hashtags.some(function(t){return typeof t !== 'string' || !/^#[A-Za-z0-9_]+$/.test(t);}) || new Set(pkg.hashtags.map(function(t){return t.toLowerCase();})).size !== MAX_HASHTAGS) throw new Error('The reply is incomplete or has invalid hashtags. Your previous package is unchanged. Try again with fewer scenes.');
          if (selScenes !== 'auto' && pkg.beats.length !== Number(selScenes)) throw new Error('The reply did not match the selected scene count. Your previous package is unchanged.');
          renderPackage(pkg);
          studioStatus('Package ready. Review the facts and five hashtag suggestions before posting. Nothing was published.');
        } catch (e) { studioStatus(e.message || 'Generation failed. Your previous package is unchanged.'); }
        finally { button.disabled = false; button.textContent = label; }
      });
    }
  }
  function body(fn) { var s = fn.toString(); return s.slice(s.indexOf('{') + 1, s.lastIndexOf('}')); }
  function apply(html) {
    if (typeof html !== 'string' || !html.includes('<!-- ============== STUDIO MODULE ============== -->')) throw new Error('Not the existing Wolf\'s Garage admin.');
    html = once(html, '<span class="topbar-ver">v38</span>', '<span class="topbar-ver">v39-preview.2</span>');
    html = once(html, "No API key on this phone. Studio calls go through the Wolf's Garage proxy, which holds the key server-side. Token below is ONLY needed if you open this page as a local file.", "Studio uses the Wolf's Garage service. Provider API keys stay on the server. Access depends on the address you open and the service's WG proxy token policy. Saved tokens do not carry between different origins or browsers. Leave the override blank to reuse a shared WG token already saved here. Never paste a provider API key.");
    html = once(html, 'placeholder="proxy token (usually leave blank)"', 'aria-label="Studio WG proxy token override" placeholder="WG proxy token override (optional)"');
    html = once(html, '// now holds the OPTIONAL proxy token (file:// use only), never an API key', '// Studio WG proxy token override; origin policy is checked by the server, never an API key');
    html = once(html, '  function getKey() { return getLS(LS_KEY) || ""; }', '  function getKey() { var keys = [LS_KEY, "wgProxyToken", "wg:proxytok"]; for (var i=0;i<keys.length;i++) { var token=(getLS(keys[i]) || "").trim(); if (token && !/^sk-/i.test(token)) return token; } return ""; }');
    html = between(html, '  function callClaude(', '  function parseJSON(', body(requestCode));
    html = between(html, '  function getDrafts()', '  function renderDrafts()', body(draftCode));
    html = between(html, '  function wireSetup()', '  function wireGenerate()', body(setupCode));
    html = between(html, '  function wireGenerate()', '  var initialized = false;', body(generateCode));
    html = once(html, 'saveDrafts(getDrafts().filter(function (x) { return x.id !== id; }));', 'if (!confirm("Delete this draft from this device?")) return;\n        if (!saveDrafts(getDrafts().filter(function (x) { return x.id !== id; }))) return;');
    html = once(html, '    if (!arr.length) { host.innerHTML', '    if (draftReadError) { host.textContent = "Existing draft storage could not be read. Nothing was overwritten."; return; }\n    if (!arr.length) { host.innerHTML');
    html = once(html, '    var jobs = files.map(function (f) {', '    if (files.length + mediaItems.length > 10) { tellUser("Choose at most 10 shots per package."); return; }\n    if (files.some(function(f){return f.size > 100 * 1024 * 1024;})) { tellUser("Each file must be under 100 MB. Trim large clips first."); return; }\n    var jobs = files.map(function (f) {');
    html = once(html, 'copyText(which === "caption" ? (pkg.caption || "") : tags);', 'copyText(which === "caption" ? (pkg.caption || "") : which === "all" ? (pkg.caption || "") + "\\n\\n" + tags : tags);');
    html = once(html, '<div class="k">Caption <button', '<div class="k">Caption <button class="studio-copy" data-copy="all">Copy post + tags</button> <button');
    html = html.replace(/Or the June 13 booth\./g, 'Or an upcoming booth, with its confirmed date.').replace(/Promote June 13 booth/g, 'Promote a confirmed booth').replace(/At the June 13 booth:/g, 'At a booth with a confirmed date:').replace(/the June 13 booth, or follow/g, 'a confirmed upcoming booth, or follow').replace(/@wolfsgarage/g, '@_wolfsgarage').replace(/or the booth date 'JUNE 13' for booth-related posts/g, 'or a booth date explicitly supplied in the topic for booth-related posts').replace(/WHAT IS WORKING RIGHT NOW \(May 2026\), build on this:/g, 'EDITORIAL STARTING POINTS, not live trend research. Never invent dates, event details, hashtag research or performance statistics:').replace(/<b>The rules of the game right now:<\/b>/g, '<b>Editorial ideas, not live trend research:<\/b>');
    html = between(html, '  var PRINCIPLES = ', '\n\n  var TRENDS = ', '  var PRINCIPLES = "Use real Wolf media. Make the opening clear, build a short story, and end with one community-focused action. Verify event details and permissions. These are editorial ideas, not current algorithm research or measured performance claims. Check the five hashtag suggestions before publishing.";');
    // Preview safety: never revive the retired GitHub JSON queue or guess the new RPC writer contract.
    html = between(html, 'async function pushToApprovalQueue(entry) {', 'async function saveSocialPost(type) {', 'async function pushToApprovalQueue(entry) { return false; }');
    html = once(html, 'Queued on this phone only (sync failed)', 'Saved on this device only. Cloud queue is not connected in this preview.');
    return html;
  }
  return {version:'v39-preview.2', apply:apply};
});
