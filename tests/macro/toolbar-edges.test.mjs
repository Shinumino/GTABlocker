// Journey 5: the edges the step 4 reviews found, in the installed Firefox with the real
// extension: Back to a cached page, a click on a switch's knob,
// "Not about GTA" inside a frame and on the whole-page cover, the menu's Settings button, and
// content added after covering was turned off. Each was a bug or an untested rule (see
// docs/review-step4.md); each test here was seen failing on the code the reviewers had.
//
// The rules proven here, each a decision of 2026-11-18:
// - a page restored by Back shows its own count on the icon again;
// - a click anywhere on a switch, its knob included, switches it once;
// - "Not about GTA" reaches every frame of the tab, and lifts the whole-page cover too;
// - a Show anyway pressed on the button outlives the Undo of another word;
// - the menu's Settings button opens the settings page;
// - off is a real stop: content added after it is not covered, no attribute of ours is left;
// - and (the user's request, 2026-11-19) the menu shows the add-on's version, small, at the
//   bottom-right, on the row of its buttons.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { useFirefox, EXTENSION_DIR } from '../support/browser-test.mjs';
import { ADDON_PREFS, MENU_URL, SETTINGS_URL, openMenu, menuKeys, waitForBadge, openPage, openSettings, backToTab } from '../support/toolbar.mjs';

const session = useFirefox({ extensionDir: EXTENSION_DIR, prefs: ADDON_PREFS, systemAccess: true });
const value = (r) => r?.value ?? r;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(host, file) {
  const { firefox, fixtures } = session;
  await firefox.navigate(fixtures.url(host, `/${file}`));
  await firefox.waitForPage('the extension to finish its first look', "return document.documentElement.getAttribute('data-gta-blocker') === 'ready'");
}
const waitCovered = (ids) => session.firefox.waitForPage(`covers on ${ids.join(', ') || 'nothing'}`,
  `const now = [...document.querySelectorAll('[data-gta-cover]')].map((e) => e.id).sort(); return JSON.stringify(now) === ${JSON.stringify(JSON.stringify(ids))} ? now : false;`);
const HOSTS = "return [...document.documentElement.children].filter((e) => e.localName.startsWith('gta-blocker-page')).length";
const hosts = () => session.firefox.evaluate(HOSTS);
const SITE_TITLE = 'GTA 6 trailer 3: everything we spotted - a video site';

test('Back to a page from the back-forward cache shows its own count on the icon again', async () => {
  const { firefox } = session;
  await open('switch.test', 'index.html');
  await waitForBadge(firefox, '3');
  await open('other.test', 'index.html');
  await waitForBadge(firefox, '1');
  await firefox.marionette.send('WebDriver:Back');
  await firefox.waitForPage('the cached page', "return location.pathname === '/index.html' && location.hostname === 'switch.test'");
  await waitForBadge(firefox, '3');
});

test('a click on the knob of a switch switches it once', async () => {
  const { firefox } = session;
  await open('switch.test', 'index.html');
  // The menu page in a tab of its own: a test can click inside it there.
  const back = await openPage(firefox, MENU_URL);
  try {
    await firefox.waitForPage('the menu drawn', "return document.title === 'GTA Blocker menu'");
    const knob = Object.values(value(await firefox.marionette.send('WebDriver:FindElement', { using: 'css selector', value: '[data-act="all"] .knob' })))[0];
    await firefox.marionette.send('WebDriver:ElementClick', { id: knob });
    await firefox.waitForPage('Everywhere off', "return document.querySelector('[data-act=\"all\"]').getAttribute('aria-checked') === 'false'");
    await sleep(300);
    assert.equal(await firefox.evaluate("return document.querySelector('[data-act=\"all\"]').getAttribute('aria-checked')"), 'false', 'and it stays off');
    const again = Object.values(value(await firefox.marionette.send('WebDriver:FindElement', { using: 'css selector', value: '[data-act="all"] .knob' })))[0];
    await firefox.marionette.send('WebDriver:ElementClick', { id: again });
    await firefox.waitForPage('Everywhere on', "return document.querySelector('[data-act=\"all\"]').getAttribute('aria-checked') === 'true'");
  } finally {
    await backToTab(firefox, back);
  }
  await waitCovered(['v-gta', 'v-online', 'v-vice']);
});

