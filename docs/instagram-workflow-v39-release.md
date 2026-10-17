# Instagram workflow v39.0.0

Scope: update the existing admin Studio and the existing Social Queue. No second app, no new publisher, no provider keys in the browser, no automatic approval or activation.

## Implemented

- Studio v39.0.0 integrates the reviewed v39-preview.2 request, storage and authorization handling into the actual index.html.
- The existing social_post_upsert / social_post_get RPCs and wg-ig-publish upload action replace the retired GitHub JSON queue writer. Every insert is pending and independently read back before success is reported.
- One shared two-week projection is used by Studio and Social Queue v1.2.0. It reads the actual queue, daily Pacific slots and publishing switch. Pending, incomplete and empty places are never described as approved days. Projections are not reserved dates.
- Owner-selected photo batches fill empty places only. Each photo is decoded sequentially, kept whole in a square output, captioned, saved to IndexedDB, checkpointed, uploaded and added for review. Previously queued or published batch photos are not rebuilt, including when their captions change. Stop leaves completed work intact.
- Saved packages include a verified media-bundle reference. Reloaded old text-only drafts never silently borrow a new photo selection. Upload retries reuse the deterministic post ID and never replace approved owner edits.
- A separate, explicit control sets the existing nightly draft target to 14 without changing live_publishing. The existing queue retains its ARM LIVE confirmation and per-post approval controls.
- The standard Social text composer can create an incomplete pending Instagram draft only when Instagram is selected. Other selected platforms are not scheduled by this integration.
- Reference video frames remain reference only. This release does not claim that a shot list is a rendered reel or automatically publish a still frame as video.
- The archived sample preview now loads its immutable v38 source, instead of attempting to transform the newly released root.

## Verification before hosted check

24 retained repair tests, 36 workflow tests and 25 existing queue tests pass. Real Chrome component tests pass photo decoding, successful model-response handling, IndexedDB save/reload, cloud-contract integration, repeat-send protection, access-error recovery, durable checkpoints and a 412px mobile layout. The component tests use labeled fixture responses and make no live model, cloud or Instagram calls.

The source assembler is reproducible from v38 commit e4660bb529ad594831970bc5bd9a43cf4f1d0f4a and refuses an unrecognized root. Windows CRLF handling was repaired. Existing login, inventory, directory, events, gallery, comments and other admin sections are retained. Public-site pairing adds only two owner-entry redirects to these existing controls, with no public layout or data-model change.

## Operational limits

- The established raw.githack.com host and GitHub Pages have different generation-service authorization behavior. The new UI explains the distinction and preserves per-origin credentials and drafts. The update does not weaken the service origin policy.
- The existing nightly preparation job relies on Claude Code subscription sign-in on the laptop. It was signed out at the start of the audit, then the owner restored sign-in. The repaired active checkout completed a real build of two new posts. The laptop must still be online at its existing nightly schedule.
- Event pin behavior remains that of the existing publisher; dates in the two-week view are explicitly projections.
- Topic and image data are not proof of a vehicle's year, model, owner, permissions, event date or hashtag performance. Captions and media stay pending for owner review.

## Rollback

The prior production admin commit is e4660bb529ad594831970bc5bd9a43cf4f1d0f4a. Revert only this release's code changes to restore the prior app. No database migration or publisher-setting change is required for code rollback. Do not delete cloud posts, media bundles, localStorage, IndexedDB or previously approved content during rollback.

## Verified hosted generation and live cloud save

The actual HTTPS admin at commit af6da9e4eda40a8e0328aa456e2f694f850e1e49 loaded in fresh Chrome with the real workflow v39.0.0 and no JavaScript errors. After the host's external-content notice was opened normally, the existing anthropic-proxy generated a valid photo caption and five suggestions from the approved public repository photo. This was a real model response, not the sample preview. No service policy, origin allowlist or provider credential changed.

A separate clearly marked validation draft exercised a real photo upload, pending RPC insert, independent read-back and repeat-send check from the hosted browser. Only that exact synthetic draft was then marked killed after verifying its identity, status and caption, removing it from the active review line. It was never approved or published. The original 12 posts were preserved.

## Active preparation and two-week target

The existing laptop scheduled checkout was fast-forwarded to f99c7239540c9bfa666d9182d470ef11ceea578a. Source changes include authenticated preflight, failures left available for retry, real completion checks, and rejecting empty caption output before rendering or upload. Its existing scheduled-task path and times were preserved. A rollback branch retains the previous checkout. Forty-five focused Python tests passed; the additional caption-before-upload regression passed with the 13 overlapping vision tests.

The cloud line_depth setting was set to 14 and independently read back while live_publishing stayed off. The repaired builder completed a real run with two new pending posts, sp-20261017-01 and sp-20261017-02. Each has five actual media objects, five source photo IDs and three caption options. Read-back verified 14 pending, zero approved, zero failed, zero publishing. This is a two-week draft target, not fourteen approved scheduled posts.

An existing September 25 weekend-event draft is stale. Its content was not silently replaced or deleted. The shared UI now marks expired events as held and blocks their approval. Future-date pins and future-pinned approvals are also held until the deployed cloud claim function is verified/corrected. The prepared SQL correction is present on disk but was not deployed. Unpinned daily line ordering and explicit owner approval remain available.
