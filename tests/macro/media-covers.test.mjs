// Journey 8: the general media rule (step 6), on a site with no rules of its own, in the
// installed Firefox with the real extension (tests/fixtures/media.test/index.html). Decided
// with the user, 2026-11-18 and 19: a video or a sound under any cover is paused and muted,
// and kept paused while covered; when no cover holds it any more, its own sound setting comes
// back. Two cases the first build missed (review, 2026-11-19): a video inside a component's
// shadow tree, and a video the site moves out of the covered card.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useFirefox, EXTENSION_DIR } from '../support/browser-test.mjs';

// Autoplay is allowed so that the videos really play here (see youtube-shorts.test.mjs).
const session = useFirefox({ extensionDir: EXTENSION_DIR, prefs: { 'media.autoplay.default': 0, 'media.autoplay.blocking_policy': 0 } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const js = (script) => session.firefox.evaluate(script);

async function open() {
  const { firefox, fixtures } = session;
  await firefox.navigate(fixtures.url('media.test', '/index.html'));
  await firefox.waitForPage('the extension to finish its first look', "return document.documentElement.getAttribute('data-gta-blocker') === 'ready'");
  await firefox.waitForPage('both cards covered', "return document.getElementById('shadow-card').hasAttribute('data-gta-cover') && document.getElementById('move-card').hasAttribute('data-gta-cover')");
}

test('a video inside a shadow tree, in a covered card, is paused and muted, and the page cannot start it again', async () => {
  await open();
  const INNER = 'const v = window.__inner(); return { paused: v.paused, muted: v.muted };';
  await session.firefox.waitForPage('the video in the shadow tree held', `const s = (() => { ${INNER} })(); return s.paused && s.muted;`);
  // A play inside a shadow tree stops at its root: the window never hears it.
  await js('window.__playInner()');
  await sleep(500);
  assert.deepEqual(await js(INNER), { paused: true, muted: true }, 'the page started it again under the cover');
});

test('a video the page moves out of a covered card gets its own sound back, and stays paused', async () => {
  await open();
  await session.firefox.waitForPage('the video in the card held', "const v = document.getElementById('mover'); return v.paused && v.muted;");
  await js('window.__move()');
  await session.firefox.waitForPage('its sound back, out of the cover', "return !document.getElementById('mover').muted;");
  // It was playing when covered, but nothing decided it is not about GTA: it moved. Started
  // here, the GTA video played with its sound outside its card (design review, round 2).
  await sleep(600);
  assert.equal(await js("return document.getElementById('mover').paused"), true, 'the moved GTA video was started');
});

test('a covered card whose text changes and stays about GTA leaves its video\u{2019}s sound alone', async () => {
  // Read again, it is covered again at once: its video stays muted the whole time. Before,
  // every recheck turned the sound on and off again, which the page heard twice (round 1, row 9).
  await open();
  await session.firefox.waitForPage('the card covered, its video held', "return document.getElementById('flicker-card').hasAttribute('data-gta-cover') && document.getElementById('flicker').muted");
  await js('window.__volumeEvents = 0; window.__retitle()');
  await sleep(600);
  assert.equal(await js("return document.getElementById('flicker-card').hasAttribute('data-gta-cover')"), true);
  assert.equal(await js('return window.__volumeEvents'), 0, 'the sound was turned on and off again');
});

test('a covered card read again and found not about GTA: its video plays on, as the page wanted', async () => {
  // A tile the site reuses: it was playing when covered; once its text is read again and is not
  // about GTA, the page's play goes through (only a recheck or a Short's player decides that).
  await open();
  await session.firefox.waitForPage('the card covered, its video held', "return document.getElementById('turn-card').hasAttribute('data-gta-cover') && document.getElementById('turner').paused");
  await js('window.__unGta()');
  await session.firefox.waitForPage('uncovered, and playing with its sound', "const v = document.getElementById('turner'); return !document.getElementById('turn-card').hasAttribute('data-gta-cover') && !v.paused && !v.muted;");
});
