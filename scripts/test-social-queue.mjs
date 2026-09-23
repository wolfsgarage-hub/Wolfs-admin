// Pure-logic tests for social-queue.html. Run: node --test scripts/test-social-queue.mjs
// The page keeps its DOM-free logic in <script id="sq-logic"> on window.SQ; this file
// extracts that block with a regex and evaluates it against a bare `window` object.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(here, '..', 'social-queue.html');
const html = readFileSync(htmlPath, 'utf8');
const m = html.match(/<script id="sq-logic">([\s\S]*?)<\/script>/);
if (!m) throw new Error('social-queue.html: <script id="sq-logic"> block not found');
const win = {};
new Function('window', m[1])(win);
const SQ = win.SQ;

const P = (id, status, line_order, pinned_date) => ({ id, status, line_order, pinned_date: pinned_date || null });

test('SQ exists with VERSION 1.0 (SQ_VERSION on window, mirrored on SQ)', () => {
  assert.ok(SQ, 'window.SQ missing');
  assert.equal(win.SQ_VERSION, '1.0');
  assert.equal(SQ.VERSION, win.SQ_VERSION);
  assert.equal(SQ.BUCKET_URL, 'https://pcqoivjzcokgdtlvoona.supabase.co/storage/v1/object/public/social-media/');
  assert.deepEqual(SQ.WEEKDAYS, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  assert.deepEqual(SQ.WEEKDAY_NAMES, ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
});

test('pacificToday formats a Date as YYYY-MM-DD in America/Los_Angeles', () => {
  // 2026-09-23T05:30:00Z is 2026-09-22 22:30 PDT
  assert.equal(SQ.pacificToday(new Date('2026-09-23T05:30:00Z')), '2026-09-22');
  assert.equal(SQ.pacificToday(new Date('2026-09-23T07:30:00Z')), '2026-09-23');
});

test('orderLine drops killed/published, sorts by line_order, pins for today first', () => {
  const posts = [
    P('c', 'pending', 30), P('a', 'approved', 10), P('k', 'killed', 5),
    P('pub', 'published', 1), P('b', 'pending', 20, '2026-09-22'),
  ];
  const r = SQ.orderLine(posts, '2026-09-22');
  assert.deepEqual(r.line.map(p => p.id), ['b', 'a', 'c']);
  assert.deepEqual(r.stale_pins, []);
});

test('orderLine reports stale pins and does not jump them', () => {
  const posts = [P('a', 'approved', 10), P('old', 'pending', 20, '2026-09-20'), P('fut', 'pending', 5, '2026-09-30')];
  const r = SQ.orderLine(posts, '2026-09-22');
  assert.deepEqual(r.line.map(p => p.id), ['fut', 'a', 'old']);
  assert.deepEqual(r.stale_pins, ['old']);
});

test('orderLine tie-breaks equal line_order by id and copes with numeric strings', () => {
  const r = SQ.orderLine([P('z', 'pending', '10'), P('m', 'pending', '10'), P('a', 'pending', '9.5')], '2026-09-22');
  assert.deepEqual(r.line.map(p => p.id), ['a', 'm', 'z']);
});

test('reorderTarget returns the p_after_id for social_post_reorder', () => {
  const ids = ['a', 'b', 'c', 'd'];
  assert.equal(SQ.reorderTarget(ids, 'd', 'a'), null);     // drop before the first = front
  assert.equal(SQ.reorderTarget(ids, 'a', 'c'), 'b');      // a goes between b and c
  assert.equal(SQ.reorderTarget(ids, 'a', null), 'd');     // drop at the end
  assert.equal(SQ.reorderTarget(ids, 'b', 'b'), 'a');      // dropped on itself = no move, after its own predecessor
  assert.equal(SQ.reorderTarget(['a'], 'a', null), null);  // single card
});

test('esc escapes the five HTML characters', () => {
  assert.equal(SQ.esc(`<a href="x">it's & done</a>`), '&lt;a href=&quot;x&quot;&gt;it&#39;s &amp; done&lt;/a&gt;');
  assert.equal(SQ.esc(null), '');
});

test('fmtTime renders Pacific wall clock as 12h', () => {
  assert.equal(SQ.fmtTime('17:15:00'), '5:15 PM');
  assert.equal(SQ.fmtTime('09:05'), '9:05 AM');
  assert.equal(SQ.fmtTime('00:30'), '12:30 AM');
  assert.equal(SQ.fmtTime('12:00'), '12:00 PM');
  assert.equal(SQ.fmtTime(''), '?');
});

test('slotWhy explains the evidence in plain words', () => {
  const row = { weekday: 1, slot_time: '17:15:00', computed_at: '2026-09-27T16:07:00+00:00',
    evidence: { online_peak_hour: 17, tie_break: 'reach', previous: '17:45', shift_min: 30 } };
  const s = SQ.slotWhy(row);
  assert.match(s, /peak at 5:00 PM on Mondays/);
  assert.match(s, /Tie within 5% broken by our own reach/);
  assert.match(s, /Was 5:45 PM, moved 30 min/);
  assert.match(s, /Computed 2026-09-27/);
  assert.equal(SQ.slotWhy(null), 'No plan yet.');
  assert.equal(SQ.slotWhy({ weekday: 0, slot_time: '18:15', evidence: {} }), 'No evidence stored.');
});

test('daysOfApproved / reviewCount / lineBanner', () => {
  const line = [{ status: 'approved' }, { status: 'pending' }, { status: 'approved' }];
  assert.equal(SQ.daysOfApproved(line), 2);
  assert.deepEqual(SQ.reviewCount(line), { approved: 2, pending: 1, total: 3 });
  assert.equal(SQ.lineBanner(3), '');
  assert.equal(SQ.lineBanner(7), '');
  assert.match(SQ.lineBanner(2), /^2 approved days left/);
  assert.match(SQ.lineBanner(1), /^1 approved day left/);
  assert.match(SQ.lineBanner(0), /^NOTHING APPROVED/);
});

test('ago and lastTick', () => {
  const now = new Date('2026-09-22T23:00:00Z');
  assert.equal(SQ.ago('2026-09-22T22:59:40Z', now), 'just now');
  assert.equal(SQ.ago('2026-09-22T22:45:00Z', now), '15 min ago');
  assert.equal(SQ.ago('2026-09-22T20:00:00Z', now), '3 h ago');
  assert.equal(SQ.ago('2026-09-20T20:00:00Z', now), '2 d ago');
  assert.equal(SQ.ago(null, now), 'never');
  const runs = [
    { at: '2026-09-22T22:30:00Z', action: 'publish', outcome: 'dry_due' },
    { at: '2026-09-22T22:45:00Z', action: 'due', outcome: 'not_due' },
    { at: '2026-09-22T22:15:00Z', action: 'due', outcome: 'not_due' },
  ];
  assert.equal(SQ.lastTick(runs, now), 'cloud tick 15 min ago · not_due');
  assert.equal(SQ.lastTick([], now), 'no cloud tick yet');
});

test('mediaUrl / pathFromUrl', () => {
  assert.equal(SQ.mediaUrl('posts/sp-20260923-01/slide-1.jpg'), SQ.BUCKET_URL + 'posts/sp-20260923-01/slide-1.jpg');
  assert.equal(SQ.mediaUrl('/posts/x.jpg'), SQ.BUCKET_URL + 'posts/x.jpg');
  assert.equal(SQ.mediaUrl('renders/posts/wgpost-20260922-07/slide-1.jpg'), 'renders/posts/wgpost-20260922-07/slide-1.jpg');
  assert.equal(SQ.mediaUrl('https://example.com/a.jpg'), 'https://example.com/a.jpg');
  assert.equal(SQ.pathFromUrl(SQ.BUCKET_URL + 'posts/x/slide-2-manual.jpg'), 'posts/x/slide-2-manual.jpg');
  assert.equal(SQ.pathFromUrl('posts/x.jpg'), 'posts/x.jpg');
});

test('kindLabel and KILL_REASONS', () => {
  assert.equal(SQ.kindLabel('car'), 'CAR');
  assert.equal(SQ.kindLabel('weekend_shows'), 'WEEKEND SHOWS');
  assert.equal(SQ.kindLabel('weekend_story'), 'WEEKEND STORY');
  assert.equal(SQ.kindLabel('reel'), 'REEL');
  assert.equal(SQ.kindLabel(undefined), '?');
  assert.deepEqual(SQ.KILL_REASONS, ['wrong photo', 'caption', 'not this week', 'dupe', 'other']);
});

test('captionChoice: unchanged radio = machine, edits or typing = john, empty = null', () => {
  const opts = [{ register: 'hit', text: 'A. ' }, { register: 'question', text: 'B?' }, { register: 'shoutout', text: 'C!' }];
  assert.deepEqual(SQ.captionChoice(opts, 0, 'A.'), { text: 'A.', author: 'machine', register: 'hit' });
  assert.deepEqual(SQ.captionChoice(opts, 1, '  B?  '), { text: 'B?', author: 'machine', register: 'question' });
  assert.deepEqual(SQ.captionChoice(opts, 1, 'B? really'), { text: 'B? really', author: 'john', register: null });
  assert.deepEqual(SQ.captionChoice(opts, null, 'my own words'), { text: 'my own words', author: 'john', register: null });
  assert.equal(SQ.captionChoice(opts, null, '   '), null);
  assert.equal(SQ.captionChoice(opts, 2, ''), null);
  assert.deepEqual(SQ.captionChoice([], null, 'x'), { text: 'x', author: 'john', register: null });
});

test('parseHashtags: 0-5 real tags, dedupe, lowercase, reject junk', () => {
  assert.deepEqual(SQ.parseHashtags(''), { tags: [], errors: [], ok: true });
  assert.deepEqual(SQ.parseHashtags('#WolfsGarage pnwcars, #PNWcars #hotrod'), { tags: ['#wolfsgarage', '#pnwcars', '#hotrod'], errors: [], ok: true });
  const six = SQ.parseHashtags('#a #b #c #d #e #f');
  assert.equal(six.ok, false); assert.equal(six.tags.length, 6); assert.match(six.errors[0], /max 5/);
  const junk = SQ.parseHashtags('#good #bad-tag #also.bad');
  assert.equal(junk.ok, false); assert.deepEqual(junk.tags, ['#good']); assert.equal(junk.errors.length, 2);
});

test('fullCaption joins caption and hashtags', () => {
  assert.equal(SQ.fullCaption({ caption_final: 'Hey.', hashtags: ['#a', '#b'] }), 'Hey.\n\n#a #b');
  assert.equal(SQ.fullCaption({ caption_final: ' Hey. ', hashtags: [] }), 'Hey.');
  assert.equal(SQ.fullCaption({ caption_final: null, hashtags: null }), '');
});

test('voiceCheck: em dash, en dash, shop, John are refused; clean text passes', () => {
  assert.equal(SQ.voiceCheck('That roofline has not been touched since the factory.'), null);
  assert.equal(SQ.voiceCheck(''), null);
  assert.match(SQ.voiceCheck('Clean car — nice work'), /em dash/);
  assert.match(SQ.voiceCheck('Clean car – nice work'), /dash/);
  assert.match(SQ.voiceCheck('Bring it by the shop.'), /shop/);
  assert.equal(SQ.voiceCheck('Workshop Saturday. Shopping list is short.'), null);   // whole word only
  assert.match(SQ.voiceCheck('John will be there.'), /John/);
  assert.equal(SQ.voiceCheck('Johnson County cruise.'), null);                       // whole word only
});

test('handleWarnings flags club names not on the handle list', () => {
  const handles = [{ name: 'Portland Roadsters', aliases: ['PDX Roadsters'] }, { name: 'Rose City Rods', aliases: [] }];
  assert.deepEqual(SQ.handleWarnings({ club: ['Rose City Rods', 'Unknown Cruisers'] }, handles), ['Unknown Cruisers']);
  assert.deepEqual(SQ.handleWarnings({ club: 'pdx roadsters ' }, handles), []);
  assert.deepEqual(SQ.handleWarnings({ club: [] }, handles), []);
  assert.deepEqual(SQ.handleWarnings({}, handles), []);
  assert.deepEqual(SQ.handleWarnings({ club: 'Anyone' }, []), ['Anyone']);
});

test('tagsAfterHandle adds user tags, collab only when collab_ok, location for venues, remove', () => {
  const t0 = { user_tags: [], collaborators: [], location_id: '', handles_used: [] };
  const club = { id: 1, name: 'Portland Roadsters', ig_handle: 'portlandroadsters', kind: 'club', collab_ok: true, location_id: '' };
  const club2 = { id: 2, name: 'Rose City Rods', ig_handle: 'rosecityrods', kind: 'club', collab_ok: false, location_id: '' };
  const venue = { id: 3, name: 'Beaverton Round', ig_handle: '', kind: 'venue', collab_ok: false, location_id: '123' };
  const t1 = SQ.tagsAfterHandle(t0, club, 'user');
  assert.deepEqual(t1, { user_tags: [{ username: 'portlandroadsters', x: 0.5, y: 0.5 }], collaborators: [], location_id: '', handles_used: [1] });
  assert.deepEqual(SQ.tagsAfterHandle(t1, club, 'user'), t1);                       // dedupe
  const t2 = SQ.tagsAfterHandle(t1, club, 'collab');
  assert.deepEqual(t2.collaborators, ['portlandroadsters']);
  const t3 = SQ.tagsAfterHandle(t2, club2, 'collab');                                // not collab_ok -> user tag
  assert.deepEqual(t3.collaborators, ['portlandroadsters']);
  assert.deepEqual(t3.user_tags.map(u => u.username), ['portlandroadsters', 'rosecityrods']);
  const t4 = SQ.tagsAfterHandle(t3, venue, 'user');
  assert.equal(t4.location_id, '123'); assert.equal(t4.user_tags.length, 2); assert.deepEqual(t4.handles_used, [1, 2, 3]);
  const t5 = SQ.tagsAfterHandle(t4, club, 'remove');
  assert.deepEqual(t5.user_tags.map(u => u.username), ['rosecityrods']); assert.deepEqual(t5.collaborators, []); assert.deepEqual(t5.handles_used, [2, 3]);
  assert.deepEqual(t0, { user_tags: [], collaborators: [], location_id: '', handles_used: [] }); // never mutated
});

test('storyRestore and mediaWithSlide', () => {
  assert.deepEqual(SQ.storyRestore({ id: 'sp-1' }, {}), { path: 'posts/sp-1/story.jpg', w: 1080, h: 1920 });
  assert.deepEqual(SQ.storyRestore({ id: 'sp-1' }, { 'sp-1': { path: 'x.jpg', w: 1080, h: 1920 } }), { path: 'x.jpg', w: 1080, h: 1920 });
  const media = [{ path: 'a.jpg', edit_tier: 'darkroom' }, { path: 'b.jpg', edit_tier: 'cleanup' }];
  const out = SQ.mediaWithSlide(media, 1, 'posts/sp-1/slide-2-manual.jpg');
  assert.deepEqual(out[1], { path: 'posts/sp-1/slide-2-manual.jpg', edit_tier: 'epic', manual: true });
  assert.deepEqual(out[0], media[0]); assert.equal(media[1].path, 'b.jpg');
});

test('handleFromRow validates and normalises a handle row', () => {
  assert.deepEqual(SQ.HANDLE_KINDS, ['club', 'show', 'venue', 'shop', 'person']);
  const ok = SQ.handleFromRow({ id: '', name: ' Rose City Rods ', ig_handle: '@RoseCityRods', kind: 'club', location_id: '', collab_ok: 'true', aliases: 'RCR, rose city ', notes: '' });
  assert.deepEqual(ok, { ok: true, handle: { id: null, name: 'Rose City Rods', ig_handle: 'RoseCityRods', kind: 'club', location_id: '', collab_ok: true, aliases: ['RCR', 'rose city'], notes: '' } });
  assert.equal(SQ.handleFromRow({ id: '7', name: 'X', ig_handle: '', kind: 'venue', location_id: '99', collab_ok: false, aliases: '', notes: 'n' }).handle.id, 7);
  assert.match(SQ.handleFromRow({ name: '', ig_handle: 'x', kind: 'club' }).error, /name/);
  assert.match(SQ.handleFromRow({ name: 'X', ig_handle: 'x', kind: 'band' }).error, /kind/);
  assert.match(SQ.handleFromRow({ name: 'X', ig_handle: '', kind: 'club', location_id: '' }).error, /handle or a location/);
});

test('commentsToShow keeps new/drafted, newest first, flags likely owners', () => {
  const rows = [
    { ig_comment_id: '1', status: 'sent', text: 'nice', commented_at: '2026-09-22T10:00:00Z' },
    { ig_comment_id: '2', status: 'new', text: 'where was this', commented_at: '2026-09-22T09:00:00Z' },
    { ig_comment_id: '3', status: 'drafted', text: 'That is my coupe! thanks', commented_at: '2026-09-22T11:00:00Z' },
    { ig_comment_id: '4', status: 'skipped', text: 'x', commented_at: '2026-09-22T12:00:00Z' },
    { ig_comment_id: '5', status: 'new', text: 'this is our build from last year', commented_at: '2026-09-21T11:00:00Z' },
  ];
  const out = SQ.commentsToShow(rows);
  assert.deepEqual(out.map(r => r.ig_comment_id), ['3', '2', '5']);
  assert.deepEqual(out.map(r => !!r.owner_flag), [true, false, true]);
  assert.equal(rows[2].owner_flag, undefined);
});

test('runRow flattens a runs row for the table', () => {
  const now = new Date('2026-09-22T23:00:00Z');
  const r = SQ.runRow({ id: 1, at: '2026-09-22T22:45:03+00:00', action: 'due', outcome: 'not_due', post_id: null, detail: { reason: 'outside slot window' } }, now);
  assert.deepEqual(r, { when: '15 min ago', action: 'due', outcome: 'not_due', post: '', detail: '{"reason":"outside slot window"}', bad: false });
  assert.equal(SQ.runRow({ at: null, action: 'publish', outcome: 'failed: token', post_id: 'sp-1', detail: null }, now).bad, true);
  assert.equal(SQ.runRow({ at: null, action: 'publish', outcome: 'failed: token', post_id: 'sp-1', detail: null }, now).detail, '');
});

test('armPlan: off -> arm with typed GO, on -> disarm with a plain confirm', () => {
  const a = SQ.armPlan('off');
  assert.equal(a.next, 'on'); assert.equal(a.label, 'ARM LIVE'); assert.equal(a.mustType, 'GO');
  assert.match(a.confirm, /post to Instagram for real/);
  assert.match(a.confirm, /Type GO/);
  const d = SQ.armPlan('on');
  assert.equal(d.next, 'off'); assert.equal(d.label, 'DISARM'); assert.equal(d.mustType, null);
  assert.match(d.confirm, /dry runs/);
  assert.deepEqual(SQ.armPlan(undefined), SQ.armPlan('off'));
  assert.deepEqual(SQ.armPlan('ON'), SQ.armPlan('on'));
  assert.deepEqual(SQ.armPlan('banana'), SQ.armPlan('off'));
});
