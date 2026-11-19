// extension/lib/media.js: what happens to a video or a sound under a cover (step 6, decided with
// the user 2026-11-18 and 19), as one pure step over one element's state. A cover pauses and
// mutes it and keeps it paused; when no cover holds it any more its own sound setting comes back;
// it plays again only when the cover went because the content changed (YouTube swaps in the next
// Short and plays it before its caption comes) and the page had asked for it meanwhile, never
// when the person lifted the cover (the person presses play). page.js carries the step out on
// the real element; the macro tests check that in Firefox. Runs alone:
//   node --test tests/micro/media-rules.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadExtensionScripts, plain } from '../support/extension-script.mjs';

const { GtaBlocker } = loadExtensionScripts({ files: ['lib/media.js'] });
const { media } = GtaBlocker;
const step = (state, event) => plain(media.step(state && Object.freeze({ ...state }), Object.freeze(event)));
const NOTHING = { muted: null, pause: false, play: false };

test('a cover on a playing video pauses and mutes it, keeps its own sound setting, and remembers it was playing', () => {
  assert.deepEqual(step(null, { type: 'cover', playing: true, muted: false }),
    { state: { mutedBefore: false, wantsPlay: true }, muted: true, pause: true, play: false });
});

test('a cover on a paused video: paused and muted, and not taken as wanting to play', () => {
  assert.deepEqual(step(null, { type: 'cover', playing: false, muted: false }),
    { state: { mutedBefore: false, wantsPlay: false }, muted: true, pause: true, play: false });
});

test('a second cover keeps the first sound setting (by then it is the add-on\u{2019}s own mute)', () => {
  const r = step({ mutedBefore: false, wantsPlay: false }, { type: 'cover', playing: false, muted: true });
  assert.deepEqual(r.state, { mutedBefore: false, wantsPlay: false });
});

test('the page playing it under a cover: paused and muted again, and remembered as wanting to play', () => {
  assert.deepEqual(step({ mutedBefore: false, wantsPlay: false }, { type: 'play', covered: true, muted: true }),
    { state: { mutedBefore: false, wantsPlay: true }, muted: true, pause: true, play: false });
  // One the add-on had not held yet (added under a cover, then played): its sound as it is.
  assert.deepEqual(step(null, { type: 'play', covered: true, muted: false }).state, { mutedBefore: false, wantsPlay: true });
});

test('freed because the content changed: its sound back, and the play the page asked for goes through', () => {
  assert.deepEqual(step({ mutedBefore: false, wantsPlay: true }, { type: 'free', by: 'content', connected: true, paused: true }),
    { state: null, muted: false, pause: false, play: true });
});

test('freed by the person (Not about GTA, the switch, Show anyway): its sound back, but it stays paused', () => {
  assert.deepEqual(step({ mutedBefore: false, wantsPlay: true }, { type: 'free', by: 'person', connected: true, paused: true }),
    { state: null, muted: false, pause: false, play: false });
});

test('never played: a video taken out of the page, one already playing, or one the page never asked for', () => {
  // A detached video has no controls on the page: started, it could not be stopped (review).
  for (const [state, event, why] of [
    [{ mutedBefore: false, wantsPlay: true }, { type: 'free', by: 'content', connected: false, paused: true }, 'taken out of the page'],
    [{ mutedBefore: false, wantsPlay: true }, { type: 'free', by: 'content', connected: true, paused: false }, 'already playing'],
    [{ mutedBefore: false, wantsPlay: false }, { type: 'free', by: 'content', connected: true, paused: true }, 'never asked'],
  ]) {
    assert.equal(step(state, event).play, false, why);
  }
});

test('a video the page itself had muted stays muted when freed', () => {
  // A person who keeps Shorts muted would get sound after every GTA Short (review, 2026-11-19).
  assert.equal(step({ mutedBefore: true, wantsPlay: true }, { type: 'free', by: 'content', connected: true, paused: true }).muted, true);
});

test('played while no cover holds it: the old wish to play is spent', () => {
  // Otherwise: "Not about GTA", the person plays it, then pauses it; a later cover and a
  // content change pressed play on a video the person had paused (review, 2026-11-19).
  assert.deepEqual(step({ mutedBefore: false, wantsPlay: true }, { type: 'play', covered: false, muted: false }),
    { state: { mutedBefore: false, wantsPlay: false }, ...NOTHING });
  assert.deepEqual(step(null, { type: 'play', covered: false, muted: false }), { state: null, ...NOTHING });
});

test('freeing a video the add-on never held, or an unknown event, does nothing', () => {
  assert.deepEqual(step(null, { type: 'free', by: 'content', connected: true, paused: true }), { state: null, ...NOTHING });
  assert.deepEqual(step({ mutedBefore: false, wantsPlay: true }, { type: 'seek' }), { state: { mutedBefore: false, wantsPlay: true }, ...NOTHING });
});

test('the person saying "not about GTA" while it is still covered spends the wish to play', () => {
  // Pressed during the second a Short is checked, the cover stayed until the caption came and
  // then went "because the content changed": the video started, against the user's rule
  // (ChatGPT review, round 2). The person's word counts from the moment it is said.
  const r = step({ mutedBefore: false, wantsPlay: true }, { type: 'stay' });
  assert.deepEqual(r, { state: { mutedBefore: false, wantsPlay: false }, muted: null, pause: false, play: false });
  assert.equal(step(r.state, { type: 'free', by: 'content', connected: true, paused: true }).play, false);
  assert.deepEqual(step(null, { type: 'stay' }), { state: null, muted: null, pause: false, play: false });
});

test('lost, not decided: a hold that ends because the video moved, its box went or the page moved on never plays it', () => {
  // Only "the same item was read again and is not about GTA" lets the page's play through. A
  // GTA video the site moved out of its card, or a trailer under a whole-page cover closed
  // because the page moved to a Short, started with its sound before (design review, round 2).
  assert.deepEqual(step({ mutedBefore: false, wantsPlay: true }, { type: 'free', by: 'lost', connected: true, paused: true }),
    { state: null, muted: false, pause: false, play: false });
});
