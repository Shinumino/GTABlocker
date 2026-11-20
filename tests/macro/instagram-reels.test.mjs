// Journey 9: Instagram Reels (the user's report, 2026-11-19: only the caption was covered, the
// GTA video played), in the installed Firefox with the real extension, on stand-ins shaped like
// Instagram's (tests/fixtures/www.instagram.com/: the Reels page, logged out and, with
// ?loggedin, the logged-in shape of the user's saved page; and a single reel's page with "More
// posts" below it). Decided with the user, 2026-11-19:
// - the Reels page and a single reel only (feed, Explore and Stories later);
// - the same as Shorts: a GTA reel's video is covered, paused and muted, and the page cannot
//   start it again while it is covered; its text's GTA lines get stripes only; the cover stays
//   until the reel is read as not about GTA, then it plays on its own with its sound;
//   "Not about GTA" counts for that reel only;
// - everything in the reel's block counts, the comments too (no reliable way to tell the
//   caption from them).
// Instagram scrambles its class names, so a reel is found from its video (sites.js). Live, each
// reel is its own block, its caption in from the start, and the address changes with every
// reel: a reel's check starts when it appears and when its video gets a new source, not when
// the address changes; its text is read on every pass.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useFirefox, EXTENSION_DIR } from '../support/browser-test.mjs';
import { ADDON_PREFS, openMenu, menuKeys, waitForBadge, openSettings, backToTab } from '../support/toolbar.mjs';

// Autoplay allowed: a paused video can only be the extension's doing (as in youtube-shorts).
const session = useFirefox({ extensionDir: EXTENSION_DIR, prefs: { ...ADDON_PREFS, 'media.autoplay.default': 0, 'media.autoplay.blocking_policy': 0 }, systemAccess: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const js = (script) => session.firefox.evaluate(script);
// Well under the 4 s a check can last (sites.PLAYER_WAIT_MS): a wait this short proves a reel
// was read at once, not after the check ran out (test review, 2026-11-19).
const AT_ONCE = { timeoutMs: 1500 };

// The Reels page, everything a test looks at in one read: per reel, the player box (the largest
// box around the video with no words: the one marked data-virtualized when logged in), what
// else in the reel is covered, and its video.
const REELS_NOW = `
  const covered = (e) => !!e && e.hasAttribute('data-gta-cover');
  return {
    path: location.pathname, heard: window.__heard, playedUncovered: window.__playedUncovered,
    hosts: [...document.documentElement.children].filter((e) => e.localName.startsWith('gta-blocker-page')).length,
    reels: [...document.querySelectorAll('.row')].map((row) => {
      const box = row.querySelector('.virtualized') || row.querySelector('.frame');
      const v = row.querySelector('video');
      const others = [...row.querySelectorAll('[data-gta-cover]')].filter((e) => e !== box);
      return {
        player: covered(box), checking: box.hasAttribute('data-gta-checking'), word: box.getAttribute('data-gta-word'),
        anyCover: covered(box) || others.some((e) => e.contains(v)),
        row: covered(row), rowChecking: row.hasAttribute('data-gta-checking'), rowWord: row.getAttribute('data-gta-word'),
        sideWhole: others.some((e) => e.contains(row.querySelector('.who'))),
        captionLine: others.some((e) => e.closest('.caption')), quiet: others.every((e) => e.hasAttribute('data-gta-quiet')),
        commentLine: others.some((e) => e.closest('.remarks')),
        nameOrCounts: others.some((e) => e.closest('.who') || e.closest('.actions')), elsewhere: others.filter((e) => !e.closest('.side')).length,
        glowHidden: getComputedStyle(row.querySelector('.glow')).visibility === 'hidden',
        paused: v ? v.paused : null, muted: v ? v.muted : null,
      };
    }),
  };`;
const reelsNow = () => js(REELS_NOW);
const waitReels = (what, check, opts) => session.firefox.waitForPage(what, `const s = (() => { ${REELS_NOW} })(); return (${check})(s) ? s : false;`, opts);

async function open(path) {
  const { firefox, fixtures } = session;
  await firefox.navigate(fixtures.url('www.instagram.com', path));
  await firefox.waitForPage('the extension to finish its first look', "return document.documentElement.getAttribute('data-gta-blocker') === 'ready'");
}
const coveredGta = (i, word = 'gta*', opts) => waitReels(`reel ${i} covered as about GTA (${word})`, `(s) => s.reels[${i}].player && !s.reels[${i}].checking && s.reels[${i}].word === ${JSON.stringify(word)}`, opts);
const playing = (i, opts) => waitReels(`reel ${i} uncovered, playing with its sound`, `(s) => !s.reels[${i}].player && !s.reels[${i}].paused && !s.reels[${i}].muted`, opts);
// Samples `check` every 50 ms for `ms`; fails at the first sample that does not hold.
async function holds(ms, what, check) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const s = await reelsNow();
    assert.ok(check(s), `${what}, ${ms - (end - Date.now())} ms in: ${JSON.stringify(s.reels.map((r) => [r.player, r.checking, r.paused, r.muted]))}`);
    await sleep(50);
  }
}

