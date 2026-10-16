# Studio v39 repair audit

Checked October 15, 2026; authorization follow-up October 16, 2026. Status: preview only, not production-ready.

## October 16 follow-up: v39-preview.2

The first demonstrated mismatch was the diagnostic origin. The repository manual identifies `https://raw.githack.com` as the admin host. The October 15 request instead supplied `https://wolfsgarage-hub.github.io` and no WG token. Both origins complete preflight, but their POST authorization behavior differs:

| Origin / request | Token | HTTP | Result |
|---|---|---|---|
| GitHub Pages OPTIONS | None | 204 | Preflight allowed; not authorization proof |
| GitHub Pages POST `{}` | None | 403 | Explicit origin-or-token policy denial |
| raw.githack OPTIONS | None | 204 | Preflight allowed |
| raw.githack POST `{}` | None | 400 | Reached non-empty-messages validation |
| raw.githack minimal model diagnostic | None | 200 | Exact `WG_DIAGNOSTIC_OK` reply, `claude-sonnet-4-6`, stop reason `end_turn` |

The same body and headers except Origin produce 403 versus body-validation 400. This establishes an application access-policy rejection for the tested GitHub Pages origin, not a generic CORS transport failure or evidence that all generation is broken. Current behavior is consistent with a deliberately permitted raw.githack origin and a token requirement on other origins. Whether GitHub Pages *should* be allowed, and whether an existing valid WG token succeeds there, remain unverified. Do not add GitHub Pages, wildcard origins, new credentials, or authentication exceptions based on this result.

These were command-line requests with explicit Origin headers, not browser-authenticated requests. An Origin header is not proof of user identity. The successful small reply demonstrates service availability through the existing origin policy, not verification of the token path or an endorsement of that policy's security. Deployed function source, environment configuration and logs are still needed to confirm the server's intended contract. Neither this admin repository nor the inspected public-site main tree contains the deployed anthropic-proxy source.

Correlation IDs for the initial comparison (no credential values recorded):

- GitHub Pages OPTIONS: `01a1457b-3441-7dce-baf8-9874c3e905fc`
- GitHub Pages POST denial: `01a1457b-436a-7960-ab62-bfe5578df307`
- raw.githack OPTIONS: `01a1457b-5038-7257-a252-a261db3ee94b`
- raw.githack POST body validation: `01a1457b-5b8b-7f1a-bc94-a396c55a493d`
- Minimal live generation: `01a1457b-d96d-72db-b1cd-0f6bfeab50bb`

### Safe correction on the existing repair branch

- Remove the remaining static claim that the WG token is needed only for local files, including its misleading placeholder and source comment.
- Explain that saved tokens are browser/origin-specific. Keep the existing `wgpost:key`, `wgProxyToken`, and `wg:proxytok` keys and priority, and keep refusing provider API keys.
- Leave the Studio override blank when using a shared token. Testing no longer silently copies a shared queue token into a higher-priority Studio override, where it could become stale after queue-token rotation.
- Require explicit Save for edited token fields. Verify saving and clearing; clearing the Studio override leaves shared tokens untouched.
- On 401/403 report current origin and whether a WG token was sent, without printing the value or claiming to know why the server denied it. Show a validated request ID only when the response exposes it; browsers may not expose `sb-request-id` through CORS.
- Label the fixture-only preview connection test as a sample test, including its success message. It cannot establish live authentication.
- Add `scripts/diagnose-studio-access.py`: default probes use empty messages and cannot generate a valid model request; `--generate` explicitly requests one small diagnostic. `--with-token` reads only the explicitly supplied `WG_PROXY_TOKEN` environment variable. It never prints credentials or raw service bodies and does not retry.

### Follow-up validation and limits

- Original 16 regressions reproduced before editing. Updated suite: **24 passed, 0 failed** using Node VM/linkedom@0.18.12 and isolated storage. Added checks cover setup wording, both token aliases, no silent credential migration, unsaved-field handling, clearing only the override, error redaction, correlation-ID filtering, and provider-key omission.
- The committed diagnostic script reproduced the same 204/403/204/400 matrix without any token or generation request.
- Only the small live diagnostic is verified. The broader draft/photo test was blocked by automatic approval review because it would disclose a local repository image and draft prompts to the Supabase/AI endpoint without explicit approval for those inputs. It was not retried. Do not count full text/photo packages as verified.
- Supabase connector was discoverable but not connected. The user's connected computer was offline. No saved credentials were accessed.
- Actual cloud Chrome checks passed on code commit `72801d5bd1bd493011334c7de1567874644be090`: source hash guard/load, visible v39-preview.2 controls, sample package rendering, duplicate save retaining exactly one in-memory draft, clipboard containing the caption plus two newlines plus tags, simulated 403 retaining prior package and draft while re-enabling Generate, sample test explicitly reporting "Live generation was not tested", and reload clearing preview-only drafts. The desktop viewport was visually inspected. These checks do not represent the user's laptop or Android device.
- Laptop Chrome, Android Chrome, authenticated sessions, real persisted browser drafts, media decoding and the current cloud queue contract remain release gates.
- `index.html` remains byte-for-byte v38 with SHA-256 `2702a86a2ae657d6a289eea6b9d3ddc07ebe5ddd76f4eb4329ea5df829af7449`. No production, public-site, cloud queue, DNS or server configuration changes are included. Public-site/admin parity is preserved because this changes no public feature.

Reproduce offline tests with linkedom@0.18.12 installed: `node tests/studio-repair-v39.test.cjs`. Run non-generating access checks: `python3 scripts/diagnose-studio-access.py`. Keep credentials out of command arguments, commits and chat.

Verified isolated preview: https://raw.githack.com/wolfsgarage-hub/Wolfs-admin/72801d5bd1bd493011334c7de1567874644be090/preview-studio-v39.html?v=39-preview.2

## Existing source and live state

- Repository: wolfsgarage-hub/Wolfs-admin.
- Main remains e4660bb529ad594831970bc5bd9a43cf4f1d0f4a (v38), independently re-read after preview work.
- Base index.html Git blob: 247a17e90c11f3305c509abcbab5e6db202a05c0.
- Base SHA-256: 2702a86a2ae657d6a289eea6b9d3ddc07ebe5ddd76f4eb4329ea5df829af7449.
- Base index.html: 222749 bytes, 3988 lines. GitHub Pages and the existing raw.githack main URL returned HTTP 200 with the same byte length.
- The legacy standalone post generator redirects to the existing admin. Studio is its inline module, not a separate new app.

## October 15 diagnostic (scope clarified above)

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
