// extension/content.js: it builds the matcher, starts the page side with it, and the page is
// marked "ready" only when the page side says its first look is done, so Journey 0
// (tests/macro/extension-loads.test.mjs) can only go green on a working extension.
// Runs alone:
//   node --test tests/micro/content-script.test.mjs
//
// The page side (lib/page.js) needs a real page; here a stand-in records how it was started.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadExtensionScripts, readExtensionScript } from '../support/extension-script.mjs';

function fakeDocument() {
  const attributes = new Map();
  return {
    attributes,
    documentElement: { setAttribute: (name, value) => attributes.set(name, String(value)) },
  };
}

// A stand-in for GtaBlocker.page that remembers what it was given.
function fakePage({ ready = true } = {}) {
  const calls = [];
  return { calls, page: { start(options) { calls.push(options); if (ready) options.onReady(); } } };
}

const WITHOUT_PAGE = ['lib/matcher.js', 'lib/cover.js', 'content.js'];

test('the page side starts with the compiled default list, and the page is marked ready', () => {
  const document = fakeDocument();
  const { calls, page } = fakePage();
  loadExtensionScripts({ files: WITHOUT_PAGE, globals: { document, GtaBlocker: { page } } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].matcher.find('GTA 6 trailer'), 'gta*');
  // The whole default list, not a part of it.
  const { matcher } = loadExtensionScripts({ files: ['lib/matcher.js'] }).GtaBlocker;
  assert.deepEqual([...calls[0].matcher.entries], [...matcher.DEFAULT_ENTRIES]);
  assert.equal(document.attributes.get('data-gta-blocker'), 'ready');
});

test('the page is not marked ready before the page side has finished its first look', () => {
  const document = fakeDocument();
  const { calls, page } = fakePage({ ready: false });
  loadExtensionScripts({ files: WITHOUT_PAGE, globals: { document, GtaBlocker: { page } } });
  assert.equal(calls.length, 1);
  assert.equal(document.attributes.get('data-gta-blocker'), undefined);
  calls[0].onReady();
  assert.equal(document.attributes.get('data-gta-blocker'), 'ready');
});

test('when the matcher fails to compile, nothing starts and the page is not marked ready', () => {
  const document = fakeDocument();
  const { calls, page } = fakePage();
  const GtaBlocker = { page, matcher: { DEFAULT_ENTRIES: [], compile() { throw new Error('broken on purpose'); } } };
  assert.throws(() => loadExtensionScripts({ files: ['content.js'], globals: { document, GtaBlocker } }), /broken on purpose/);
  assert.equal(calls.length, 0);
  assert.notEqual(document.attributes.get('data-gta-blocker'), 'ready');
});

test('an empty list marks the page "error" and starts nothing', () => {
  const document = fakeDocument();
  const { calls, page } = fakePage();
  const GtaBlocker = { page, matcher: { DEFAULT_ENTRIES: [], compile: () => ({ entries: [] }) } };
  loadExtensionScripts({ files: ['content.js'], globals: { document, GtaBlocker } });
  assert.equal(calls.length, 0);
  assert.equal(document.attributes.get('data-gta-blocker'), 'error');
});

test('without the matcher loaded first, content.js stops before marking anything', () => {
  const document = fakeDocument();
  assert.throws(() => loadExtensionScripts({ files: ['content.js'], globals: { document } }), /GtaBlocker is not defined/);
  assert.equal(document.attributes.size, 0);
});

test('content.js leaves nothing of its own in the shared global scope', () => {
  // Scripts listed together share one global scope; a top-level const there would clash with
  // the same name in a later file and stop it with a SyntaxError.
  const document = fakeDocument();
  const { page } = fakePage();
  const { context } = loadExtensionScripts({ files: WITHOUT_PAGE, globals: { document, GtaBlocker: { page } } });
  const before = new Set(Object.keys(context));
  vm.runInContext(readExtensionScript('content.js'), context, { filename: 'extension/content.js' });
  assert.deepEqual(Object.keys(context).filter((k) => !before.has(k)), []);
  assert.doesNotThrow(() => vm.runInContext(readExtensionScript('content.js'), context), 'running it twice clashed');
});
