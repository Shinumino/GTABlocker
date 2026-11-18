// The harness must never leave a Firefox running on this machine. Found on the very first run
// (2026-11-18): the new profile made Firefox restart itself once. The restarted browser is not
// a child of the process we started and has a bare command line (the profile travels in its
// environment), so the harness, which only watched the first PID, thought Firefox had died and
// left the restarted one running; it had to be stopped by hand. Marionette's own restart
// command reproduces the same situation on demand.
//
// A process is named by its id AND its start time everywhere here: an id alone can be reused
// by Windows within seconds, and the user's Firefox starts new processes all day.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startFirefox } from '../support/firefox.mjs';
import { readAllProcesses, killExact } from '../support/firefox-process.mjs';

const same = (a) => (b) => a.pid === b.pid && a.created === b.created;

test('quit stops a Firefox that restarted itself and deletes its profile', async () => {
  const firefox = await startFirefox();
  const { profileDir } = firefox;
  const before = firefox.processes();
  let restarted = [];
  try {
    await firefox.marionette.send('Marionette:Quit', { flags: ['eForceQuit', 'eRestart'] });

    // Wait for the restarted browser: on the profile, and none of the processes from before.
    // Without this the test could pass by quitting before the restart happened.
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const now = firefox.processes();
      if (now.length > 0 && !now.some((p) => before.some(same(p)))) {
        restarted = now;
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.ok(restarted.length > 0, 'Firefox never came back under new processes');

    await firefox.quit();

    // Checked against the raw process table, not the harness's own idea of what is ours.
    const alive = readAllProcesses();
    assert.deepEqual(restarted.filter((p) => alive.some(same(p))), [], 'the restarted Firefox is still running');
    assert.equal(fs.existsSync(profileDir), false, 'the throwaway profile was not deleted');
  } finally {
    // Safety net so a red run cannot leak a browser either: only processes this test saw on
    // its own profile, and only if the same process (id and start time) is still there.
    killExact([...before, ...restarted]);
  }
});
