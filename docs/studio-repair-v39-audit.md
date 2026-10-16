# Studio v39 repair audit

Checked October 15, 2026. Status: preview only, not production-ready.

## Existing source and live state

- Repository: wolfsgarage-hub/Wolfs-admin.
- Main remains e4660bb529ad594831970bc5bd9a43cf4f1d0f4a (v38), independently re-read after preview work.
- Base index.html Git blob: 247a17e90c11f3305c509abcbab5e6db202a05c0.
- Base SHA-256: 2702a86a2ae657d6a289eea6b9d3ddc07ebe5ddd76f4eb4329ea5df829af7449.
- Base index.html: 222749 bytes, 3988 lines. GitHub Pages and the existing raw.githack main URL returned HTTP 200 with the same byte length.
- The legacy standalone post generator redirects to the existing admin. Studio is its inline module, not a separate new app.

## Confirmed live blocker

A non-posting diagnostic request to the existing anthropic-proxy function returned HTTP 403. The request used Origin https://wolfsgarage-hub.github.io. A second request with the same Origin plus Referer https://wolfsgarage-hub.github.io/ also returned 403. Neither request carried a saved WG proxy token. The exact response was:

    Forbidden: request must come from an allowed site, or carry a valid x-wg-token.

OPTIONS returned 204. This verifies an access failure, not its server-side cause. The live function's code and logs have not been inspected. Do not conclude that the API key, model, or billing is broken from this evidence. Do not disable authentication or broaden the origin policy as a workaround.

## Source defects and preview repairs

- API requests had no timeout. Preview adds a 60-second abort and a single in-flight request guard, without automatic paid retries.
- Generate cleared the previous package first. Preview keeps it until a valid replacement is ready.
- Truncated, empty and malformed output was poorly handled. Preview checks it and validates the caption, beat array, chosen scene count and five unique hashtag suggestions.
- The UI claimed no key was needed without checking. Preview labels connection state untested until a diagnostic reply is verified; reads existing WG token aliases and refuses provider API keys.
- Draft storage errors were swallowed before a success notice. Preview checks storage writes, preserves corrupt existing data, reports failures, and deduplicates identical packages.
- Preview adds combined caption-plus-tags copy and confirmation before draft deletion.
- Hardcoded June 13 booth references and the incorrect handle were removed from the transformed source. Correct handle: @_wolfsgarage. Editorial guidance is no longer presented as live trend research. Legacy individual format claims still need editorial review.
- Media selection is capped at 10 files and 100 MB per input file. Media decoding remains parallel and needs further performance testing; this is not a full media pipeline optimization.
- The root social writer referenced a variable outside its scope and targeted retired data/post-queue.json. Preview fails closed instead of reviving that writer. It does not implement the current Supabase queue RPC contract.

## Tests actually run

Node VM and linkedom@0.18.12, using the committed transformation and original base HTML, with mocked generation and isolated storage. No real model generation, Firebase sign-in or publishing was executed by the regression suite.

16 passed, 0 failed:

1. All three inline scripts parse.
2. Source drift stops the repair.
3. Stale booth date and incorrect handle are removed.
4. Provider API keys are not accepted and existing shared WG tokens are reused.
5. HTTP 403 preserves previous output, restores the button and makes one request.
6. HTTP 429 and 503 produce explicit errors without retry.
7. Timeout aborts at 60 seconds and releases the lock (simulated timer).
8. Concurrent generation is blocked.
9. Truncated and empty replies fail safely.
10. Malformed generation retains existing output.
11. A valid mocked package renders; combined copy contains real newline separators.
12. Storage failure never reports a draft saved.
13. Corrupt stored drafts remain unchanged.
14. Duplicate save creates one draft.
15. Initial connection state does not claim success.
16. Preview does not invoke the retired queue writer.

The HTTPS preview URL returned HTTP 200. Its loader was also executed in a DOM simulation: reviewed source hash verified, eight goal chips rendered, a sample package rendered, and the sole loader fetch was the source HTML. This is not a real Chrome rendering test.

## Preview

https://raw.githack.com/wolfsgarage-hub/Wolfs-admin/b07d2d9159948c2c8ef7415a92fad6a385030b30/preview-studio-v39.html

The preview extracts only the existing Studio panel, styles and repaired module. It does not execute the main admin scripts or bypass a real account login. All generation replies are visibly labeled fixtures. Its storage is an isolated in-memory map. It does not read saved credentials, publish, call live generation, or write cloud records. Preview drafts disappear on reload or close. It verifies the exact base SHA-256 and refuses unknown source.

## Release gate

1. Connect Supabase and inspect the existing anthropic-proxy source and logs. Resolve the legitimate admin authorization path without weakening security. Verify a real diagnostic reply, then one real text package and one photo package.
2. Inspect the current social_post_upsert contract and authorization; connect the draft flow without approving or publishing. Verify an explicitly labeled pending draft and its media before any live release.
3. Inspect preview layout and controls in actual laptop Chrome and Android Chrome. Photo/video decoding, clipboard permissions, quota behavior and authentication require real-device testing.
4. Turn the tested transformation into a reviewed direct source change before production. The patch script is a guarded preview/build aid, not a replacement deployment architecture.
5. Keep public-site/admin parity: no public-site behavior changes are included in this preview. Any later public feature must get matching administration controls.
6. Do not merge/release while the live service is unverified. No production index, domain, DNS, social automation setting, customer data or existing draft was changed during this audit.
