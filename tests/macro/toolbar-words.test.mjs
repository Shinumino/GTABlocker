// Journey 3: telling the add-on a cover is wrong, or that GTA slipped through, from the real
// toolbar menu, and seeing it in the settings page (step 4). The menu is driven with real keys
// (tests/support/toolbar.mjs); the settings page is a normal tab the test reads and clicks.
//
// The rules proven here, each a decision of 2026-11-18:
// - "Not about GTA" shows every cover of that word on this page again and saves a report;
//   its Undo covers them again and takes the report back;
// - a cover made by one of the person's own words says "a word from your list" on the page,
//   and its row offers "Remove from my list", which takes the word out (Undo puts it back);
// - "Report missed GTA" saves the page's address with what the person wrote;
// - reports live only in the settings page, newest first.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useFirefox, EXTENSION_DIR } from '../support/browser-test.mjs';
import { ADDON_PREFS, openMenu, menuKeys, waitForBadge, openSettings, backToTab } from '../support/toolbar.mjs';

const session = useFirefox({ extensionDir: EXTENSION_DIR, prefs: ADDON_PREFS, systemAccess: true });

async function open(host, file) {
  const { firefox, fixtures } = session;
  await firefox.navigate(fixtures.url(host, `/${file}`));
  await firefox.waitForPage('the extension to finish its first look', "return document.documentElement.getAttribute('data-gta-blocker') === 'ready'");
}
const waitCovered = (ids) => session.firefox.waitForPage(`covers on ${ids.join(', ') || 'nothing'}`,
  `const now = [...document.querySelectorAll('[data-gta-cover]')].map((e) => e.id).sort(); return JSON.stringify(now) === ${JSON.stringify(JSON.stringify(ids))} ? now : false;`);

// The reports as the settings page shows them: [[report, word or note, page], ...].
async function reports() {
  const { firefox } = session;
  const back = await openSettings(firefox);
  try {
    return await firefox.evaluate("return [...document.querySelectorAll('#reports-box tbody tr')].map((tr) => [...tr.querySelectorAll('td')].slice(1, 4).map((td) => td.textContent.trim()))");
  } finally {
    await backToTab(firefox, back);
  }
}

// Adds a word on the settings page, as a person types it.
async function addWord(word) {
  const { firefox } = session;
  const back = await openSettings(firefox);
  try {
    const input = await firefox.marionette.send('WebDriver:FindElement', { using: 'css selector', value: '#add-input' });
    const id = Object.values(input.value ?? input)[0];
    await firefox.marionette.send('WebDriver:ElementSendKeys', { id, text: `${word}\u{E007}` });
    await firefox.waitForPage('the word in the list', `return document.querySelector('.wlist').textContent.includes(${JSON.stringify(word)})`);
  } finally {
    await backToTab(firefox, back);
  }
}

test('"Not about GTA" shows that word\'s covers on this page and saves a report; Undo takes both back', async () => {
  const { firefox, fixtures } = session;
  await open('switch.test', 'index.html');
  await waitForBadge(firefox, '3');
  await openMenu(firefox);
  // Site, Everywhere, then the first word: gta* (two covers, listed first).
  await menuKeys(firefox, ['Tab', 'Tab', 'Tab', 'Space']);
  await waitCovered(['v-vice']);
  await waitForBadge(firefox, '1');
  // The focus went to that row's Undo: a second Space undoes, it does not hide another word.
  await menuKeys(firefox, ['Space']);
  await menuKeys(firefox, ['Escape']);
  await waitCovered(['v-gta', 'v-online', 'v-vice']);
  assert.deepEqual(await reports(), [], 'Undo took the report back');
  // Once more, and this time it stays.
  await openMenu(firefox);
  await menuKeys(firefox, ['Tab', 'Tab', 'Tab', 'Space']);
  await menuKeys(firefox, ['Escape']);
  await waitCovered(['v-vice']);
  assert.deepEqual(await reports(), [['Not about GTA', 'gta*', fixtures.url('switch.test', '/index.html')]]);
  // On this page only: a new visit covers them again.
  await open('switch.test', 'index.html');
  await waitCovered(['v-gta', 'v-online', 'v-vice']);
});

test('a cover from your own word never shows the word, and "Remove from my list" takes it out; Undo puts it back', async () => {
  const { firefox } = session;
  await addWord('cucumber');
  await open('switch.test', 'index.html');
  await waitCovered(['v-cat', 'v-gta', 'v-online', 'v-vice']);
  assert.equal(await firefox.evaluate("return document.getElementById('v-cat').getAttribute('data-gta-word')"), 'a word from your list');
  assert.equal(await firefox.evaluate("return document.documentElement.outerHTML.includes('cucumber</a>') && !document.querySelector('[data-gta-word=\"cucumber\"]')"), true);
  // The menu lists what the icon counts: wait until the icon has heard of all four.
  await waitForBadge(firefox, '4');
  await openMenu(firefox);
  // gta* (2), then cucumber and vice city (1 each, by name): cucumber is the second word.
  await menuKeys(firefox, ['Tab', 'Tab', 'Tab', 'Tab', 'Space']);
  await waitCovered(['v-gta', 'v-online', 'v-vice']);
  await menuKeys(firefox, ['Space']);
  await menuKeys(firefox, ['Escape']); // Undo
  await waitCovered(['v-cat', 'v-gta', 'v-online', 'v-vice']);
  await waitForBadge(firefox, '4');
  await openMenu(firefox);
  await menuKeys(firefox, ['Tab', 'Tab', 'Tab', 'Tab', 'Space']);
  await menuKeys(firefox, ['Escape']);
  await waitCovered(['v-gta', 'v-online', 'v-vice']);
  const back = await openSettings(firefox);
  try {
    assert.equal(await firefox.evaluate("return document.querySelector('.wlist').textContent.includes('cucumber')"), false);
  } finally {
    await backToTab(firefox, back);
  }
});

test('"Report missed GTA" saves the page\'s address with what you wrote', async () => {
  const { firefox, fixtures } = session;
  await open('other.test', 'index.html');
  await openMenu(firefox);
  // From the end of the menu: Settings, then Report missed GTA.
  await menuKeys(firefox, ['ShiftTab', 'ShiftTab', 'Space']);
  await menuKeys(firefox, [...'a GTA ad on the right', 'Enter']);
  await menuKeys(firefox, ['Escape']);
  const rows = await reports();
  assert.deepEqual(rows[0], ['Missed GTA', 'You wrote: "a GTA ad on the right"', fixtures.url('other.test', '/index.html')]);
});
