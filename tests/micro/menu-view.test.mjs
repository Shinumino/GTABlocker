// extension/pages/menu-view.js: what the toolbar menu shows, decided from the settings, the
// page's address and its covers, as the agreed preview has it (docs/design/menu-preview.html).
// The menu page only draws it; the macro tests drive the real menu. Runs alone:
//   node --test tests/micro/menu-view.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadExtensionScripts, plain } from '../support/extension-script.mjs';

const { GtaBlocker } = loadExtensionScripts({ files: ['lib/matcher.js', 'lib/settings.js', 'pages/menu-view.js'], globals: { URL } });
const { settings: S, menuView: V } = GtaBlocker;
const URL_YT = 'https://www.youtube.com/results?q=x';
const COVERS = [{ entry: 'gta*', n: 3 }, { entry: 'trevor philips', n: 1 }, { entry: 'vice city', n: 1 }];
const mine = S.addWord(S.read({}), 'trevor philips').settings;
const view = (over = {}) => plain(V.view({ settings: mine, url: URL_YT, covers: COVERS, done: {}, ...over }));

test('on: both switches on, the covers by word, a count, and the report button', () => {
  const v = view();
  assert.deepEqual(v.rows, [{ kind: 'site', on: true, label: 'On this site', sub: 'youtube.com' }, { kind: 'all', on: true, label: 'Everywhere', sub: 'Every site you visit' }]);
  assert.equal(v.state, null);
  assert.equal(v.count, '5 covered on this page');
  assert.deepEqual(v.groups.map((g) => [g.entry, g.n, g.own, g.action, g.done]), [
    ['gta*', 3, false, 'notgta', null], ['trevor philips', 1, true, 'remove', null], ['vice city', 1, false, 'notgta', null]]);
  assert.equal(v.hint, true);
  assert.equal(v.miss, true);
});

test('a word the person acted on stays in its row, marked, and no longer counts', () => {
  const v = view({ done: { 'gta*': 'shown', 'trevor philips': 'removed' } });
  assert.equal(v.count, '1 covered on this page');
  assert.deepEqual(v.groups.map((g) => g.done), ['shown', 'removed', null]);
  const all = view({ done: { 'gta*': 'shown', 'trevor philips': 'removed', 'vice city': 'shown' } });
  assert.equal(all.count, 'Nothing covered on this page now');
  assert.equal(all.hint, false, 'no hint once no row offers Not about GTA');
});

test('nothing covered here', () => {
  const v = view({ covers: [] });
  assert.equal(v.count, 'Nothing covered on this page.');
  assert.deepEqual(v.groups, []);
  assert.equal(v.hint, false);
  assert.equal(v.miss, true, 'missed GTA can still be reported');
});

test('off on this site: the site switch off, a plain sentence, no list and no report button', () => {
  const v = view({ settings: S.setSite(mine, 'youtube.com', false) });
  assert.deepEqual(v.rows.map((r) => [r.kind, r.on]), [['site', false], ['all', true]]);
  assert.equal(v.state, 'Off on youtube.com. Nothing is covered here until you turn it back on.');
  assert.equal(v.count, null);
  assert.deepEqual(v.groups, []);
  assert.equal(v.miss, false);
});

test('off everywhere: the site row is hidden until Everywhere is back on', () => {
  const v = view({ settings: S.setEverywhere(S.setSite(mine, 'youtube.com', false), false) });
  assert.deepEqual(v.rows.map((r) => [r.kind, r.on]), [['all', false]]);
  assert.equal(v.state, 'Off everywhere. Nothing is covered on any site until you turn it back on.');
  assert.equal(v.miss, false);
});

test('a page with no site address (a local file) is covered and listed; only Everywhere turns it off', () => {
  const v = view({ url: 'file:///C:/page.html' });
  assert.deepEqual(v.rows.map((r) => r.kind), ['all']);
  assert.equal(v.note, 'This page has no site address, so only Everywhere turns it off.');
  assert.equal(v.state, null);
  assert.equal(v.count, '5 covered on this page');
  assert.equal(v.groups.length, 3);
  assert.equal(v.miss, true);
});

test("Firefox's own pages are never covered, and the menu says so", () => {
  for (const url of ['about:addons', 'about:newtab', 'moz-extension://abc/pages/settings.html']) {
    const v = view({ url, covers: [] });
    assert.deepEqual(v.rows.map((r) => r.kind), ['all'], url);
    assert.equal(v.state, "Firefox's own pages are never covered.");
    assert.equal(v.miss, false);
  }
});

test('an empty word list covers nothing, and the menu says how to fix it', () => {
  const empty = S.read({ words: { added: [], removed: [...GtaBlocker.matcher.DEFAULT_ENTRIES] } });
  const v = view({ settings: empty, covers: [] });
  assert.equal(v.state, 'Your word list is empty, so nothing is covered. Add words in Settings.');
  assert.equal(v.miss, false);
});

test('rows stay in place, in the order first seen; a word acted on keeps its row after it leaves the page', () => {
  // A word shown again leaves the page's covers: its row, with its Undo, must stay (the row and
  // the focus on its Undo once vanished on the next redraw: macro test, 2026-11-18).
  let seen = [];
  ({ seen } = V.keep(seen, [{ entry: 'gta*', n: 3 }, { entry: 'vice city', n: 1 }], {}));
  let r = V.keep(seen, [{ entry: 'vice city', n: 1 }, { entry: 'leonida', n: 2 }], { 'gta*': 'shown' });
  assert.deepEqual(plain(r.covers), [{ entry: 'gta*', n: 3 }, { entry: 'vice city', n: 1 }, { entry: 'leonida', n: 2 }]);
  // A word gone from the page that the person did not act on is dropped.
  r = V.keep(r.seen, [{ entry: 'leonida', n: 2 }], {});
  assert.deepEqual(plain(r.covers), [{ entry: 'leonida', n: 2 }]);
});

test('with the built-in list only, no row offers to remove a word', () => {
  const v = view({ settings: S.read({}), covers: [{ entry: 'gta*', n: 1 }] });
  assert.deepEqual(v.groups.map((g) => g.action), ['notgta']);
});
