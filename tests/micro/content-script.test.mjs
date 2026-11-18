// extension/content.js: the page is marked "ready" only after the matcher loaded and compiled,
// so Journey 0 (tests/macro/extension-loads.test.mjs) can only go green on a working matcher.
// Runs alone:
//   node --test tests/micro/content-script.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadExtensionScripts, readExtensionScript } from '../support/extension-script.mjs';
import vm from 'node:vm';

function fakeDocument() {
  const attributes = new Map();
  return {
    attributes,
    documentElement: { setAttribute: (name, value) => attributes.set(name, String(value)) },
  };
}

test('with the real matcher, the page is marked ready', () => {
  const document = fakeDocument();
  loadExtensionScripts({ globals: { document } });
  assert.equal(document.attributes.get('data-gta-blocker'), 'ready');
});

test('when the matcher fails to compile, the page is not marked ready', () => {
  const document = fakeDocument();
  const GtaBlocker = { matcher: { DEFAULT_ENTRIES: [], compile() { throw new Error('broken on purpose'); } } };
  assert.throws(() => loadExtensionScripts({ files: ['content.js'], globals: { document, GtaBlocker } }), /broken on purpose/);
  assert.notEqual(document.attributes.get('data-gta-blocker'), 'ready');
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
  const { context } = loadExtensionScripts({ globals: { document } });
  const before = new Set(Object.keys(context));
  vm.runInContext(readExtensionScript('content.js'), context, { filename: 'extension/content.js' });
  assert.deepEqual(Object.keys(context).filter((k) => !before.has(k)), []);
  assert.doesNotThrow(() => vm.runInContext(readExtensionScript('content.js'), context), 'running it twice clashed');
});
