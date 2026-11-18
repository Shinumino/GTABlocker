// Which processes are a test Firefox, and stopping them. Runs alone:
//   node --test tests/micro/profile-processes.test.mjs
//
// The process tables here are made up, so these tests never look at or stop a real process.
// The one that matters most: the user's own Firefox is never picked, even when Windows has
// reused a process id the harness saw earlier.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  selectOurs, ProfileProcesses, stopAndRemove, removeProfile, assertHarnessProfile, sweepStaleProfiles, killExact,
} from '../support/firefox-process.mjs';
import { startFirefox } from '../support/firefox.mjs';

const ff = (pid, ppid, created) => ({ pid, ppid, created, name: 'firefox.exe' });
const table = (all, { named = [], lockHolders = [] } = {}) => ({ all, named, lockHolders });
const pids = (procs) => procs.map((p) => p.pid).sort((a, b) => a - b);

// The user's Firefox: started long before any test, with its own content processes.
const USER = [ff(500, 4, 1_000), ff(501, 500, 1_100), ff(502, 500, 1_200)];

test("the user's Firefox is never picked, only the test browser and its children", () => {
  const t = table([...USER, ff(900, 800, 5_000), ff(901, 900, 5_100), ff(902, 900, 5_200)], { named: [900] });
  assert.deepEqual(pids(selectOurs(t, new Map(), 6_000)), [900, 901, 902]);
});

test('whoever holds the profile lock is picked only when it is a firefox.exe', () => {
  const scanner = { pid: 700, ppid: 4, created: 5_500, name: 'antivirus.exe' };
  const t = table([...USER, ff(900, 1, 5_000), scanner], { lockHolders: [900, 700] });
  assert.deepEqual(pids(selectOurs(t, new Map(), 6_000)), [900]);
});

test('a reused process id is not ours: same id, different start time', () => {
  // We once saw 900 on the profile. Now 900 is a new process of the user's Firefox.
  const known = new Map([[900, { created: 5_000, goneSince: 5_500 }]]);
  const t = table([...USER, ff(900, 500, 7_000), ff(950, 900, 7_100)]);
  assert.deepEqual(selectOurs(t, known, 8_000), []);
});

test('a child is never picked when it is older than its parent (the parent id was reused)', () => {
  // 600 is an old process whose parent died long ago; its parent id 900 now belongs to our browser.
  const t = table([...USER, ff(600, 900, 2_000), ff(900, 1, 5_000)], { named: [900] });
  assert.deepEqual(pids(selectOurs(t, new Map(), 6_000)), [900]);
});

test('after a restart, the new browser is found through its parent even with a bare command line and no lock yet', () => {
  // 900 (ours) restarted: it started 960 and exited. 960 names nothing and holds nothing yet.
  const known = new Map([[900, { created: 5_000, goneSince: null }]]);
  const t = table([...USER, ff(960, 900, 6_000), ff(961, 960, 6_100)]);
  assert.deepEqual(pids(selectOurs(t, known, 6_500)), [960, 961]);
});

test('a process born after our parent was seen gone is not its child', () => {
  // 900 was seen gone at 5_500; 970 claims 900 as parent but started at 7_000, so its real
  // parent was a later owner of id 900 that has gone too.
  const known = new Map([[900, { created: 5_000, goneSince: 5_500 }]]);
  const t = table([...USER, ff(970, 900, 7_000)]);
  assert.deepEqual(selectOurs(t, known, 8_000), []);
});

test('a child of a dead parent whose id is now held by someone else must be older than that holder', () => {
  const known = new Map([[900, { created: 5_000, goneSince: null }]]);
  // 900 is now held by a process of the user's (started 6_500): 980 started after it, so 980 is its child.
  const t = table([...USER, ff(900, 500, 6_500), ff(980, 900, 6_600), ff(960, 900, 6_000)]);
  assert.deepEqual(pids(selectOurs(t, known, 7_000)), [960]);
});

test('the tracker remembers what it saw, so a restarted browser is still found on the next look', () => {
  let now = 5_000;
  const looks = [
    table([...USER, ff(900, 1, 4_000)], { named: [900] }),
    table([...USER, ff(960, 900, 5_600)]),
  ];
  const tracker = new ProfileProcesses(fakeProfile(), { readTable: () => looks.shift(), clock: () => now });
  assert.deepEqual(pids(tracker.current()), [900]);
  now = 6_000;
  assert.deepEqual(pids(tracker.current()), [960]);
});

test('a profile folder that is not a harness profile is refused before anything runs', () => {
  for (const dir of [
    'C:\\Users\\x\\AppData\\Roaming\\Mozilla\\Firefox\\Profiles\\ab12cd.default-release',
    path.join(os.tmpdir(), 'gtablocker-ff-'),
    path.join(os.tmpdir(), 'gtablocker-ff-abc'),
    path.join(os.tmpdir(), 'gtablocker-ff-abcdef', '..', 'x'),
  ]) {
    assert.throws(() => assertHarnessProfile(dir), /not a harness profile/, dir);
  }
  assert.throws(() => new ProfileProcesses('C:\\Users\\x\\Profiles\\ab12cd.default'), /not a harness profile/);
});

