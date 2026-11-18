// What a macro test file calls instead of starting Firefox itself: one line registers both the
// start and the stop with node:test, so no test file can forget to stop its browser or its
// fixture server ("a property the caller has to remember to apply is a property that will one
// day not be applied"). The server is closed even when quitting Firefox throws, because an
// open server keeps the test process alive and the gate would hang instead of going red.

import { before, after } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFirefox } from './firefox.mjs';
import { startFixtureServer } from './fixtures.mjs';

export const EXTENSION_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'extension');

// Returns an object whose `firefox` and `fixtures` are filled in before the first test runs.
// `start` and `startServer` are seams for the harness's own tests only.
export function useFirefox({ extensionDir, prefs, start = startFirefox, startServer = startFixtureServer } = {}) {
  const session = { firefox: null, fixtures: null };
  before(async () => {
    session.fixtures = await startServer();
    session.firefox = await start({ prefs });
    if (extensionDir) await session.firefox.installExtension(extensionDir);
  });
  after(async () => {
    try {
      await session.firefox?.quit();
    } finally {
      await session.fixtures?.close();
    }
  });
  return session;
}
