// tools/repo_rules.mjs and tools/check_repo.mjs: nothing secret gets committed or signed.
// Runs alone:
//   node --test tests/micro/check-repo.test.mjs
//
// The fake keys are assembled at run time, so this file never contains a string that looks
// like a real key (the checker reads this file too).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findProblems, parseEnv, readSecrets, listRepoFiles, gatherFiles, isSecretFile } from '../../tools/repo_rules.mjs';

const CHECK_REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'tools', 'check_repo.mjs');
const fakeIssuer = ['user', '12345678', '901'].join(':');
const fakeSecret = 'f'.repeat(16) + '0123456789abcdef'.repeat(3);
const file = (p, text) => ({ path: p, bytes: Buffer.from(text, 'utf8') });

// No 8-character run of the secret, and not the key itself, may appear in any message.
function assertNothingLeaked(messages, ...secrets) {
  for (const message of messages) {
    for (const secret of secrets) {
      for (let i = 0; i + 8 <= secret.length; i++) {
        assert.ok(!message.includes(secret.slice(i, i + 8)), `a piece of a secret was printed: ${message}`);
      }
    }
  }
}

function tempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtab-check-'));
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
    return r;
  };
  git('init', '-q');
  return { dir, git, write: (p, text) => { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), text); } };
}

test('a clean set of files has no problems', () => {
  assert.deepEqual(findProblems([file('extension/content.js', 'ok'), file('.env.example', 'WEB_EXT_API_KEY=')], []), []);
});

test('any .env file is refused, except .env.example', () => {
  for (const p of ['.env', 'sub/.env', '.env.local', '.env.production', '.env (staged)']) {
    const problems = findProblems([file(p, 'X=1')], []);
    assert.equal(problems.length, 1, p);
    assert.match(problems[0], /\.env/);
  }
});

test('something shaped like a Mozilla add-ons API key is refused, in UTF-8 and UTF-16, and not printed', () => {
  for (const bytes of [Buffer.from(`key ${fakeIssuer} here`, 'utf8'), Buffer.from(`key ${fakeIssuer} here`, 'utf16le')]) {
    const problems = findProblems([{ path: 'notes.md', bytes }], []);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /notes\.md/);
    assert.match(problems[0], /API key/);
    assertNothingLeaked(problems, fakeIssuer);
  }
});

test('the real secret values are refused in UTF-8 and UTF-16, and no piece of them is printed', () => {
  const secrets = [['WEB_EXT_API_SECRET', fakeSecret]];
  const utf8 = findProblems([file('a.txt', `s=${fakeSecret}`)], secrets);
  const utf16 = findProblems([{ path: 'b.txt', bytes: Buffer.from(`s=${fakeSecret}`, 'utf16le') }], secrets);
  for (const problems of [utf8, utf16]) {
    assert.equal(problems.length, 1);
    assert.match(problems[0], /WEB_EXT_API_SECRET/);
    assertNothingLeaked(problems, fakeSecret);
  }
});

test('a file at an odd position in a bigger buffer does not crash the check', () => {
  // Node 24.19 dies on the spot (no message; heap corruption) decoding as UTF-16 a slice that starts
  // at an odd byte and has an odd length of a few KB. Staged copies are slices of git's one
  // output buffer, so this happened on the first check after the first commit (2026-11-18).
  const big = Buffer.alloc(3_051, 0x61);
  for (const bytes of [big.subarray(1, 3_050), big.subarray(1, 3_049), big.subarray(0, 3_049)]) {
    assert.deepEqual(findProblems([{ path: 'x.txt', bytes }], [['WEB_EXT_API_SECRET', fakeSecret]]), []);
  }
  const withKey = Buffer.concat([Buffer.from('x'), Buffer.from(`key ${fakeIssuer} `.repeat(200), 'utf16le'), Buffer.from('y')]);
  assert.equal(findProblems([{ path: 'k.txt', bytes: withKey.subarray(1, withKey.length) }], []).length, 1);
  // A UTF-16 key with nothing after it, at the start of the buffer and at an odd offset. It
  // ends in a single digit, so losing the last character would leave no key shape to find.
  const keyOnly = Buffer.from(['user', '12345678', '9'].join(':'), 'utf16le');
  const shifted = Buffer.concat([Buffer.from('z'), keyOnly]);
  assert.equal(findProblems([{ path: 'a.txt', bytes: keyOnly }], []).length, 1);
  assert.equal(findProblems([{ path: 'b.txt', bytes: shifted.subarray(1) }], []).length, 1);
});

test('a secret too short to be real is ignored, so an empty or placeholder value cannot match everything', () => {
  assert.deepEqual(findProblems([file('a.txt', 'abc')], [['WEB_EXT_API_SECRET', 'abc']]), []);
  assert.deepEqual(findProblems([file('a.txt', 'abc')], [['WEB_EXT_API_SECRET', '']]), []);
});

test('.env lines are read the way people write them', () => {
  assert.deepEqual(parseEnv([
    '# signing keys',
    'WEB_EXT_API_KEY="quoted-key-1234"',
    "export WEB_EXT_API_SECRET='exported-secret-1234'",
    'OTHER=ignored',
  ].join('\r\n')), [['WEB_EXT_API_KEY', 'quoted-key-1234'], ['WEB_EXT_API_SECRET', 'exported-secret-1234']]);
  assert.deepEqual(parseEnv('WEB_EXT_API_KEY=plain-key-1234 # the key from AMO'), [['WEB_EXT_API_KEY', 'plain-key-1234']]);
  assert.deepEqual(parseEnv('WEB_EXT_API_KEY="has # inside-1234"'), [['WEB_EXT_API_KEY', 'has # inside-1234']]);
  // A quoted value with a comment after it: the quotes were kept, and the repo check then
  // looked for the wrong value (security review, step 7).
  assert.deepEqual(parseEnv('WEB_EXT_API_SECRET="quoted-secret-1234" # from AMO'), [['WEB_EXT_API_SECRET', 'quoted-secret-1234']]);
  // An invisible character copied from a web page is not part of the key.
  assert.deepEqual(parseEnv('WEB_EXT_API_SECRET=zero\u{200B}width-1234\u{FEFF}'), [['WEB_EXT_API_SECRET', 'zerowidth-1234']]);
});

