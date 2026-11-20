// extension/lib/matcher.js: what counts as GTA. Runs alone:
//   node --test tests/micro/matcher.test.mjs
//
// The tables of cases live in tests/support/matcher-cases.mjs, shared with the macro test that
// runs this same file inside Firefox. This file adds the rules that are about the list itself.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadExtensionScripts, plain, readExtensionScript } from '../support/extension-script.mjs';
import {
  SHOULD_MATCH, ACCEPTED_FALSE_HITS, SHOULD_NOT_MATCH, ENTRY_CASES, NORMALIZE_CASES,
} from '../support/matcher-cases.mjs';

const { matcher } = loadExtensionScripts({ until: 'lib/matcher.js' }).GtaBlocker;
const defaults = matcher.compile(matcher.DEFAULT_ENTRIES);
const codes = (m) => plain(m.rejected.map((r) => r.code));

test('the default list is the one agreed on 2026-11-18 (with "rockstar" alone, 2026-11-19), and every entry of it is used', () => {
  // "rockstar" alone: a GTA Short said only "Rockstar" and played (the user's report and
  // choice, 2026-11-19). "rockstar games" stays before it: it alone finds "rockstargames", and
  // where both match, the earlier entry in the list is the one named.
  assert.deepEqual(plain(matcher.DEFAULT_ENTRIES), [
    'gta*', 'grand theft auto', 'rockstar games', 'rockstar', 'vice city', 'leonida', 'los santos',
    'liberty city', 'san andreas',
    'jason and lucia', 'jason e lucia', 'jason y lucia',
    'lucia and jason', 'lucia e jason', 'lucia y jason',
  ]);
  // No entry was refused or folded into another as a duplicate.
  assert.deepEqual(plain(defaults.entries), plain(matcher.DEFAULT_ENTRIES));
  assert.deepEqual(plain(defaults.rejected), []);
});

for (const [label, cases] of [['matches', SHOULD_MATCH], ['matches (accepted false hit)', ACCEPTED_FALSE_HITS], ['does not match', SHOULD_NOT_MATCH]]) {
  for (const [text, expected] of cases) {
    test(`${label} ${expected ?? ''}: ${JSON.stringify(text)}`, () => {
      assert.equal(defaults.find(text), expected);
    });
  }
}

for (const [entries, text, expected] of ENTRY_CASES) {
  test(`your own list ${JSON.stringify(entries)} on ${JSON.stringify(text)} gives ${JSON.stringify(expected)}`, () => {
    assert.equal(matcher.compile(entries).find(text), expected);
  });
}

for (const [text, expected] of NORMALIZE_CASES) {
  test(`normalize ${JSON.stringify(text)} -> ${JSON.stringify(expected)}`, () => {
    assert.equal(matcher.normalize(text), expected);
  });
}

test('every invisible character is removed, wherever it sits in a word', () => {
  const missed = [];
  for (let cp = 0; cp <= 0x10FFFF; cp++) {
    if (cp >= 0xD800 && cp <= 0xDFFF) continue;
    const ch = String.fromCodePoint(cp);
    if (!/[\p{Cf}\p{DI}]/u.test(ch)) continue;
    if (defaults.find(`G${ch}TA 6`) !== 'gta*') missed.push(`U+${cp.toString(16).toUpperCase()}`);
  }
  assert.deepEqual(missed, []);
});

test('runs of spaces, punctuation and symbols become one space, so no long gap reaches the pattern', () => {
  assert.equal(matcher.normalize(`vice${' -_.,!\u{2605}'.repeat(1_000)}city`), 'vice city');
});

test('punctuation in an entry only separates its words; no character acts as a pattern', () => {
  for (const c of '^$\\.*+?()[]{}|/-') {
    assert.equal(matcher.compile([`abc${c}def`]).find('abcxdef'), null, `the ${c} acted as a pattern`);
  }
  assert.deepEqual(codes(matcher.compile(['(gta|.*)'])), ['star-not-at-end']);
});

test('a * anywhere but the end is refused, so it cannot quietly change meaning', () => {
  const m = matcher.compile(['vice*city', '*gta']);
  assert.deepEqual(codes(m), ['star-not-at-end', 'star-not-at-end']);
  assert.equal(m.find('vice cityscape'), null);
  assert.equal(m.find('gta'), null);
});

test('an entry needs 3 letters or digits; punctuation does not count', () => {
  // '.*' ends in its star, so the star is allowed; what is left (a dot) is too short.
  const m = matcher.compile(['gt', 'a*', '.*', 'a-b', '#gt', '...', 'ok word']);
  assert.deepEqual(codes(m), ['too-short', 'too-short', 'too-short', 'too-short', 'too-short', 'too-short']);
  // A refused entry never matches anything.
  assert.equal(m.find('gt gt'), null);
  assert.equal(m.find('apple'), null);
  assert.equal(m.find('an ok word here'), 'ok word');
});