for (const shape of ['logged out', 'logged in']) {
  test(`a GTA reel (${shape}): its video, controls and the faint copy around it covered, paused and muted; its caption line striped; the next reel not`, async () => {
    await open(shape === 'logged in' ? '/reels/gtareel/?loggedin' : '/reels/gtareel/');
    await coveredGta(0);
    const s = await waitReels('the video paused and muted', '(s) => s.reels[0].paused && s.reels[0].muted');
    const r = s.reels[0];
    assert.equal(r.glowHidden, true, 'the faint copy of the reel\u{2019}s picture around the video showed');
    // Stripes only on the caption's GTA line: the player's note says it (as on Shorts).
    assert.deepEqual([r.captionLine, r.quiet], [true, true], 'the caption line, striped');
    assert.deepEqual([r.nameOrCounts, r.sideWhole, r.elsewhere], [false, false, 0], 'the name, Follow and the counts stay; nothing else covered');
    assert.equal(s.reels[1].player, false, 'the next reel (a cat) was covered');
    assert.equal(s.hosts, 0, 'no whole-page cover');
    if (shape === 'logged in') {
      // The controls' SVG title ("Audio is muted") is not a word a person sees: the cover went
      // on the box marked data-virtualized, not a smaller one inside it.
      assert.equal(await js("return document.querySelector('.row .frame').hasAttribute('data-gta-cover')"), false);
    }
    // The page tries to play it again, the way Instagram does: it stays paused.
    await js('window.__play(0)');
    await sleep(500);
    const again = (await reelsNow()).reels[0];
    assert.deepEqual([again.paused, again.muted], [true, true]);
  });
}

test('a page that brings each reel\u{2019}s caption before its video (as live): the caption lines still end striped, the videos covered before they are heard', async () => {
  // Live (2026-11-19), the captions came 46 ms before the videos: read then, a caption's block
  // was no reel yet, and three caption lines got the full note under a covered video.
  await open('/reels/gtareel/?videolate&order=gta,gta2,cat');
  await coveredGta(0);
  await coveredGta(1);
  assert.equal(await js('return window.__captionFirst'), true, 'the caption was not read before the video came: the journey proves nothing');
  const s = await waitReels('both caption lines striped', '(s) => [0, 1].every((i) => s.reels[i].captionLine && s.reels[i].quiet)');
  assert.equal(s.heard.gta, undefined, 'the first GTA reel was heard');
  assert.deepEqual([s.playedUncovered.gta, s.playedUncovered.gta2], [undefined, undefined], 'a GTA reel started playing uncovered');
  assert.equal(s.reels[2].player, false, 'the cat reel was covered');
});

