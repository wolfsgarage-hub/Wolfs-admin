# Wolf's Garage admin scripts

One-off maintenance scripts. These are not part of the deployed admin site
(`index.html`); they are run by hand from a terminal.

---

## render_reel.py - the reels line

Turns a JSON brief into a 1080x1920 9:16 MP4 for Instagram Reels, plus a poster frame.
Phase 3 of `Documents\WG-content-machine-v2-plan.md`.

```sh
python scripts/render_reel.py --brief scripts/briefs/demo-stills-patina-row.json \
                              --output renders/reels/wgreel-20260809-01/reel.mp4
```

It writes `reel.mp4` and a sibling `reel.jpg` poster (same stem, `.jpg`).

### Two brief formats, one file

| brief has | renders as | notes |
|---|---|---|
| `"clips"` | v1, the July format | frozen; the ten mp4s in `renders/` stay reproducible |
| `"segments"` | v2, the Phase 3 format | transitions, spec-driven motion, media-index stills |

Dispatch is on the key. **Do not fold the v1 functions into the v2 ones.**

### ffmpeg

Resolution order: `$WG_FFMPEG`, then `ffmpeg` on PATH, then the `imageio-ffmpeg` wheel's
bundled binary. The GitHub Action (`.github/workflows/render-reel.yml`) apt-installs ffmpeg,
so CI hits the PATH branch and behaves exactly as before. **John's Windows box has no system
ffmpeg** - `pip install --user imageio-ffmpeg` puts a full gyan.dev build (libx264 +
libfreetype) inside Python 3.12's site-packages without touching PATH or anything
system-wide. That is how the demos were rendered locally.

### Transitions

`transition_in` on a segment describes how it arrives. Names are John-facing, not ffmpeg's.

| name | ffmpeg xfade | default |
|---|---|---|
| `cut` | (concat, no overlap) | - |
| `crossfade` | fade | 0.40s |
| `dissolve` | dissolve | 0.45s |
| `fade_black` | fadeblack | 0.50s |
| `slide_left` / `_right` / `_up` / `_down` | slideleft/right/up/down | 0.40s |
| `whip_left` / `_right` / `_up` / `_down` | smoothleft/right/up/down | 0.20s |
| `blur` | hblur | 0.35s |
| `push_in` | zoomin | 0.45s |

An unknown name aborts; it never silently degrades to a cut. A transition is clamped to 60%
of either neighbour so it can never eat a whole segment.

### Motion on stills

`zoom: 1.0` means **the full height of the source is in frame**; `2.0` shows half of it.
Width follows from 9:16. That reading is what makes his panoramas work - a 16320x7532 pano at
`zoom 1.0` shows a 4237px-wide slice and `focus_x` can walk it the entire way across the
picture. `focus_x` / `focus_y` are 0-1 across the remaining travel, exactly like the photo
pipeline's crop. `easing` is `ease` (smoothstep, default) or `linear`.

Frames are cut in Pillow, not ffmpeg's `zoompan`, because zoompan samples `iw/zoom` by
`ih/zoom` - it distorts any input that is not already 9:16, which rules out panning a
panorama - and because cutting them here means a reel uses the same crop maths as
`assemble.py`, so one still looks the same in a carousel and in a reel.

### Guards (they abort, they do not warn)

- **NO-UPSCALE.** A still whose tightest window samples fewer than 1080 real pixels of source
  width aborts. A clip that has to be scaled up to fill aborts. `"allow_upscale": true`
  overrides and warns loudly.
- **BRD-005.** A still whose media-index `content_tag` is `resale` or `personal` aborts.
- **SUBJECT SAFETY.** With a `subject` box declared, every motion keyframe must keep the
  subject's full height in frame (no decapitated cars) and keep it filling at least
  `min_subject_cover` (default 0.5) of the frame width - pan ALONG the car, never off into
  the grass. `"allow_unsafe_motion": true` overrides and warns.

### Landscape footage - read this before adding clips

Every clip in `temp/reel-source/` plays back **1920x1080 landscape** (coded 1080x1920 with a
90-degree display matrix, which is why a naive probe reads it backwards). Filling 9:16 from
those means a 1.78x upscale, and the guard refuses it. Use:

```json
{ "fit": "contain", "crop_to": 1.0, "backdrop": "black", "place_y": 0.30 }
```

`crop_to` squares the frame off at native resolution first, so a 1080x1080 window lands at
1:1 with no upscale anywhere and still owns 56% of the reel - where a plain letterbox would
leave a 1080x607 strip owning 32%. `backdrop: "blur"` exists as an alternative but puts
uncontrolled colour across the whole frame, which the palette lock argues against.
**The real fix is John shooting vertical.**

### Frame weights are NOT the photo numbers

`assemble.py` draws `thin` as 4 margin + 2 red + 2 gap + 2 bone + 2 gap. Copying those onto a
reel looks right in a PNG and dies in the encoder: H.264 `yuv420p` carries chroma at half
resolution, so a 2px line gets one chroma sample and averages with whatever is beside it.
Measured on the first render: `#CC0000` came back `(153,29,7)` and `#F5F1E8` came back
`(218,225,189)` - red read amber, bone read green. Strokes are doubled to 4px and the bands
sit on a black margin the way a photo post draws them. Re-measured after: red `(182,18,20)`,
bone `(220,222,218)`, copper `(198,144,42)`. If you ever thin them again, measure the output,
not the intent.

