// extension/lib/settings.js: what the user's settings are and how each change is made. The
// switch (on this site, everywhere), the word list (the built-in words, minus the ones the
// person removed, plus their own), and the reports, as plain logic over a plain object, so the
// menu, the settings page, the content script and the background all apply the same rules.
// Saving them is browser.storage's job; the macro tests check that. Runs alone:
//   node --test tests/micro/settings-rules.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadExtensionScripts, plain } from '../support/extension-script.mjs';

// URL is a browser global that a bare Node context lacks; the test lends Node's.
const { GtaBlocker } = loadExtensionScripts({ files: ['lib/matcher.js', 'lib/settings.js'], globals: { URL } });
const { settings: S, matcher: M } = GtaBlocker;
const BUILT_IN = [...M.DEFAULT_ENTRIES];
const fresh = () => S.read({});
const deepFreeze = (o) => { if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };
const list = (s) => [...S.entries(s)];
const add = (s, text) => S.addWord(s, text).settings;

test('"this site" is the address without www; other subdomains are sites of their own', () => {
  const cases = {
    'https://www.youtube.com/watch?v=1': 'youtube.com',
    'https://youtube.com/': 'youtube.com',
    'https://m.youtube.com/': 'm.youtube.com',
    'https://WWW.Reddit.com./r/gaming': 'reddit.com',
    'http://localhost:8080/x': 'localhost',
    'https://www.com/': 'www.com', // "www." is only dropped when a name is left
    'http://[::1]:3000/': '[::1]',
    'https://www.globo.com.br/': 'globo.com.br',
  };
  for (const [url, site] of Object.entries(cases)) assert.equal(S.siteKey(url), site, url);
});

test('pages that are not web sites have no site, and cannot be switched one by one', () => {
  for (const url of ['about:blank', 'moz-extension://abc/menu.html', 'file:///C:/x.html', 'data:text/html,hi', 'not a url', '', null, 42]) {
    assert.equal(S.siteKey(url), null, String(url));
  }
});

test('fresh settings: on everywhere, no site off, the built-in words, no reports', () => {
  assert.deepEqual(plain(fresh()), { everywhere: true, offSites: [], added: [], removed: [], reports: [] });
  assert.deepEqual(list(fresh()), BUILT_IN);
});

test('settings are kept as three stores, so pages never read the reports', () => {
  assert.deepEqual([...S.KEYS], ['switch', 'words', 'reports']);
  let s = S.setSite(fresh(), 'reddit.com', false);
  s = add(s, 'trevor philips');
  s = S.addReport(s, { kind: 'missed', page: 'https://x.test/' }, new Date(0));
  const stored = plain(S.toStorage(s));
  assert.deepEqual(Object.keys(stored), ['switch', 'words', 'reports']);
  assert.deepEqual(stored.switch, { everywhere: true, offSites: ['reddit.com'] });
  assert.deepEqual(stored.words, { added: ['trevor philips'], removed: [] });
  assert.equal(stored.reports.length, 1);
  // What a page reads: the switch and the words only, and that is enough to cover.
  const page = S.read({ switch: stored.switch, words: stored.words });
  assert.deepEqual(list(page), list(s));
  assert.deepEqual([...page.reports], []);
});

test('stored settings are read defensively: a wrong field falls back to its default, junk is dropped', () => {
  for (const raw of [null, 'x', 42, [], { switch: 'no', words: 'gta*', reports: {} }, { switch: { everywhere: 'no', offSites: 'x' }, words: { added: 'x', removed: 3 } }]) {
    assert.deepEqual(plain(S.read(raw)), plain(fresh()), JSON.stringify(raw));
  }
  const s = S.read({
    switch: { everywhere: false, offSites: ['reddit.com', 'reddit.com', 7, '', 'https://www.x.com/y'] },
    words: { added: ['trevor philips', 3, ''], removed: ['vice city', 'not a built-in word', 9] },
    reports: [{ kind: 'nope' }],
  });
  assert.equal(s.everywhere, false);
  assert.deepEqual([...s.offSites], ['reddit.com', 'x.com']);
  assert.deepEqual([...s.added], ['trevor philips']);
  assert.deepEqual([...s.removed], ['vice city'], 'only built-in words can be removed');
  assert.deepEqual([...s.reports], []);
});