test('through a GTA reel to the next one and back: the reels not about GTA are never put under "Checking"; each plays with its sound', async () => {
  // On Shorts a new address means a new Short in the same player; here each reel has its own
  // block, read when it came: checking it again on every address covered it for 4 s. The
  // stand-in changes the page after the address, as Instagram does, so the add-on looks again.
  await open('/reels/gtareel/?order=cat,gta,dog');
  await playing(0, AT_ONCE);
  await coveredGta(1, 'gta*', AT_ONCE);
  await js('window.__scroll()');
  await sleep(300);
  assert.equal((await reelsNow()).path, '/reels/gtareel/', 'the address never changed: the journey proves nothing');
  await js('window.__scroll()');
  await holds(1500, 'the dog reel covered after the address changed', (s) => !s.reels[2].player && s.reels[1].player);
  await playing(2, AT_ONCE);
  await js('window.__scrollBack(); window.__scrollBack()');
  await holds(1000, 'the cat reel covered after scrolling back', (s) => !s.reels[0].player);
  await playing(0, AT_ONCE);
});

test('into a GTA reel from one not about GTA: covered before a moment of it plays', async () => {
  await open('/reels/gtareel/?order=cat,gta');
  await playing(0, AT_ONCE);
  await coveredGta(1, 'gta*', AT_ONCE); // read when it came, below the screen
  await js('window.__heard = {}; window.__scroll()');
  await holds(1000, 'the GTA reel uncovered or heard', (s) => s.reels[1].player && s.reels[1].paused && s.reels[1].muted);
  assert.equal((await reelsNow()).heard.gta, undefined, 'a moment of it was heard');
});

test('reels added as the person scrolls are read at once: about GTA, covered before it is heard; not about GTA or with no caption, they play', async () => {
  await open('/reels/gtareel/');
  await coveredGta(0);
  await js("window.__heard = {}; window.__mount('gta2')");
  await coveredGta(3, 'gta*', AT_ONCE);
  await sleep(500);
  const gta = (await reelsNow()).reels[3];
  assert.deepEqual([gta.paused, gta.muted], [true, true]);
  assert.equal((await reelsNow()).heard.gta2, undefined, 'the added GTA reel was heard');
  // A new video's first source sends no "emptied": it is read at its "play", before it starts
  // (security and correctness review, round 2: up to a flush, ~30 ms, it played uncovered).
  assert.equal((await reelsNow()).playedUncovered.gta2, undefined, 'the added GTA reel started playing uncovered');
  await js("window.__mount('bird')");
  await playing(4, AT_ONCE);
  // Only its name to read: still something, so it is decided (an empty text never is).
  await js("window.__mount('nocap')");
  await playing(5, AT_ONCE);
});

test('a reel keeps its cover, pause and mute while the page around it changes (a second reel comes in)', async () => {
  // Alone on the page, a reel's block reaches up to the list; with a second reel it is its row.
  // Its cover went for a moment when its block changed, and its sound came back (design,
  // security and correctness review, 2026-11-19).
  await open('/reels/gtareel/?order=gta');
  await coveredGta(0);
  await js("window.__heard = {}; window.__mount('cat')");
  await holds(1000, 'the GTA reel lost its cover, pause or mute', (s) => s.reels[0].player && s.reels[0].paused && s.reels[0].muted);
  await js('window.__play(0)');
  await holds(500, 'the GTA reel started', (s) => s.reels[0].player && s.reels[0].paused);
  assert.equal((await reelsNow()).heard.gta, undefined);
});

