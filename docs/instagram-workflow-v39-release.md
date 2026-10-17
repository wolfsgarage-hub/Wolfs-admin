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

24 retained repair tests, 33 workflow tests and 25 existing queue tests pass. Real Chrome component tests pass photo decoding, successful model-response handling, IndexedDB save/reload, cloud-contract integration, repeat-send protection, access-error recovery, durable checkpoints and a 412px mobile layout. The component tests use labeled fixture responses and make no live model, cloud or Instagram calls.

The source assembler is reproducible from v38 commit e4660bb529ad594831970bc5bd9a43cf4f1d0f4a and refuses an unrecognized root. Windows CRLF handling was repaired. Existing login, inventory, directory, events, gallery, comments and other admin sections are retained. No public-site behavior or public-site data model changed.

## Operational limits

- The established raw.githack.com host and GitHub Pages have different generation-service authorization behavior. The new UI explains the distinction and preserves per-origin credentials and drafts. The update does not weaken the service origin policy.
- The existing nightly preparation job relies on Claude Code subscription sign-in on the laptop. It was signed out during this audit. A browser manual batch does not make an unattended PC job healthy.
- Event pin behavior remains that of the existing publisher; dates in the two-week view are explicitly projections.
- Topic and image data are not proof of a vehicle's year, model, owner, permissions, event date or hashtag performance. Captions and media stay pending for owner review.

## Rollback

The prior production admin commit is e4660bb529ad594831970bc5bd9a43cf4f1d0f4a. Revert only this release's code changes to restore the prior app. No database migration or publisher-setting change is required for code rollback. Do not delete cloud posts, media bundles, localStorage, IndexedDB or previously approved content during rollback.