test('stored lists are capped: 200 own words, 1000 sites, 50 reports', () => {
  const words = Array.from({ length: 300 }, (_, i) => `word ${i}`);
  const sites = Array.from({ length: 1200 }, (_, i) => `site${i}.test`);
  const reports = Array.from({ length: 70 }, (_, i) => ({ at: new Date(i).toISOString(), kind: 'missed', page: `https://x.test/${i}` }));
  const s = S.read({ switch: { offSites: sites }, words: { added: words }, reports });
  assert.equal(s.added.length, 200);
  assert.equal(s.offSites.length, 1000);
  assert.equal(s.reports.length, 50);
});

test("a page decides by the tab's site; a page with no site address follows Everywhere only", () => {
  const s = deepFreeze(S.setSite(fresh(), 'youtube.com', false));
  assert.deepEqual(plain(S.coverState(s, 'youtube.com')), { on: false, siteSwitch: true });
  assert.deepEqual(plain(S.coverState(s, 'm.youtube.com')), { on: true, siteSwitch: true });
  assert.deepEqual(plain(S.coverState(s, null)), { on: true, siteSwitch: false }, 'a local file is covered');
  assert.deepEqual(plain(S.coverState(S.setEverywhere(s, false), null)), { on: false, siteSwitch: false });
  assert.deepEqual(plain(S.coverState(S.setEverywhere(s, false), 'reddit.com')), { on: false, siteSwitch: true });
});

test('off on a site, and off everywhere, each switch only what they say; Everywhere back keeps the site as it was', () => {
  const s = deepFreeze(fresh());
  const offAll = S.setEverywhere(S.setSite(s, 'youtube.com', false), false);
  const back = S.setEverywhere(offAll, true);
  assert.equal(S.coverState(back, 'youtube.com').on, false);
  assert.equal(S.coverState(S.setSite(back, 'youtube.com', true), 'youtube.com').on, true);
  assert.deepEqual(plain(S.setSite(fresh(), null, false)), plain(fresh()));
  assert.deepEqual(plain(s), plain(fresh()), 'the settings given were not changed');
});

test("an own word goes first; a refused one says why, in the matcher's words", () => {
  let r = S.addWord(deepFreeze(fresh()), '  Trevor   Philips ');
  assert.equal(r.refused, null);
  assert.deepEqual(list(r.settings), ['Trevor   Philips', ...BUILT_IN]);
  r = S.addWord(deepFreeze(r.settings), 'michael de santa');
  assert.deepEqual(list(r.settings).slice(0, 2), ['michael de santa', 'Trevor   Philips']);
  for (const [text, code] of [['ab', 'too-short'], ['g*ta', 'star-not-at-end']]) {
    const no = S.addWord(r.settings, text);
    assert.equal(no.refused && no.refused.code, code, text);
    assert.equal(no.refused.reason, M.REASONS[code]);
    assert.equal(no.settings, r.settings, 'nothing changed');
  }
});

test('a repeat says which entry it repeats, as the list shows it', () => {
  const s = add(fresh(), 'Trevor   Philips');
  assert.equal(S.addWord(s, 'trevor philips').refused.reason, 'Already in the list as "Trevor   Philips".');
  assert.equal(S.addWord(s, 'VICE  city').refused.reason, 'Already in the list as "vice city".');
});

test('a blank word, or one made only of invisible characters, is refused, not added empty', () => {
  for (const text of ['', '   ', '\u{200B}', '\u{200B}\u{FEFF} ', null]) {
    const r = S.addWord(fresh(), text);
    assert.equal(r.refused.code, 'blank', JSON.stringify(text));
    assert.equal(r.refused.reason, 'Type a word or phrase first.');
  }
});

test('a built-in word typed back in is built-in again, in its own place and spelling', () => {
  let s = S.removeWord(fresh(), 'vice city');
  assert.ok(!list(s).includes('vice city'));
  assert.deepEqual([...s.removed], ['vice city']);
  s = add(s, 'Vice City');
  assert.deepEqual(list(s), BUILT_IN);
  assert.deepEqual([...s.added], []);
  assert.deepEqual([...s.removed], []);
});

test('a full list refuses one more word, a built-in one typed back in too', () => {
  const room = M.LIMITS.maxEntries - (BUILT_IN.length - 1);
  const s = S.read({ words: { added: Array.from({ length: room }, (_, i) => `own word ${i}`), removed: ['vice city'] } });
  assert.equal(S.entries(s).length, M.LIMITS.maxEntries);
  assert.equal(S.addWord(s, 'one more').refused.code, 'list-full');
  assert.equal(S.addWord(s, 'vice city').refused.code, 'list-full');
});