test('a new source in the same reel: checked again until its caption changes, then covered as about GTA', async () => {
  // Not seen on Instagram (2026-11-19), but YouTube does it with its Shorts: a block that gets
  // another reel's video must not be trusted on the last reel's caption. The video's own
  // controls change their label as it plays: that is no new caption either.
  await open('/reels/gtareel/?order=cat,dog');
  await playing(0, AT_ONCE);
  await js("window.__heard = {}; window.__newSource(0, 'gta2')");
  const t0 = Date.now();
  const early = await waitReels('the reel checked at once', '(s) => s.reels[0].player && s.reels[0].checking', { timeoutMs: 300 });
  assert.deepEqual([early.reels[0].paused, early.reels[0].muted], [true, true]);
  // Its caption comes 800 ms after the source: until then it stays checked, timed from the
  // source, not from when the check was first seen (test review, round 2).
  await holds(Math.max(0, 700 - (Date.now() - t0)), 'decided before its caption came', (s) => s.reels[0].player && s.reels[0].checking);
  // Decided on the new caption, well before the 4 s a check can last: the words that tell a
  // new reel apart are read, not waited out (test review, round 2).
  await coveredGta(0, 'gta*', { timeoutMs: Math.max(100, 2000 - (Date.now() - t0)) });
  assert.equal((await reelsNow()).heard.gta2, undefined, 'a moment of it was heard');
});

test('a reel the person showed, then given another reel\u{2019}s video: the new one is checked anew, the word not carried over', async () => {
  // The person's word is kept by the video; a new source in it is a new reel, and the word for
  // the old one let the GTA reel that came in play with its sound (design, security and
  // correctness review, round 2).
  const { firefox } = session;
  await open('/reels/gtareel/?order=gta,cat');
  await coveredGta(0);
  await openMenu(firefox);
  await menuKeys(firefox, ['Tab', 'Tab', 'Tab', 'Space']); // site, Everywhere, gta*
  await menuKeys(firefox, ['Escape']);
  await waitReels('the reel shown again', '(s) => !s.reels[0].player');
  await js("window.__heard = {}; window.__newSource(0, 'gta2')");
  await coveredGta(0, 'gta*', { timeoutMs: 2000 });
  await waitReels('its caption line covered too', '(s) => s.reels[0].captionLine && s.reels[0].paused && s.reels[0].muted');
  assert.equal((await reelsNow()).heard.gta2, undefined, 'a moment of it was heard');
});

test('a comment about GTA under a reel not about GTA covers its video too (the user\u{2019}s choice); the comment line is striped', async () => {
  await open('/reels/gtareel/?order=cat,dog');
  await playing(0, AT_ONCE);
  await js("window.__comment(0, 'better than GTA 6 lol')");
  await coveredGta(0, 'gta*', AT_ONCE);
  const r = (await waitReels('paused and muted', '(s) => s.reels[0].paused && s.reels[0].muted')).reels[0];
  assert.deepEqual([r.commentLine, r.quiet, r.captionLine], [true, true, false]);
});

test('a label with words on the video itself: the cover still goes on the video, paused and muted', async () => {
  // A label in the video's own wrapper left no box without words: no cover at all, and the
  // GTA video played (security and correctness review, 2026-11-19).
  await open('/reels/gtareel/?label');
  await waitReels('the GTA reel\u{2019}s video covered, paused and muted', '(s) => s.reels[0].anyCover && s.reels[0].paused && s.reels[0].muted', AT_ONCE);
  assert.equal(await js("return document.querySelector('.row video').parentElement.getAttribute('data-gta-word')"), 'gta*', 'the cover carries the note');
});

test('one reel on the page, with words about GTA in the header next to it: the reel is read on its own and plays', async () => {
  // A reel's block never reaches the page's main area: alone, it would read the whole page.
  await open('/reels/gtareel/?nav&order=cat');
  await waitReels('the header\u{2019}s GTA line covered on its own', '() => !!document.querySelector("nav [data-gta-cover], nav[data-gta-cover]")');
  await playing(0, AT_ONCE);
  assert.equal(await js("return document.querySelector('nav [data-gta-cover], nav[data-gta-cover]').hasAttribute('data-gta-quiet')"), false, 'the header line lost its note');
});

