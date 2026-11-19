// The rules a site gets on top of the general ones (step 6), as plain logic. Each site's rule
// says:
// - allowsPageCover(pathname): whether a page whose title is about GTA may get the whole-page
//   cover there (cover.pageStep takes the answer);
// - player: the site's media player that the general rules cannot handle, named by CSS
//   selectors page.js looks up ({ scope, box, caption, title }: the item, the box to cover,
//   where its words are, and the line that tells one item from the next), or null. playerStep
//   below decides that player's cover.
// A site is chosen by its host (the frame's own: a YouTube player inside another site has
// YouTube's page shapes), exactly or with "www." in front; a look-alike never is. "m." is not
// stripped: the mobile site is built from other elements, and taking YouTube's rules there
// gave its Shorts the exemption with no player it could find (review, 2026-11-19).
(function (root) {
  'use strict';
  const ns = Object.hasOwn(root, 'GtaBlocker') ? root.GtaBlocker : (root.GtaBlocker = {});

  const GENERAL = Object.freeze({ allowsPageCover: () => true, player: null });

  // YouTube Shorts (decided with the user, 2026-11-18 and 19): a Short's PLAYER is covered,
  // paused and muted, while it is checked and when it is about GTA; scrolling on keeps working;
  // a Shorts page (/shorts, then /shorts/<id>) gets no whole-page cover, since its title is the
  // current Short's and the card blocked the feed. From the live page (2026-11-19): one Short
  // element (ytd-reel-video-renderer), reused as the person scrolls, holds the player
  // (#player-container) and, drawn over it, the caption (yt-reel-metapanel-view-model), where
  // the words are.
  const YOUTUBE = Object.freeze({
    ...GENERAL,
    allowsPageCover: (pathname) => !(typeof pathname === 'string' && /^\/shorts(\/|$)/.test(pathname)),
    player: Object.freeze({
      scope: 'ytd-reel-video-renderer', box: '#player-container', caption: 'yt-reel-metapanel-view-model',
      title: 'yt-shorts-video-title-view-model',
    }),
  });

  const SITES = new Map([['youtube.com', YOUTUBE]]);

  function rulesFor(host) {
    if (typeof host !== 'string') return GENERAL;
    const name = host.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
    return SITES.get(name) || GENERAL;
  }

  // ---- a site player's cover, one item (a Short) at a time ----

  // How long a caption that has not changed is distrusted after the address changed. Live,
  // YouTube put in the new caption ~0.8 s after the address (2026-11-19); two Shorts in a row
  // with the very same caption would otherwise stay "Checking" for good (the user chose 4 s).
  const PLAYER_WAIT_MS = 4000;

  // One step for one item's player. `state` is null (never seen) or what the last step gave;
  // the input is the page's address (`key`), the item's caption text as it is now (`caption`,
  // '' when there is none), the word it matched (`entry`, null when none, or when the person
  // said it is not about GTA on this address), the time (`now`, in ms), and `restart` when the
  // item's video just got a new source: live, YouTube swaps the next Short's video in 16 to
  // 245 ms BEFORE it changes the address (2026-11-19), so that is the first sign of a new
  // item, and it counts like a new address. Returns
  // { state, act, entry, wakeAt }: state.shows is what the player shows ('check' while it is
  // checked, 'gta' when covered as about GTA, 'none'); act says what changed ('check', 'cover'
  // (with entry: a new cover or a new word), 'clear', 'none'); wakeAt, while it is checked, is
  // when to look again although nothing changed (the wait above), else null.
  //
  // The rules (the user's, 2026-11-19): a cover stays until a caption shows the item is not
  // about GTA. After the address changes, the caption on the page is the last item's until it
  // changes: YouTube played the next Short ~0.8 s before its caption came, and a GTA Short
  // played uncovered with its sound. So a new item is checked until its caption changes, or
  // the wait is over: a player covered as about GTA stays covered, its note now "Checking". An
  // empty caption is never "not about GTA" (ChatGPT review, 2026-11-19).
  function playerStep(state, { key, caption, entry = null, now, restart = false }) {
    const text = typeof caption === 'string' ? caption : '';
    const word = entry || null;
    let s = state;
    if (!s || s.key !== key || restart === true) {
      // Checked, whatever the last one was: still covered, but the note says "Checking" and
      // not the last Short's word (the user's choice after round 2). A new video on an item
      // with no state does not trust the caption already there either: a restart of the
      // add-on inside the gap left none, and the last Short's caption was taken (round 2).
      s = {
        key, shows: 'check', entry: null, text: s ? s.text : '', checking: true,
        from: s ? s.text : restart === true ? text : null, since: now,
      };
    }
    if (s.checking) {
      const fresh = text !== '' && (s.from === null || text !== s.from);
      const waited = text !== '' && now - s.since >= PLAYER_WAIT_MS;
      if (!fresh && !waited) return finish(state, s, text);
    } else if (text === '' || (text === s.text && word === s.entry)) {
      return { state, act: 'none', entry: s.entry, wakeAt: null };
    }
    return finish(state, { key, shows: word ? 'gta' : 'none', entry: word, text, checking: false, from: null, since: null }, text);
  }

  // wakeAt only while the wait can still decide: with no caption at all, only the caption coming
  // can (a mutation), and a past-due wake time made the page look again every 50 ms for as long
  // as the caption stayed empty (ChatGPT and Gemini review, round 2).
  function finish(prev, next, text) {
    const was = prev ? prev.shows : 'none';
    let act = 'none';
    if (next.shows === 'check' && was !== 'check') act = 'check';
    else if (next.shows === 'gta' && !(was === 'gta' && prev.entry === next.entry)) act = 'cover';
    else if (next.shows === 'none' && was !== 'none') act = 'clear';
    return { state: next, act, entry: next.entry, wakeAt: next.checking && text !== '' ? next.since + PLAYER_WAIT_MS : null };
  }

  ns.sites = Object.freeze({ rulesFor, playerStep, PLAYER_WAIT_MS });
})(globalThis);
