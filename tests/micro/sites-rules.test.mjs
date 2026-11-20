// extension/lib/sites.js: the rules one site gets on top of the general ones (step 6). A site's
// rule says whether its pages may get the whole-page cover, and gives its media player on a
// page, if it has one the general rules cannot handle: named by selectors (YouTube Shorts) or
// found from its video (Instagram Reels: itemLevel, boxLevel and postOf decide). The player's
// own rule (sites.playerStep) decides, for one Short or reel, when its player is covered while
// it is checked, covered as about GTA, or shown: decided with the user, 2026-11-19 (every
// Short starts under "Checking for GTA..." until its caption is read; a caption that has not
// changed yet is not the new Short's). All plain logic; page.js measures the page and carries
// it out, and the macro tests check that in Firefox. Runs alone:
//   node --test tests/micro/sites-rules.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadExtensionScripts, plain } from '../support/extension-script.mjs';

const { GtaBlocker } = loadExtensionScripts({ files: ['lib/sites.js'] });
const { sites } = GtaBlocker;

test('YouTube Shorts get no whole-page cover; every other YouTube page may (user, 2026-11-18)', () => {
  for (const host of ['www.youtube.com', 'youtube.com', 'WWW.YouTube.COM', 'www.youtube.com.']) {
    const r = sites.rulesFor(host);
    assert.equal(r.allowsPageCover('/shorts/3Gf1PYunHLY'), false, host);
    // YouTube's own Shorts address, before it moves on to the first Short (live, 2026-11-19).
    assert.equal(r.allowsPageCover('/shorts'), false, `${host}: /shorts`);
    for (const path of ['/watch', '/results', '/', '/shortsfilm', '/@channel/shorts']) {
      assert.equal(r.allowsPageCover(path), true, `${host}: ${path}`);
    }
  }
});

const YOUTUBE_PLAYER = {
  kind: 'named', scope: 'ytd-reel-video-renderer', box: '#player-container', caption: 'yt-reel-metapanel-view-model',
  title: 'yt-shorts-video-title-view-model', key: 'address',
};

test('YouTube names its Shorts player: the Short, its player box and its caption (live DOM, 2026-11-19)', () => {
  // On every YouTube page: the player is only found where a Short is.
  for (const path of ['/shorts/3Gf1PYunHLY', '/watch', '/']) {
    assert.deepEqual(plain(sites.rulesFor('www.youtube.com').playerAt(path)), YOUTUBE_PLAYER, path);
  }
});

// Instagram Reels (the user's report, 2026-11-19: the caption was covered, the GTA video
// played). Instagram scrambles its class names, so a reel is found from its video (itemLevel
// and boxLevel below). Each reel is its own block (live: the next reel is not swapped into the
// same elements), so a reel's check starts when it appears and when its video gets a new
// source, not when the address changes (it changes with every reel); its text is read on
// every pass. The user chose: the Reels page and a single reel only; feed, Explore and Stories
// later.
const INSTAGRAM_PLAYER = {
  kind: 'found', media: 'video', postLinks: 'a[href*="/p/"], a[href*="/reel/"]', stopAt: 'body, main, [role="main"]', key: 'item',
};

test('Instagram: the Reels page and a single reel get a player found from its video', () => {
  for (const host of ['www.instagram.com', 'instagram.com', 'WWW.Instagram.COM', 'www.instagram.com.']) {
    const r = sites.rulesFor(host);
    // Reel codes are base64url: "_" and "-" are part of them. A reel shared from a profile can
    // be addressed under its name (/<name>/reel/<code>/; correctness review, 2026-11-19).
    for (const path of ['/reels/Df7SJWPh8Ro/', '/reels/Df7SJWPh8Ro', '/reel/Df7ql1DJKp4/', '/reels/', '/reels',
      '/reels/C_x-9aBcDeF/', '/reel/C_x-9aBcDeF/', '/tutorial_info/reel/Df7ql1DJKp4/', '/tutorial.info_2/reel/C_x-9aBcDeF']) {
      assert.deepEqual(plain(r.playerAt(path)), INSTAGRAM_PLAYER, `${host}: ${path}`);
    }
    // Its titles say only "Instagram" (live and the user's saved page): the whole-page card can
    // stay allowed there, it never comes.
    assert.equal(r.allowsPageCover('/reels/Df7SJWPh8Ro/'), true, host);
  }
});