test('a built-in word added in a later version reaches an edited list, unless it was removed', () => {
  // The same stored words, read by a version whose built-in list has one word more.
  const stored = { added: ['trevor philips'], removed: ['los santos'] };
  const defaults = [...BUILT_IN, 'gta vi'];
  const L = S.withDefaults(defaults);
  const s = L.read({ words: stored });
  assert.deepEqual([...L.entries(s)], ['trevor philips', ...defaults.filter((w) => w !== 'los santos')]);
  assert.equal(L.isOwn(s, 'gta vi'), false);
  // A built-in word dropped in a later version does not turn into one of the person's own.
  const fewer = S.withDefaults(BUILT_IN.filter((w) => w !== 'leonida'));
  const t = fewer.read({ words: { added: [], removed: ['leonida'] } });
  assert.deepEqual([...t.removed], [], 'a removed word no longer built in is forgotten');
  assert.equal(fewer.isOwn(t, 'leonida'), false);
});

test('an own word that a later version builds in becomes the built-in one: listed once, and its covers name it', () => {
  // The user had added "Rockstar" by hand when 0.1.1 built it in (2026-11-19). Kept as their
  // own, the list showed it twice and its covers said "a word from your list"; typed in, a
  // built-in word was already the built-in one (addWord).
  const defaults = [...BUILT_IN, 'trevor philips'];
  const L = S.withDefaults(defaults);
  const s = L.read({ words: { added: ['franklin', 'Trevor  Philips'], removed: [] } });
  assert.deepEqual([...s.added], ['franklin']);
  assert.deepEqual([...L.entries(s)], ['franklin', ...defaults]);
  assert.equal(L.isOwn(s, 'trevor philips'), false);
  assert.equal(L.coverWord(s, 'trevor philips'), 'trevor philips');
  // Even where the stored words say it was removed (no menu can do that): the person's own
  // word stays in the list, now as the built-in one.
  const t = L.read({ words: { added: ['Trevor Philips'], removed: ['trevor philips', 'leonida'] } });
  assert.deepEqual([...t.added], []);
  assert.deepEqual([...t.removed], ['leonida']);
  // The user's own cases, in this version: "Rockstar" (0.1.1), "jason" and "Lucia" (0.1.2).
  const u = S.read({ words: { added: ['jason', 'Lucia', 'Rockstar'], removed: [] } });
  assert.deepEqual([...u.added], []);
  for (const w of ['rockstar', 'jason', 'lucia']) {
    assert.equal(list(u).filter((x) => x.toLowerCase() === w).length, 1, `${w} listed twice`);
  }
  // What a cover does: the page's matcher finds the entry, and the cover is labelled by it
  // (test review, 0.1.2: checking the label alone could pass for the wrong reason).
  const m = M.compile(S.entries(u));
  for (const [text, w] of [['Rockstar trailer', 'rockstar'], ['Jason is back', 'jason'], ['L\u{FA}cia', 'lucia']]) {
    assert.equal(S.coverWord(u, m.find(text)), w, text);
  }
});

test('an own word is the built-in one whenever the matcher reads them as the same word', () => {
  // Not only capitals and spaces: accents, a #, a hyphen (test review, 0.1.2). "RockStar" is
  // read as two words, so it also finds "a rock star": another word, still the person's own.
  const s = S.read({ words: { added: ['L\u{FA}cia', '#Rockstar', 'Vice-City', 'RockStar'] } });
  assert.deepEqual([...s.added], ['RockStar']);
  assert.equal(S.isOwn(s, 'RockStar'), true);
});

test('an own word that repeats another own word is listed once, the first one', () => {
  const s = S.read({ words: { added: ['franklin', 'Franklin', 'trevor  philips', 'Trevor Philips'] } });
  assert.deepEqual([...s.added], ['franklin', 'trevor  philips']);
});

test('a built-in list that repeats a word of its own still lets the person remove it', () => {
  // Only a later version's list can be like this (the real one is checked in matcher.test.mjs).
  const D = S.withDefaults(['vice city', 'Vice City', 'leonida']);
  assert.deepEqual([...D.read({ words: { removed: ['vice city'] } }).removed], ['vice city']);
});