test('"Not about GTA" reaches every frame of the tab; its Undo too', async () => {
  const { firefox } = session;
  await open('switch.test', 'with-frame.html');
  const inFrame = async (script) => {
    const frame = await firefox.marionette.send('WebDriver:FindElement', { using: 'css selector', value: '#player' });
    await firefox.marionette.send('WebDriver:SwitchToFrame', { element: Object.values(value(frame))[0] });
    try {
      return await firefox.waitForPage('the frame', script);
    } finally {
      await firefox.marionette.send('WebDriver:SwitchToParentFrame');
    }
  };
  await inFrame("return document.documentElement.getAttribute('data-gta-blocker') === 'ready' && document.querySelectorAll('[data-gta-cover]').length === 1");
  await waitForBadge(firefox, '1');
  await openMenu(firefox);
  await menuKeys(firefox, ['Tab', 'Tab', 'Tab', 'Space']); // site, Everywhere, gta* (the frame's)
  await inFrame("return document.querySelectorAll('[data-gta-cover]').length === 0");
  await menuKeys(firefox, ['Space']); // its Undo
  await menuKeys(firefox, ['Escape']);
  await inFrame("return document.querySelectorAll('[data-gta-cover]').length === 1");
});

test('"Not about GTA" on the word of a whole-page cover lifts it; Undo brings it back', async () => {
  const { firefox } = session;
  await open('cover.test', 'about-gta.html');
  assert.equal(await hosts(), 1);
  await waitForBadge(firefox, '1');
  await openMenu(firefox);
  await menuKeys(firefox, ['Tab', 'Tab', 'Tab', 'Space']); // gta*, the whole-page cover's word
  await firefox.waitForPage('the page shown', `return (() => { ${HOSTS} })() === 0 && document.title === ${JSON.stringify(SITE_TITLE)}`);
  await menuKeys(firefox, ['Space']); // Undo
  await menuKeys(firefox, ['Escape']);
  await firefox.waitForPage('the page covered again', `return (() => { ${HOSTS} })() === 1 && document.title === 'Hidden page'`);
});

test('a Show anyway pressed on the button outlives the Undo of "Not about GTA" on another word', async () => {
  const { firefox } = session;
  await open('cover.test', 'about-gta-vice.html');
  assert.equal(await hosts(), 1);
  await firefox.press('Enter'); // Show anyway
  await firefox.waitForPage('the page shown', `return (() => { ${HOSTS} })() === 0`);
  await waitCovered(['p-vice']);
  await waitForBadge(firefox, '1');
  await openMenu(firefox);
  await menuKeys(firefox, ['Tab', 'Tab', 'Tab', 'Space']); // vice city
  await waitCovered([]);
  await menuKeys(firefox, ['Space']); // Undo
  await menuKeys(firefox, ['Escape']);
  await waitCovered(['p-vice']);
  await sleep(300);
  assert.equal(await hosts(), 0, 'the Show anyway the person pressed still holds');
});

test("the menu's Settings button opens the settings page", async () => {
  const { firefox } = session;
  await open('switch.test', 'index.html');
  const known = value(await firefox.marionette.send('WebDriver:GetWindowHandles'));
  const here = value(await firefox.marionette.send('WebDriver:GetWindowHandle'));
  await openMenu(firefox);
  await menuKeys(firefox, ['ShiftTab', 'Enter']); // the last control: Settings
  let added;
  for (let i = 0; i < 50 && !added; i++) {
    added = value(await firefox.marionette.send('WebDriver:GetWindowHandles')).find((h) => !known.includes(h));
    if (!added) await sleep(100);
  }
  assert.ok(added, 'a tab opened');
  await firefox.marionette.send('WebDriver:SwitchToWindow', { handle: added });
  await firefox.waitForPage('the settings page', `return location.href === ${JSON.stringify(SETTINGS_URL)}`);
  await firefox.marionette.send('WebDriver:CloseWindow');
  await firefox.marionette.send('WebDriver:SwitchToWindow', { handle: here });
});

