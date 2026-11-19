// extension/lib/cover.js, the whole-page cover's decisions: when a page whose title is about GTA
// gets covered, what keeps it covered, what lifts it, and what "Show anyway" remembers. They are
// one pure step over plain state, so they run in Node; lib/page.js only carries them out (the
// dialog, the tab title), and the macro tests check that in Firefox. Runs alone:
//   node --test tests/micro/page-cover-rules.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadExtensionScripts, plain } from '../support/extension-script.mjs';

const { GtaBlocker } = loadExtensionScripts({ until: 'lib/cover.js' });
const { cover, matcher: m } = GtaBlocker;
const matcher = m.compile(m.DEFAULT_ENTRIES);
const HIDDEN = cover.HIDDEN_TITLE;
const FRESH = Object.freeze({ cover: null, revealedAt: null, siteTitle: null });

// Runs the steps in order, as the page would on each title or address change, and returns every
// step's result. Each state is frozen, so a step that changes its input in place throws.
function run(steps, state = FRESH) {
  const out = [];
  for (const { key, title } of steps) {
    const r = cover.pageStep(state, { key, title, matcher });
    out.push(r);
    state = deepFreeze(r.state);
  }
  return out;
}
function deepFreeze(o) {
  if (o && typeof o === 'object') { for (const v of Object.values(o)) deepFreeze(v); Object.freeze(o); }
  return o;
}
const last = (rs) => rs[rs.length - 1];

test('a page whose title is about GTA is covered, and the site title is kept for later', () => {
  const r = cover.pageStep(FRESH, { key: 'https://v.test/watch', title: 'GTA 6 trailer - a video site', matcher });
  assert.equal(r.act, 'open');
  assert.equal(r.entry, 'gta*');
  assert.deepEqual(plain(r.state), { cover: { key: 'https://v.test/watch', waiting: false }, revealedAt: null, siteTitle: 'GTA 6 trailer - a video site' });
});

test('a page whose title is not about GTA, or has no title, is left alone', () => {
  for (const title of ['Making bread at home', '', null]) {
    const r = cover.pageStep(FRESH, { key: 'k', title, matcher });
    assert.equal(r.act, 'none', String(title));
    assert.deepEqual(plain(r.state), FRESH);
  }
});

test('while covered, the site changing its title keeps the cover and is taken as the new site title', () => {
  const rs = run([
    { key: 'k', title: 'GTA 6 trailer' },
    { key: 'k', title: 'New message!' },
    { key: 'k', title: 'Making bread at home' },
  ]);
  assert.deepEqual(rs.map((r) => r.act), ['open', 'keep', 'keep']);
  assert.equal(last(rs).state.siteTitle, 'Making bread at home');
});

test('a title built from ours is never taken as the site title', () => {
  // A site that counts messages turns "Hidden page" into "(1) Hidden page".
  const rs = run([
    { key: 'k', title: 'GTA 6 trailer' },
    { key: 'k', title: 'New message!' },
    { key: 'k', title: HIDDEN },
    { key: 'k', title: `(1) ${HIDDEN}` },
  ]);
  assert.deepEqual(rs.map((r) => r.act), ['open', 'keep', 'keep', 'keep']);
  assert.equal(last(rs).state.siteTitle, 'New message!');
});

test('a new address under the cover waits for the site title of that address, then decides again', () => {
  const lifted = run([
    { key: 'a', title: 'GTA 6 trailer' },
    { key: 'b', title: HIDDEN }, // the address changed; the tab still shows ours: not a decision
    { key: 'b', title: 'Making bread at home' },
  ]);
  assert.deepEqual(lifted.map((r) => r.act), ['open', 'keep', 'close']);
  assert.deepEqual(plain(last(lifted).state), { cover: null, revealedAt: null, siteTitle: 'Making bread at home' });

  const kept = run([
    { key: 'a', title: 'GTA 6 trailer' },
    { key: 'b', title: 'Vice City tour' },
    { key: 'b', title: 'Making bread at home' }, // decided already for b: a title change keeps it
  ]);
  assert.deepEqual(kept.map((r) => r.act), ['open', 'keep', 'keep']);
  assert.deepEqual(plain(last(kept).state.cover), { key: 'b', waiting: false });
});

