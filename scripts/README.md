# Wolf's Garage admin scripts

One-off maintenance scripts. These are not part of the deployed admin site
(`index.html`); they are run by hand from a terminal.

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
