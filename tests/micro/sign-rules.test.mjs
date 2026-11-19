// tools/sign_rules.mjs, the signing command's rules (step 7): what it refuses before anything is
// sent, the gate before the upload, and the keys kept out of sight. Everything outside is faked
// here; tests/micro/sign-run.test.mjs runs the real seams against a throwaway project and a fake
// web-ext. This file never imports tools/sign.mjs: that one always runs. Runs alone:
//   node --test tests/micro/sign-rules.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readKeyFile, compareVersions, highestSigned, signPlan, mask, childEnv, gateEnv, keysReport, sign, SIGN_ARGS } from '../../tools/sign_rules.mjs';

// Built at run time: a key-shaped string must never be in a file (the repo check reads this one).
const ISSUER = ['user', '1234567', '890'].join(':');
const SECRET = 'test-secret-' + 'abcdef0123456789'.repeat(3);
const ENV_TEXT = `WEB_EXT_API_KEY=${ISSUER}\r\nWEB_EXT_API_SECRET=${SECRET}\r\n`;
const CLEAN = Object.freeze({ clean: true, changes: [], tree: 't1' });

// A run with every seam faked; `calls` records what was started, in order.
function fakeRun({ keyText = ENV_TEXT, version = '0.1.0', signedBefore = [], made = ['gta_blocker-0.1.0.xpi'], folder = CLEAN, folderAfter = CLEAN, versionAfter = null,
  gate = 0, webExt = { code: 0, lines: ['Your add-on has been signed'] }, stray = [], mode = 'sign' } = {}) {
  const calls = [];
  const lines = [];
  let listed = 0;
  let folderReads = 0;
  let versionReads = 0;
  const run = sign({
    log: (line) => lines.push(line),
    keyFilePath: () => 'D:\\project\\.env',
    readKeyBytes: () => (keyText === null ? null : Buffer.from(keyText, 'utf8')),
    strayKeyFiles: () => stray,
    readVersion: () => (versionReads++ === 0 || versionAfter === null ? version : versionAfter),
    listSigned: () => (listed++ === 0 ? signedBefore : [...signedBefore, ...made]),
    artifactPath: (name) => `D:\\project\\web-ext-artifacts\\${name}`,
    folderState: () => (folderReads++ === 0 ? folder : folderAfter),
    runGate: async () => { calls.push('gate'); return gate; },
    runWebExt: async (args, env, onLine) => { calls.push({ args, env }); for (const l of webExt.lines) onLine(l); return webExt.code; },
  }, { mode });
  return { run, calls, lines, text: () => lines.join('\n') };
}

