// extension/lib/tabs.js: what the background keeps about each tab (its site, and the covers each
// of its frames reports), what the toolbar icon then shows, and which messages it accepts. Pure
// logic over a plain object that browser.storage.session holds, because an idle event page is
// unloaded and its memory with it. Runs alone:
//   node --test tests/micro/tabs-rules.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadExtensionScripts, plain } from '../support/extension-script.mjs';

const { GtaBlocker } = loadExtensionScripts({ files: ['lib/matcher.js', 'lib/settings.js', 'lib/tabs.js'], globals: { URL } });
const T = GtaBlocker.tabs;
const deepFreeze = (o) => { if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };

test("the top frame starts a tab afresh: a new page forgets the old page\'s covers", () => {
  let s = deepFreeze(T.hello({}, 7, 0, 'youtube.com'));
  s = deepFreeze(T.report(s, 7, 0, { 'gta*': 3 }));
  s = deepFreeze(T.report(s, 7, 4, { 'vice city': 1 }));
  assert.equal(T.total(s, 7), 4);
  s = T.hello(s, 7, 0, 'reddit.com');
  assert.equal(T.total(s, 7), 0);
  assert.equal(T.siteOf(s, 7), 'reddit.com');
});

test("a frame\'s hello does not reset the tab, and a frame learns the tab\'s site", () => {
  let s = T.report(T.hello({}, 7, 0, 'reddit.com'), 7, 0, { 'gta*': 2 });
  s = T.hello(s, 7, 3, 'youtube.com');
  assert.equal(T.total(s, 7), 2);
  assert.equal(T.siteOf(s, 7), 'reddit.com', 'a YouTube player inside Reddit follows Reddit');
  assert.equal(T.siteOf(s, 99), null);
});

test('covers by word add up across frames, most first', () => {
  let s = T.hello({}, 1, 0, 'x.test');
  s = T.report(s, 1, 0, { 'gta*': 2, 'vice city': 1 });
  s = T.report(s, 1, 5, { 'gta*': 1, 'trevor philips': 4 });
  assert.deepEqual(plain(T.byEntry(s, 1)), [{ entry: 'trevor philips', n: 4 }, { entry: 'gta*', n: 3 }, { entry: 'vice city', n: 1 }]);
  // A frame that reports again replaces what it said before; an empty report clears it.
  s = T.report(s, 1, 5, {});
  assert.deepEqual(plain(T.byEntry(s, 1)), [{ entry: 'gta*', n: 2 }, { entry: 'vice city', n: 1 }]);
});

test('a closed tab is forgotten', () => {
  const s = T.forget(T.report(T.hello({}, 1, 0, 'x.test'), 1, 0, { 'gta*': 1 }), 1);
  assert.equal(T.total(s, 1), 0);
  assert.deepEqual(plain(s), {});
});

test('what a page reports is capped: a hostile page decides what its content script sees', () => {
  const many = {};
  for (let i = 0; i < 500; i++) many[`w${i}`] = 5;
  let s = T.report(T.hello({}, 1, 0, 'x.test'), 1, 0, many);
  assert.equal(T.byEntry(s, 1).length, 200);
  s = T.report(s, 1, 0, { 'gta*': 1e9, ['x'.repeat(201)]: 2, bad: -3, nan: Number.NaN, str: '4', ['y'.repeat(200)]: 1 });
  const rows = plain(T.byEntry(s, 1));
  assert.deepEqual(rows, [{ entry: 'gta*', n: 10000 }, { entry: 'y'.repeat(200), n: 1 }], 'an own word may be 200 characters as written');
  for (let f = 1; f <= 80; f++) s = T.report(s, 1, f, { 'gta*': 1 });
  assert.equal(Object.keys(s['1'].frames).length, 64, 'frames per tab are capped at 64');
  // A frame already known can still change at the cap; a frame with no covers frees its slot.
  s = T.report(s, 1, 5, { 'gta*': 7 });
  assert.equal(s['1'].frames['5']['gta*'], 7);
  s = T.report(s, 1, 6, {});
  assert.equal(Object.keys(s['1'].frames).length, 63);
  s = T.report(s, 1, 99, { 'gta*': 1 });
  assert.equal(s['1'].frames['99']['gta*'], 1, 'the freed slot is used');
});

test('a frame with no covers takes no slot, and a report that changes nothing writes nothing', () => {
  const s = T.report(T.hello({}, 1, 0, 'x.test'), 1, 3, { 'gta*': 2 });
  assert.equal(T.report(s, 1, 3, { 'gta*': 2 }), s, 'the same counts again: the same state');
  assert.equal(T.report(s, 1, 8, {}), s, 'a frame with nothing covered: nothing stored');
  assert.deepEqual(plain(T.report(s, 1, 3, {})['1'].frames), {}, 'a frame that has nothing covered any more is dropped');
});

test("a word named like an object's own property is counted like any other", () => {
  const s = T.report(T.hello({}, 1, 0, 'x.test'), 1, 0, { constructor: 2, toString: 1, __proto__: 5 });
  assert.deepEqual(plain(T.byEntry(s, 1)), [{ entry: 'constructor', n: 2 }, { entry: 'toString', n: 1 }]);
});

test('the icon: the number of covers in gold, "off" in grey when it is off, nothing at zero', () => {
  assert.deepEqual(plain(T.badge(true, 5)), { text: '5', color: '#E2B857', textColor: '#1F1806' });
  assert.deepEqual(plain(T.badge(true, 0)), { text: '', color: '#E2B857', textColor: '#1F1806' });
  assert.deepEqual(plain(T.badge(true, 12345)), { text: '999+', color: '#E2B857', textColor: '#1F1806' });
  assert.deepEqual(plain(T.badge(false, 5)), { text: 'off', color: '#5B5B66', textColor: '#FBFBFE' });
});

