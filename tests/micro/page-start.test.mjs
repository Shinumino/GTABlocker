// extension/lib/page.js, the one rule that runs before it touches a page: page.start refuses
// to run without label(entry), the word a cover may show. The content script always passes
// one that turns the user's own words into "a word from your list"; a caller that forgot it
// would put those words in the page, where the page can read them (design review,
// 2026-11-18). The rest of page.js needs a real page: the macro tests. Runs alone:
//   node --test tests/micro/page-start.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadExtensionScripts } from '../support/extension-script.mjs';

const { GtaBlocker } = loadExtensionScripts({ files: ['lib/matcher.js', 'lib/cover.js', 'lib/page.js'] });
const matcher = GtaBlocker.matcher.compile(GtaBlocker.matcher.DEFAULT_ENTRIES);

test('page.start refuses to run without label, before it touches anything', () => {
  for (const label of [undefined, null, 'gta*', {}]) {
    assert.throws(() => GtaBlocker.page.start({ matcher, label }), /needs label/, String(label));
  }
});