test('moving in place onto the Reels page (no reload): its reels are read there', async () => {
  // Instagram moves between its pages without loading one: the rules follow the address, not
  // the page the add-on started on (test review, 2026-11-19).
  await open('/reels/gtareel/?home');
  assert.equal((await reelsNow()).path, '/');
  await sleep(500);
  assert.equal((await reelsNow()).reels[0].player, false, 'a reel player outside the Reels page');
  await js('window.__enter()');
  await coveredGta(0, 'gta*', AT_ONCE);
  await waitReels('paused and muted', '(s) => s.reels[0].paused && s.reels[0].muted');
});

test('moving in place off the Reels page with the GTA reel still on it: its cover stays', async () => {
  // The cover stays until the reel is read as not about GTA (the user, 2026-11-19); a page that
  // moved on is no such reading.
  await open('/reels/gtareel/');
  await coveredGta(0);
  await js('window.__leave()');
  await sleep(300);
  assert.equal((await reelsNow()).path, '/explore/');
  await holds(800, 'the GTA reel lost its cover after the page moved on', (s) => s.reels[0].player && s.reels[0].paused);
});

test('"Not about GTA" shows the reel being watched again, with its sound, but leaves it paused (as on Shorts)', async () => {
  const { firefox } = session;
  await open('/reels/gtareel/');
  await coveredGta(0);
  await waitForBadge(firefox, '2'); // the player and the caption line
  await openMenu(firefox);
  await menuKeys(firefox, ['Tab', 'Tab', 'Tab', 'Space']); // site, Everywhere, gta*
  await waitReels('the reel and its caption line shown again, with its sound', '(s) => !s.reels[0].player && !s.reels[0].captionLine && !s.reels[0].muted');
  await sleep(600);
  assert.equal((await reelsNow()).reels[0].paused, true, 'it stays paused: the person presses play');
  // Undo, the same button now, covers it again.
  await menuKeys(firefox, ['Space']);
  await menuKeys(firefox, ['Escape']);
  await coveredGta(0, 'gta*', AT_ONCE);
  await waitReels('paused and muted again', '(s) => s.reels[0].paused && s.reels[0].muted && s.reels[0].captionLine');
});

test('"Not about GTA" counts for the reel being watched only: the others stay covered, also once scrolled to', async () => {
  // The add-on keeps the person's word per address, and every reel on the page shares it while
  // the address names the one being watched: the next GTA reel was shown too, and played when
  // scrolled to (security and correctness review, 2026-11-19). Pressed on the second reel, so
  // "the one being watched" is not just the first.
  const { firefox } = session;
  await open('/reels/gtareel/?order=gta,gta2');
  await coveredGta(0);
  await coveredGta(1);
  await js('window.__scroll()');
  await waitReels('the second reel in view', "(s) => s.path === '/reels/gta_reel-2/'");
  await openMenu(firefox);
  await menuKeys(firefox, ['Tab', 'Tab', 'Tab', 'Space']); // site, Everywhere, gta*
  await waitReels('the reel being watched shown again', '(s) => !s.reels[1].player');
  await menuKeys(firefox, ['Escape']);
  await holds(500, 'the other GTA reel shown too', (s) => s.reels[0].player && s.reels[0].captionLine);
  await js('window.__heard = {}; window.__scrollBack()');
  await holds(1000, 'the other GTA reel uncovered or heard once scrolled to', (s) => s.reels[0].player && s.reels[0].paused && s.reels[0].muted);
  assert.equal((await reelsNow()).heard.gta, undefined);
});

