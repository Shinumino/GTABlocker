// tools/test.mjs and test.cmd: a red run is red, and a run that found nothing to test is red
// too. Runs alone:
//   node --test tests/micro/test-runner.test.mjs
//
// Every run here points GTAB_TEST_ROOT at a small made-up test tree, so no Firefox starts and
// the real suites are not run. GTAB_NESTED stops this file from running itself inside such a
// run (an older test.cmd that ignored GTAB_TEST_ROOT would otherwise start the real suite,
// which contains this file, which would start it again).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEST_MJS = path.join(PROJECT, 'tools', 'test.mjs');
const TEST_CMD = path.join(PROJECT, 'test.cmd');
const nested = process.env.GTAB_NESTED === '1';

const PASS = "import { test } from 'node:test'; test('passes', () => {});\n";
const FAIL = "import { test } from 'node:test'; test('fails', () => { throw new Error('red on purpose'); });\n";
const NO_TESTS = '// a test file with no test in it\n';
// A macro test that leaves a mark, so a test can see whether the macro suite ran at all.
const MARK = (marker) => `import { test } from 'node:test'; import fs from 'node:fs';\n`
  + `test('marks', () => fs.writeFileSync(${JSON.stringify(marker)}, 'ran'));\n`;

function tree(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtab-runner-'));
  fs.mkdirSync(path.join(dir, 'micro'));
  fs.mkdirSync(path.join(dir, 'macro'));
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  return dir;
}

// node --test marks the processes it starts (NODE_TEST_CONTEXT), and a node --test started
// with that mark skips its files and reports nothing: every run below would "pass" without
// running anything. Each run gets a clean environment, as if typed at a prompt.
function cleanEnv(dir) {
  const env = { ...process.env, GTAB_TEST_ROOT: dir, GTAB_NESTED: '1' };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

function runTestMjs(dir, args = []) {
  return spawnSync(process.execPath, [TEST_MJS, ...args], {
    encoding: 'utf8', env: cleanEnv(dir), timeout: 60_000,
  });
}

function runTestCmd(dir, args = []) {
  const line = [`"${TEST_CMD}"`, ...args.map((a) => `"${a}"`)].join(' ');
  return spawnSync('cmd.exe', ['/d', '/s', '/c', `"${line}"`], {
    encoding: 'utf8', windowsVerbatimArguments: true, timeout: 60_000,
    env: cleanEnv(dir),
  });
}

test('green micro and macro suites pass, and both ran', { skip: nested }, () => {
  const marker = path.join(os.tmpdir(), `gtab-mark-${process.pid}-a`);
  const dir = tree({ 'micro/a.test.mjs': PASS, 'macro/b.test.mjs': MARK(marker) });
  try {
    const r = runTestMjs(dir);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(fs.existsSync(marker), 'the macro suite never ran');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(marker, { force: true });
  }
});

test('a red micro suite fails the run and the macro suite never starts', { skip: nested }, () => {
  const marker = path.join(os.tmpdir(), `gtab-mark-${process.pid}-b`);
  const dir = tree({ 'micro/a.test.mjs': FAIL, 'macro/b.test.mjs': MARK(marker) });
  try {
    const r = runTestMjs(dir);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.ok(!fs.existsSync(marker), 'the macro suite ran after a red micro suite');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(marker, { force: true });
  }
});

test('a suite with no test files is red, not an empty pass', { skip: nested }, () => {
  const dir = tree({ 'macro/b.test.mjs': PASS });
  try {
    const r = runTestMjs(dir);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /no test files/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('test files that hold no test are red too', { skip: nested }, () => {
  const dir = tree({ 'micro/a.test.mjs': NO_TESTS, 'macro/b.test.mjs': PASS });
  try {
    const r = runTestMjs(dir, ['micro']);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /no test ran/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a narrow run of one red file is red, and of one green file is green', { skip: nested }, () => {
  const dir = tree({ 'micro/red.test.mjs': FAIL, 'micro/green.test.mjs': PASS });
  try {
    assert.equal(runTestMjs(dir, [path.join(dir, 'micro', 'red.test.mjs')]).status, 1);
    assert.equal(runTestMjs(dir, [path.join(dir, 'micro', 'green.test.mjs')]).status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a narrow run whose name pattern matches no test is red', { skip: nested }, () => {
  const dir = tree({ 'micro/green.test.mjs': PASS });
  try {
    const r = runTestMjs(dir, ['--test-name-pattern=nothing-is-called-this', path.join(dir, 'micro', 'green.test.mjs')]);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /no test ran/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a narrow run whose file pattern matches no file is red', { skip: nested }, () => {
  // node --test treats a pattern with * as a glob; one that matches nothing runs 0 tests and
  // exits 0 on its own (measured on Node 24.19).
  const dir = tree({ 'micro/green.test.mjs': PASS });
  try {
    const r = runTestMjs(dir, [path.join(dir, 'micro', 'no-such-*.test.mjs')]);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /no test ran/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a run started from inside another test still runs its tests', { skip: nested }, () => {
  // No cleanEnv here on purpose: this process carries NODE_TEST_CONTEXT, as it would when a
  // test calls the runner, and the runner must still run the files.
  const marker = path.join(os.tmpdir(), `gtab-mark-${process.pid}-d`);
  const dir = tree({ 'micro/a.test.mjs': MARK(marker) });
  try {
    assert.ok(process.env.NODE_TEST_CONTEXT, 'this test expects to run under node --test');
    const r = spawnSync(process.execPath, [TEST_MJS, 'micro'], {
      encoding: 'utf8', timeout: 60_000, env: { ...process.env, GTAB_TEST_ROOT: dir, GTAB_NESTED: '1' },
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.ok(fs.existsSync(marker), 'the test file never ran');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(marker, { force: true });
  }
});

test('a test that never ends is stopped and counted red', { skip: nested }, () => {
  const dir = tree({ 'micro/hangs.test.mjs': "import { test } from 'node:test'; test('hangs', () => new Promise(() => setInterval(() => {}, 1000)));\n" });
  try {
    const started = Date.now();
    const r = spawnSync(process.execPath, [TEST_MJS, 'micro'], {
      encoding: 'utf8', timeout: 60_000, env: { ...cleanEnv(dir), GTAB_TIMEOUT_MS: '3000' },
    });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /still running after 3 s/);
    assert.ok(Date.now() - started < 30_000, 'the hang was not stopped by the time limit');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('test.cmd passes the exit code on: 1 when the micro suite is red, 0 when all is green', { skip: nested }, () => {
  const marker = path.join(os.tmpdir(), `gtab-mark-${process.pid}-c`);
  const red = tree({ 'micro/a.test.mjs': FAIL, 'macro/b.test.mjs': MARK(marker) });
  const green = tree({ 'micro/a.test.mjs': PASS, 'macro/b.test.mjs': PASS });
  try {
    const r = runTestCmd(red);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.ok(!fs.existsSync(marker), 'the macro suite ran after a red micro suite');
    const g = runTestCmd(green);
    assert.equal(g.status, 0, g.stdout + g.stderr);
    assert.equal(runTestCmd(red, [path.join(red, 'micro', 'a.test.mjs')]).status, 1);
  } finally {
    fs.rmSync(red, { recursive: true, force: true });
    fs.rmSync(green, { recursive: true, force: true });
    fs.rmSync(marker, { force: true });
  }
});
