// tools/check.mjs, the gate: the steps run in order and the first red one stops it with exit 1.
// Runs alone:
//   node --test tests/micro/check-gate.test.mjs
//
// The real check.mjs is copied into a made-up project where every step is a stub that writes
// its name to a log and exits 3 when STUB_FAIL names it. The npm audit step is the real npm in
// a folder with no lock file, so it always fails at once, offline too, without asking the
// registry anything.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const STUB = `import fs from 'node:fs';
const name = process.argv.slice(2).find((a) => !a.startsWith('-')) || 'repo';
fs.appendFileSync(process.env.STUB_LOG, name + '\\n');
process.exit(process.env.STUB_FAIL && name.startsWith(process.env.STUB_FAIL) ? 3 : 0);
`;

function fakeProject({ withWebExt = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtab-gate-'));
  fs.mkdirSync(path.join(dir, 'tools'));
  fs.copyFileSync(path.join(PROJECT, 'tools', 'check.mjs'), path.join(dir, 'tools', 'check.mjs'));
  fs.writeFileSync(path.join(dir, 'tools', 'check_repo.mjs'), STUB);
  fs.writeFileSync(path.join(dir, 'tools', 'test.mjs'), STUB);
  if (withWebExt) {
    fs.mkdirSync(path.join(dir, 'node_modules', 'web-ext', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'node_modules', 'web-ext', 'bin', 'web-ext.js'), STUB);
  }
  // check_repo, test and web-ext are ES modules; the stubs need the same.
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}\n');
  return dir;
}

function runCheck(dir, fail, extraEnv = {}) {
  const log = path.join(dir, 'steps.log');
  fs.writeFileSync(log, '');
  const r = spawnSync(process.execPath, [path.join(dir, 'tools', 'check.mjs')], {
    encoding: 'utf8', timeout: 60_000, env: { ...process.env, STUB_LOG: log, STUB_FAIL: fail || '', ...extraEnv },
  });
  return { ...r, steps: fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) };
}

test('a red first step stops the gate before anything else runs', () => {
  const dir = fakeProject();
  try {
    const r = runCheck(dir, 'repo');
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.deepEqual(r.steps, ['repo']);
    assert.match(r.stderr, /CHECK FAILED at: repo/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the cheap steps run first, and a red step stops the slow ones', () => {
  const dir = fakeProject();
  try {
    const r = runCheck(dir, 'lint');
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.deepEqual(r.steps, ['repo', 'micro', 'lint']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a failing dependency audit stops the gate before the macro tests', () => {
  const dir = fakeProject();
  try {
    const r = runCheck(dir);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.deepEqual(r.steps, ['repo', 'micro', 'lint']);
    assert.match(r.stderr, /CHECK FAILED at: dependency audit/);
    assert.doesNotMatch(r.stdout, /CHECK OK/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a step that hangs is stopped and counted red', () => {
  const dir = fakeProject();
  try {
    fs.writeFileSync(path.join(dir, 'tools', 'check_repo.mjs'), 'setInterval(() => {}, 1000);\n');
    const started = Date.now();
    const r = runCheck(dir, '', { GTAB_STEP_TIMEOUT_MS: '2000' });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /CHECK FAILED at: repo.*still running after 2 s/);
    assert.ok(Date.now() - started < 30_000, 'the hanging step was not stopped');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a missing tool is red before any step runs, with what to do', () => {
  const dir = fakeProject({ withWebExt: false });
  try {
    const r = runCheck(dir);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.deepEqual(r.steps, []);
    assert.match(r.stderr, /setup\.cmd/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
