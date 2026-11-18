// Starts the installed Firefox, headless, in a throwaway profile, and drives pages through
// Marionette. The extension is loaded the way about:debugging loads it (a temporary add-on).
//
// Rules this file keeps:
// - The user's own Firefox is never touched: --no-remote plus a fresh profile keeps their open
//   windows out of it, and everything that stops or deletes goes through firefox-process.mjs,
//   which only ever acts on processes tied to our throwaway profile.
// - No hostname reaches the internet: network.dns.forceResolve sends every name to 127.0.0.1,
//   where the fixture server answers, so a test that names www.youtube.com gets our fake page
//   and a typo gets a 404 instead of the real site. (An address written as an IP number would
//   still go out; tests use hostnames only.)
// - marionette.port = 0 makes Firefox pick a free port and write it to MarionetteActivePort in
//   the profile, so two test files can never fight over a fixed port.

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Marionette } from './marionette.mjs';
import {
  PROFILE_PREFIX, ProfileProcesses, stopAndRemove, sweepStaleProfiles, writeOwner, removeProfile,
} from './firefox-process.mjs';

export const FIREFOX_BIN = process.env.FIREFOX_BIN || 'C:\\Program Files\\Mozilla Firefox\\firefox.exe';

// Prefs for the throwaway profile only (written to its user.js). The ones that change what a
// page sees are explained; the rest stop Firefox from phoning home or showing first-run screens.
const TEST_PREFS = {
  'marionette.port': 0,
  // Every hostname resolves to this machine (see the header). DNS-over-HTTPS is switched off as
  // a precaution; on this machine it is off anyway, so no test can show this pref matters.
  'network.dns.forceResolve': '127.0.0.1',
  'network.trr.mode': 5,
  'network.proxy.type': 0,
  // The fixture server speaks plain http. YouTube and Google are on the HSTS preload list, and
  // Firefox now tries https first, so without these a fake youtube page would never load.
  'network.stricttransportsecurity.preloadlist': false,
  'dom.security.https_first': false,
  'dom.security.https_first_pbm': false,
  'dom.security.https_only_mode': false,
  'browser.shell.checkDefaultBrowser': false,
  'browser.aboutwelcome.enabled': false,
  'browser.startup.homepage_override.mstone': 'ignore',
  'browser.startup.page': 0,
  'startup.homepage_welcome_url': 'about:blank',
  'datareporting.policy.dataSubmissionEnabled': false,
  'datareporting.healthreport.uploadEnabled': false,
  'toolkit.telemetry.enabled': false,
  'toolkit.telemetry.reportingpolicy.firstRun': false,
  'app.update.auto': false,
  'app.update.disabledForTesting': true,
  'app.normandy.enabled': false,
  'extensions.update.enabled': false,
  'extensions.getAddons.cache.enabled': false,
  'browser.safebrowsing.malware.enabled': false,
  'browser.safebrowsing.phishing.enabled': false,
  'browser.safebrowsing.downloads.enabled': false,
  'network.captive-portal-service.enabled': false,
  'network.connectivity-service.enabled': false,
  'services.settings.server': 'data:,#remote-settings-dummy/v1',
};

