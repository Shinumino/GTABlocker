// Journey 4: the settings page (step 4), in the installed Firefox with the real extension,
// clicked and typed into as a person does, while a page stays open in the tab beside it. Each
// test starts from clean settings (fresh()), so none depends on another.
//
// The rules proven here, each a decision of 2026-11-18:
// - a refused word says why, in the matcher's own words, and what was typed stays;
// - an added word is first in the list, tagged as yours, and an open page covers it at once,
//   with "a word from your list" on the cover, the word itself nowhere in the page;
// - the bin removes a word at once, and its Undo puts back only that word; the open page
//   follows both;
// - Reset asks first, naming what goes; Escape keeps the list;
// - a site turned off from the menu is listed, and "Turn on" covers it again; while
//   Everywhere is off, the page says so;
// - a change made in the menu shows here at once, and clears messages it made untrue;
// - one report can be removed, the right one, with Undo; Clear all asks first.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { useFirefox, EXTENSION_DIR } from '../support/browser-test.mjs';
import { ADDON_PREFS, SETTINGS_URL, openMenu, menuKeys, openSettings, backToTab } from '../support/toolbar.mjs';

const session = useFirefox({ extensionDir: EXTENSION_DIR, prefs: ADDON_PREFS, systemAccess: true });
const value = (r) => r?.value ?? r;

async function open(host, file) {
  const { firefox, fixtures } = session;
  await firefox.navigate(fixtures.url(host, `/${file}`));
  await firefox.waitForPage('the extension to finish its first look', "return document.documentElement.getAttribute('data-gta-blocker') === 'ready'");
}
const waitCovered = (ids) => session.firefox.waitForPage(`covers on ${ids.join(', ') || 'nothing'}`,
  `const now = [...document.querySelectorAll('[data-gta-cover]')].map((e) => e.id).sort(); return JSON.stringify(now) === ${JSON.stringify(JSON.stringify(ids))} ? now : false;`);

async function find(selector) {
  return Object.values(value(await session.firefox.marionette.send('WebDriver:FindElement', { using: 'css selector', value: selector })))[0];
}
const click = async (selector) => session.firefox.marionette.send('WebDriver:ElementClick', { id: await find(selector) });
const type = async (selector, text) => session.firefox.marionette.send('WebDriver:ElementSendKeys', { id: await find(selector), text });
const text = (selector) => session.firefox.evaluate('const e = document.querySelector(arguments[0]); return e ? e.textContent.trim() : null;', [selector]);
const waitText = (selector, want) => session.firefox.waitForPage(`${selector} to read ${want}`,
  `const e = document.querySelector(${JSON.stringify(selector)}); return e && e.textContent.trim() === ${JSON.stringify(want)};`);
const words = () => session.firefox.evaluate("return [...document.querySelectorAll('.wlist .w')].map((e) => e.firstChild.textContent)");
const reportNotes = () => session.firefox.evaluate("return [...document.querySelectorAll('#reports-box tbody tr')].map((tr) => tr.children[2].textContent)");

// Runs `fn` on the settings page; the page under test stays open in the tab it came from.
async function inSettings(fn) {
  const back = await openSettings(session.firefox);
  try {
    return await fn(back);
  } finally {
    await backToTab(session.firefox, back);
  }
}
// Moves between the two open tabs without closing either.
const toTab = (handle) => session.firefox.marionette.send('WebDriver:SwitchToWindow', { handle });
const thisTab = async () => value(await session.firefox.marionette.send('WebDriver:GetWindowHandle'));

// Clean settings: the built-in words, no report, every site on (Everywhere is left on by every
// test that turns it off).
async function fresh() {
  const { firefox } = session;
  await inSettings(async () => {
    // Reset whenever the list is not exactly the built-in one (a count alone is not enough: one
    // word added and one removed is 17 too).
    await click('#reset');
    if (await firefox.evaluate("return document.getElementById('ask').open")) await click('#ask-yes');
    await firefox.waitForPage('the built-in list', "return document.getElementById('n-words').textContent === '(17 of 200)' && !document.querySelector('.wlist .tag.yours')");
    if (await firefox.evaluate("return Boolean(document.getElementById('clear'))")) {
      await click('#clear');
      await click('#ask-yes');
      await firefox.waitForPage('no reports', "return !document.querySelector('#reports-box tbody')");
    }
    while (await firefox.evaluate("return Boolean(document.querySelector('.sites button'))")) {
      await click('.sites button');
    }
  });
}