test('stopping fails loudly and keeps the profile when a process will not die', async () => {
  const dir = makeProfileDir();
  try {
    const stuck = [ff(900, 1, 5_000)];
    const killed = [];
    const tracker = { current: () => stuck };
    await assert.rejects(
      stopAndRemove(dir, tracker, { kill: (procs) => killed.push(...pids(procs)), pollMs: 1, killWaitMs: 5, settleMs: 1 }),
      /still running/,
    );
    assert.ok(killed.length > 0, 'it never tried to stop the process');
    assert.ok(fs.existsSync(dir), 'the profile was deleted while Firefox still had it');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('stopping kills what is left, checks once more, then deletes the profile', async () => {
  const dir = makeProfileDir();
  let alive = [ff(900, 1, 5_000)];
  const killed = [];
  const tracker = { current: () => alive };
  await stopAndRemove(dir, tracker, {
    kill: (procs) => { killed.push(...pids(procs)); alive = []; }, pollMs: 1, killWaitMs: 5, settleMs: 1,
  });
  assert.deepEqual(killed, [900]);
  assert.equal(fs.existsSync(dir), false);
});

test('a browser that appears during the final check is stopped too (the restart gap)', async () => {
  const dir = makeProfileDir();
  const looks = [[], [ff(960, 1, 6_000)]];
  const killed = [];
  let afterKill = false;
  const tracker = { current: () => (afterKill ? [] : looks.length ? looks.shift() : []) };
  await stopAndRemove(dir, tracker, {
    kill: (procs) => { killed.push(...pids(procs)); afterKill = true; }, pollMs: 1, killWaitMs: 5, settleMs: 1,
  });
  assert.deepEqual(killed, [960]);
  assert.equal(fs.existsSync(dir), false);
});

test('deleting a profile that something still holds fails loudly', async () => {
  const dir = makeProfileDir();
  // Windows refuses to delete a folder that is another process's working folder.
  const holder = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 20000)'], { cwd: dir, stdio: 'ignore' });
  try {
    await new Promise((r) => setTimeout(r, 300));
    await assert.rejects(removeProfile(dir, { attempts: 2, waitMs: 10 }), /could not delete/);
  } finally {
    holder.kill();
    await new Promise((r) => holder.on('exit', r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('deleting refuses a folder that is not a harness profile', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'not-ours-'));
  try {
    await assert.rejects(removeProfile(dir), /not a harness profile/);
    assert.ok(fs.existsSync(dir));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('profiles left by a test run that died are swept; one still in use is not', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gtab-sweep-'));
  try {
    const live = path.join(tmp, 'gtablocker-ff-Live01');
    const dead = path.join(tmp, 'gtablocker-ff-Dead01');
    fs.mkdirSync(live);
    fs.mkdirSync(dead);
    fs.writeFileSync(path.join(live, 'harness-owner.json'), JSON.stringify({ pid: 300, created: 3_000 }));
    fs.writeFileSync(path.join(dead, 'harness-owner.json'), JSON.stringify({ pid: 301, created: 3_100 }));
    // 300 (the live owner) is still running; 301 is gone, and its Firefox 910 is still up.
    const procs = [...USER, { pid: 300, ppid: 1, created: 3_000, name: 'node.exe' }, ff(910, 1, 4_000)];
    const readTable = (dir) => table(procs, { named: dir === dead ? [910] : [] });
    const killed = [];
    const swept = await sweepStaleProfiles({
      tmp, readTable, kill: (p) => { killed.push(...pids(p)); procs.splice(procs.findIndex((x) => x.pid === 910), 1); },
      pollMs: 1, killWaitMs: 5, settleMs: 1,
    });
    assert.deepEqual(swept, ['gtablocker-ff-Dead01']);
    assert.deepEqual(killed, [910]);
    assert.ok(fs.existsSync(live), 'a profile still in use was swept');
    assert.equal(fs.existsSync(dead), false, 'the dead run\'s profile was kept');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('killing touches only the exact process: same id and same start time', () => {
  // 900 is still ours; 901's id now belongs to a newer process; 902 has gone.
  const killedPids = [];
  killExact([ff(900, 1, 5_000), ff(901, 900, 5_100), ff(902, 900, 5_200)], {
    readAll: () => [...USER, ff(900, 1, 5_000), ff(901, 500, 9_000)],
    taskkill: (pid) => killedPids.push(pid),
  });
  assert.deepEqual(killedPids, [900]);
});

test('a Firefox that cannot be started leaves no profile behind', async () => {
  // Its own folder for the profile, so another test file working in %TEMP% cannot race it.
  const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gtab-profiles-'));
  try {
    await assert.rejects(startFirefox({ firefoxBin: path.join(os.tmpdir(), 'no-such-firefox.exe'), profileRoot }), /could not start/);
    assert.deepEqual(fs.readdirSync(profileRoot), []);
  } finally {
    fs.rmSync(profileRoot, { recursive: true, force: true });
  }
});

function makeProfileDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gtablocker-ff-'));
}

function fakeProfile() {
  return path.join(os.tmpdir(), 'gtablocker-ff-Fake01');
}