test('"Not about GTA" on a reel outlives a change of the word list (the add-on starts over on the page)', async () => {
  // The word added ("banjo") stays in this test browser's list for the journeys after this
  // one: no other reel's text has it ("cucumber" did, and covered the cat reel in them).
  const { firefox } = session;
  await open('/reels/gtareel/?order=gta,frog');
  await coveredGta(0);
  await openMenu(firefox);
  await menuKeys(firefox, ['Tab', 'Tab', 'Tab', 'Space']); // site, Everywhere, gta*
  await menuKeys(firefox, ['Escape']);
  await waitReels('the reel shown again', '(s) => !s.reels[0].player');
  const back = await openSettings(firefox);
  try {
    const found = await firefox.marionette.send('WebDriver:FindElement', { using: 'css selector', value: '#add-input' });
    const input = Object.values(found?.value ?? found)[0];
    await firefox.marionette.send('WebDriver:ElementSendKeys', { id: input, text: 'banjo\u{E007}' });
    await firefox.waitForPage('the word added', "return document.getElementById('word-msg').textContent === 'Added \"banjo\".'");
  } finally {
    await backToTab(firefox, back);
  }
  // The frog reel below is covered by the new word: the add-on did start over here.
  await waitReels('the frog reel covered by the new word', "(s) => s.reels[1].player && s.reels[1].word === 'a word from your list'");
  await holds(500, 'the reel the person showed covered again', (s) => !s.reels[0].player);
});

test('a reel block holding a second video: the reel\u{2019}s video is still covered, paused and muted', async () => {
  // No box around the video then holds it alone with its words: the cover goes on the reel's
  // block itself, and with nothing to read in it, the reel stays "Checking" (a cover too big
  // beats a GTA video playing; correctness review, 2026-11-19).
  await open('/reels/gtareel/?second');
  await waitReels('the reel\u{2019}s video covered, paused and muted', '(s) => s.reels[0].anyCover && s.reels[0].paused && s.reels[0].muted', AT_ONCE);
});

test('no box between a reel\u{2019}s video and its row can carry a cover: the row is covered, and read like any reel', async () => {
  // Covered on its row, every word of the reel sits inside its own cover: read only outside
  // it, a GTA reel stayed "Checking" for good and a clean one never played (security and
  // correctness review, round 2).
  await open('/reels/gtareel/?contents');
  await waitReels('the GTA reel\u{2019}s row covered as about GTA, paused and muted', "(s) => s.reels[0].row && !s.reels[0].rowChecking && s.reels[0].rowWord === 'gta*' && s.reels[0].paused && s.reels[0].muted", AT_ONCE);
  await open('/reels/gtareel/?contents&order=cat');
  await waitReels('the cat reel uncovered, playing with its sound', '(s) => !s.reels[0].row && !s.reels[0].paused && !s.reels[0].muted', AT_ONCE);
});

test('off the Reels page in place: "Not about GTA" shows a GTA reel kept covered there', async () => {
  // Kept covered after the page moved on, it could no longer be shown: its caption line went,
  // its video stayed covered (design and correctness review, round 2).
  const { firefox } = session;
  await open('/reels/gtareel/');
  await coveredGta(0);
  await js('window.__leave()');
  await sleep(300);
  await openMenu(firefox);
  await menuKeys(firefox, ['Tab', 'Tab', 'Tab', 'Space']); // site, Everywhere, gta*
  await menuKeys(firefox, ['Escape']);
  await waitReels('the reel and its caption line shown again, with its sound', '(s) => !s.reels[0].player && !s.reels[0].captionLine && !s.reels[0].muted');
});

test('off the Reels page in place: a reel not about GTA is let go (the page\u{2019}s rules are the general ones there)', async () => {
  // Kept as a reel off the Reels page, a GTA comment added under it got stripes with no note,
  // and its video played on (correctness review, round 2).
  await open('/reels/gtareel/?order=cat');
  await playing(0, AT_ONCE);
  await js('window.__leave()');
  await sleep(300);
  await js("window.__comment(0, 'better than GTA 6 lol')");
  await waitReels('the comment line covered, with its note', '(s) => s.reels[0].commentLine && !s.reels[0].quiet');
});