async function addWord(word) {
  await type('#add-input', `${word}\u{E007}`);
  await waitText('#word-msg', `Added "${word}".`);
}

test('own words that this version builds in (the user\u{2019}s "Rockstar", "jason", "Lucia") are listed once, as built-in, and a cover names them', async () => {
  // The user's own stored words after updating (test review, 0.1.2): every surface reads them
  // through settings.js read(), and none may list one twice or label its covers as the person's.
  const { firefox } = session;
  await fresh();
  await open('switch.test', 'index.html');
  await inSettings(async () => {
    await firefox.marionette.send('WebDriver:ExecuteAsyncScript', { script: "const done = arguments[arguments.length - 1]; browser.storage.local.set({ words: { added: ['Rockstar', 'jason', 'Lucia'], removed: [] } }).then(() => done(true));", args: [] });
    await firefox.navigate(SETTINGS_URL);
    await firefox.waitForPage('the settings page again', "return document.documentElement.hasAttribute('data-ready')");
    const rows = await firefox.evaluate("return [...document.querySelectorAll('.wlist li')].map((li) => [li.querySelector('.w').firstChild.textContent, li.querySelector('.tag').textContent])");
    for (const w of ['rockstar', 'jason', 'lucia']) assert.deepEqual(rows.filter(([word]) => word.toLowerCase() === w), [[w, 'built-in']], w);
    assert.equal(await text('#n-words'), '(17 of 200)');
  });
  await firefox.evaluate("const p = document.createElement('p'); p.id = 'x-jason'; p.textContent = 'Jason is back'; document.body.appendChild(p);");
  await firefox.waitForPage('the line covered, naming its word', "return document.getElementById('x-jason').getAttribute('data-gta-word') === 'jason'");
  await fresh();
});

// What browser.storage.local holds, read and written in the add-on's own settings tab (a web
// page cannot reach it). Inside inSettings.
const storedWords = async () => JSON.parse(value(await session.firefox.marionette.send('WebDriver:ExecuteAsyncScript', { script: "const done = arguments[arguments.length - 1]; browser.storage.local.get('words').then((w) => done(JSON.stringify(w.words ?? null)));", args: [] })));
const storeWords = (words) => session.firefox.marionette.send('WebDriver:ExecuteAsyncScript', { script: `const done = arguments[arguments.length - 1]; browser.storage.local.set({ words: ${JSON.stringify(words)} }).then(() => done(true));`, args: [] });

