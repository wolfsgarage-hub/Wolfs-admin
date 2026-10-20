# Social Queue 1.4.0: actual media before approval

Owner requirement: do not approve a post without seeing its pictures.

## Delivered behavior

The former card-level POST IT action now opens REVIEW POST instead of immediately approving. The review shows one actual full-size media file alongside an editable caption. PREVIOUS and NEXT cover every feed slide and any enabled Story attachment. FULL PHOTO expands the whole picture without cropping it. The existing detail panel also has VIEW PHOTOS + CAPTION and per-slide VIEW FULL PHOTO buttons. Its desktop photo strip remains visible while the caption is edited.

Approval is disabled until every attached picture has decoded and been displayed, and the owner explicitly confirms review of the pictures and caption. A missing, corrupt or unsupported image gives an error and retry control, never a fake replacement image. An available thumbnail/cover does not validate a missing actual media file. A video must actually start playing; its poster is not sufficient.

Caption changes clear confirmation and require an explicit save. Saving edits only the selected pending post and independently reads it back. Unsaved words survive closing the review and failed saves. Immediately before approval, the current cloud record is read again and compared to the reviewed media, caption, tags, facts, status and date. A changed record blocks approval and requires a fresh review. Existing expired-event and future-pin holds remain in place.

The viewer fails closed when its script is unavailable. Opening it, loading media, navigating and enlarging do not approve or publish. No global publishing switch, queue order, existing caption, media object or owner approval was changed during development.

## Verification

- 61 retained queue/workflow unit tests passed.
- 24 retained Studio repair tests passed.
- 20 new Chrome checks passed with actual repository JPEG decoding and intercepted cloud RPC fixtures.
- Seven viewports: 1366x768, 1229x608, 1024x600, 412x915, 360x640, 852x393 and 412x450.
- Verified simultaneous picture/caption visibility, full-photo mode, all-slides plus Story review, explicit confirmation, failed-save recovery, draft retention, changed-media rejection, corrupt HTTP-200 images, missing images, unavailable video and missing-script rejection.
- A fixture-only approval exercised the explicit final action. No real queued post was approved or published.
- Desktop and phone-size screenshots were inspected. The actual Galaxy hardware was not used for testing.

## Preserved and limits

No change to the Post Maker 39.1.0 caption voice, generation credentials, scheduling, cloud schema, publisher, other admin tools or public-site content. The public queue entry is paired to version 1.4.0. This review gate is in this interface, not a replacement for the cloud authorization policy; older open pages must be refreshed. Record rechecking is not an atomic server compare-and-set. A media path whose contents are overwritten without changing record metadata cannot be detected by the record comparison alone. Media availability is checked when displayed; this release does not claim every existing cloud file was restored. No new video generation or caption regeneration was performed.

Code rollback: restore the previous queue source at 6e8b866c77a009eb3acc8f2690a67ad1844ea073 and its entry version. Preserve all cloud posts, files, approvals and local drafts. The new worktree leaves the owner's existing checkouts unchanged.