test('80 characters is allowed, 81 is not, measured after trimming and after normalizing', () => {
  const m = matcher.compile(['a'.repeat(80), ` ${'b'.repeat(80)} `, 'c'.repeat(81), '\u{FDFA}'.repeat(5)]);
  assert.deepEqual(plain(m.rejected.map((r) => [r.index, r.code])), [[2, 'too-long'], [3, 'too-long']]);
});

test('an entry of more than 10 words is refused', () => {
  const m = matcher.compile(['one two three four five six seven eight nine ten', 'one two three four five six seven eight nine ten eleven']);
  assert.deepEqual(plain(m.rejected.map((r) => [r.index, r.code])), [[1, 'too-many-words']]);
});

test('the list holds 200 entries; repeats and refused entries do not take a place', () => {
  // 198 + 'dup entry' + 'last one' = 200. If the repeat or the refused 'gt' took a place,
  // 'last one' would be the 201st and refused.
  const unique = Array.from({ length: 198 }, (_, i) => `word number ${i}`);
  const m = matcher.compile([...unique, 'dup entry', 'Dup Entry', 'gt', 'last one', 'one too many']);
  assert.equal(m.entries.length, 200);
  assert.equal(m.find('last one'), 'last one');
  assert.deepEqual(plain(m.rejected.map((r) => [r.index, r.code])), [[199, 'duplicate'], [200, 'too-short'], [202, 'list-full']]);
  assert.equal(m.find('one too many'), null);
});

test('a repeat names the entry it repeats', () => {
  const m = matcher.compile(['  Vice City ', 'vice-city', 'ViceCity']);
  assert.deepEqual(plain(m.entries), ['Vice City']);
  assert.deepEqual(plain(m.rejected.map((r) => [r.index, r.code, r.sameAs])), [[1, 'duplicate', 0], [2, 'duplicate', 0]]);
  assert.equal(m.find('VICE CITY'), 'Vice City');
});

test('blank lines are skipped, and things that are not text are refused', () => {
  const m = matcher.compile(['', '   ', null, 42, 'gta*']);
  assert.deepEqual(plain(m.rejected.map((r) => [r.index, r.code])), [[2, 'not-text'], [3, 'not-text']]);
  assert.deepEqual(plain(m.entries), ['gta*']);
});

test('every refusal comes with a reason a person can act on', () => {
  const m = matcher.compile([42, 'x'.repeat(81), 'one two three four five six seven eight nine ten eleven', 'gt', 'a*b', 'gta*', 'GTA*']);
  for (const r of m.rejected) {
    assert.equal(typeof r.reason, 'string');
    assert.ok(r.reason.length > 10 && !/[\u{2013}\u{2014}]/u.test(r.reason), `${r.code}: ${r.reason}`);
  }
  assert.deepEqual(codes(m), ['not-text', 'too-long', 'too-many-words', 'too-short', 'star-not-at-end', 'duplicate']);
});

test('a GtaBlocker that is only reachable through the page cannot stand in for ours', () => {
  // In a content script, a name missing from our own scope can be looked up through to the
  // page's window, where an element with id="GtaBlocker" would answer. A prototype stands in
  // for that window here.
  const planted = { planted: true };
  const context = vm.createContext(Object.create({ GtaBlocker: planted }));
  vm.runInContext(readExtensionScript('lib/matcher.js'), context);
  assert.equal(planted.matcher, undefined, 'the matcher was written into the page\'s object');
  assert.ok(Object.hasOwn(context, 'GtaBlocker'), 'our own GtaBlocker was not created');
  assert.equal(typeof context.GtaBlocker.matcher.compile, 'function');
});

test('an empty list matches nothing', () => {
  assert.equal(matcher.compile([]).find('GTA 6'), null);
});

// These guard against catastrophic slowdowns, not small ones: node:test cannot interrupt a
// regular expression that never ends, so a real hang shows up as the runner's own time limit.
test('a long page, and text built to slow a pattern down, are checked in under a second', () => {
  const big = matcher.compile([...matcher.DEFAULT_ENTRIES, ...Array.from({ length: 180 }, (_, i) => `long entry number ${i} *`)]);
  const inputs = [
    'Lorem ipsum, dolor sit amet! '.repeat(4_000), // about 116 KB of ordinary text
    `vice${' -_.,!'.repeat(20_000)}x`, // a huge gap where an entry's words would go
    `a${'\u{301}\u{316}'.repeat(50_000)}`, // 100,000 stacked accent marks of two kinds
    // 200,000 symbols in one gap (about 60 ms). The stack overflow this guards against needed
    // 20 million on the old code; the collapse that prevents it has its own test above, so the
    // input is kept small enough to leave this time limit plenty of room (2 million took 640 ms).
    `vice${'\u{2605}'.repeat(200_000)}x`,
  ];
  for (const input of inputs) {
    const started = Date.now();
    assert.equal(big.find(input), null);
    assert.ok(Date.now() - started < 1_000, `took ${Date.now() - started} ms on a ${input.length}-character input`);
  }
});
