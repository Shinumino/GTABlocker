// extension/pages/settings-view.js: the words the settings page shows that are worked out, not
// fixed: the report rows, the text "Copy all" gives, and what the Reset box says goes and comes
// back. Plain logic; the page only draws it. Runs alone:
//   node --test tests/micro/settings-view.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadExtensionScripts, plain } from '../support/extension-script.mjs';

const { GtaBlocker } = loadExtensionScripts({ files: ['lib/matcher.js', 'lib/settings.js', 'pages/settings-view.js'], globals: { URL, Intl } });
const { settings: S, settingsView: V } = GtaBlocker;
const at = new Date(Date.UTC(2026, 10, 18, 22, 40));

test('report rows: the date with its year, the kind in plain words, the word or what was written, the page', () => {
  let s = S.read(undefined);
  s = S.addReport(s, { kind: 'not-gta', word: 'vice city', page: 'https://news.test/a' }, at);
  s = S.addReport(s, { kind: 'missed', note: 'an ad', page: 'https://x.test/b' }, at);
  s = S.addReport(s, { kind: 'missed', page: 'https://x.test/c' }, at);
  const rows = plain(V.reportRows(s.reports, 'UTC'));
  assert.deepEqual(rows, [
    { when: '18 Nov 2026, 22:40', kind: 'Missed GTA', label: 'Note', note: '', page: 'https://x.test/c' },
    { when: '18 Nov 2026, 22:40', kind: 'Missed GTA', label: 'Note', note: 'You wrote: "an ad"', page: 'https://x.test/b' },
    { when: '18 Nov 2026, 22:40', kind: 'Not about GTA', label: 'Word', note: 'vice city', page: 'https://news.test/a' },
  ]);
});

test('"Copy all" gives one plain line per report, ready to paste', () => {
  let s = S.addReport(S.read(undefined), { kind: 'not-gta', word: 'vice city', page: 'https://news.test/a' }, at);
  s = S.addReport(s, { kind: 'missed', page: 'https://x.test/c' }, at);
  assert.equal(V.copyText(s.reports, 'UTC'), '18 Nov 2026, 22:40  Missed GTA  https://x.test/c\n18 Nov 2026, 22:40  Not about GTA  vice city  https://news.test/a');
});

test('the Reset box names what goes and what comes back, and shortens a long list', () => {
  let s = S.removeWord(S.read(undefined), 'los santos');
  s = S.addWord(s, 'trevor philips').settings;
  s = S.addWord(s, 'michael de santa').settings;
  assert.equal(V.resetText(s), 'Your 2 own words go ("michael de santa", "trevor philips"), and the 1 built-in word you removed comes back ("los santos").');
  for (const w of ['aaa', 'bbb', 'ccc']) s = S.addWord(s, w).settings;
  assert.match(V.resetText(s), /^Your 5 own words go \("ccc", "bbb", "aaa" and 2 more\)/);
  assert.equal(V.resetText(S.addWord(S.read(undefined), 'trevor philips').settings), 'Your 1 own word goes ("trevor philips").');
  // In quotes, an entry's own "and" cannot run into the list's (design review, 0.1.2).
  const many = ['jason and lucia', 'jason e lucia', 'jason y lucia', 'lucia and jason', 'lucia e jason'].reduce((t, w) => S.removeWord(t, w), S.read(undefined));
  assert.equal(V.resetText(many), 'The 5 built-in words you removed come back ("jason and lucia", "jason e lucia", "jason y lucia" and 2 more).');
  assert.equal(V.resetText(S.read(undefined)), null, 'nothing to reset');
});