test('the key file: missing, UTF-16, a name twice, empty, or an issuer of the wrong shape are problems; never a value', () => {
  const cases = [
    [null, /no \.env/],
    [Buffer.from(ENV_TEXT, 'utf16le'), /UTF-16/],
    [`${ENV_TEXT}WEB_EXT_API_SECRET=another-secret-value-123\r\n`, /more than once/],
    [`WEB_EXT_API_KEY=${ISSUER}\r\nWEB_EXT_API_SECRET=\r\n`, /WEB_EXT_API_SECRET is missing or empty/],
    [`WEB_EXT_API_KEY=${SECRET}\r\nWEB_EXT_API_SECRET=${ISSUER}\r\n`, /swapped/],
  ];
  for (const [input, problem] of cases) {
    const r = readKeyFile(input === null ? null : Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8'));
    assert.match(r.problems.join('; '), problem);
    assert.ok(!r.problems.join(' ').includes(SECRET) && !r.problems.join(' ').includes(ISSUER), 'a value in a problem line');
  }
  assert.deepEqual(readKeyFile(Buffer.from(ENV_TEXT, 'utf8')), { keys: { WEB_EXT_API_KEY: ISSUER, WEB_EXT_API_SECRET: SECRET }, problems: [] });
});

test('without good keys nothing runs, and it says where the keys go (and finds Notepad\u{2019}s .env.txt)', async () => {
  for (const keyText of [null, '', `WEB_EXT_API_KEY=${ISSUER}\r\n`]) {
    const { run, calls, text } = fakeRun({ keyText, stray: ['.env.txt'] });
    assert.equal(await run, 1);
    assert.deepEqual(calls, []);
    assert.match(text(), /D:\\project\\\.env/);
    assert.match(text(), /docs\\secrets\.md/);
    assert.match(text(), /Found \.env\.txt/);
  }
});

test('versions: only a higher one than any signed is sent; the same one says install it, with the next number', async () => {
  assert.equal(compareVersions('0.10.0', '0.9.0'), 1);
  assert.equal(compareVersions('1.0', '1.0.0'), 0);
  assert.equal(highestSigned(['gta_blocker-0.1.0.xpi', 'gta_blocker-0.2.0.xpi', 'notes.txt', 'x.zip']), '0.2.0');
  assert.equal(highestSigned([]), null);
  const same = fakeRun({ signedBefore: ['gta_blocker-0.1.0.xpi'] });
  assert.equal(await same.run, 1);
  assert.deepEqual(same.calls, []);
  assert.match(same.text(), /Install that file/);
  assert.match(same.text(), /0\.1\.0 to 0\.1\.1/);
  const lower = fakeRun({ version: '0.0.9', signedBefore: ['gta_blocker-0.1.0.xpi'] });
  assert.equal(await lower.run, 1);
  assert.match(lower.text(), /lower than 0\.1\.0/);
  // "1.0" is higher than "0.1.0", though "gta_blocker-0.1.0.xpi" contains "1.0.xpi".
  const higher = fakeRun({ version: '1.0', signedBefore: ['gta_blocker-0.1.0.xpi'], made: ['gta_blocker-1.0.xpi'] });
  assert.equal(await higher.run, 0);
});

test('only the extension folder exactly as committed is sent', async () => {
  const dirty = fakeRun({ folder: { clean: false, changes: ['extension/lib/page.js', 'extension/notes.txt'], tree: 't1' } });
  assert.equal(await dirty.run, 1);
  assert.deepEqual(dirty.calls, []);
  assert.match(dirty.text(), /extension\/lib\/page\.js, extension\/notes\.txt/);
  assert.match(dirty.text(), /only committed code is signed/);
});

test('a failed check sends nothing, and says what to do next', async () => {
  const { run, calls, text } = fakeRun({ gate: 1 });
  assert.equal(await run, 1);
  assert.deepEqual(calls, ['gate']);
  assert.match(text(), /nothing was sent to Mozilla/);
  assert.match(text(), /run sign\.cmd again/);
});

test('a folder that changes while the check runs sends nothing (a new commit, an edit, a new version)', async () => {
  for (const change of [{ folderAfter: { clean: true, changes: [], tree: 't2' } }, { folderAfter: { clean: false, changes: ['extension/x.js'], tree: 't1' } }, { versionAfter: '0.2.0' }]) {
    const { run, calls, text } = fakeRun(change);
    assert.equal(await run, 1, JSON.stringify(change));
    assert.deepEqual(calls, ['gate']);
    assert.match(text(), /changed while the check ran/);
  }
});

test('web-ext is asked, after the check, for an unlisted signature with no config file read', async () => {
  const { run, calls, text } = fakeRun();
  assert.equal(await run, 0);
  assert.equal(calls[0], 'gate');
  assert.deepEqual(calls[1].args, [...SIGN_ARGS]);
  assert.ok(SIGN_ARGS.includes('--channel=unlisted') && SIGN_ARGS.includes('--no-config-discovery'));
  assert.match(text(), /keep this window open/);
});

test('the keys reach web-ext only through its environment, and are masked in every line it prints, every time', async () => {
  const { run, calls, text } = fakeRun({ webExt: { code: 0, lines: [`using ${ISSUER} and ${SECRET}, again ${SECRET}`, 'Your add-on has been signed'] } });
  assert.equal(await run, 0);
  const { args, env } = calls[1];
  assert.deepEqual(env, { WEB_EXT_API_KEY: ISSUER, WEB_EXT_API_SECRET: SECRET });
  for (const arg of args) assert.ok(!arg.includes(ISSUER) && !arg.includes(SECRET), arg);
  assert.ok(!text().includes(SECRET) && !text().includes(ISSUER), 'a key was printed');
  assert.match(text(), /using \*\*\* and \*\*\*, again \*\*\*/);
});

test('the new signed file is named in full, and an older one is not', async () => {
  const { run, text } = fakeRun({ version: '0.2.0', signedBefore: ['gta_blocker-0.1.0.xpi'], made: ['gta_blocker-0.2.0.xpi'] });
  assert.equal(await run, 0);
  assert.match(text(), /Signed: D:\\project\\web-ext-artifacts\\gta_blocker-0\.2\.0\.xpi/);
  assert.ok(!/Signed: .*0\.1\.0/.test(text()), 'the old file was named as signed');
  assert.match(text(), /Install Add-on From File\.\.\./);
});

test('web-ext saying yes with no new file is not a success; a failure keeps its code and says how to recover', async () => {
  const none = fakeRun({ made: [] });
  assert.equal(await none.run, 1);
  assert.match(none.text(), /no new signed file/);
  const failed = fakeRun({ webExt: { code: 2, lines: ['Error: 401 Unauthorized'] }, made: ['gta_blocker-0.1.0.xpi'] });
  assert.equal(await failed.run, 2);
  assert.match(failed.text(), /exit code 2/);
  assert.match(failed.text(), /401/);
  assert.match(failed.text(), /may be incomplete: delete/, 'a file a broken download left');
  assert.match(failed.text(), /Mozilla may already have version 0\.1\.0/);
  assert.ok(!/Nothing was installed/.test(failed.text()));
});

test('sign.cmd --keys says what is wrong with .env and never shows a value', async () => {
  const good = fakeRun({ mode: 'keys' });
  assert.equal(await good.run, 0);
  assert.match(good.text(), /WEB_EXT_API_KEY: present/);
  assert.match(good.text(), /look right/);
  assert.deepEqual(good.calls, []);
  const bad = fakeRun({ mode: 'keys', keyText: `WEB_EXT_API_KEY=${SECRET}\r\n`, stray: ['.env.txt'] });
  assert.equal(await bad.run, 1);
  assert.match(bad.text(), /WEB_EXT_API_SECRET: missing/);
  assert.match(bad.text(), /Found \.env\.txt/);
  for (const r of [good, bad]) assert.ok(!r.text().includes(SECRET) && !r.text().includes(ISSUER), 'a value was shown');
  assert.equal(keysReport({ keyFile: { keys: {}, problems: [] }, strayFiles: [] }).ok, true);
});

test('web-ext gets only what it needs from the environment; the check gets no keys and no test redirect', () => {
  const base = { Path: 'C:\\Windows', SystemRoot: 'C:\\Windows', TEMP: 'C:\\t', WEB_EXT_AMO_BASE_URL: 'https://elsewhere.test', WEB_EXT_UPLOAD_SOURCE_CODE: 'x', NODE_OPTIONS: '--require x', HTTPS_PROXY: 'http://p', GTAB_EXTENSION_DIR: 'C:\\other', WEB_EXT_API_SECRET: 'old' };
  assert.deepEqual(childEnv(base, { WEB_EXT_API_KEY: ISSUER, WEB_EXT_API_SECRET: SECRET }),
    { Path: 'C:\\Windows', SystemRoot: 'C:\\Windows', TEMP: 'C:\\t', WEB_EXT_API_KEY: ISSUER, WEB_EXT_API_SECRET: SECRET });
  assert.deepEqual(gateEnv(base), { Path: 'C:\\Windows', SystemRoot: 'C:\\Windows', TEMP: 'C:\\t', NODE_OPTIONS: '--require x', HTTPS_PROXY: 'http://p' });
});

test('masking replaces every occurrence of every value, and an empty value masks nothing', () => {
  assert.equal(mask(`a ${SECRET} b ${SECRET} c ${ISSUER}`, [SECRET, ISSUER]), 'a *** b *** c ***');
  assert.equal(mask('nothing secret', [SECRET, '']), 'nothing secret');
});

test('the plan on its own: the refusals come in the order keys, version, folder', () => {
  const keyFile = readKeyFile(Buffer.from(ENV_TEXT, 'utf8'));
  const noKeys = readKeyFile(null);
  const dirty = { clean: false, changes: ['x'], tree: 't' };
  assert.equal(signPlan({ keyFile: noKeys, version: '0.1.0', signed: ['g-0.1.0.xpi'], folder: dirty }).kind, 'keys');
  assert.equal(signPlan({ keyFile, version: '0.1.0', signed: ['g-0.1.0.xpi'], folder: dirty }).kind, 'version');
  assert.equal(signPlan({ keyFile, version: '0.2.0', signed: ['g-0.1.0.xpi'], folder: dirty }).kind, 'folder');
  assert.equal(signPlan({ keyFile, version: '0.2.0', signed: ['g-0.1.0.xpi'], folder: CLEAN }).ok, true);
});
