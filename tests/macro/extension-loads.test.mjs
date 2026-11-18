// Journey 0, the harness itself: the installed Firefox loads the extension, and the
// extension's content script runs on a fake YouTube page served from this machine. Every later
// journey stands on this one, so when it is red, read it first.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useFirefox, EXTENSION_DIR } from '../support/browser-test.mjs';

const session = useFirefox({ extensionDir: EXTENSION_DIR });

test('the extension runs on a YouTube page', async () => {
  const { firefox, fixtures } = session;
  await firefox.navigate(fixtures.url('www.youtube.com'));
  assert.equal(await firefox.evaluate('return document.title'), 'Fake YouTube (test fixture)');
  const state = await firefox.waitForPage(
    'the extension to mark the page as running',
    "return document.documentElement.getAttribute('data-gta-blocker')",
  );
  assert.equal(state, 'ready');
});

test('test pages come from this machine, never the internet', async () => {
  const { firefox, fixtures } = session;
  // Each test makes its own requests, so a narrow run of this one alone is still meaningful.
  fixtures.requests.length = 0;
  await firefox.navigate(fixtures.url('www.youtube.com'));
  assert.ok(fixtures.requests.some((r) => r.host === 'www.youtube.com' && r.path === '/'),
    `the fixture server never saw the youtube request: ${JSON.stringify(fixtures.requests)}`);
  // A site we have no fixture for gets our 404, not the real site.
  await firefox.navigate(fixtures.url('example.com', '/anything'));
  const body = await firefox.evaluate('return document.body.textContent');
  assert.equal(body.trim(), 'no fixture for example.com/anything');
});
