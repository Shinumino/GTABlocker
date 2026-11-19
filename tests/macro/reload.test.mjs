// Journey 6: a removed, reloaded or updated add-on (step 4 review), in the installed Firefox
// with the real extension. Firefox stops the old copy's code at once and it cleans nothing
// (checked 2026-11-18); the next copy runs in the open tab. Its own file: removing the add-on
// makes Firefox forget the fixed address the test profile gives it, which the other journeys
// need. Seen failing on the code the reviewers had.
//
// The rule proven here, the user's choice of 2026-11-18: the next copy clears what an earlier
// one left (its whole-page cover with a dead button, the tab title, its covers), and covers
// the page itself. And a video the earlier copy held gets its own sound setting back (review,
// 2026-11-19: YouTube reuses one video for every Short, and it stayed muted for good).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useFirefox, EXTENSION_DIR } from '../support/browser-test.mjs';
import { ADDON_ID, ADDON_PREFS, openMenu, menuKeys, waitForBadge } from '../support/toolbar.mjs';

// Autoplay is allowed so that the Short's video really plays here (see youtube-shorts.test.mjs).
const session = useFirefox({ extensionDir: EXTENSION_DIR, prefs: { ...ADDON_PREFS, 'media.autoplay.default': 0, 'media.autoplay.blocking_policy': 0 }, systemAccess: true });
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

async function reinstall() {
  const { firefox } = session;
  await firefox.marionette.send('Addon:Uninstall', { id: ADDON_ID });
  await sleep(1000);
  await firefox.evaluate("document.documentElement.removeAttribute('data-gta-blocker')");
  await firefox.installExtension(EXTENSION_DIR);
  await firefox.waitForPage('the new copy to finish its first look', "return document.documentElement.getAttribute('data-gta-blocker') === 'ready'", { timeoutMs: 10_000 });
}

test('a removed and reinstalled add-on leaves no dead whole-page cover: the next copy cleans up and covers the page itself', async () => {
  const { firefox } = session;
  await open('cover.test', 'about-gta.html');
  assert.equal(await hosts(), 1);
  assert.equal(await firefox.evaluate('return document.title'), 'Hidden page');
  await reinstall();
  await firefox.waitForPage('one working whole-page cover', `return (() => { ${HOSTS} })() === 1 && document.title === 'Hidden page'`);
  // Its button works: it is the new copy's cover, not the dead one.
  await firefox.press('Enter');
  await firefox.waitForPage('the page shown', `return (() => { ${HOSTS} })() === 0`);
  assert.equal(await firefox.evaluate('return document.title'), SITE_TITLE, 'the tab has the site\u{2019}s own title back');
});

test('covers left by an earlier copy are taken over by the next one: the switch takes them all off', async () => {
  const { firefox } = session;
  await open('switch.test', 'index.html');
  await waitCovered(['v-gta', 'v-online', 'v-vice']);
  await reinstall();
  await waitCovered(['v-gta', 'v-online', 'v-vice']);
  await waitForBadge(firefox, '3');
  await openMenu(firefox);
  await menuKeys(firefox, ['Tab', 'Space']);
  await menuKeys(firefox, ['Escape']);
  await waitCovered([]);
  assert.equal(await firefox.evaluate("return document.querySelectorAll('[data-gta-word], [data-gta-within], [data-gta-title]').length"), 0);
  await openMenu(firefox);
  await menuKeys(firefox, ['Tab', 'Space']);
  await menuKeys(firefox, ['Escape']);
  await waitCovered(['v-gta', 'v-online', 'v-vice']);
});


test('a video the earlier copy held gets its own sound back: the next Short not about GTA plays with its sound', async () => {
  const { firefox } = session;
  await open('www.youtube.com', 'shorts/gta.html');
  await firefox.waitForPage('the player covered, its video muted', "return document.getElementById('player-container').hasAttribute('data-gta-cover') && document.getElementById('video').muted");
  await reinstall();
  await firefox.evaluate('window.__scroll("cat")');
  await firefox.waitForPage('the next Short playing with its sound', "const v = document.getElementById('video'); return !document.getElementById('player-container').hasAttribute('data-gta-cover') && !v.paused && !v.muted", { timeoutMs: 8000 });
});
