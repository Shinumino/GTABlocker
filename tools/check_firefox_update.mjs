// Exits 1, with what to do, when a Firefox update is waiting; run.cmd runs this before it starts
// Firefox. The reason is in firefox_update.mjs. Always runs its check when started (a guessed
// "am I the main script" test once let another check exit 0 having read nothing).
//
// GTAB_UPDATE_PROGRAMDATA and GTAB_UPDATE_LOCALAPPDATA point it at other folders, for its tests.

import { waitingUpdates, WAITING_MESSAGE, defaultRoots } from './firefox_update.mjs';

const waiting = waitingUpdates(defaultRoots());
if (waiting.length > 0) {
  console.error(WAITING_MESSAGE);
  for (const file of waiting) console.error(`  (${file})`);
  process.exit(1);
}