test('only well-formed messages are accepted', () => {
  assert.deepEqual(plain(T.parse({ type: 'hello', site: 'youtube.com' })), { type: 'hello', site: 'youtube.com' });
  assert.deepEqual(plain(T.parse({ type: 'hello', site: null })), { type: 'hello', site: null });
  assert.deepEqual(plain(T.parse({ type: 'covers', counts: { 'gta*': 2 } })), { type: 'covers', counts: { 'gta*': 2 } });
  assert.deepEqual(plain(T.parse({ type: 'tab-covers', tabId: 4 })), { type: 'tab-covers', tabId: 4 });
  for (const bad of [null, 'hello', { type: 'nope' }, { type: 'hello', site: 5 }, { type: 'hello', site: 'x'.repeat(300) },
    { type: 'covers', counts: [] }, { type: 'covers' }, { type: 'tab-covers', tabId: 'a' }, { type: 'tab-covers', tabId: -1 }]) {
    assert.equal(T.parse(bad), null, JSON.stringify(bad));
  }
});

const sender = (tabId, frameId) => ({ tab: { id: tabId }, frameId });
const ON = { everywhere: true, offSites: [] };

test("the background: a page says hello and learns the tab's site; the icon is repainted", () => {
  let r = T.handle({}, { type: 'hello', site: 'reddit.com' }, sender(4, 0), ON);
  assert.deepEqual(plain(r.reply), { site: 'reddit.com' });
  assert.deepEqual(plain(r.paint), { tabId: 4, text: '', color: '#E2B857', textColor: '#1F1806', title: 'GTA Blocker, nothing covered' });
  r = T.handle(r.state, { type: 'hello', site: 'youtube.com' }, sender(4, 7), ON);
  assert.deepEqual(plain(r.reply), { site: 'reddit.com' }, 'a frame follows the tab');
  // A frame of a tab the background has not heard of yet decides by its own site.
  assert.deepEqual(plain(T.handle({}, { type: 'hello', site: 'youtube.com' }, sender(9, 2), ON).reply), { site: 'youtube.com' });
});

test('the background: covers reach the icon, and "off" when the site of the tab is off', () => {
  let r = T.handle(T.hello({}, 4, 0, 'reddit.com'), { type: 'covers', counts: { 'gta*': 3 } }, sender(4, 0), ON);
  assert.equal(r.paint.text, '3');
  assert.equal(r.paint.title, 'GTA Blocker, 3 covered');
  assert.equal(T.paintFor(T.report(r.state, 4, 0, { 'gta*': 1 }), 4, ON).title, 'GTA Blocker, 1 covered');
  r = T.handle(r.state, { type: 'covers', counts: { 'gta*': 3 } }, sender(4, 0), { everywhere: true, offSites: ['reddit.com'] });
  assert.equal(r.paint, null, 'nothing changed: no repaint');
  assert.equal(T.paintFor(r.state, 4, { everywhere: true, offSites: ['reddit.com'] }).text, 'off');
  assert.equal(T.paintFor(r.state, 4, { everywhere: false, offSites: [] }).text, 'off');
  assert.equal(T.paintFor(r.state, 4, { everywhere: false, offSites: [] }).title, 'GTA Blocker, off');
});

test("the background: a page can never read a tab's covers; only our own pages (no sender tab) can", () => {
  const state = T.report(T.hello({}, 4, 0, 'x.test'), 4, 0, { 'gta*': 1 });
  assert.equal(T.handle(state, { type: 'tab-covers', tabId: 4 }, sender(5, 0), ON).reply, undefined);
  assert.deepEqual(plain(T.handle(state, { type: 'tab-covers', tabId: 4 }, {}, ON).reply), { covers: [{ entry: 'gta*', n: 1 }] });
});

test('the background: a message from nowhere, or of the wrong shape, changes nothing and gets no answer', () => {
  const state = T.hello({}, 4, 0, 'x.test');
  for (const [msg, from] of [[{ type: 'covers', counts: { 'gta*': 1 } }, {}], [{ type: 'hello', site: 'a.test' }, { tab: { id: 'x' }, frameId: 0 }],
    [{ type: 'covers', counts: { 'gta*': 1 } }, { tab: { id: 4 } }], [{ type: 'nope' }, sender(4, 0)], [null, sender(4, 0)]]) {
    const r = T.handle(state, msg, from, ON);
    assert.equal(r.state, state, JSON.stringify(msg));
    assert.equal(r.reply, undefined);
    assert.equal(r.paint, null);
  }
});

test('messages from the menu to a page: a word to show again, or to cover again; anything else is refused', () => {
  assert.deepEqual(plain(T.parseForPage({ type: 'show-word', entry: 'gta*' })), { type: 'show-word', entry: 'gta*' });
  assert.deepEqual(plain(T.parseForPage({ type: 'cover-word', entry: 'y'.repeat(200) })), { type: 'cover-word', entry: 'y'.repeat(200) });
  for (const bad of [null, { type: 'show-word' }, { type: 'show-word', entry: '' }, { type: 'show-word', entry: 'y'.repeat(201) }, { type: 'show-word', entry: 4 }, { type: 'covers', entry: 'x' }]) {
    assert.equal(T.parseForPage(bad), null, JSON.stringify(bad));
  }
});