test('Instagram: a link\u{2019}s post is its code, from /p/<code> or /reel/<code>, a comment\u{2019}s own link included; anything else is no post', () => {
  // A reel's block links to one post at most: live, a single reel's comments each link to
  // themselves under the reel's own code (/p/<code>/c/<id>/, 13 of them), and counting links
  // instead of posts cut the reel down to its bare video, with nothing to read (2026-11-19).
  for (const [href, code] of [
    ['/p/Df7SJWPh8Ro/', 'Df7SJWPh8Ro'], ['/reel/Df7ql1DJKp4/', 'Df7ql1DJKp4'], ['/reel/Df7ql1DJKp4', 'Df7ql1DJKp4'],
    ['/p/Df7SJWPh8Ro/c/17896767150439835/', 'Df7SJWPh8Ro'], ['https://www.instagram.com/p/Df7SJWPh8Ro/', 'Df7SJWPh8Ro'],
    ['/tutorial_info/p/Df7SJWPh8Ro/', 'Df7SJWPh8Ro'], ['/tutorial_info/reel/Df7ql1DJKp4/', 'Df7ql1DJKp4'],
    ['/p/C_x-9aBcDeF/', 'C_x-9aBcDeF'],
  ]) assert.equal(sites.postOf(href), code, href);
  for (const href of ['/reels/audio/390532918118706/', '/tutorial_info/reels/', '/tutorial_info/', '/explore/tags/gta6/', '/p/',
    '/reels/Df7SJWPh8Ro/', '/xp/abc/', '/preel/abc/', '', null, undefined, 42]) {
    assert.equal(sites.postOf(href), null, String(href));
  }
});

test('Instagram: every other page keeps the general rules (feed, Explore, posts, a profile\u{2019}s reels, audio pages)', () => {
  const r = sites.rulesFor('www.instagram.com');
  for (const path of ['/', '/explore/', '/p/Df7SJWPh8Ro/', '/tutorial_info/reels/', '/reels/audio/390532918118706/',
    '/stories/tutorial_info/123/', '/reelsx/', '/reel/', '/direct/inbox/', '/tutorial_info/p/Df7SJWPh8Ro/',
    '/a/b/reel/Df7ql1DJKp4/', '', null, undefined]) {
    assert.equal(r.playerAt(path), null, String(path));
  }
});

test('every player a site gives is one of the two kinds, with all of its fields and nothing else', () => {
  // page.js tells the kinds apart by `kind`; a player with fields of both, or missing one,
  // would be read half one way and half the other (design review, 2026-11-19).
  const FIELDS = { named: ['caption', 'box', 'key', 'kind', 'scope', 'title'], found: ['key', 'kind', 'media', 'postLinks', 'stopAt'] };
  for (const [host, path] of [['www.youtube.com', '/shorts/x'], ['www.instagram.com', '/reels/x/']]) {
    const player = sites.rulesFor(host).playerAt(path);
    assert.ok(Object.isFrozen(player), host);
    assert.deepEqual(Object.keys(player).sort(), FIELDS[player.kind].sort(), host);
    assert.ok(['address', 'item'].includes(player.key), host);
  }
});

// ---- finding a reel from its video, and its cover's box (pure: page.js measures, these decide) ----

test('a reel\u{2019}s item: the highest box around its video with no other video and links to one post at most', () => {
  // Each level: the boxes from the video's parent up to the page's main area, never reaching it.
  const L = (videos, posts) => ({ videos, posts });
  assert.equal(sites.itemLevel([L(1, 0), L(1, 0), L(1, 1), L(3, 1)]), 2, 'the reels list holds three videos');
  assert.equal(sites.itemLevel([L(1, 0), L(1, 1), L(1, 1), L(1, 4)]), 2, 'More posts links to other posts');
  assert.equal(sites.itemLevel([L(1, 0), L(1, 0)]), 1, 'up to the main area: the highest box below it');
  assert.equal(sites.itemLevel([L(2, 0)]), -1, 'a box with two videos is no reel');
  assert.equal(sites.itemLevel([L(1, 2)]), -1);
  assert.equal(sites.itemLevel([]), -1, 'the video right under the main area');
});

