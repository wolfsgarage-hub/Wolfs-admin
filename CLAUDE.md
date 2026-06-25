# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## ⚠️ Sister-repo sync contract (READ THIS FIRST)

This admin app does **not** stand alone. It is the control surface for a
counterpart public site — **`wolfsgarage-hub/wolfs-garage-site`** (cloned
locally alongside this repo at `../wolfs-garage-site`) — and the two share a
single backend:

- the same Firebase project `wolfs-garage-directory` (Auth + Firestore);
- the same Firestore collections and document shapes (`pack_photos`, `events`,
  business listings, …) and their `status` workflow (`pending` → approved);
- the same Cloudinary account/preset/folder (`dancaaglf` / `wolfs-garage`);
- the same `ADMIN_EMAILS` allowlist and the same Mailchimp audience.

This **admin app** is the *control / moderation* surface: an admin reviews,
approves, configures, and exports data. The public **site** is the
*producer / consumer* surface: visitors submit and view that same data.

**THE RULE — admin features and site features ship together.**
If a change here does any of the following, it almost certainly requires a
matching change in `wolfs-garage-site`:
- adds or changes moderation of a Firestore collection, field, or `status` value;
- introduces a new admin control for a content type that has no producing/
  viewing surface on the public site yet;
- touches shared config (Cloudinary preset or folder, `ADMIN_EMAILS`,
  Mailchimp wiring) that the site also reads or writes.
Conversely, an admin control is useless if the site never produces the data it
moderates — so a new admin surface usually implies a new site surface too.

**Required of every session:** before treating a feature change as done, open
`../wolfs-garage-site` and check whether it needs a corresponding change. If it
does, say so explicitly and do **both** — never silently ship one half. (Past
breakage came from exactly this: a change landed on one app and never reached
the other.) If both halves can't be done in one session, leave an explicit
written TODO in the other repo's commit message / CLAUDE.md naming the missing
counterpart.

## Repository shape

Multi-file static admin app (HTML/CSS/JS, no build step, no package manager).
Key files:
- `index.html` — the main admin dashboard (gallery/event moderation, counters,
  config, Mailchimp subscriber export). Loads the Firebase compat SDK v10.7.1
  from CDN and talks to the `wolfs-garage-directory` Firestore.
- `wg-content-studio-*.html`, `wg-post-generator-*.html`, `quick.html` —
  content-creation tools (multiple versioned iterations live side by side).
- `assets/`, `renders/`, `scripts/`, `temp/` — supporting files.

To preview locally, open the relevant `.html` in a browser, or serve the
directory with any static server (admin features that hit Firebase need a real
`http://` origin, not `file://`).
