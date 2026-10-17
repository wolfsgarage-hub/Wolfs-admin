# Studio v39 repair audit

Checked October 15, 2026; authorization follow-up October 16, 2026. Status: preview only, not production-ready.

## Laptop follow-up: October 16, 23:15 Pacific (October 17 UTC)

Remote Desktop Commander is now connected. The prior laptop-access blocker is resolved. The existing `wolfs-ops` social client successfully used its saved events admin credential to read the live queue; credentials stayed on the laptop and were not printed. Supabase management/source inspection is still unavailable through a connector, but the current local migrations and contracts are now readable.

Current queue evidence: 12 pending, zero approved, zero publishing, zero published in seven days; `live_publishing=off`; daily slot 19:15 Pacific; successful recent `comments_pull` tick. `social_line_needs` returns `line_depth=10`, `in_line=12`, `needed=0`. The two-week target is therefore not configured, and pending drafts are not scheduled/approved coverage. SocialPrep is enabled; legacy MetaPublish and WeekBuilder tasks are disabled.

The first demonstrated failure in the **nightly preparation path** is separate from the Studio proxy: its generator invokes Claude Code, whose local auth status returns `loggedIn: false`. The executable itself runs. A bounded synthetic no-file/no-tool request exited 1. No photos were sent in this diagnostic.

The old preparation code catches that failure, creates a quality-zero heuristic record, saves/uploads it, and then skips that source on later nights because a record exists. October 16's run log shows 60 such failures followed by `described=60` and an overall success marker. The local ledger contains 934 records, of which 542 have zero/unknown quality. The present sign-in failure does not establish the cause of every historical record.

An isolated local branch, `repair/social-prep-20261017`, now contains a correction: sign-in preflight without generation; strict validation before durable record writes; bounded retries of failed records; preservation of private/resale classifications; exclusion of unknown-quality records from post selection; preservation of existing media on analysis failure; and independent queue-depth verification before writing a completion marker. The scheduled production checkout has not been changed. The separate `wolfs-ops` source remains on the laptop, not copied into this public admin repository.

The final focused suite passed **48 tests, zero failures**, including 13 new failure-path tests, after correcting the historical-record retry path to preserve private/resale exclusions. All three modified Python modules parse and `git diff --check` passes. An earlier broader run was stopped after exposing the now-covered retry regression; the full repository suite was not completed. The real repaired wrapper exited 9 while signed out, with `model_sign_in_required`, no completion flag, and no photo-record file. This confirms fail-closed handling, not successful generation. Local code commit: `16afcf10c07611d465b46d362f37c21156ad5978`; the development worktree is clean.

Studio access follow-up: empty-message requests with the saved **publishing proxy token** still return 403 from the GitHub Pages origin and validation 400 from raw.githack. The publishing token has not been verified as a valid Studio credential. No origin policy or authentication requirement was changed, and no additional paid proxy generation was run.

The existing Claude subscription sign-in flow was opened on the laptop; user account approval remains necessary. No credentials, login code, or consent were entered by the agent. Next work remains real generation, bounded recovery of failed records, the integrated fourteen-day queue flow, persisted drafts, and actual browser verification. Production v38, publishing settings, tasks, and public-site behavior remain unchanged; PR #4 stays draft and unmerged.

```text
LIVE VERSION: Admin v38 unchanged; social preparation repair v1 is development-only.
COMMIT: local wolfs-ops 16afcf10c07611d465b46d362f37c21156ad5978.
VERCEL DEPLOYMENT: none; no deployment performed.
BRANCH: repair/social-prep-20261017; admin audit on repair/instagram-studio-v39.
FILES CHANGED: social vision.py, cli.py, builder.py, preparation wrapper, three test files, local repair report; this admin audit.
FEATURES COMPLETED: safe preparation-failure handling and independent queue-depth completion check.
TESTS PASSED: 48 focused regressions, three Python syntax checks, diff check, real signed-out wrapper guard.
BUGS FOUND: signed-out model CLI; failed photo records counted as complete; queue target ten, not fourteen.
BUGS FIXED: false-success and failed-record handling in the isolated development branch.
WHAT WAS PRESERVED: production v38, active PC checkout, private/resale exclusions, credentials, queue posts, live switch, tasks, public-site parity.
NEEDS ANDROID TAP TESTING: real integrated generation, persisted drafts, cloud queue, clipboard and media handling.
EXACT ANDROID TEST STEPS: after integration, sign in, generate a real post, save/reload, confirm one durable draft and its queued media, retry a failed request and confirm prior output remains.
KNOWN LIMITS: user sign-in pending; two-week automation incomplete; no merge, publishing activation or production deployment.
```

