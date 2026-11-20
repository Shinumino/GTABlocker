// The rules a site gets on top of the general ones (step 6), as plain logic. Each site's rule
// says:
// - allowsPageCover(pathname): whether a page whose title is about GTA may get the whole-page
//   cover there (cover.pageStep takes the answer);
// - playerAt(pathname): the site's media player on that page that the general rules cannot
//   handle, or null. Two kinds, told apart by `kind`:
//   - 'named', by CSS selectors ({ scope, box, caption, title }: the item, the box to cover,
//     where its words are, and the line that tells one item from the next);
//   - 'found' from its video, where a site gives no names to go by ({ media, postLinks,
//     stopAt }: itemLevel and boxLevel below decide, from what page.js measures, which box
//     around a video is the item and which one gets the cover; `postLinks` names the links
//     postOf reads; `stopAt` names the boxes an item never reaches);
//   and `key` says when an item's check starts again: on a new 'address' as well as a new
//   video source (one item reused for the next, YouTube), or on a new source only (each
//   'item' its own, Instagram). playerStep below decides that player's cover.
// A site is chosen by its host (the frame's own: a YouTube player inside another site has
// YouTube's page shapes), exactly or with "www." in front; a look-alike never is. "m." is not
// stripped: the mobile site is built from other elements, and taking YouTube's rules there
// gave its Shorts the exemption with no player it could find (review, 2026-11-19).
(function (root) {
  'use strict';
  const ns = Object.hasOwn(root, 'GtaBlocker') ? root.GtaBlocker : (root.GtaBlocker = {});

  const GENERAL = Object.freeze({ allowsPageCover: () => true, playerAt: () => null });

  // YouTube Shorts (decided with the user, 2026-11-18 and 19): a Short's PLAYER is covered,
  // paused and muted, while it is checked and when it is about GTA; scrolling on keeps working;
  // a Shorts page (/shorts, then /shorts/<id>) gets no whole-page cover, since its title is the
  // current Short's and the card blocked the feed. From the live page (2026-11-19): one Short
  // element (ytd-reel-video-renderer), reused as the person scrolls, holds the player
  // (#player-container) and, drawn over it, the caption (yt-reel-metapanel-view-model), where
  // the words are.
  const YOUTUBE_PLAYER = Object.freeze({
    kind: 'named', scope: 'ytd-reel-video-renderer', box: '#player-container', caption: 'yt-reel-metapanel-view-model',
    title: 'yt-shorts-video-title-view-model', key: 'address',
  });
  const YOUTUBE = Object.freeze({
    ...GENERAL,
    allowsPageCover: (pathname) => !(typeof pathname === 'string' && /^\/shorts(\/|$)/.test(pathname)),
    playerAt: () => YOUTUBE_PLAYER,
  });

  // Instagram Reels (the user's report and choices, 2026-11-19): the Reels page (/reels/<code>/)
  // and a single reel (/reel/<code>/, also under a name) only; feed, Explore and Stories later.
  // The same as Shorts: a GTA reel's video covered, paused and muted, its caption line striped;
  // everything in its block counts, the comments too. From the live page and the user's saved
  // one (2026-11-19): the class names are scrambled; each reel is its own block (video, a faint
  // copy of its picture around it, then the name, caption and comments, and the like buttons),
  // with its caption from the start; the address changes with every reel; on a single reel's
  // page, the reel and "More posts" (links to 10 other posts, shown below it) share the next
  // box up. An item never reaches the page's main area or the body: a reel shown in a dialog
  // outside the main area, alone on the page, would read the whole page (correctness review).
  const INSTAGRAM_PLAYER = Object.freeze({
    kind: 'found', media: 'video', postLinks: 'a[href*="/p/"], a[href*="/reel/"]', stopAt: 'body, main, [role="main"]', key: 'item',
  });
  // Reel codes are base64url ("_" and "-" too). /<name>/reels/ is a profile's grid, not a reel.
  const REELS_PAGE = /^\/(reels\/?|reels\/[A-Za-z0-9_-]+\/?|([A-Za-z0-9._]+\/)?reel\/[A-Za-z0-9_-]+\/?)$/;
  const INSTAGRAM = Object.freeze({
    ...GENERAL,
    playerAt: (pathname) => (typeof pathname === 'string' && REELS_PAGE.test(pathname) ? INSTAGRAM_PLAYER : null),
  });

  // The post a link goes to (its code, from /p/<code> or /reel/<code>, also after a name), or
  // null: a reel's block links to one post at most, and a comment's own link is under the
  // reel's code (/p/<code>/c/<id>/: live, a single reel's 13 comments each had one, and
  // counting links instead of posts cut the reel down to its bare video, 2026-11-19).
  const POST_LINK = /(?:^|\/)(?:p|reel)\/([A-Za-z0-9_-]+)/;
  function postOf(href) {
    if (typeof href !== 'string') return null;
    const found = POST_LINK.exec(href);
    return found ? found[1] : null;
  }

  // ---- a 'found' player: which box around a video is the item, and which gets the cover ----
  // page.js measures each box on the way up; these decide, so the rules are tested here and
  // not only in Firefox (design review, 2026-11-19).

  // `levels`: from the video's parent up to the last box below a `stopAt` one, each
  // { videos, posts } (how many videos it holds, how many posts its links go to). The item is
  // the highest box with no other video and links to one post at most: a reel's block on the
  // Reels page (the list holds the other reels), and on a single reel's page the reel without
  // "More posts". -1: none (the video's own parent already fails).
  function itemLevel(levels) {
    let found = -1;
    for (let i = 0; i < levels.length; i++) {
      if (!fitsItem(levels[i])) break;
      found = i;
    }
    return found;
  }

  // One box, as above: whether it can be (part of) a reel's item. page.js stops measuring at
  // the first box that cannot.
  function fitsItem({ videos, posts }) {
    return videos === 1 && posts <= 1;
  }

  // `levels`: the video itself, then each box above it below the item, each { words, carries }
  // (holds words a person reads, so every box around it does too; can carry a cover). The cover's box is the highest one with no
  // words that can carry a cover: live, that takes in the controls and the faint copy of the
  // reel's picture around the video, and stops below the name and caption (2026-11-19). With
  // words right around the video (a label on it), the first box that can carry one, words or
  // not: no cover at all let the video play (security and correctness review). -1: none, and
  // page.js covers the item itself.
  function boxLevel(levels) {
    let wordless = -1;
    let first = -1;
    for (let i = 0; i < levels.length; i++) {
      if (!levels[i].carries) continue;
      if (first === -1) first = i;
      if (!levels[i].words) wordless = i;
    }
    return wordless !== -1 ? wordless : first;
  }

  const SITES = new Map([['youtube.com', YOUTUBE], ['instagram.com', INSTAGRAM]]);

  function rulesFor(host) {
    if (typeof host !== 'string') return GENERAL;
    const name = host.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
    return SITES.get(name) || GENERAL;
  }

  // ---- a site player's cover, one item (a Short, a reel) at a time ----

  // How long a caption that has not changed is distrusted after the address changed. Live,
  // YouTube put in the new caption ~0.8 s after the address (2026-11-19); two Shorts in a row
  // with the very same caption would otherwise stay "Checking" for good (the user chose 4 s).
  const PLAYER_WAIT_MS = 4000;

  // One step for one item's player. `state` is null (never seen) or what the last step gave;
  // the input is `key` (the page's address; for a player whose items are checked again only on
  // a new source, the same word every time: `key: 'item'` above), the item's caption text as it
  // is now (`caption`, '' when there is none), the word it matched (`entry`, null when none, or
  // when the person said it is not about GTA there: on this address, or for that reel), the
  // time (`now`, in ms), and `restart` when the item's video just got a new source: live,
  // YouTube swaps the next Short's video in 16 to 245 ms BEFORE it changes the address
  // (2026-11-19), so that is the first sign of a new item, and it counts like a new address.
  // Returns { state, act, entry, wakeAt }: state.shows is what the player shows ('check' while
  // it is checked, 'gta' when covered as about GTA, 'none'); act says what changed ('check',
  // 'cover' (with entry: a new cover or a new word), 'clear', 'none'); wakeAt, while it is
  // checked, is when to look again although nothing changed (the wait above), else null.
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

  ns.sites = Object.freeze({ rulesFor, playerStep, postOf, itemLevel, fitsItem, boxLevel, PLAYER_WAIT_MS });
})(globalThis);
