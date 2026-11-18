// The matcher gives the same answers in Firefox's own JavaScript engine as in Node. The micro
// tests run lib/matcher.js in Node (V8); the extension runs it in Firefox (SpiderMonkey), and
// the two can differ on exactly the things the matcher leans on: Unicode property classes and
// scripts, look-behind, case mapping and normalization tables. Same file, same tables.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useFirefox } from '../support/browser-test.mjs';
import { readExtensionScript } from '../support/extension-script.mjs';
import { ALL_CASES, ENTRY_CASES, NORMALIZE_CASES } from '../support/matcher-cases.mjs';

const session = useFirefox();

test('Firefox agrees with the micro tests on every case', async () => {
  const { firefox, fixtures } = session;
  await firefox.navigate(fixtures.url('www.youtube.com'));
  const source = readExtensionScript('lib/matcher.js');
  const answers = await firefox.evaluate(
    `${source}\nconst M = GtaBlocker.matcher;\nconst d = M.compile(M.DEFAULT_ENTRIES);\n`
    + 'const [texts, entryCases, normalizeTexts] = arguments;\n'
    + 'return {\n'
    + '  defaults: texts.map((t) => d.find(t)),\n'
    + '  entries: entryCases.map(([list, t]) => M.compile(list).find(t)),\n'
    + '  normalized: normalizeTexts.map((t) => M.normalize(t)),\n'
    + '};',
    [ALL_CASES.map(([t]) => t), ENTRY_CASES.map(([list, t]) => [list, t]), NORMALIZE_CASES.map(([t]) => t)],
  );
  const disagreements = [
    ...ALL_CASES.map(([text, expected], i) => ({ text, expected, firefox: answers.defaults[i] })),
    ...ENTRY_CASES.map(([list, text, expected], i) => ({ list, text, expected, firefox: answers.entries[i] })),
    ...NORMALIZE_CASES.map(([text, expected], i) => ({ normalize: text, expected, firefox: answers.normalized[i] })),
  ].filter((c) => c.firefox !== c.expected);
  assert.deepEqual(disagreements, []);
});