---

## Reel drafts in post-queue.json (schema v3 + reel extension)

A reel draft is a normal schema-v3 draft with `format: "reel"`, `aspect: "reel_9x16"`, an
empty `slides` array, and two new keys: `video` (what to play and post) and `segments` (the
spec it was rendered from, so it is re-renderable without hunting for the brief).

```json
{
  "id": "wgreel-20260809-01",
  "created": "2026-08-09",
  "status": "pending_approval",
  "format": "reel",
  "aspect": "reel_9x16",
  "frame": "thin",
  "angle": "motion-on-stills: three slammed pickups from one 2026-07-11 show",
  "hook": "A TRUCK THIS LOW",
  "caption": "Three trucks on the same grass and not one of them sitting up. ... Get back in the garage.",
  "hashtags": ["#wolfsgarage", "#c10", "#slammed", "#pnwtrucks", "#getbackinthegarage"],
  "cta": "brand",
  "video": {
    "file":   "renders/reels/wgreel-20260809-01/reel.mp4",
    "poster": "renders/reels/wgreel-20260809-01/poster.jpg",
    "duration": 11.9, "w": 1080, "h": 1920, "fps": 30,
    "brief": "scripts/briefs/demo-stills-patina-row.json",
    "renderer": "scripts/render_reel.py v2"
  },
  "slides": [],
  "segments": [ ... the brief's segments array, verbatim ... ],
  "target_slot": "2026-08-12 18:30 America/Los_Angeles",
  "platforms": ["instagram"]
}
```

Rules that come with it:

- **`slides` stays present and empty.** Every reader on this estate does `(d.slides || [])`;
  an absent key is fine but an empty array is what the publishers, the week builder and the
  approval page already expect to iterate.
- **`video.file` must start with `renders/`**, same law as a photo slide. `assertShape` and
  `queueIntegrity` in post-queue.html both enforce it now, because an empty `slides` array
  passes the old `.some()` check vacuously - a reel with no mp4 would otherwise sail through
  the exact fixture-shape gate that exists to catch it. **The other three copies of that rule
  (`wolfs-ops\src\publisher.py`, `wg-ig-publish/index.ts`, and STEP 2.5 of both scheduled
  publish prompts) still have the vacuous version.** Fix them when the reel leg is wired.
- **`hook` is burned into the mp4.** The approval page shows it read-only. Changing a reel's
  hook means re-rendering, not retyping - otherwise the queue and the video disagree about
  what the post says.
- **The poster frame is not optional.** It is what the approval card shows before John hits
  play, and it is the only reason the card is not a black rectangle.
- One reel per draft. Instagram has no reel carousel.

### Where the files live

```
renders/reels/<draft-id>/reel.mp4      the master
renders/reels/<draft-id>/poster.jpg    the frame the approval card shows
scripts/briefs/<name>.json             the brief it was rendered from
```

Mirrors `renders/posts/<draft-id>/slide-N.jpg` on the photo side.

---

## migrate-pack-to-wolf.js

Option B re-sort. Moves Wolf's own photos out of the `pack_photos` Firestore
collection into `wolf_photos`, then deletes them from `pack_photos`.

### What it does

1. Reads every doc in `pack_photos`.
2. Classifies each doc by its `isWolf` field and prints a per-doc report.
3. For docs where `isWolf === true`: copies them to `wolf_photos` preserving
   every field, and deletes them from `pack_photos`.
4. The copy and delete happen as one atomic Firestore batch, so there is no
   half-done state where a doc lands in both collections.
5. Logs `pack_photos` and `wolf_photos` counts before and after.

The `gallery` collection is never read or modified.

### Known caveat: the isWolf field may be absent

The v22 in-admin `gallery` -> `pack_photos` copy did **not** preserve the
`isWolf` field. If the docs now in `pack_photos` have no `isWolf` field, this
script will correctly move **0 docs** and print a clear warning. In that case
the re-sort needs a different selection key (for example, cross-referencing
the `gallery` backup). Always run the dry run first and read the per-doc
report before doing anything else.

### One additive change to copied docs

`wolf_photos` views (community `gallery.html`, the admin panel) order by
`addedAt`. A doc with no `addedAt` is excluded from those queries. So when a
copied doc has no `addedAt`, the script backfills it from the doc's own
`submittedAt` or `createdAt`, falling back to the current time. Every other
field is copied unchanged.

### Prerequisites

- Node.js (any current LTS).
- A Firebase service account JSON for the `wolfs-garage-directory` project.
  Create one in the Firebase Console: Project settings, Service accounts,
  Generate new private key. Treat this file as a secret. Do not commit it.

Provide the key one of two ways:

1. Save it to `~/wolfs-garage-service-account.json`, or
2. Set `GOOGLE_APPLICATION_CREDENTIALS` to its full path.

### Run it

```sh
cd scripts
npm install

# Dry run: prints the report and what it WOULD move. Changes nothing.
node migrate-pack-to-wolf.js

# Apply: performs the move and delete.
node migrate-pack-to-wolf.js --apply
```

`npm run migrate` and `npm run migrate:apply` are shortcuts for the two
commands above.

Run the dry run first, confirm the per-doc report looks right, then apply.
