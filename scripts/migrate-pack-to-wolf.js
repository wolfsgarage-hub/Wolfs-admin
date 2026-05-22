#!/usr/bin/env node
/**
 * migrate-pack-to-wolf.js
 *
 * Option B re-sort. Moves Wolf's own photos out of the `pack_photos`
 * collection and into `wolf_photos`, then deletes them from `pack_photos`.
 *
 * Background:
 *   Under Option B, `wolf_photos` and `pack_photos` are the canonical photo
 *   collections (the old `gallery` collection is kept only as a cold backup).
 *   A previous in-admin migration copied `gallery` docs into `pack_photos`,
 *   so `pack_photos` now holds a mix of Wolf's photos and real community
 *   submissions. This script separates them.
 *
 * Selection key:
 *   A `pack_photos` doc is treated as Wolf's photo when `isWolf === true`.
 *   IMPORTANT: the v22 admin gallery->pack_photos copy did NOT preserve the
 *   `isWolf` field. If the docs in `pack_photos` have no `isWolf` field, this
 *   script will (correctly) move 0 docs and say so loudly. In that case the
 *   re-sort needs a different key. Run this in dry-run first and read the
 *   per-doc field report before doing anything else.
 *
 * Safety:
 *   - Dry-run is the default. Nothing is written or deleted unless you pass
 *     --apply on the command line.
 *   - The move is done as a single atomic Firestore batch: every selected doc
 *     is copied and deleted together, or nothing changes. There is no
 *     half-done state where a doc lands in both collections.
 *   - The `gallery` collection is never read or touched by this script.
 *
 * Credentials:
 *   Needs a Firebase service account JSON for project `wolfs-garage-directory`.
 *   Provide it either way:
 *     1. Save it to ~/wolfs-garage-service-account.json
 *     2. Or set GOOGLE_APPLICATION_CREDENTIALS=/full/path/to/key.json
 *
 * Usage:
 *   cd scripts
 *   npm install
 *   node migrate-pack-to-wolf.js            # dry run: report only, no changes
 *   node migrate-pack-to-wolf.js --apply    # perform the move and delete
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const admin = require('firebase-admin');

const PROJECT_ID = 'wolfs-garage-directory';
const SOURCE = 'pack_photos';
const TARGET = 'wolf_photos';
const DEFAULT_KEY_PATH = path.join(os.homedir(), 'wolfs-garage-service-account.json');
const FIRESTORE_BATCH_LIMIT = 450; // Firestore hard limit is 500 ops per batch.

const APPLY = process.argv.includes('--apply');

// Resolve a Firebase Admin credential from the env var or the default path.
function resolveCredential() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return { mode: 'GOOGLE_APPLICATION_CREDENTIALS', cred: admin.credential.applicationDefault() };
  }
  if (fs.existsSync(DEFAULT_KEY_PATH)) {
    let json;
    try {
      json = JSON.parse(fs.readFileSync(DEFAULT_KEY_PATH, 'utf8'));
    } catch (err) {
      console.error('ERROR: ' + DEFAULT_KEY_PATH + ' exists but is not valid JSON.');
      console.error(err.message);
      process.exit(1);
    }
    return { mode: DEFAULT_KEY_PATH, cred: admin.credential.cert(json) };
  }
  return null;
}

// Normalize a timestamp value (Firestore Timestamp, Date, or string) to ISO.
function toIso(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

async function countCollection(db, name) {
  const snap = await db.collection(name).get();
  return snap.size;
}

async function main() {
  const resolved = resolveCredential();
  if (!resolved) {
    console.error('ERROR: no Firebase service account credentials found.');
    console.error('Provide a service account key for project ' + PROJECT_ID + ' one of two ways:');
    console.error('  1. Save it to ' + DEFAULT_KEY_PATH);
    console.error('  2. Or set GOOGLE_APPLICATION_CREDENTIALS=/full/path/to/key.json');
    process.exit(1);
  }

  admin.initializeApp({ credential: resolved.cred, projectId: PROJECT_ID });
  const db = admin.firestore();

  console.log('Wolf\'s Garage - Option B re-sort: ' + SOURCE + ' -> ' + TARGET);
  console.log('Project     : ' + PROJECT_ID);
  console.log('Credentials : ' + resolved.mode);
  console.log('Mode        : ' + (APPLY ? 'APPLY (will write and delete)' : 'DRY RUN (no changes)'));
  console.log('');

  // Step 1: read all pack_photos docs. Step 5 (part 1): counts before.
  const srcSnap = await db.collection(SOURCE).get();
  const targetBefore = await countCollection(db, TARGET);
  console.log('BEFORE: ' + SOURCE + ' = ' + srcSnap.size + ' doc(s), ' + TARGET + ' = ' + targetBefore + ' doc(s).');
  console.log('');

  // Step 2: identify isWolf:true docs, and report field presence per doc so
  // the operator can see exactly what is in Firestore.
  const toMove = [];
  let explicitFalse = 0;
  let missingIsWolf = 0;

  console.log('Per-doc report for ' + SOURCE + ':');
  srcSnap.forEach((doc) => {
    const data = doc.data() || {};
    const hasIsWolf = Object.prototype.hasOwnProperty.call(data, 'isWolf');
    const fields = Object.keys(data).sort().join(', ');
    if (!hasIsWolf) missingIsWolf++;
    else if (data.isWolf === false) explicitFalse++;
    if (data.isWolf === true) toMove.push({ id: doc.id, data: data });
    console.log('  ' + doc.id
      + ' | isWolf=' + (hasIsWolf ? JSON.stringify(data.isWolf) : '(field absent)')
      + ' | status=' + JSON.stringify(data.status)
      + ' | fields=[' + fields + ']');
  });
  console.log('');
  console.log('Classification:');
  console.log('  isWolf === true    : ' + toMove.length + ' (move to ' + TARGET + ')');
  console.log('  isWolf === false   : ' + explicitFalse + ' (stay in ' + SOURCE + ')');
  console.log('  isWolf field absent: ' + missingIsWolf + ' (stay in ' + SOURCE + ')');
  console.log('');

  if (srcSnap.size > 0 && missingIsWolf === srcSnap.size) {
    console.log('WARNING: not one ' + SOURCE + ' doc carries an isWolf field.');
    console.log('The v22 gallery->pack_photos copy did not preserve isWolf, so there');
    console.log('is nothing to key the re-sort on. This script will move 0 docs.');
    console.log('Re-sorting these requires a different key (for example, cross-');
    console.log('referencing the gallery backup by image or userEmail). Stop here');
    console.log('and check with John before going further.');
    console.log('');
  }

  if (toMove.length === 0) {
    console.log('Nothing to move. Done.');
    return;
  }

  // Steps 3 + 4: copy each selected doc to wolf_photos (preserving every
  // field) and delete it from pack_photos, as one atomic batch.
  if (!APPLY) {
    console.log('DRY RUN: would move ' + toMove.length + ' doc(s) to ' + TARGET + '.');
    console.log('Re-run with --apply to perform the move and delete.');
    return;
  }

  if (toMove.length > FIRESTORE_BATCH_LIMIT) {
    console.error('ERROR: ' + toMove.length + ' docs to move exceeds the single-batch');
    console.error('limit of ' + FIRESTORE_BATCH_LIMIT + '. Split this run before applying.');
    process.exit(1);
  }

  const batch = db.batch();
  const plan = [];
  toMove.forEach((item) => {
    const out = Object.assign({}, item.data); // preserve every field
    // wolf_photos views (community gallery.html, admin) order by addedAt.
    // A doc with no addedAt is excluded from those queries, so backfill it
    // from the doc's own timestamps and fall back to now.
    if (!out.addedAt) {
      out.addedAt = toIso(item.data.submittedAt) || toIso(item.data.createdAt) || new Date().toISOString();
    }
    const newRef = db.collection(TARGET).doc();
    batch.set(newRef, out);
    batch.delete(db.collection(SOURCE).doc(item.id));
    plan.push({ from: item.id, to: newRef.id });
  });

  await batch.commit();
  plan.forEach((p) => {
    console.log('  moved ' + SOURCE + '/' + p.from + ' -> ' + TARGET + '/' + p.to);
  });
  console.log('');

  // Step 5 (part 2): counts after.
  const srcAfter = await countCollection(db, SOURCE);
  const targetAfter = await countCollection(db, TARGET);
  console.log('AFTER : ' + SOURCE + ' = ' + srcAfter + ' doc(s), ' + TARGET + ' = ' + targetAfter + ' doc(s).');
  console.log('Moved ' + plan.length + ' doc(s).');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('MIGRATION FAILED:', err);
    process.exit(1);
  });