test('a reel taken off the page is let go: the icon stops counting it', async () => {
  const { firefox } = session;
  await open('/reels/gtareel/?order=gta,gta2');
  await coveredGta(0);
  await coveredGta(1);
  await waitForBadge(firefox, '4'); // two reels, each its video and its caption line
  await js('window.__remove(1)');
  await waitForBadge(firefox, '2');
});

test('a reel added with its caption before its video, after "Not about GTA" on another: its caption line is covered once its video comes', async () => {
  // Read before its video came, its caption was no reel's yet, so the word said for the reel
  // being watched (kept for its address too) left it uncovered for good (security review,
  // round 2). A reel is read whole once more when its video first comes.
  const { firefox } = session;
  await open('/reels/gtareel/');
  await coveredGta(0);
  await openMenu(firefox);
  await menuKeys(firefox, ['Tab', 'Tab', 'Tab', 'Space']); // site, Everywhere, gta*
  await menuKeys(firefox, ['Escape']);
  await waitReels('the reel shown again', '(s) => !s.reels[0].player');
  await js("window.__mount('gta2', 300)");
  await coveredGta(3, 'gta*', AT_ONCE);
  await waitReels('its caption line covered, striped', '(s) => s.reels[3].captionLine && s.reels[3].quiet', AT_ONCE);
});

test('the site puts a new video element in a covered reel: the cover stays, and the new video is paused and muted', async () => {
  // Its wrapper stays, so its box does: a box still used by a player is never let go, though
  // the player that had it (the old video) is gone.
  await open('/reels/gtareel/');
  await coveredGta(0);
  await js('window.__heard = {}; window.__swapVideo(0)');
  await holds(1000, 'the reel lost its cover, or its new video played', (s) => s.reels[0].player && s.reels[0].paused && s.reels[0].muted);
  assert.equal((await reelsNow()).heard.gta, undefined);
});

test('a picture about GTA inside a reel\u{2019}s player box: one cover on the box, with its note', async () => {
  // The faint copy of the reel's picture, described as about GTA: its cover is the player box,
  // and a player's own box keeps its note (striped, nothing on screen would say why).
  await open('/reels/gtareel/?glowalt&order=cat');
  await waitReels('the reel\u{2019}s box covered, paused and muted', '(s) => s.reels[0].player && s.reels[0].paused && s.reels[0].muted', AT_ONCE);
  assert.equal(await js("return document.querySelector('.row .frame').hasAttribute('data-gta-quiet')"), false, 'the cover lost its note');
});

// ---- a single reel's page ----

const SINGLE_NOW = `
  const box = document.querySelector('.column');
  const v = document.getElementById('video');
  const post = document.getElementById('gta-post');
  const postCover = post && (post.hasAttribute('data-gta-cover') ? post : post.querySelector('[data-gta-cover]'));
  const behind = document.getElementById('behind');
  return {
    player: box.hasAttribute('data-gta-cover'), checking: box.hasAttribute('data-gta-checking'), word: box.getAttribute('data-gta-word'),
    captionLine: !!document.querySelector('.caption[data-gta-cover], .caption [data-gta-cover]'),
    captionQuiet: !!document.querySelector('.caption[data-gta-quiet], .caption [data-gta-quiet]'),
    gtaPost: !!postCover, gtaPostNote: !!postCover && !postCover.hasAttribute('data-gta-quiet'),
    behind: !!behind && behind.hasAttribute('data-gta-cover') && !behind.hasAttribute('data-gta-quiet'),
    paused: v.paused, muted: v.muted, playedFor: v.currentTime, heard: window.__heard,
  };`;
const singleNow = () => js(SINGLE_NOW);
const waitSingle = (what, check, opts) => session.firefox.waitForPage(what, `const s = (() => { ${SINGLE_NOW} })(); return (${check})(s) ? s : false;`, opts);
const singlePlaying = () => waitSingle('the reel uncovered, playing with its sound', '(s) => !s.player && !s.paused && !s.muted && s.playedFor > 0.2', { timeoutMs: 3000 });

