// Journey 2: turning covering off and on from the real toolbar menu (step 4), in the installed
// Firefox with the real extension. The icon is clicked for real, and the menu is driven with
// real key presses (a test cannot reach inside the menu's process; see tests/support/toolbar.mjs),
// so what is checked is what the menu does: the page, the icon, and other sites.
//
// The rules proven here, each a decision of 2026-11-18:
// - the icon shows how many covers the page has, and "off" while covering is off;
// - "On this site" and "Everywhere" stop covering for real: every cover goes and the page works
//   as if the add-on were not there, read live, without a reload; on again covers again;
// - "this site" is the site the person is on: a player embedded from another site follows it;
// - while Everywhere is off, the "On this site" row is hidden (the first key reaches Everywhere);
// - the whole-page cover goes with the switch and gives the tab its title back, and a "Show
//   anyway" is kept through off and on.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useFirefox, EXTENSION_DIR } from '../support/browser-test.mjs';
import { ADDON_PREFS, openMenu, menuKeys, waitForBadge, iconState } from '../support/toolbar.mjs';

const session = useFirefox({ extensionDir: EXTENSION_DIR, prefs: ADDON_PREFS, systemAccess: true });

async function open(host, file) {
  const { firefox, fixtures } = session;
  await firefox.navigate(fixtures.url(host, `/${file}`));
  await firefox.waitForPage('the extension to finish its first look', "return document.documentElement.getAttribute('data-gta-blocker') === 'ready'");
}
const covered = () => session.firefox.evaluate("return [...document.querySelectorAll('[data-gta-cover]')].map((e) => e.id).sort()");
const waitCovered = (ids) => session.firefox.waitForPage(`covers on ${JSON.stringify(ids)}`,
  `const now = [...document.querySelectorAll('[data-gta-cover]')].map((e) => e.id).sort(); return JSON.stringify(now) === arguments[0] ? now : false;`.replace('arguments[0]', JSON.stringify(JSON.stringify(ids))));
const ALL = ['v-gta', 'v-online', 'v-vice'];

// Every switch test starts from covering on everywhere: it puts back what it turned off.
async function toggle(keys) {
  await openMenu(session.firefox);
  await menuKeys(session.firefox, [...keys]);
  await menuKeys(session.firefox, ['Escape']);
}

test('the icon shows how many covers the page has', async () => {
  await open('switch.test', 'index.html');
  assert.deepEqual(await covered(), ALL);
  await waitForBadge(session.firefox, '3');
});

test('"On this site" off: every cover goes, the page works again, the icon says off; on covers again', async () => {
  const { firefox } = session;
  await open('switch.test', 'index.html');
  await toggle(['Tab', 'Space']); // the first control: On this site
  await waitCovered([]);
  await waitForBadge(firefox, 'off');
  // The page hears a click on what was covered: nothing of the add-on is left in the way.
  const [x, y] = await firefox.evaluate("const r = document.getElementById('v-gta-link').getBoundingClientRect(); return [r.left + 20, r.top + 20];");
  await firefox.clickAt(x, y);
  assert.deepEqual(await firefox.evaluate('return window.__clicks'), ['v-gta-link']);
  // Read live: a reload is not needed, and another site is not affected.
  await open('other.test', 'index.html');
  assert.deepEqual(await covered(), ['o-gta']);
  await open('switch.test', 'index.html');
  assert.deepEqual(await covered(), [], 'still off after a reload: the switch is kept');
  await toggle(['Tab', 'Space']);
  await waitCovered(ALL);
  await waitForBadge(firefox, '3');
});

test('"Everywhere" off: no site is covered and the site row is hidden; on again covers again', async () => {
  const { firefox } = session;
  await open('switch.test', 'index.html');
  await toggle(['Tab', 'Tab', 'Space']); // On this site, then Everywhere
  await waitCovered([]);
  await waitForBadge(firefox, 'off');
  await open('other.test', 'index.html');
  assert.deepEqual(await covered(), []);
  // The site row is hidden while Everywhere is off: the first key reaches Everywhere.
  await toggle(['Tab', 'Space']);
  await waitCovered(['o-gta']);
  await open('switch.test', 'index.html');
  assert.deepEqual(await covered(), ALL);
});

test('a player embedded from another site follows the switch of the site the person is on', async () => {
  const { firefox } = session;
  await open('switch.test', 'with-frame.html');
  // The frame's covers, once its first look is done (`want`: wait until they are exactly that).
  const frameCovered = async (want) => {
    const frame = await firefox.marionette.send('WebDriver:FindElement', { using: 'css selector', value: '#player' });
    await firefox.marionette.send('WebDriver:SwitchToFrame', { element: Object.values(frame.value ?? frame)[0] });
    try {
      return await firefox.waitForPage(`the frame's covers to be ${JSON.stringify(want)}`,
        `const now = [...document.querySelectorAll('[data-gta-cover]')].map((e) => e.id); return document.documentElement.getAttribute('data-gta-blocker') === 'ready' && JSON.stringify(now) === ${JSON.stringify(JSON.stringify(want))} && now;`);
    } finally {
      await firefox.marionette.send('WebDriver:SwitchToParentFrame');
    }
  };
  await frameCovered(['f-gta']);
  await waitForBadge(firefox, '1');
  await toggle(['Tab', 'Space']); // On this site: switch.test
  // Live, without a reload: the frame is from other.test, but the person is on switch.test.
  await frameCovered([]);
  await waitForBadge(firefox, 'off');
  // Only switch.test went off: other.test, on its own, is still covered (so it was not Everywhere).
  await open('other.test', 'index.html');
  assert.deepEqual(await covered(), ['o-gta']);
  await open('switch.test', 'with-frame.html');
  await frameCovered([]);
  await toggle(['Tab', 'Space']);
  await frameCovered(['f-gta']);
});

test('the whole-page cover goes with the switch and gives the tab its own title back; Show anyway is kept', async () => {
  const { firefox } = session;
  const PAGE = "return [...document.documentElement.children].some((e) => e.localName.startsWith('gta-blocker-page'))";
  await open('cover.test', 'about-gta.html');
  assert.equal(await firefox.evaluate('return document.title'), 'Hidden page');
  await toggle(['Tab', 'Space']);
  await firefox.waitForPage('the whole-page cover to go', `return !(() => { ${PAGE} })()`);
  assert.equal(await firefox.evaluate('return document.title'), 'GTA 6 trailer 3: everything we spotted - a video site');
  await toggle(['Tab', 'Space']);
  await firefox.waitForPage('the whole-page cover to come back', `return (() => { ${PAGE} })()`);
  // Show anyway (the cover's button has the focus), then off and on: it stays shown.
  await firefox.press('Enter');
  await firefox.waitForPage('the page to be shown', `return !(() => { ${PAGE} })()`);
  await toggle(['Tab', 'Space']);
  await waitForBadge(firefox, 'off');
  await toggle(['Tab', 'Space']);
  // Covering really runs again (a GTA line added now is covered), and still no whole-page cover.
  await firefox.evaluate("const p = document.createElement('p'); p.id = 'p-new'; p.textContent = 'GTA 6 leak'; document.body.append(p);");
  await firefox.waitForPage('the new line covered', "return document.getElementById('p-new').hasAttribute('data-gta-cover')");
  assert.equal(await firefox.evaluate(PAGE), false, 'Show anyway is for this visit, switch or not');
  assert.ok(await iconState(firefox));
});
