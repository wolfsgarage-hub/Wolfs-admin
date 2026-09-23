# Wolfs-admin

## social-queue.html (IG rewrite, 2026-09-22)

John's approval page for the ordered line of Instagram drafts. Reads and writes Supabase
`public.social_*` RPCs with the events admin key (localStorage `wgEvAdminKey`, same as
events-queue.html); edge-function actions (upload, epic_request, comment_reply) use the proxy
write token (localStorage `wgProxyToken`). Open with `?demo=1` to load
`data/social-queue-demo.json` read-only.

- Tests: `node --test scripts/test-social-queue.mjs` (pure logic on `window.SQ`).
- HR-007: `node scripts/check-inline.mjs social-queue.html` before every commit.
- Version: `var SQ_VERSION = '1.0'` at the top of `<script id="sq-logic">` (exposed as `window.SQ_VERSION`,
  mirrored as `SQ.VERSION`, printed by the console line). `<meta name="wg-version" content="1.0">` and
  `<title>WG Social Queue v1.0</title>` carry the same string. Bump all three places (script, meta, title).
- Live publishing: the `ARM LIVE` / `DISARM` button in the header strip is the only thing that flips
  `social.settings.live_publishing` (RPC `social_setting_set`). Arming asks John to type GO.