function userJs(prefs) {
  return Object.entries(prefs)
    .map(([name, value]) => `user_pref(${JSON.stringify(name)}, ${JSON.stringify(value)});`)
    .join('\n') + '\n';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(what, timeoutMs, probe) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await probe();
      if (value !== undefined && value !== null && value !== false) return value;
    } catch (err) {
      lastError = err;
    }
    await sleep(100);
  }
  throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}${lastError ? ` (${lastError.message})` : ''}`);
}

export async function startFirefox({ prefs = {}, firefoxBin = FIREFOX_BIN, startTimeoutMs = 30_000 } = {}) {
  // Profiles left by a run that died (Ctrl+C, a crash) are stopped and deleted first.
  const swept = await sweepStaleProfiles();
  if (swept.length > 0) console.warn(`removed ${swept.length} test profile(s) left by an earlier run: ${swept.join(', ')}`);

  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), PROFILE_PREFIX));
  let tracker;
  try {
    writeOwner(profileDir);
    await fs.writeFile(path.join(profileDir, 'user.js'), userJs({ ...TEST_PREFS, ...prefs }));
    tracker = new ProfileProcesses(profileDir);
  } catch (err) {
    await removeProfile(profileDir).catch(() => {});
    throw err;
  }
  const portFile = path.join(profileDir, 'MarionetteActivePort');

  // -wait-for-browser keeps the launcher alive for the first browser's life (Firefox on Windows
  // otherwise starts through a launcher process that exits at once). It does not cover a
  // restart, which is why "is it alive" below asks the tracker, not our child.
  const child = spawn(firefoxBin, [
    '--marionette', '--headless', '--no-remote', '-wait-for-browser', '--profile', profileDir,
  ], {
    stdio: 'ignore',
    windowsHide: true,
    // A crash would otherwise leave a report in the per-user Crash Reports folder, which the
    // user's own Firefox then offers to send.
    env: { ...process.env, MOZ_CRASHREPORTER_DISABLE: '1' },
  });
  let exited = false;
  let spawnError = null;
  const exitedPromise = new Promise((resolve) => child.on('exit', () => { exited = true; resolve(); }));
  child.on('error', (err) => { spawnError = err; exited = true; });

  let marionette;
  try {
    const deadline = Date.now() + startTimeoutMs;
    let lastError;
    let checkedAfterExit = 0;
    while (!marionette) {
      if (spawnError) throw new Error(`could not start ${firefoxBin}: ${spawnError.message}`);
      if (Date.now() >= deadline) {
        throw new Error(`Firefox did not accept a Marionette session within ${startTimeoutMs} ms`
          + (lastError ? ` (last: ${lastError.message})` : ''));
      }
      // The launcher going away is normal when Firefox restarts on a new profile; it is only a
      // death when nothing is on the profile any more. Checked every 2 s (a look costs ~0.5 s).
      if (exited && Date.now() - checkedAfterExit > 2_000) {
        checkedAfterExit = Date.now();
        if (tracker.current().length === 0) throw new Error('Firefox exited during start');
      }
      try {
        // Re-read every time: a restart rewrites the file with a new port.
        const port = Number((await fs.readFile(portFile, 'utf8')).trim());
        if (Number.isInteger(port) && port > 0) {
          const client = await Marionette.connect(port, { timeoutMs: 5_000 });
          try {
            await client.send('WebDriver:NewSession', { capabilities: { alwaysMatch: {} } }, { timeoutMs: 10_000 });
            marionette = client;
          } catch (err) {
            client.close();
            throw err;
          }
        }
      } catch (err) {
        lastError = err;
      }
      if (!marionette) await sleep(200);
    }
    // Learn the browser and its children now, so they stay known (as parents) if they restart.
    tracker.current();
  } catch (err) {
    marionette?.close();
    try {
      await stopAndRemove(profileDir, tracker);
    } catch (cleanupErr) {
      err.message += `; and cleanup failed: ${cleanupErr.message}`;
    }
    throw err;
  }

  return {
    marionette,
    profileDir,

    // The processes on our profile right now, each as { pid, created }.
    processes() {
      return tracker.current().map(({ pid, created }) => ({ pid, created }));
    },

    // Loads the extension as a temporary add-on, the same path about:debugging uses.
    async installExtension(dir) {
      return marionette.send('Addon:Install', { path: path.resolve(dir), temporary: true });
    },

    async navigate(url) {
      await marionette.send('WebDriver:Navigate', { url });
    },

    // Runs in the page. Returns the script's value.
    async evaluate(script, args = []) {
      const result = await marionette.send('WebDriver:ExecuteScript', { script, args });
      return result?.value;
    },

    // Polls a page expression until it is truthy; fails with what it last saw.
    async waitForPage(what, script, { timeoutMs = 5_000 } = {}) {
      let last;
      try {
        return await waitFor(what, timeoutMs, async () => {
          last = await this.evaluate(script);
          return last;
        });
      } catch (err) {
        err.message += `; last value: ${JSON.stringify(last)}`;
        throw err;
      }
    },

    // Asks Firefox to quit, then makes sure of it (see stopAndRemove). Throws on a leak.
    async quit() {
      let asked = false;
      try {
        await marionette.send('Marionette:Quit', { flags: ['eForceQuit'] }, { timeoutMs: 5_000 });
        asked = true;
      } catch {
        // Expected when the session is already gone (Firefox restarted or crashed). Nobody is
        // going to quit on their own then, so there is nothing to wait for.
      }
      marionette.close();
      // When it was asked, the launcher ends with the browser: waiting for that event is free,
      // where every look at the process list costs about half a second.
      if (asked && !exited) await Promise.race([exitedPromise, sleep(10_000)]);
      await stopAndRemove(profileDir, tracker, { graceMs: asked ? 2_000 : 0 });
    },
  };
}