test('a single reel about GTA: its video covered, paused and muted; its caption line striped', async () => {
  await open('/reel/single/');
  const s = await waitSingle('the reel covered as about GTA, paused and muted', "(s) => s.player && !s.checking && s.word === 'gta*' && s.paused && s.muted", AT_ONCE);
  assert.deepEqual([s.captionLine, s.captionQuiet], [true, true], 'the caption line, striped');
});

test('a single reel not about GTA, with a GTA post below it: the reel plays with its sound; the post is covered on its own, with its note', async () => {
  // Live, the reel and "More posts" share the next box up: a reel read with them would be
  // covered for a post that is not it.
  await open('/reel/single/?cat');
  await waitSingle('the GTA post below covered, with its note', '(s) => s.gtaPost && s.gtaPostNote');
  await singlePlaying();
});

test('a single reel scrolled out of view: "Not about GTA" on the GTA post in More posts shows the post, which is no reel\u{2019}s', async () => {
  // Live, the reel and More posts share the next box up from the reel's own, so the first box
  // around the post with one video in it is above the reel's block: the post is still no
  // reel's, and the person's word counts for this address there. Taken for the reel's, the
  // word counted for the reel being watched, and with none in view the post stayed covered
  // (mutation pass, I26).
  const { firefox } = session;
  await open('/reel/single/?cat&tall');
  await waitSingle('the GTA post below covered', '(s) => s.gtaPost');
  await singlePlaying();
  await js("document.getElementById('gta-post').scrollIntoView()");
  assert.equal(await js("return document.getElementById('reel').getBoundingClientRect().bottom <= 0"), true, 'the reel is still in view: the journey proves nothing');
  await openMenu(firefox);
  await menuKeys(firefox, ['Tab', 'Tab', 'Tab', 'Space']); // site, Everywhere, gta*
  await menuKeys(firefox, ['Escape']);
  await waitSingle('the GTA post shown again', '(s) => !s.gtaPost', AT_ONCE);
});

test('a single reel about GTA keeps its cover, pause and mute when "More posts" comes in after it', async () => {
  await open('/reel/single/?latemore');
  await waitSingle('the reel covered as about GTA', "(s) => s.player && s.word === 'gta*' && s.paused && s.muted", AT_ONCE);
  assert.equal((await singleNow()).gtaPost, false, 'More posts were already there: the journey proves nothing');
  const end = Date.now() + 2500;
  while (Date.now() < end) {
    const s = await singleNow();
    assert.deepEqual([s.player, s.paused, s.muted], [true, true, true], `after More posts came: ${JSON.stringify(s)}`);
    await sleep(50);
  }
  assert.equal((await singleNow()).gtaPost, true, 'More posts never came: the journey proves nothing');
  assert.equal((await singleNow()).heard, 0);
});

test('a single reel not about GTA stays uncovered when "More posts", one about GTA, comes in after it', async () => {
  // Its block shrinks then (More posts link to other posts): read with the block it had before,
  // kept from an earlier pass, the GTA post below would cover it (test review, round 2).
  await open('/reel/single/?cat&latemore');
  await singlePlaying();
  assert.equal((await singleNow()).gtaPost, false, 'More posts were already there: the journey proves nothing');
  await waitSingle('the GTA post below covered, with its note', '(s) => s.gtaPost && s.gtaPostNote', { timeoutMs: 3000 });
  await sleep(300);
  const s = await singleNow();
  assert.deepEqual([s.player, s.paused], [false, false], 'the reel was covered for the post below it');
});

test('a reel shown in a dialog outside the main area, alone on the page: read on its own, not with the page behind it', async () => {
  await open('/reel/single/?cat&dialog');
  await waitSingle('the GTA line behind the dialog covered on its own, with its note', '(s) => s.behind');
  await singlePlaying();
});