test('Undo of a removed own word does nothing when the word is back in another spelling', () => {
  // Remove "Jason Statham", type "jason statham", then Undo: it was listed twice (correctness
  // review, 0.1.2).
  let s = add(fresh(), 'Jason Statham');
  const at = s.added.indexOf('Jason Statham');
  s = S.removeWord(s, 'Jason Statham');
  s = add(s, 'jason statham');
  s = S.restoreWord(s, 'Jason Statham', at);
  assert.deepEqual([...s.added], ['jason statham']);
});

test('Undo of a removal puts back only that word, where it was', () => {
  let s = add(add(add(fresh(), 'aaa one'), 'bbb two'), 'ccc three'); // ccc, bbb, aaa
  const at = s.added.indexOf('bbb two');
  s = S.removeWord(s, 'bbb two');
  s = S.removeWord(s, 'aaa one');
  s = S.restoreWord(s, 'bbb two', at);
  assert.deepEqual([...s.added], ['ccc three', 'bbb two'], 'aaa one stays removed');
  s = S.removeWord(S.removeWord(s, 'gta*'), 'vice city');
  s = S.restoreWord(s, 'gta*', -1);
  assert.deepEqual([...s.removed], ['vice city']);
  assert.equal(S.restoreWord(s, 'bbb two', 0), s, 'already there: nothing changes');
});

test('removing and resetting', () => {
  let s = add(fresh(), 'trevor philips');
  s = S.removeWord(s, 'los santos');
  assert.deepEqual(list(s), ['trevor philips', ...BUILT_IN.filter((w) => w !== 'los santos')]);
  assert.equal(S.removeWord(s, 'not in the list'), s);
  s = S.resetWords(s);
  assert.deepEqual(list(s), BUILT_IN);
  assert.deepEqual(plain([s.added, s.removed]), [[], []]);
});

test("built-in words show on a cover; the user's own words never do", () => {
  const s = add(fresh(), 'trevor philips');
  assert.equal(S.coverWord(s, 'gta*'), 'gta*');
  assert.equal(S.coverWord(s, 'trevor philips'), 'a word from your list');
  assert.equal(S.isOwn(s, 'trevor philips'), true);
  assert.equal(S.isOwn(s, 'gta*'), false);
});

test('reports: newest first, the last 50 kept, the full address without its #part, each field capped', () => {
  let s = deepFreeze(fresh());
  const now = (i) => new Date(Date.UTC(2026, 10, 18, 19, i));
  for (let i = 0; i < 55; i++) s = deepFreeze(S.addReport(s, { kind: 'not-gta', word: 'vice city', page: `https://x.test/${i}?v=abc#part` }, now(i)));
  assert.equal(s.reports.length, 50);
  assert.equal(s.reports[0].page, 'https://x.test/54?v=abc', 'newest first; the ?part is kept, the #part is not');
  assert.equal(s.reports[49].page, 'https://x.test/5?v=abc');
  assert.equal(s.reports[0].at, now(54).toISOString());
  const long = S.addReport(fresh(), { kind: 'missed', note: 'n'.repeat(500), page: 'https://x.test/' + 'p'.repeat(3000) }, now(0)).reports[0];
  assert.equal(long.note.length, 200);
  assert.ok(long.page.length <= 2000);
  assert.equal(long.word, undefined);
  for (const bad of [{ kind: 'other', page: 'https://x.test/' }, { kind: 'missed' }, { kind: 'missed', page: 'javascript:alert(1)' }]) {
    assert.equal(S.addReport(fresh(), bad, now(0)).reports.length, 0, JSON.stringify(bad));
  }
});

test('one report removed, or all of them; Undo puts back only that report, where it was', () => {
  let s = fresh();
  for (let i = 0; i < 3; i++) s = S.addReport(s, { kind: 'missed', note: `n${i}`, page: `https://x.test/${i}` }, new Date(i));
  const gone = s.reports[1];
  const two = S.removeReport(s, 1);
  assert.deepEqual(plain(two.reports.map((r) => r.note)), ['n2', 'n0']);
  assert.equal(S.removeReport(s, 9), s);
  // A report saved meanwhile (from the menu) is not lost by the Undo.
  const meanwhile = S.addReport(two, { kind: 'missed', note: 'new', page: 'https://x.test/new' }, new Date(9));
  const back = S.restoreReport(meanwhile, gone, 2);
  assert.deepEqual(plain(back.reports.map((r) => r.note)), ['new', 'n2', 'n1', 'n0']);
  assert.equal(S.restoreReport(back, gone, 0), back, 'already there: nothing changes');
  assert.deepEqual([...S.clearReports(s).reports], []);
});