test('.env.example names the keys but may never hold one', () => {
  // With .env.example open in Notepad, "fill in the two values" read as "here": a key written
  // into it would be committed, and with no .env yet no value is known to look for (wording
  // and security review, step 7). Any value in it is refused, whatever it looks like.
  assert.deepEqual(findProblems([file('.env.example', '# comment\nWEB_EXT_API_KEY=\nWEB_EXT_API_SECRET=\n')], []), []);
  for (const text of [`WEB_EXT_API_SECRET=${fakeSecret}\n`, 'WEB_EXT_API_KEY=anything-at-all\n']) {
    const problems = findProblems([file('.env.example', text)], []);
    assert.equal(problems.length, 1, text.slice(0, 20));
    assert.match(problems[0], /\.env\.example holds a value/);
    assert.ok(!problems[0].includes(fakeSecret) && !problems[0].includes('anything-at-all'), 'the value was printed');
  }
});

test('one rule says which files hold the keys, for every copy of the project (the mutation pass too)', () => {
  // The mutation pass copied the whole project into %TEMP% for every break, .env included:
  // once the keys existed, a few hundred copies a run (security review, step 7).
  for (const name of ['.env', '.env.local', '.env.txt', '.ENV']) assert.equal(isSecretFile(name), true, name);
  for (const name of ['.env.example', 'env.js', 'environment.md', 'my.env.notes']) assert.equal(isSecretFile(name), false, name);
});

test('both the environment and .env are searched, so a stale variable cannot hide the real key', () => {
  const { dir } = tempRepo();
  try {
    fs.writeFileSync(path.join(dir, '.env'), 'WEB_EXT_API_SECRET=from-file-secret-1234\n');
    const secrets = readSecrets(dir, { WEB_EXT_API_SECRET: 'from-env-secret-99' });
    assert.deepEqual(secrets.map(([, v]) => v).sort(), ['from-env-secret-99', 'from-file-secret-1234']);
    assert.deepEqual(readSecrets(path.join(dir, 'missing'), {}), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the file list is what git would pick up: tracked and new files, not ignored ones', () => {
  const { dir, git, write } = tempRepo();
  try {
    write('.gitignore', 'ignored.txt\n');
    write('tracked.txt', 'x');
    write('new.txt', 'x');
    write('ignored.txt', 'x');
    git('add', 'tracked.txt');
    assert.deepEqual(listRepoFiles(dir).sort(), ['.gitignore', 'new.txt', 'tracked.txt']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('what is staged is checked too, even when the working copy no longer shows it', () => {
  const { dir, git, write } = tempRepo();
  try {
    // A key staged in notes.md, then removed from the working copy only: the commit would hold it.
    write('notes.md', `key ${fakeIssuer}\n`);
    git('add', 'notes.md');
    write('notes.md', 'clean now\n');
    // A .env force-added, then renamed to an ignored name: listed by git, gone from disk.
    write('.gitignore', '.env*\n');
    write('.env', 'WEB_EXT_API_KEY=staged-key-1234\n');
    git('add', '-f', '.env');
    fs.renameSync(path.join(dir, '.env'), path.join(dir, '.env.local'));
    const problems = findProblems(gatherFiles(dir), []);
    assert.ok(problems.some((p) => p.startsWith('notes.md (staged)') && /API key/.test(p)), problems.join('\n'));
    assert.ok(problems.some((p) => p.startsWith('.env (staged)')), problems.join('\n'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('every file under extension/ is checked, even one git ignores, because signing uploads them all', () => {
  const { dir, write } = tempRepo();
  try {
    write('.gitignore', 'extension/local.js\n');
    write('extension/local.js', `// ${fakeIssuer}\n`);
    const problems = findProblems(gatherFiles(dir), []);
    assert.ok(problems.some((p) => p.startsWith('extension/local.js') && /API key/.test(p)), problems.join('\n'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('outside a git repository the check fails instead of passing on an empty list', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtab-check-'));
  try {
    assert.throws(() => listRepoFiles(dir), /git/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the command fails on a staged .env and prints no piece of the key', () => {
  const { dir, git, write } = tempRepo();
  try {
    write('.env', `WEB_EXT_API_SECRET=${fakeSecret}\n`);
    git('add', '-f', '.env');
    const r = spawnSync(process.execPath, [CHECK_REPO, dir], { encoding: 'utf8', env: { ...process.env, WEB_EXT_API_SECRET: '' } });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /\.env/);
    assertNothingLeaked([r.stdout, r.stderr], fakeSecret);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the command says what to do when the folder is not a git repository', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtab-check-'));
  try {
    const r = spawnSync(process.execPath, [CHECK_REPO, dir], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /git init/);
    assert.doesNotMatch(r.stderr, /at .*check_repo/, 'it printed a stack trace');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the command passes on a clean repository', () => {
  const { dir, write } = tempRepo();
  try {
    write('a.txt', 'nothing secret\n');
    const r = spawnSync(process.execPath, [CHECK_REPO, dir], { encoding: 'utf8', env: { ...process.env, WEB_EXT_API_KEY: '', WEB_EXT_API_SECRET: '' } });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Repo check OK/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
