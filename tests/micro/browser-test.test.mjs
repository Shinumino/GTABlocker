// useFirefox (tests/support/browser-test.mjs): the fixture server is closed even when quitting
// Firefox throws. An open server keeps the test process alive, so without this the gate hangs
// instead of going red (found in review, 2026-11-18). Runs alone:
//   node --test tests/micro/browser-test.test.mjs
//
// The test file below runs under plain node --test, without --test-force-exit, which would
// hide the hang: the point is that the stop itself is right.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SUPPORT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'support', 'browser-test.mjs');

test('the fixture server is closed even when quitting Firefox throws', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtab-usefx-'));
  const file = path.join(dir, 'quit-throws.test.mjs');
  fs.writeFileSync(file, [
    `import { test } from 'node:test';`,
    `import { useFirefox } from ${JSON.stringify(pathToFileURL(SUPPORT).href)};`,
    `// A fake Firefox whose quit fails, the way the leak detector fails it.`,
    `useFirefox({ start: async () => ({ quit: async () => { throw new Error('Firefox still running (fake)'); } }) });`,
    `test('a test', () => {});`,
  ].join('\n'));
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  try {
    const started = Date.now();
    const r = spawnSync(process.execPath, ['--test', file], { encoding: 'utf8', timeout: 20_000, env });
    assert.notEqual(r.error?.code, 'ETIMEDOUT', 'the test process hung: the server was left open');
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout + r.stderr, /still running \(fake\)/);
    assert.ok(Date.now() - started < 15_000);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a test Firefox gets system access only when its test asks for it', () => {
  // System access lets the test drive Firefox's own interface; only the toolbar journeys need
  // it, and it is never the default (agreed 2026-11-18).
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtab-usefx-'));
  const file = path.join(dir, 'options.test.mjs');
  fs.writeFileSync(file, [
    `import { test } from 'node:test';`,
    `import { useFirefox } from ${JSON.stringify(pathToFileURL(SUPPORT).href)};`,
    `const seen = [];`,
    `const start = async (options) => { seen.push(options); return { quit: async () => {} }; };`,
    `const startServer = async () => ({ close: async () => {} });`,
    `useFirefox({ start, startServer, prefs: { a: 1 } });`,
    `useFirefox({ start, startServer, systemAccess: true });`,
    `test('a test', () => {});`,
    `process.on('exit', () => console.log('SEEN ' + JSON.stringify(seen)));`,
  ].join('\n'));
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  try {
    const r = spawnSync(process.execPath, ['--test', file], { encoding: 'utf8', timeout: 20_000, env });
    const seen = JSON.parse(/SEEN (.*)/.exec(r.stdout + r.stderr)[1]);
    assert.deepEqual(seen, [{ prefs: { a: 1 } }, { systemAccess: true }]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  // And startFirefox itself defaults to none, and sets the variable only under that option.
  const source = fs.readFileSync(path.join(path.dirname(SUPPORT), 'firefox.mjs'), 'utf8');
  assert.match(source, /systemAccess = false/);
  assert.equal(source.match(/MOZ_REMOTE_ALLOW_SYSTEM_ACCESS/g).length, 1, 'set in one place only: the spawn');
  assert.match(source, /systemAccess \? \{ MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: '1' \} : \{\}/);
});