test("the menu shows the add-on's version, small, at the bottom-right on the row of its buttons", async () => {
  const { firefox } = session;
  const want = JSON.parse(fs.readFileSync(path.join(EXTENSION_DIR, 'manifest.json'), 'utf8')).version;
  await open('switch.test', 'index.html');
  const back = await openPage(firefox, MENU_URL);
  try {
    await firefox.waitForPage('the menu drawn', "return document.title === 'GTA Blocker menu' && document.querySelector('.pfoot')");
    // The menu in a tab is the popup's 340 px, but it has no "Report missed GTA" (its tab is an
    // add-on page). On a web page the row holds both buttons and the version, so the test puts
    // the button in as the menu draws it, and measures that row (test review, 0.1.2).
    const got = await firefox.evaluate(`
      const foot = document.querySelector('.pfoot');
      const ver = foot.querySelector('.ver');
      const button = foot.querySelector('[data-act="settings"]');
      if (!ver) return null;
      const report = document.createElement('button');
      report.type = 'button';
      report.className = 'btn';
      report.textContent = 'Report missed GTA';
      foot.insertBefore(report, foot.firstChild);
      const grey = document.createElement('span');
      grey.style.color = 'var(--muted)';
      foot.appendChild(grey);
      const muted = getComputedStyle(grey).color;
      grey.remove();
      const f = foot.getBoundingClientRect(), v = ver.getBoundingClientRect(), b = button.getBoundingClientRect(), r = report.getBoundingClientRect();
      return {
        text: ver.textContent, last: foot.lastElementChild === ver,
        right: Math.round(f.right - parseFloat(getComputedStyle(foot).paddingRight) - v.right),
        sameRow: v.top < b.bottom && v.bottom > b.top && v.top < r.bottom && v.bottom > r.top,
        smaller: parseFloat(getComputedStyle(ver).fontSize) < parseFloat(getComputedStyle(button).fontSize),
        grey: getComputedStyle(ver).color === muted,
      };`);
    assert.deepEqual(got, { text: want, last: true, right: 0, sameRow: true, smaller: true, grey: true });
  } finally {
    await backToTab(firefox, back);
  }
});

test('off is a real stop: content added after it is not covered, and nothing of ours is left on the page', async () => {
  const { firefox } = session;
  await open('switch.test', 'index.html');
  await waitCovered(['v-gta', 'v-online', 'v-vice']);
  await openMenu(firefox);
  await menuKeys(firefox, ['Tab', 'Space']);
  await menuKeys(firefox, ['Escape']);
  await waitCovered([]);
  await firefox.evaluate("const li = document.createElement('li'); li.id = 'v-new'; li.textContent = 'GTA 6 leak, all of it'; document.querySelector('ul').append(li);");
  await sleep(400);
  assert.deepEqual(await firefox.evaluate("return [...document.querySelectorAll('*')].filter((e) => [...e.attributes].some((a) => a.name.startsWith('data-gta-') && a.name !== 'data-gta-blocker')).map((e) => e.id)"), []);
  // The control: on again, and the new item is covered.
  await openMenu(firefox);
  await menuKeys(firefox, ['Tab', 'Space']);
  await menuKeys(firefox, ['Escape']);
  await waitCovered(['v-gta', 'v-new', 'v-online', 'v-vice']);
});

test('the icon says "off" when covering is turned off, also on a page with nothing covered', async () => {
  const { firefox } = session;
  await open('plain.test', 'index.html');
  await waitForBadge(firefox, '');
  await openMenu(firefox);
  await menuKeys(firefox, ['Tab', 'Space']);
  await menuKeys(firefox, ['Escape']);
  await waitForBadge(firefox, 'off');
  await openMenu(firefox);
  await menuKeys(firefox, ['Tab', 'Space']);
  await menuKeys(firefox, ['Escape']);
  await waitForBadge(firefox, '');
});

test('"Not about GTA" outlives a change of the word list on the same page', async () => {
  const { firefox } = session;
  await open('switch.test', 'index.html');
  await waitForBadge(firefox, '3');
  await openMenu(firefox);
  await menuKeys(firefox, ['Tab', 'Tab', 'Tab', 'Space']); // gta*
  await menuKeys(firefox, ['Escape']);
  await waitCovered(['v-vice']);
  // A word list change restarts covering on every open page: gta* must stay shown here.
  const back = await openSettings(firefox);
  try {
    const input = Object.values(value(await firefox.marionette.send('WebDriver:FindElement', { using: 'css selector', value: '#add-input' })))[0];
    await firefox.marionette.send('WebDriver:ElementSendKeys', { id: input, text: 'cucumber\u{E007}' });
    await firefox.waitForPage('the word added', "return document.getElementById('word-msg').textContent === 'Added \"cucumber\".'");
  } finally {
    await backToTab(firefox, back);
  }
  await waitCovered(['v-cat', 'v-vice']);
  await sleep(300);
  assert.deepEqual(await firefox.evaluate("return [...document.querySelectorAll('[data-gta-cover]')].map((e) => e.id).sort()"), ['v-cat', 'v-vice']);
});
