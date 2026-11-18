// Whether the installed Firefox has an update waiting to be installed.
//
// Why this matters (2026-11-18): Firefox runs its updater at launch, before it reads any
// setting, so a test Firefox started from C:\Program Files\Mozilla Firefox installs a waiting
// update there, under the user's own open Firefox. That is how this project's first test run
// moved the user's Firefox from 160.0 to 160.0.1 without asking (Firefox's update log:
// "UpdaterInvocation::First" at the test's start time). A pref in the test profile cannot stop
// it, so the harness and run.cmd refuse to start Firefox while an update waits.
//
// Firefox keeps the state in update.status under one of two folders:
//   C:\ProgramData\Mozilla-<id>\updates\<install hash>\updates\0\update.status   (current)
//   %LOCALAPPDATA%\Mozilla\updates\<install hash>\updates\0\update.status        (older)
// Every install found is checked, not only this one: there is one Firefox on this machine, and
// a wrong "waiting" costs one restart, where a wrong "nothing waiting" changes the user's browser.

import fs from 'node:fs';
import path from 'node:path';

// States in which the next launch would install something.
const WAITING = /^(pending|pending-service|pending-elevate|applied|applied-service|applying)\b/;

export function defaultRoots(env = process.env) {
  return {
    programData: env.GTAB_UPDATE_PROGRAMDATA || env.ProgramData || 'C:\\ProgramData',
    localAppData: env.GTAB_UPDATE_LOCALAPPDATA || env.LOCALAPPDATA || '',
  };
}

function listDirs(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(dir, e.name));
  } catch {
    return [];
  }
}

// The update.status files that say an update is waiting.
export function waitingUpdates(roots = defaultRoots()) {
  const hashDirs = [
    ...listDirs(roots.programData).filter((d) => /^Mozilla-/.test(path.basename(d))).flatMap((d) => listDirs(path.join(d, 'updates'))),
    ...(roots.localAppData ? listDirs(path.join(roots.localAppData, 'Mozilla', 'updates')) : []),
  ];
  const waiting = [];
  for (const hashDir of hashDirs) {
    const status = path.join(hashDir, 'updates', '0', 'update.status');
    let text;
    try {
      text = fs.readFileSync(status, 'utf8').trim();
    } catch {
      continue;
    }
    if (WAITING.test(text)) waiting.push(status);
  }
  return waiting;
}

export const WAITING_MESSAGE = 'A Firefox update is waiting to be installed. Starting a test Firefox now '
  + 'would install it under your open Firefox. Restart your own Firefox once (it installs the update), '
  + 'then run this again.';

export function assertNoWaitingUpdate(roots) {
  const waiting = waitingUpdates(roots);
  if (waiting.length > 0) {
    const err = new Error(`${WAITING_MESSAGE} (update is waiting: ${waiting.join(', ')})`);
    err.code = 'GTAB_UPDATE_WAITING';
    throw err;
  }
}