test('Show anyway is for this visit: the same address stays shown, another one is decided afresh', () => {
  let state = deepFreeze(run([{ key: 'a', title: 'GTA 6 trailer' }])[0].state);
  state = deepFreeze(cover.showAnyway(state, 'a'));
  assert.deepEqual(plain(state), { cover: null, revealedAt: 'a', revealedBy: 'button', siteTitle: 'GTA 6 trailer' });
  const rs = run([
    { key: 'a', title: 'GTA 6 trailer' },
    { key: 'a', title: 'GTA 6 trailer (2)' },
    { key: 'b', title: 'GTA 6 map' },
  ], state);
  assert.deepEqual(rs.map((r) => r.act), ['none', 'none', 'open']);
  assert.equal(rs[1].state.revealedAt, 'a');
  assert.equal(last(rs).state.revealedAt, null);
});

test('coming back to the shown address after another one covers it again', () => {
  const state = deepFreeze(cover.showAnyway(run([{ key: 'a', title: 'GTA 6 trailer' }])[0].state, 'a'));
  const rs = run([
    { key: 'b', title: 'Making bread at home' },
    { key: 'a', title: 'GTA 6 trailer' },
  ], state);
  assert.deepEqual(rs.map((r) => r.act), ['none', 'open']);
});

test('the matched word comes from the title', () => {
  const r = cover.pageStep(FRESH, { key: 'k', title: 'Grand Theft Auto VI news', matcher });
  assert.equal(r.entry, 'grand theft auto');
});

test('Show anyway remembers why: the button, or the word the person said is not about GTA', () => {
  const byButton = cover.showAnyway(FRESH, 'a');
  assert.deepEqual(plain(byButton), { cover: null, revealedAt: 'a', revealedBy: 'button', siteTitle: null });
  const byWord = cover.showAnyway(FRESH, 'a', 'vice city');
  assert.equal(byWord.revealedBy, 'vice city');
  // Undo of a word lifts only a Show anyway that word caused (review: the Undo of any word once
  // brought back a whole-page cover the person had dismissed with the button).
  assert.equal(cover.undoShow(byButton, 'a', 'vice city'), byButton);
  assert.equal(cover.undoShow(byWord, 'a', 'gta*'), byWord);
  assert.deepEqual(plain(cover.undoShow(byWord, 'a', 'vice city')), { cover: null, revealedAt: null, revealedBy: null, siteTitle: null });
  assert.equal(cover.undoShow(byWord, 'b', 'vice city'), byWord, 'another address: nothing to undo');
});

test('a new address forgets why the old one was shown', () => {
  const s = deepFreeze(cover.showAnyway(FRESH, 'a', 'gta*'));
  const r = cover.pageStep(s, { key: 'b', title: 'Making bread', matcher });
  assert.equal(r.state.revealedAt, null);
  assert.equal(r.state.revealedBy, null);
});

test('"Not about GTA" belongs to the address: kept through a restart, forgotten on another address', () => {
  let d = deepFreeze(cover.dismiss(null, 'a', 'gta*'));
  d = deepFreeze(cover.dismiss(d, 'a', 'vice city'));
  assert.deepEqual([...cover.dismissedOn(d, 'a')], ['gta*', 'vice city']);
  assert.deepEqual([...cover.dismissedOn(d, 'b')], [], 'a single-page site moved on: covered again');
  assert.deepEqual([...cover.dismissedOn(cover.undismiss(d, 'a', 'gta*'), 'a')], ['vice city']);
  // Dismissing on a new address starts afresh.
  assert.deepEqual([...cover.dismissedOn(cover.dismiss(d, 'b', 'leonida'), 'b')], ['leonida']);
  assert.deepEqual([...cover.dismissedOn(null, 'a')], []);
});

test('covers are counted by word, a word named like an object\u{2019}s own property too', () => {
  assert.deepEqual(plain(cover.countEntries(['gta*', 'constructor', 'gta*', 'toString', '__proto__'])), { 'gta*': 2, constructor: 1, toString: 1, ['__proto__']: 1 });
});
