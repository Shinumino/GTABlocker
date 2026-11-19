// sign.cmd runs this; the rules are in sign_rules.mjs (and docs/secrets.md for the keys).
// `--keys`: only say whether .env holds the two keys as it should, never a value.
//
// It always runs: no "am I the main script" guess. Through a folder junction that guess failed
// and a check exited 0 having done nothing (check_repo.mjs, 2026-11-18). So no test imports this
// file: they import sign_rules.mjs.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sign, realSeams } from './sign_rules.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const seams = realSeams({
  root: ROOT,
  webExt: path.join(ROOT, 'node_modules', 'web-ext', 'bin', 'web-ext.js'),
  gate: path.join(ROOT, 'tools', 'check.mjs'),
});
process.exitCode = await sign(seams, { mode: process.argv.includes('--keys') ? 'keys' : 'sign' });