test('a reel\u{2019}s cover box: the highest box around the video with no words that can carry a cover, else the first that can', () => {
  // Each level: the video itself first, then each box up to the item (never the item itself).
  // The highest box with no words takes in the controls and the faint copy of the reel's picture
  // Instagram draws around the video, and stops below the name and caption (live, 2026-11-19).
  const L = (words, carries) => ({ words, carries });
  assert.equal(sites.boxLevel([L(false, false), L(false, true), L(false, true), L(true, true)]), 2);
  assert.equal(sites.boxLevel([L(false, false), L(false, true), L(false, false), L(true, true)]), 1, 'the highest one that can carry');
  // Words in the video's own wrapper (a "Paid partnership" label): the first box that can carry
  // a cover, words or not; no cover at all brought back the reported bug (security and
  // correctness review, 2026-11-19).
  assert.equal(sites.boxLevel([L(false, false), L(true, true), L(true, true)]), 1);
  assert.equal(sites.boxLevel([L(false, false), L(true, false), L(true, true)]), 2);
  assert.equal(sites.boxLevel([L(false, false)]), -1, 'none: page.js covers the item itself');
  assert.equal(sites.boxLevel([]), -1);
});

test('the mobile site is a site of its own: it keeps the general rules (its Shorts are other elements)', () => {
  // Stripping "m." gave m.youtube.com the Shorts exemption without a player it could find:
  // a GTA Short there got no cover at all (review, 2026-11-19). Settings treat it apart too.
  const r = sites.rulesFor('m.youtube.com');
  assert.equal(r.allowsPageCover('/shorts/abc'), true);
  assert.equal(r.playerAt('/shorts/abc'), null);
});

test('a site with no rules of its own, or a look-alike name, gets the general ones', () => {
  for (const host of ['www.reddit.com', 'x.com', 'example.test', 'youtube.com.evil.test', 'notyoutube.com', 'youtube.co',
    'www.m.youtube.com', 'm.instagram.com', 'instagram.com.evil.test', 'notinstagram.com', '', null, undefined, 42]) {
    const r = sites.rulesFor(host);
    assert.equal(r.allowsPageCover('/shorts/abc'), true, String(host));
    assert.equal(r.playerAt('/reels/abc/'), null, String(host));
    assert.equal(r.playerAt('/shorts/abc'), null, String(host));
  }
});

// ---- the player's rule: one Short, step by step ----

const GTA = 'gta*';
// Runs the steps in order and returns each result; every state is frozen, so a step that
// changes its input in place throws.
function run(steps, state = null) {
  const out = [];
  for (const input of steps) {
    const r = sites.playerStep(state, { now: 0, ...input });
    out.push(r);
    state = deepFreeze(r.state);
  }
  return out;
}
function deepFreeze(o) {
  if (o && typeof o === 'object') { for (const v of Object.values(o)) deepFreeze(v); Object.freeze(o); }
  return o;
}
const shows = (rs) => rs.map((r) => r.state.shows);
const acts = (rs) => rs.map((r) => r.act);

test('a Short seen with its caption is decided at once: covered if about GTA, shown if not', () => {
  const [gta] = run([{ key: 'a', caption: 'All legends #gta6', entry: GTA }]);
  assert.equal(gta.act, 'cover');
  assert.equal(gta.entry, GTA);
  assert.equal(gta.state.shows, 'gta');
  const [cat] = run([{ key: 'a', caption: 'A cat meets a cucumber', entry: null }]);
  assert.equal(cat.act, 'none', 'nothing to do: it was never covered');
  assert.equal(cat.state.shows, 'none');
});

