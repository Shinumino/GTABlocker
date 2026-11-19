// GtaBlocker.media: what happens to a video or a sound under a cover (step 6, decided with the
// user 2026-11-18 and 19), as one pure step. The same rule for every cover: a covered item, a
// Short's player, the whole-page cover (which paused but never muted before: ChatGPT review,
// 2026-11-19).
//
// One element's state is null (the add-on does not hold it) or { mutedBefore, wantsPlay }:
// - mutedBefore: its own muted setting when a cover first held it, given back when no cover
//   holds it any more (a video the page had muted stays muted);
// - wantsPlay: it was playing when covered, or the page played it while covered. When the
//   cover goes because the content changed (YouTube swaps in the next Short and plays it
//   before its caption comes, so the play lands under the old cover), that play goes through:
//   the next Short stood still otherwise (live, 2026-11-19). When the person lifts the cover
//   it does not: the person presses play (the user's choice, 2026-11-18). A play while no
//   cover holds it spends the wish, so a video the person paused is never started later.
//
// step(state, event) returns { state, muted, pause, play }: muted is the value to set (null:
// leave it), pause and play whether to call them. Events:
// - { type: 'cover', playing, muted }: a cover now holds it;
// - { type: 'play', covered, muted }: the page started it (a trusted play event only);
// - { type: 'free', by: 'content' | 'person' | 'lost', connected, paused }: no cover holds it any
//   more. 'content': its item was read again and is not about GTA; 'person': the person lifted
//   the cover; 'lost': the hold ended for any other reason (moved, its box gone, the page moved
//   on). Only 'content' lets the page's play through;
// - { type: 'stay' }: the person said it is not about GTA while a cover still holds it (a Short
//   being checked): the wish to play is spent then, so the cover going later never starts it
//   (ChatGPT review, round 2).
(function (root) {
  'use strict';
  const ns = Object.hasOwn(root, 'GtaBlocker') ? root.GtaBlocker : (root.GtaBlocker = {});

  const NOTHING = Object.freeze({ muted: null, pause: false, play: false });
  const HUSH = Object.freeze({ muted: true, pause: true, play: false });

  function step(state, event) {
    const e = event || {};
    if (e.type === 'cover') {
      const s = state ? { ...state, wantsPlay: state.wantsPlay || e.playing === true }
        : { mutedBefore: e.muted === true, wantsPlay: e.playing === true };
      return { state: s, ...HUSH };
    }
    if (e.type === 'play') {
      if (e.covered) {
        return { state: state ? { ...state, wantsPlay: true } : { mutedBefore: e.muted === true, wantsPlay: true }, ...HUSH };
      }
      return { state: state && state.wantsPlay ? { ...state, wantsPlay: false } : state, ...NOTHING };
    }
    if (e.type === 'stay') {
      return { state: state && state.wantsPlay ? { ...state, wantsPlay: false } : state, ...NOTHING };
    }
    if (e.type === 'free') {
      if (!state) return { state: null, ...NOTHING };
      // Never a video taken out of the page: it has no controls there, and could not be stopped.
      const play = e.by === 'content' && state.wantsPlay === true && e.connected === true && e.paused === true;
      return { state: null, muted: state.mutedBefore, pause: false, play };
    }
    return { state, ...NOTHING };
  }

  ns.media = Object.freeze({ step });
})(globalThis);
