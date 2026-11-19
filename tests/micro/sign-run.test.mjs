// tools/sign_rules.mjs's real seams (step 7), end to end with no network: a throwaway git
// project in %TEMP% with its own fake keys, a fake web-ext and a fake check, both small node
// scripts. What the rules' own tests cannot see is proven here: the keys only in web-ext's
// environment, its output masked as it streams, only the allowed environment passed on, and
// only committed code sent (review, step 7: all of it rested on code no test ran). Never the
// project's real .env: everything here lives in the throwaway folder. Runs alone:
//   node --test tests/micro/sign-run.test.mjs

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { sign, realSeams } from '../../tools/sign_rules.mjs';

// Built at run time: a key-shaped string must never be in a file (the repo check reads this one).
const ISSUER = ['user', '7654321', '98'].join(':');
const SECRET = 'run-secret-' + '0123456789abcdef'.repeat(3);

// The fake web-ext: prints its arguments, which of the names it was given, the secret itself
// twice (so masking shows), then a line 300 ms later (so streaming shows); writes the signed
// file and, like the real one, the upload id into the source folder; exits with fake-exit.
const FAKE_WEB_EXT = `
import fs from 'node:fs';
const has = (n) => (process.env[n] ? 'yes' : 'no');
console.log('argv ' + JSON.stringify(process.argv.slice(2)));
console.log('env key ' + has('WEB_EXT_API_KEY') + ' secret ' + has('WEB_EXT_API_SECRET') + ' amo ' + has('WEB_EXT_AMO_BASE_URL') + ' node ' + has('NODE_OPTIONS') + ' gtab ' + has('GTAB_EXTENSION_DIR'));
console.log('echo ' + process.env.WEB_EXT_API_SECRET + ' and ' + process.env.WEB_EXT_API_SECRET);
await new Promise((r) => setTimeout(r, 300));
console.log('later');
const version = JSON.parse(fs.readFileSync('extension/manifest.json', 'utf8')).version;
fs.mkdirSync('web-ext-artifacts', { recursive: true });
fs.writeFileSync('web-ext-artifacts/gta_blocker-' + version + '.xpi', 'signed');
fs.writeFileSync('extension/.amo-upload-uuid', '{}');
process.exitCode = fs.existsSync('fake-exit') ? Number(fs.readFileSync('fake-exit', 'utf8')) : 0;
`;
// The fake check: says what it got, exits with gate-exit.
const FAKE_GATE = `
import fs from 'node:fs';
console.log('gate keys ' + (process.env.WEB_EXT_API_SECRET ? 'yes' : 'no') + ' gtab ' + (process.env.GTAB_EXTENSION_DIR ? 'yes' : 'no'));
process.exitCode = fs.existsSync('gate-exit') ? Number(fs.readFileSync('gate-exit', 'utf8')) : 0;
`;

let root;
const git = (...args) => {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
};
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'gtab-sign-'));
  fs.mkdirSync(path.join(root, 'extension'));
  fs.writeFileSync(path.join(root, 'extension', 'manifest.json'), JSON.stringify({ version: '0.1.0' }));
  fs.writeFileSync(path.join(root, '.gitignore'), '.env\nweb-ext-artifacts/\nextension/.amo-upload-uuid\nextension/*.secret\nfake-*\ngate-*\n');
  fs.writeFileSync(path.join(root, '.env'), `WEB_EXT_API_KEY=${ISSUER}\r\nWEB_EXT_API_SECRET=${SECRET}\r\n`);
  fs.writeFileSync(path.join(root, 'fake-web-ext.mjs'), FAKE_WEB_EXT);
  fs.writeFileSync(path.join(root, 'gate-check.mjs'), FAKE_GATE);
  git('init', '-q');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '.');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'start');
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function seams(extraEnv = {}) {
  const lines = [];
  const times = [];
  const s = realSeams({
    root,
    webExt: path.join(root, 'fake-web-ext.mjs'),
    gate: path.join(root, 'gate-check.mjs'),
    env: { ...process.env, WEB_EXT_AMO_BASE_URL: 'https://elsewhere.test', NODE_OPTIONS: '--no-warnings', GTAB_EXTENSION_DIR: root, ...extraEnv },
    log: (line) => { lines.push(line); times.push(Date.now()); },
  });
  return { s, lines, times, text: () => lines.join('\n') };
}