test('a Short with no caption yet is checked (covered, "Checking for GTA...") until one comes', () => {
  const rs = run([
    { key: 'a', caption: '', entry: null },
    { key: 'a', caption: '', entry: null, now: 9000 }, // no caption, however long: still checked
    { key: 'a', caption: 'A cat meets a cucumber', entry: null, now: 9100 },
  ]);
  assert.deepEqual(acts(rs), ['check', 'none', 'clear']);
  assert.deepEqual(shows(rs), ['check', 'check', 'none']);
});

test('scrolling from a Short not about GTA: the next one is checked from the moment its address changes', () => {
  // Live, YouTube plays the new Short ~0.8 s before it puts in the new caption: the caption
  // still on the page then is the last Short's, and a GTA Short played uncovered with its sound.
  const rs = run([
    { key: 'a', caption: 'A cat meets a cucumber', entry: null },
    { key: 'b', caption: 'A cat meets a cucumber', entry: null, now: 350 }, // the address first
    { key: 'b', caption: 'Vice City at night #gta6', entry: 'vice city', now: 1150 }, // its caption
  ]);
  assert.deepEqual(acts(rs), ['none', 'check', 'cover']);
  assert.deepEqual(shows(rs), ['none', 'check', 'gta']);
  assert.equal(rs[2].entry, 'vice city');
});

test('a new video in the same Short starts the check at once, before the address changes', () => {
  // Live, 2026-11-19: YouTube swaps the next Short's video in ("emptied", "play", "loadstart")
  // 16 to 245 ms BEFORE it changes the address. page.js sends restart then.
  const rs = run([
    { key: 'a', caption: 'A cat meets a cucumber', entry: null },
    { key: 'a', caption: 'A cat meets a cucumber', entry: null, now: 100, restart: true }, // the new video
    { key: 'b', caption: 'A cat meets a cucumber', entry: null, now: 300 }, // then the address
    { key: 'b', caption: 'Vice City at night #gta6', entry: 'vice city', now: 1100 }, // then its caption
  ]);
  assert.deepEqual(acts(rs), ['none', 'check', 'none', 'cover']);
  assert.deepEqual(shows(rs), ['none', 'check', 'check', 'gta']);
});

test('scrolling from a GTA Short: covered until the new caption shows the next one is not about GTA, and "Checking" meanwhile (user, 2026-11-19)', () => {
  // The cover never lifts in between; its note says what is going on, not the last Short's
  // word, and the icon does not count it (the user's choice after round 2).
  const rs = run([
    { key: 'a', caption: 'All legends #gta6', entry: GTA },
    { key: 'b', caption: 'All legends #gta6', entry: GTA, now: 350 }, // the old caption: not a decision
    { key: 'b', caption: 'A cat meets a cucumber', entry: null, now: 1150 },
  ]);
  assert.deepEqual(acts(rs), ['cover', 'check', 'clear']);
  assert.deepEqual(shows(rs), ['gta', 'check', 'none']);
  assert.equal(rs[1].entry, null, 'no word while it is checked');
});

test('a GTA Short after a GTA Short stays covered, and the cover takes the new word', () => {
  const rs = run([
    { key: 'a', caption: 'All legends #gta6', entry: GTA },
    { key: 'b', caption: 'All legends #gta6', entry: GTA, now: 350 },
    { key: 'b', caption: 'Vice City at night', entry: 'vice city', now: 1150 },
  ]);
  assert.deepEqual(shows(rs), ['gta', 'check', 'gta']);
  assert.equal(rs[2].act, 'cover');
  assert.equal(rs[2].entry, 'vice city');
});

test('an empty caption is never taken as "not about GTA" (ChatGPT review, 2026-11-19)', () => {
  const rs = run([
    { key: 'a', caption: 'All legends #gta6', entry: GTA },
    { key: 'a', caption: '', entry: null }, // the site empties it for a moment
    { key: 'b', caption: '', entry: null, now: 350 },
    { key: 'b', caption: '', entry: null, now: 9000 },
  ]);
  assert.deepEqual(shows(rs), ['gta', 'gta', 'check', 'check']);
  assert.deepEqual(acts(rs), ['cover', 'none', 'check', 'none']);
});

