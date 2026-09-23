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