test('a whole run: keys only in the environment, every value masked, nothing else passed on, the file named', async () => {
  const { s, lines, times, text } = seams();
  assert.equal(await sign(s), 0, text());
  assert.ok(!text().includes(SECRET) && !text().includes(ISSUER), 'a key was printed');
  const argv = lines.find((l) => l.startsWith('argv '));
  assert.ok(argv && argv.includes('--channel=unlisted') && argv.includes('--no-config-discovery'), argv);
  assert.ok(!argv.includes('run-secret') && !argv.includes('7654321'), 'a key on the command line');
  assert.ok(lines.includes('env key yes secret yes amo no node no gtab no'), 'what web-ext got: ' + lines.find((l) => l.startsWith('env ')));
  assert.ok(lines.includes('echo *** and ***'), 'masked as it came');
  assert.match(text(), new RegExp('Signed: ' + path.join(root, 'web-ext-artifacts', 'gta_blocker-0.1.0.xpi').replace(/[\\.]/g, '\\$&')));
  // Streamed: the line printed 300 ms after the others was logged that much later.
  const echo = times[lines.indexOf('echo *** and ***')];
  const later = times[lines.indexOf('later')];
  assert.ok(later - echo >= 250, `logged ${later - echo} ms apart: held until the end`);
});

test('a failed check sends nothing, through the real child process', async () => {
  // The real check prints straight to the console: only its exit code comes back here. What it
  // is given (no keys, no test redirect) is proven by gateEnv's own test in sign-rules.
  fs.writeFileSync(path.join(root, 'gate-exit'), '1');
  const { s, text } = seams({ WEB_EXT_API_SECRET: 'leftover-in-the-environment' });
  assert.equal(await sign(s), 1);
  assert.match(text(), /nothing was sent to Mozilla/);
  assert.equal(fs.existsSync(path.join(root, 'web-ext-artifacts')), false, 'web-ext ran');
});

test('an uncommitted change, a new file, or an ignored file in the extension folder sends nothing', async () => {
  const cases = [
    () => fs.writeFileSync(path.join(root, 'extension', 'manifest.json'), JSON.stringify({ version: '0.1.0', name: 'changed' })),
    () => fs.writeFileSync(path.join(root, 'extension', 'new.js'), 'x'),
    () => fs.writeFileSync(path.join(root, 'extension', 'notes.secret'), 'x'), // ignored, but web-ext would pack it
  ];
  for (const make of cases) {
    git('checkout', '-q', '--', '.');
    for (const name of fs.readdirSync(path.join(root, 'extension'))) if (name !== 'manifest.json') fs.rmSync(path.join(root, 'extension', name));
    make();
    const { s, text } = seams();
    assert.equal(await sign(s), 1, text());
    assert.match(text(), /not exactly as committed/);
    assert.equal(fs.existsSync(path.join(root, 'web-ext-artifacts')), false, 'web-ext ran');
  }
});

test('the upload id web-ext leaves in the folder is no reason to refuse the next version', async () => {
  const first = seams();
  assert.equal(await sign(first.s), 0, first.text());
  assert.ok(fs.existsSync(path.join(root, 'extension', '.amo-upload-uuid')));
  fs.writeFileSync(path.join(root, 'extension', 'manifest.json'), JSON.stringify({ version: '0.2.0' }));
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-am', '0.2.0');
  const second = seams();
  assert.equal(await sign(second.s), 0, second.text());
  assert.match(second.text(), /gta_blocker-0\.2\.0\.xpi/);
});

test('a failed upload keeps its exit code, through the real child process', async () => {
  fs.writeFileSync(path.join(root, 'fake-exit'), '3');
  const { s, text } = seams();
  assert.equal(await sign(s), 3);
  assert.match(text(), /exit code 3/);
});

test('--keys reads the real file and shows no value', async () => {
  const { s, text } = seams();
  assert.equal(await sign(s, { mode: 'keys' }), 0);
  assert.match(text(), /WEB_EXT_API_KEY: present/);
  assert.ok(!text().includes(SECRET) && !text().includes(ISSUER));
  fs.writeFileSync(path.join(root, '.env.txt'), 'x');
  fs.rmSync(path.join(root, '.env'));
  const missing = seams();
  assert.equal(await sign(missing.s, { mode: 'keys' }), 1);
  assert.match(missing.text(), /Found \.env\.txt/);
});