## October 17: corrected product scope and automation investigation

The user clarified that Studio must be part of the existing program that makes posts and lines up two weeks of automatic Instagram publishing. The single-package fixture preview does not satisfy this requirement. Its regression repairs are supporting work, not a completed posting system.

The required end-to-end behavior is: select suitable real media from the existing library, generate grounded captions in Wolf's voice, persist complete posts in the existing social queue, fill the next 14 days using the configured posting cadence, and let the established publisher deliver them. A rolling refill must run without an open browser. Fourteen days is a coverage horizon, not an assumption of exactly fourteen posts. Preserve existing queue decisions, media provenance, brand rules, and public-site/admin parity. Do not revive the retired JSON queue or introduce a second publishing queue.

### Evidence and first missing connection

- Current `Wolfs-admin/social-queue.html` uses the existing Supabase `social_line`, `social_post_upsert`, `social_post_caption`, `social_post_decide`, `social_post_pin`, and `social_setting_set` RPCs, plus `wg-ig-publish`. The repository identifies the active publisher as `wg-social-tick`. The UI has approval, schedule, media, and explicit live-publishing controls. Its partial `social_post_upsert` call only demonstrates updating tags on an existing post; it does not establish the full insertion or generation contract.
- Studio's repaired preview intentionally blocks the retired `data/post-queue.json` writer and has no replacement cloud-queue integration. Therefore a locally generated or saved package is not a queued Instagram post.
- In `wolfsgarage-growth-engine`, inspected `rebuild/growth-engine-core` commit `26ac8a73b15633da8741b9bf86bbfcdd5b071958`, `api/schedule-approved-post.js` returns a not-connected/manual-reminder response even when Instagram environment variables exist. It does not schedule a post. `api/generate-calendar.js` produces a seven-day calendar rather than a media-grounded 14-day queue. These are source findings, not verification of the currently deployed Growth Engine.
- The October 16 handoff document, **OpenAI Takeover Handoff: Wolf's Garage, GGG, Hustle & Flow**, reports direct inspection of the deployed `social` schema and functions that day: 934 photo records, 62 voice samples, 12 pending posts, a successful 15-minute publisher tick, and `live_publishing = off`. It also reports a PC preparation component in `wolfs-ops` (`python -m social`, 1:17 AM) from function comments. These are dated handoff findings; this session has not independently read the live database or PC preparation code.
- That handoff reports inspection of `anthropic-proxy` v4: permitted brand, raw.githack, and Vercel origins, or a matching `x-wg-token`. GitHub Pages is absent from the described allowlist. This independently reported contract is consistent with the observed Pages 403 / raw.githack 400 and 200 comparison above. The diagnostic chose an origin outside that described policy without a token. It is not evidence that generation is generally broken. A current direct source/log inspection and saved-token browser test remain outstanding.

### Access limits and next executable work

The Supabase connector is not available in this session, and the connected shop computer is offline. The private `wolfs-ops-backups` mirror contains a September 23 backup ZIP, not an unpacked source tree. The GitHub connector rejected its binary fetch, and the base64 file read returned no contents; no backup contents, credentials, or unrelated records were accessed. The stale backup cannot establish the current preparation workflow.

Reconnect the existing awarewolf Supabase project (`pcqoivjzcokgdtlvoona`) so the deployed RPC definitions, preparation contract, settings, and relevant run logs can be inspected. Recover the current `wolfs-ops` social source from the connected laptop if the live functions still depend on it. Under repository rule AFR-001, do not invent queue fields, fake a successful scheduler, or build replacement infrastructure before resolving these contracts.

Then implement the smallest integration on the isolated development branch: generation to durable queue, idempotent 14-day refill using the existing cadence and media eligibility rules, and clear coverage/failure status in the existing admin. Validate real media generation, draft recovery across reload/devices, duplicate prevention, scheduling/time-zone behavior, publisher dry runs, and Android/laptop Chrome. Any eventual publishing activation must follow the existing release gate and the user's reviewed live settings; this investigation changed none of them.

