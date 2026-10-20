# Caption editor repair: Social Queue 1.3.0 / Post Maker 39.1.0

## Scope

Repair the existing caption editor and the existing web generator. No new application, queue, login, publishing action or data migration.

## Confirmed scroll defect

Social Queue 1.2.0 made the desktop detail column sticky without a maximum height or its own vertical overflow. The column could be taller than the visible browser area. FIX IT scrolled to the top of that column rather than the editable caption.

The repair bounds the desktop panel to the current viewport and gives it its own vertical scrollbar. Mobile keeps normal document scrolling. FIX IT and EDIT CAPTION focus and reveal the actual caption textarea. The text field, hashtags and SAVE CAPTION precede collapsed suggested captions. Labels are explicitly associated with inputs. Saving still only edits the selected draft; it does not approve or publish it.

## Caption voice

Both the regular Studio package prompt and its batch-photo prompt now use the same plain-voice rules. Removed forced search-keyword phrasing, minimum-length padding and obligatory calls to action. Short observations may simply end. No performative blue-collar persona, forced question, fake enthusiasm, invented firsthand experience or repeated car-caption slogans. A make, year, engine, owner or event needs reliable supplied information. Different photos must not be assumed to show the same vehicle.

The separate hashtag contract and the storyboard's existing visual-outro controls are preserved. Human wording already stored in the queue is not rewritten by this release.

## Verification

- 61 retained queue/workflow unit tests passed.
- 24 retained Studio repair tests passed.
- 16 new actual Chromium interaction checks passed, including seven viewport sizes: 1229x608, 1366x768, 1024x600, 412x915, 360x640, 852x393 and 412x450.
- Browser checks reproduce the old oversized panel, exercise FIX IT, scrolling, saved edits, failed-save retention, polling while typing, existing explicit option selection and the new edit shortcut.
- Both outgoing generation prompts are asserted in browser tests. Model responses and cloud saves are fixtures, not live-service tests.
- Tests reject post approval, live-setting changes, media upload, publishing and new-post writes.
- Every inline script parsed successfully. The existing source assembler reproduces the delivered index exactly and the patch is idempotent.
- GitHub Actions independently passed the same source checks and browser tests in run 39347262229. Its one-time branch-only materialization workflow was removed afterward. The generated source was required to match the previously tested SHA-256 hashes.

## Boundaries

No existing cloud captions, photo objects, records, approval state or live-publishing settings were changed. No Instagram post was published. The physical Galaxy was not tested.

The laptop was offline to the remote connection during this repair. The separate laptop-driven nightly builder and its prompt were not changed. Old queued captions remain old captions until the owner edits or regenerates them. This release improves the web generator's instructions; a fresh authenticated model output was not judged against the owner's taste during these fixture tests.

Public-site owner-entry redirects are paired to Post Maker 39.1.0 and Social Queue 1.3.0, preserving all other public routes and settings.