test('a caption that never changes is decided 4 s after the address changed (user, 2026-11-19)', () => {
  // Two Shorts in a row with the very same caption: the same words give the same answer.
  const cat = run([
    { key: 'a', caption: 'A cat meets a cucumber', entry: null },
    { key: 'b', caption: 'A cat meets a cucumber', entry: null, now: 1000 },
    { key: 'b', caption: 'A cat meets a cucumber', entry: null, now: 4999 },
    { key: 'b', caption: 'A cat meets a cucumber', entry: null, now: 5000 },
  ]);
  assert.deepEqual(shows(cat), ['none', 'check', 'check', 'none']);
  assert.equal(sites.PLAYER_WAIT_MS, 4000);
  // While it is checked the page is told when to look again: the moment the wait is over.
  assert.equal(cat[1].wakeAt, 5000);
  assert.equal(cat[3].wakeAt, null);
  const gta = run([
    { key: 'a', caption: 'All legends #gta6', entry: GTA },
    { key: 'b', caption: 'All legends #gta6', entry: GTA, now: 1000 },
    { key: 'b', caption: 'All legends #gta6', entry: GTA, now: 5000 },
  ]);
  assert.deepEqual(shows(gta), ['gta', 'check', 'gta']);
});

test('a new video on a Short the add-on had no memory of does not trust the caption already there', () => {
  // A restart of the add-on (the switch, a word list change) or a lost player box inside the
  // 0.8 s gap left no state: the last Short's caption was taken as the new one's (review,
  // round 2). With a new video seen, the caption on the page must change first, or the wait end.
  const rs = run([
    { key: 'b', caption: 'A cat meets a cucumber', entry: null, restart: true },
    { key: 'b', caption: 'Vice City at night #gta6', entry: 'vice city', now: 800 },
  ]);
  assert.deepEqual(shows(rs), ['check', 'gta']);
});

test('on the same Short, a caption that changes is decided again at once ("...more" opened)', () => {
  const rs = run([
    { key: 'a', caption: 'A night drive', entry: null },
    { key: 'a', caption: 'A night drive through Vice City', entry: 'vice city', now: 10 },
    { key: 'a', caption: 'A night drive', entry: null, now: 20 },
  ]);
  assert.deepEqual(acts(rs), ['none', 'cover', 'clear']);
});

test('"Not about GTA" for this Short shows it; Undo covers it again (the word comes in as null, then back)', () => {
  const rs = run([
    { key: 'a', caption: 'All legends #gta6', entry: GTA },
    { key: 'a', caption: 'All legends #gta6', entry: null }, // the person said it is not about GTA
    { key: 'a', caption: 'All legends #gta6', entry: GTA }, // Undo
  ]);
  assert.deepEqual(acts(rs), ['cover', 'clear', 'cover']);
});

test('nothing new: the same caption and word on the same Short is no step at all', () => {
  const rs = run([
    { key: 'a', caption: 'All legends #gta6', entry: GTA },
    { key: 'a', caption: 'All legends #gta6', entry: GTA, now: 100 },
  ]);
  assert.deepEqual(acts(rs), ['cover', 'none']);
  assert.equal(rs[1].state, rs[0].state, 'the state is handed back as it was');
});

test('an empty caption gives no time to wake at: only the caption coming can decide (no polling)', () => {
  // A wake time past due came back on every pass, and the page looked again every 50 ms for
  // as long as the caption stayed empty (ChatGPT and Gemini review, round 2).
  const rs = run([
    { key: 'a', caption: '', entry: null },
    { key: 'a', caption: '', entry: null, now: 9000 },
  ]);
  assert.deepEqual(rs.map((r) => r.wakeAt), [null, null]);
  // With a caption that has not changed yet, the wait still has a time.
  const same = run([
    { key: 'a', caption: 'A cat meets a cucumber', entry: null },
    { key: 'b', caption: 'A cat meets a cucumber', entry: null, now: 1000 },
  ]);
  assert.equal(same[1].wakeAt, 5000);
});