No application code or production settings changed in this follow-up. Production v38 remains unchanged. PR #4 remains unmerged. This is an investigation checkpoint, not a delivered two-week automation workflow.

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
- The broader draft/photo test was initially blocked by automatic approval review pending approval to transmit the specific inputs. The user then explicitly approved both tests: the repository's `data/demo/car/slide-1.jpg` Divco truck photo and synthetic garage-test prompts through the existing Supabase anthropic-proxy to Anthropic. The two approved requests were completed; see the results below. The text package passed; the photo response did not meet the package format.
- Supabase connector was discoverable but not connected. The user's connected computer was offline. No saved credentials were accessed.
- Actual cloud Chrome checks passed on code commit `72801d5bd1bd493011334c7de1567874644be090`: source hash guard/load, visible v39-preview.2 controls, sample package rendering, duplicate save retaining exactly one in-memory draft, clipboard containing the caption plus two newlines plus tags, simulated 403 retaining prior package and draft while re-enabling Generate, sample test explicitly reporting "Live generation was not tested", and reload clearing preview-only drafts. The desktop viewport was visually inspected. These checks do not represent the user's laptop or Android device.
- Laptop Chrome, Android Chrome, authenticated sessions, real persisted browser drafts, media decoding and the current cloud queue contract remain release gates.
- `index.html` remains byte-for-byte v38 with SHA-256 `2702a86a2ae657d6a289eea6b9d3ddc07ebe5ddd76f4eb4329ea5df829af7449`. No production, public-site, cloud queue, DNS or server configuration changes are included. Public-site/admin parity is preserved because this changes no public feature.

Reproduce offline tests with linkedom@0.18.12 installed: `node tests/studio-repair-v39.test.cjs`. Run non-generating access checks: `python3 scripts/diagnose-studio-access.py`. Keep credentials out of command arguments, commits and chat.

Verified isolated preview: https://raw.githack.com/wolfsgarage-hub/Wolfs-admin/72801d5bd1bd493011334c7de1567874644be090/preview-studio-v39.html?v=39-preview.2

### Approved live-package tests (October 16)

Exactly two real requests were sent to the existing anthropic-proxy with `Origin: https://raw.githack.com`, no saved WG token, and no provider credential. No automatic retries, social publishing or cloud-draft writes were made. Both returned HTTP 200 from `claude-sonnet-4-6` with stop reason `end_turn`.

| Test | Actual result | Validation |
|---|---|---|
| Synthetic invitation to show a current garage project | JSON package returned inside a code fence; 1,736 input / 785 output tokens | Existing Studio parser accepted it. The repaired Generate handler validated and rendered it. Repeated Save actions retained one draft in isolated storage. |
| Approved Divco photo with a visible-vehicle description prompt | Plain prose description, no JSON package; 2,543 input / 232 output tokens | Image request reached generation, but package-format validation failed. It is not a successful photo-package test. |

Upstream message IDs, for source/log correlation: text `msg_011Cg6Dxm2gxR6dvCgkr2f9x`; photo `msg_011Cg6DzFC8j6ZUSkbX4aHi3`. The harness did not persist Supabase request IDs for these two calls. Do not invent them or rerun paid calls merely to obtain IDs.

The photo response was replayed through the repaired Generate handler without another network call. Studio reported an incomplete/invalid reply, kept the previous rendered text package and saved draft byte-for-byte, and re-enabled Generate. This confirms the existing fail-safe handling for this real response. It does not turn the invalid photo response into a passing generation result.

Test-scope limitation: the text call used the Generate event handler. The photo call used the same `callClaude` and `buildSystem` functions directly with the approved image and description prompt; it did not exercise file selection/decoding or populate the UI's mediaItems list/attached-shot system note. The request still included the system's JSON-package instructions. The first observed mismatch was the model response containing prose rather than a package; the initial harness JSON parser then stopped. The saved response contains no JSON object, so this is not merely a code-fence parsing issue. Without the deployed proxy source/logs and a normal browser photo flow, do not attribute the result to authentication, the proxy's prompt forwarding, or the production media workflow. No speculative prompt or server changes were made.

These checks used Node VM/linkedom plus real HTTP requests, with isolated in-memory draft storage. They do not verify saved-token authentication, Firebase sign-in, browser persistence, Android/laptop media handling, or cloud queue writes. The photo-package release gate remains open. Production v38 and the public site remain unchanged; PR #4 remains a draft and unmerged.

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