test('updated from an earlier version that kept "Rockstar", "jason", "Lucia" as own words: pages are covered, and the words are saved as built-in', async () => {
  // The user's own next update (0.1.2 over 0.1.1, 2026-11-20). After an update the background
  // reads and saves the words; read at a first install, the add-on never covered some pages,
  // so this proves the update itself covers pages. The earlier version here is this one with a
  // lower version number, installed over it first (not removed: Firefox would forget the
  // add-on's fixed address, which this file needs).
  const { firefox } = session;
  await fresh();
  const older = fs.mkdtempSync(path.join(os.tmpdir(), 'gtab-older-'));
  try {
    fs.cpSync(EXTENSION_DIR, older, { recursive: true });
    const manifest = JSON.parse(fs.readFileSync(path.join(older, 'manifest.json'), 'utf8'));
    fs.writeFileSync(path.join(older, 'manifest.json'), JSON.stringify({ ...manifest, version: '0.0.1' }, null, 2));
    await firefox.installExtension(older);
    await open('switch.test', 'index.html');
    await inSettings(() => storeWords({ added: ['Rockstar', 'jason', 'Lucia'], removed: [] }));
    await firefox.evaluate("document.documentElement.removeAttribute('data-gta-blocker')");
    await firefox.installExtension(EXTENSION_DIR);
    await firefox.waitForPage('the updated copy to finish its first look', "return document.documentElement.getAttribute('data-gta-blocker') === 'ready'", { timeoutMs: 10_000 });
    await waitCovered(['v-gta', 'v-online', 'v-vice']);
    let words = null;
    for (const end = Date.now() + 5000; Date.now() < end;) {
      words = await inSettings(storedWords);
      if (words && words.added.length === 0) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.deepEqual(words, { added: [], removed: [] }, 'the own words were not saved as built-in');
  } finally {
    fs.rmSync(older, { recursive: true, force: true });
  }
  await fresh();
});

test('a refused word says why and keeps what was typed; an added one is first, and an open page covers it at once', async () => {
  const { firefox } = session;
  await fresh();
  await open('switch.test', 'index.html');
  const inPage = await firefox.evaluate("return document.documentElement.outerHTML.split('cucumber').length - 1");
  await inSettings(async () => {
    await type('#add-input', 'ab\u{E007}');
    await waitText('#word-msg', 'Too short: use at least 3 letters or numbers.');
    assert.equal(await firefox.evaluate("return document.getElementById('add-input').value"), 'ab');
    await firefox.evaluate("document.getElementById('add-input').value = ''");
    await type('#add-input', 'VICE  city\u{E007}');
    await waitText('#word-msg', 'Already in the list as "vice city".');
    await firefox.evaluate("document.getElementById('add-input').value = ''");
    await addWord('cucumber');
    assert.equal((await words())[0], 'cucumber');
    assert.equal(await text('.wlist li:first-child .tag'), 'yours');
    assert.equal(await text('#n-words'), '(18 of 200)');
  });
  await waitCovered(['v-cat', 'v-gta', 'v-online', 'v-vice']);
  assert.equal(await firefox.evaluate("return document.getElementById('v-cat').getAttribute('data-gta-word')"), 'a word from your list');
  assert.equal(await firefox.evaluate("return document.documentElement.outerHTML.split('cucumber').length - 1"), inPage,
    'the word is nowhere in the page but where the site itself wrote it');
});

test('the bin removes a word at once and Undo puts back only that word; the open page follows both', async () => {
  const { firefox } = session;
  await fresh();
  await open('switch.test', 'index.html');
  const pageTab = await thisTab();
  const back = await openSettings(firefox);
  const settingsTab = await thisTab();
  try {
    await addWord('cucumber');
    await click('.wlist button[aria-label="Remove vice city"]');
    await waitText('#word-msg', 'Removed "vice city". Undo');
    await click('.wlist button[aria-label="Remove cucumber"]');
    await toTab(pageTab);
    await waitCovered(['v-gta', 'v-online']);
    await toTab(settingsTab);
    // The Undo on the screen is cucumber's: it puts back cucumber only, not vice city.
    await click('#word-msg .link-btn');
    await waitText('#word-msg', '"cucumber" is back.');
    const now = await words();
    assert.ok(now.includes('cucumber'));
    assert.ok(!now.includes('vice city'), 'the other removal stays');
    await toTab(pageTab);
    await waitCovered(['v-cat', 'v-gta', 'v-online']);
  } finally {
    await toTab(settingsTab);
    await backToTab(firefox, back);
  }
});

test('Reset asks first and names what goes; Escape keeps the list, "Reset the list" brings the built-in words back', async () => {
  const { firefox } = session;
  await fresh();
  await inSettings(async () => {
    await addWord('cucumber');
    await click('.wlist button[aria-label="Remove vice city"]');
    await waitText('#word-msg', 'Removed "vice city". Undo');
    await click('#reset');
    assert.equal(await firefox.evaluate("return document.getElementById('ask').open"), true);
    assert.equal(await text('#ask-p'), 'Your 1 own word goes ("cucumber"), and the 1 built-in word you removed comes back ("vice city").');
    assert.equal(await firefox.evaluate("return document.activeElement.id"), 'ask-no', 'the safe button has the focus');
    await firefox.press('Escape');
  });
  // Read again from what is stored: Escape changed nothing.
  await inSettings(async () => {
    assert.ok((await words()).includes('cucumber'));
    assert.equal(await text('#n-words'), '(17 of 200)');
    await click('#reset');
    await click('#ask-yes');
    await waitText('#n-words', '(17 of 200)');
    await waitText('#word-msg', 'Back to the built-in words.');
    assert.ok(!(await words()).includes('cucumber'));
  });
});

test('a site turned off from the menu is listed, and "Turn on" covers it again; the page says when Everywhere is off', async () => {
  const { firefox } = session;
  await fresh();
  await open('switch.test', 'index.html');
  await openMenu(firefox);
  await menuKeys(firefox, ['Tab', 'Space', 'Tab', 'Space']);
  await menuKeys(firefox, ['Escape']); // this site off, then Everywhere off
  await waitCovered([]);
  await inSettings(async () => {
    assert.equal(await text('#sites-box .msg.warn'), 'Off everywhere right now: nothing is covered on any site. Turn Everywhere back on in the toolbar menu.');
    assert.equal(await text('.sites li span'), 'switch.test');
    assert.equal(await firefox.evaluate("return document.querySelector('.sites li button').getAttribute('aria-label')"), 'Turn on switch.test');
    await click('.sites li button');
    await waitText('#site-msg', 'Covers come back on switch.test once Everywhere is on.');
  });
  await openMenu(firefox);
  await menuKeys(firefox, ['Tab', 'Space']);
  await menuKeys(firefox, ['Escape']); // Everywhere on (the site row is hidden while it is off)
  await waitCovered(['v-gta', 'v-online', 'v-vice']);
});

test('a change made in the menu shows in the open settings page at once, and clears a message it made untrue', async () => {
  const { firefox } = session;
  await fresh();
  await open('switch.test', 'index.html');
  const pageTab = await thisTab();
  await openMenu(firefox);
  await menuKeys(firefox, ['Tab', 'Space']);
  await menuKeys(firefox, ['Escape']);
  await waitCovered([]);
  const back = await openSettings(firefox);
  const settingsTab = await thisTab();
  try {
    await click('.sites li button');
    await waitText('#site-msg', 'Covers are back on switch.test.');
    await toTab(pageTab);
    await waitCovered(['v-gta', 'v-online', 'v-vice']);
    await openMenu(firefox);
    await menuKeys(firefox, ['Tab', 'Space']);
  await menuKeys(firefox, ['Escape']); // off again, from the menu
    await waitCovered([]);
    await toTab(settingsTab);
    await firefox.waitForPage('the site listed again', "return document.querySelector('.sites li span') && document.querySelector('.sites li span').textContent === 'switch.test'");
    assert.equal(await text('#site-msg'), '', 'the message that is no longer true is gone');
    await click('.sites li button');
  } finally {
    await toTab(settingsTab);
    await backToTab(firefox, back);
  }
});

test('one report can be removed, the right one, and put back where it was; Clear all asks first', async () => {
  const { firefox } = session;
  await fresh();
  await open('other.test', 'index.html');
  for (const note of ['the first', 'the second']) {
    await openMenu(firefox);
    await menuKeys(firefox, ['ShiftTab', 'ShiftTab', 'Space', ...note, 'Enter']);
  await menuKeys(firefox, ['Escape']);
  }
  await inSettings(async () => {
    assert.deepEqual(await reportNotes(), ['You wrote: "the second"', 'You wrote: "the first"']);
    const bins = await firefox.marionette.send('WebDriver:FindElements', { using: 'css selector', value: '#reports-box td.act button' });
    await firefox.marionette.send('WebDriver:ElementClick', { id: Object.values(value(bins)[1])[0] });
    await waitText('#rep-msg', 'Report removed. Undo');
    assert.deepEqual(await reportNotes(), ['You wrote: "the second"']);
    await click('#rep-msg .link-btn');
    await waitText('#rep-msg', 'The report is back.');
    assert.deepEqual(await reportNotes(), ['You wrote: "the second"', 'You wrote: "the first"']);
    await click('#clear');
    assert.equal(await text('#ask-p'), 'The 2 reports go for good. Copy them first if you still want to send them.');
    await click('#ask-no');
  });
  await inSettings(async () => {
    assert.equal((await reportNotes()).length, 2, '"Keep them" kept them (read again from what is stored)');
    await click('#clear');
    await click('#ask-yes');
    await firefox.waitForPage('no reports', "return !document.querySelector('#reports-box tbody')");
    assert.equal(await text('#reports-box .empty'), 'No reports yet. "Not about GTA" and "Report missed GTA" in the toolbar menu add them here.');
  });
  assert.ok(SETTINGS_URL.startsWith('moz-extension://'));
});
