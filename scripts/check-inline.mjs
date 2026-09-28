#!/usr/bin/env node
// HR-007: every inline <script> in the given HTML files must pass `node --check`.
// Usage: node scripts/check-inline.mjs social-queue.html [more.html ...]
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: node scripts/check-inline.mjs <file.html> [...]'); process.exit(2); }

const dir = mkdtempSync(path.join(tmpdir(), 'wg-check-inline-'));
let failed = 0;
for (const file of files) {
  const html = readFileSync(file, 'utf8');
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m, n = 0;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] || '';
    if (/\bsrc\s*=/.test(attrs)) continue;                       // external, not ours to check
    if (/type\s*=\s*["'](?!module|text\/javascript|application\/javascript)/i.test(attrs)) continue; // json/template blocks
    n += 1;
    const isModule = /type\s*=\s*["']module["']/i.test(attrs);
    const out = path.join(dir, `${path.basename(file)}.${n}.${isModule ? 'mjs' : 'js'}`);
    writeFileSync(out, m[2], 'utf8');
    const r = spawnSync(process.execPath, ['--check', out], { encoding: 'utf8' });
    if (r.status !== 0) {
      failed += 1;
      console.error(`FAIL ${file} <script> #${n}${isModule ? ' (module)' : ''}\n${r.stderr}`);
    } else {
      console.log(`ok   ${file} <script> #${n} (${m[2].length} chars)`);
    }
  }
  if (n === 0) console.log(`note ${file}: no inline scripts`);
}
rmSync(dir, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
