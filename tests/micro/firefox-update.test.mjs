// No test Firefox is ever started while the installed Firefox has an update waiting. Runs alone:
//   node --test tests/micro/firefox-update.test.mjs
//
// What happened (2026-11-18): Firefox runs its updater at launch, before it reads any setting,
// so the first test Firefox of this project installed a waiting update (160.0 to 160.0.1) into
// C:\Program Files\Mozilla Firefox while the user's own Firefox was open on the old version,
// then restarted itself. "app.update.disabledForTesting" in the test profile cannot stop that.
// The only safe answer is not to start Firefox at all until the user's Firefox has installed it.
//
// Every test here uses made-up update folders and a Firefox path that does not exist, so even a
// red run of this file starts no Firefox.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { waitingUpdates } from '../../tools/firefox_update.mjs';
import { startFirefox } from '../support/firefox.mjs';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'tools', 'check_firefox_update.mjs');
const NO_FIREFOX = path.join(os.tmpdir(), 'no-such-firefox.exe');

// Lays out Firefox's two update folders the way Windows has them, with the given status files:
// C:\ProgramData\Mozilla-<id>\updates\<hash>\updates\0\update.status, and the older
// %LOCALAPPDATA%\Mozilla\updates\<hash>\updates\0\update.status.
function fakeRoots(statuses) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtab-upd-'));
  const programData = path.join(dir, 'ProgramData');
  const localAppData = path.join(dir, 'LocalAppData');
  statuses.forEach(([where, status], i) => {
    const base = where === 'programdata'
      ? path.join(programData, 'Mozilla-1de4eec8-1241-4177-a864-e594e8d1fb38', 'updates', `HASH${i}`)
      : path.join(localAppData, 'Mozilla', 'updates', `HASH${i}`);
    const folder = path.join(base, 'updates', '0');
    fs.mkdirSync(folder, { recursive: true });
    if (status !== null) fs.writeFileSync(path.join(folder, 'update.status'), status);
  });
  return { dir, roots: { programData, localAppData } };
}

test('a waiting update is found in either update folder, in every waiting state', () => {
  for (const status of ['pending', 'pending-service', 'pending-elevate', 'applied', 'applied-service', 'applying']) {
    for (const where of ['programdata', 'localappdata']) {
      const { dir, roots } = fakeRoots([[where, `${status}\n`]]);
      try {
        assert.equal(waitingUpdates(roots).length, 1, `${status} in ${where}`);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  }
});

test('a finished or failed update, or none at all, is not waiting', () => {
  const { dir, roots } = fakeRoots([['programdata', 'succeeded'], ['programdata', 'failed: 58'], ['programdata', null], ['localappdata', '']]);
  try {
    assert.deepEqual(waitingUpdates(roots), []);
    assert.deepEqual(waitingUpdates({ programData: path.join(dir, 'missing'), localAppData: path.join(dir, 'missing') }), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the harness refuses to start Firefox while an update is waiting, and leaves no profile', async () => {
  const { dir, roots } = fakeRoots([['programdata', 'pending']]);
  // A folder of this test's own for the profile: another test file may make and remove
  // profiles in %TEMP% at the same moment (that race failed this test once in 12 runs).
  const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gtab-profiles-'));
  try {
    await assert.rejects(startFirefox({ firefoxBin: NO_FIREFOX, updateRoots: roots, profileRoot }), /update is waiting/);
    assert.deepEqual(fs.readdirSync(profileRoot), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(profileRoot, { recursive: true, force: true });
  }
});

test('the command run.cmd uses says what to do, and exits 1, while an update is waiting', () => {
  const { dir, roots } = fakeRoots([['localappdata', 'applied']]);
  try {
    const env = { ...process.env, GTAB_UPDATE_PROGRAMDATA: roots.programData, GTAB_UPDATE_LOCALAPPDATA: roots.localAppData };
    const r = spawnSync(process.execPath, [CLI], { encoding: 'utf8', env });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /Restart your own Firefox/);
    const clean = fakeRoots([['programdata', 'succeeded']]);
    try {
      const ok = spawnSync(process.execPath, [CLI], {
        encoding: 'utf8', env: { ...process.env, GTAB_UPDATE_PROGRAMDATA: clean.roots.programData, GTAB_UPDATE_LOCALAPPDATA: clean.roots.localAppData },
      });
      assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    } finally {
      fs.rmSync(clean.dir, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
