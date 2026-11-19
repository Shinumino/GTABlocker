// Journey 7: the YouTube Shorts player (step 6), in the installed Firefox with the real
// extension, on a stand-in shaped like YouTube's, with YouTube's own timing (tests/fixtures/
// www.youtube.com/shorts/gta.html: the address changes and the next video starts first, its
// caption comes 0.8 s later). Decided with the user, 2026-11-18 and 19:
// - a GTA Short gets a cover on its player, its video is paused and muted, and the page cannot
//   start it again while it is covered; its caption's GTA line is covered too (YouTube draws
//   the caption over the player), while the channel and Subscribe stay;
// - a Shorts page gets no whole-page cover, even though its title is about GTA;
// - every Short starts under "Checking for GTA..." until its caption is read; the cover stays
//   until a caption shows the Short is not about GTA; then it plays on its own, with its sound;
// - a caption that never changes is decided after 4 s;
// - after "Not about GTA" or the switch, the sound comes back and the video stays paused.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useFirefox, EXTENSION_DIR } from '../support/browser-test.mjs';
import { ADDON_PREFS, openMenu, menuKeys, waitForBadge, iconState } from '../support/toolbar.mjs';

// Firefox blocks a video with sound from starting on its own until the person interacts with
// the page; here autoplay is allowed, so a paused video can only be the extension's doing
// (without it, "paused" proved nothing: found while writing this journey).
const session = useFirefox({ extensionDir: EXTENSION_DIR, prefs: { ...ADDON_PREFS, 'media.autoplay.default': 0, 'media.autoplay.blocking_policy': 0 }, systemAccess: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const js = (script) => session.firefox.evaluate(script);
// Everything a test looks at, in one read.
const NOW = `
  const p = document.getElementById('player-container');
  const v = document.getElementById('video');
  const has = (id) => document.getElementById(id) ? document.getElementById(id).hasAttribute('data-gta-cover') : null;
  return {
    player: p.hasAttribute('data-gta-cover'), checking: p.hasAttribute('data-gta-checking'), word: p.getAttribute('data-gta-word'),
    layers: p.getAttribute('data-gta-layers'),
    titleRow: has('title-row'), channelRow: has('channel-row'),
    paused: v.paused, muted: v.muted, heard: window.__heard, path: location.pathname,
    hosts: [...document.documentElement.children].filter((e) => e.localName.startsWith('gta-blocker-page')).length,
  };`;
const now = () => js(NOW);
const waitNow = (what, test, opts) => session.firefox.waitForPage(what, `const s = (() => { ${NOW} })(); return (${test})(s) ? s : false;`, opts);

async function open(path = '/shorts/gta.html') {
  const { firefox, fixtures } = session;
  await firefox.navigate(fixtures.url('www.youtube.com', path));
  await firefox.waitForPage('the extension to finish its first look', "return document.documentElement.getAttribute('data-gta-blocker') === 'ready'");
}
const coveredGta = (word = 'gta*') => waitNow(`the player covered as about GTA (${word})`, `(s) => s.player && !s.checking && s.word === ${JSON.stringify(word)}`);
const playing = () => waitNow('the player uncovered, its video playing with its sound', '(s) => !s.player && !s.paused && !s.muted');

test('a GTA Short: its player and its title line are covered, the video paused and muted; the channel stays; no whole-page cover', async () => {
  await open();
  await coveredGta();
  const s = await waitNow('the video paused and muted', '(s) => s.paused && s.muted');
  assert.equal(s.titleRow, true, 'the caption line with the GTA words, drawn over the player, is covered too');
  // Stripes only: the player's note already says it (the user's choice after round 2).
  assert.equal(await js("return document.getElementById('title-row').hasAttribute('data-gta-quiet')"), true);
  assert.equal(await js("return getComputedStyle(document.getElementById('title-row'), '::after').content"), 'none');
  assert.equal(s.channelRow, false, 'the channel and Subscribe stay');
  assert.equal(s.hosts, 0, 'no whole-page cover on a Shorts page');
  assert.equal(await js('return document.title'), 'GTA protagonists tribute #shorts #gta6 - YouTube');
  // The page tries to play it again, the way YouTube does: it stays paused.
  await js('window.__play()');
  await sleep(500);
  const after = await now();
  assert.deepEqual([after.paused, after.muted], [true, true]);
  // The player's own insides change (YouTube redraws its controls): the cover stays as it is.
  await js("document.getElementById('shorts-player').appendChild(document.createElement('span'))");
  await sleep(300);
  const redrawn = await now();
  assert.deepEqual([redrawn.player, redrawn.word], [true, 'gta*'], 'a change inside the player lifted its cover');
});

test('from a GTA Short to one not about GTA: covered until its caption is in, then it plays on its own with its sound', async () => {
  await open();
  await coveredGta();
  await js('window.__scroll("cat")');
  // YouTube has started the next video, but its caption is not in yet: the cover stays.
  await sleep(400);
  const gap = await now();
  assert.deepEqual([gap.player, gap.paused, gap.muted], [true, true, true], 'still covered, paused and muted before the caption');
  // Its note says it is being checked, not the last Short's word; YouTube put the sound back on
  // at 200 ms, under the cover, and the add-on muted it again (Gemini review, round 2).
  assert.equal(gap.checking, true);
  // The page's play landed under the cover; once the caption shows it is not about GTA, the
  // cover goes and that play goes through (the next Short stood still otherwise, live).
  await playing();
});

test('into a GTA Short from one not about GTA: covered and silent from the moment it starts, before its caption is in', async () => {
  await open();
  await coveredGta();
  await js('window.__scroll("cat")');
  await playing();
  const before = (await now()).path;
  // Live, this Short played uncovered with its sound until its caption came (~0.4 s). YouTube
  // swaps the video in before it changes the address (up to 245 ms before, live): here 400 ms.
  await js('window.__heard = 0; window.__ADDRESS_MS = 400; window.__scroll("gta")');
  const early = await waitNow('the player checked at once', '(s) => s.player && s.checking', { timeoutMs: 300 });
  assert.equal(early.path, before, 'checked on the new video already, before the address changed');
  assert.deepEqual([early.paused, early.muted], [true, true]);
  await coveredGta();
  const after = await now();
  assert.equal(after.heard, 0, 'not a moment of it was heard');
  // Drawn again on the same box (check, then GTA): the add-on's own ::before and ::after are
  // not the site's, so the cover keeps both layers (they flipped to one before: review round 2).
  assert.equal(after.layers, 'both');
});

test('a GTA Short after a GTA Short stays covered all along, and its cover takes the new word', async () => {
  await open();
  await coveredGta();
  await js('window.__heard = 0; window.__scroll("vice")');
  for (const at of [100, 400]) {
    await sleep(at === 100 ? 100 : 300);
    const s = await now();
    assert.deepEqual([s.player, s.paused, s.muted], [true, true, true], `${at} ms after the scroll`);
  }
  await coveredGta('vice city');
  assert.equal((await now()).heard, 0);
});

test('a Short whose caption is the very same as the last one\u{2019}s is decided after 4 s', async () => {
  await open();
  await coveredGta();
  await js('window.__scroll("cat")');
  await playing();
  await js('window.__scroll("same")');
  await waitNow('the next Short checked', '(s) => s.player && s.checking', { timeoutMs: 1000 });
  await sleep(2500); // the caption came again, word for word: not a sign of the new Short
  assert.equal((await now()).checking, true, 'still checked before the 4 s are over');
  assert.equal((await iconState(session.firefox)).badge, '', 'a Short being checked is not counted as a find');
  // The note says what is going on, so a paused Short does not look broken (the user's pick).
  assert.equal(await js("return getComputedStyle(document.getElementById('player-container'), '::after').content"), '"Checking for GTA\u{2026}"');
  await waitNow('decided at 4 s: not about GTA, so it plays', '(s) => !s.player && !s.paused && !s.muted', { timeoutMs: 4000 });
});

test('the control: a Short not about GTA really plays here, with its sound', async () => {
  await open();
  await coveredGta();
  await js('window.__scroll("cat")');
  await playing();
  await session.firefox.waitForPage('its sound playing on', "const v = document.getElementById('video'); return !v.paused && !v.muted && v.currentTime > 0.2;", { timeoutMs: 8000 });
  // The counter the other journeys read at 0 does count, when there is sound to count.
  await session.firefox.waitForPage('the sound counted', 'return window.__heard > 0', { timeoutMs: 3000 });
});

test('"Not about GTA" on a covered Short shows it again with its sound, but leaves it paused (the user\u{2019}s choice)', async () => {
  const { firefox } = session;
  await open();
  await coveredGta();
  await waitForBadge(firefox, '2'); // the player and the caption line
  await openMenu(firefox);
  await menuKeys(firefox, ['Tab', 'Tab', 'Tab', 'Space']); // site, Everywhere, gta*
  await waitNow('the player and its caption line shown again, with its sound', '(s) => !s.player && !s.titleRow && !s.muted');
  await waitForBadge(firefox, ''); // not the switch: that would read "off"
  await sleep(600);
  assert.equal((await now()).paused, true, 'it stays paused: the person presses play');
  // Undo, the same button now, covers it again.
  await menuKeys(firefox, ['Space']);
  await menuKeys(firefox, ['Escape']);
  await coveredGta();
  await waitNow('paused and muted again', '(s) => s.paused && s.muted');
});

test('"Not about GTA" counts for that Short only: the next GTA Short is covered', async () => {
  const { firefox } = session;
  await open();
  await coveredGta();
  await openMenu(firefox);
  await menuKeys(firefox, ['Tab', 'Tab', 'Tab', 'Space']); // gta*
  await menuKeys(firefox, ['Escape']);
  await waitNow('the player shown', '(s) => !s.player');
  await js('window.__scroll("gta2")');
  await coveredGta();
});

test('"Not about GTA" while the next Short is being checked: it stays paused once shown', async () => {
  // Pressed during the check, the cover stayed until the caption came, then went "because the
  // content changed" and the video started (ChatGPT review, round 2).
  const { firefox } = session;
  await open();
  await coveredGta();
  await js('window.__CAPTION_MS = 3000; window.__scroll("gta2")');
  await waitNow('the next Short checked', '(s) => s.player && s.checking', { timeoutMs: 1000 });
  await openMenu(firefox);
  await menuKeys(firefox, ['Tab', 'Tab', 'Tab', 'Space']); // gta*, the caption line still on the page
  await menuKeys(firefox, ['Escape']);
  await waitNow('shown once its caption came (its word said not about GTA here)', '(s) => !s.player', { timeoutMs: 6000 });
  await sleep(600);
  assert.equal((await now()).paused, true, 'it was started after the person said it is not about GTA');
});

test('the caption\u{2019}s rows coming apart: a changed channel line alone does not decide the new Short', async () => {
  // Live the caption is four rows; if the channel line comes before the title, the last
  // Short's title was still read as the new one's, and a GTA Short played (ChatGPT, round 2).
  await open();
  await coveredGta();
  await js('window.__scroll("cat")');
  await playing();
  await js('window.__heard = 0; window.__SPLIT_MS = 400; window.__scroll("gta")');
  await session.firefox.waitForPage('the new channel line in, the old title still there',
    "return document.getElementById('channel').textContent === '@WhizlyEdits' && document.getElementById('caption').textContent.includes('cucumber')", { timeoutMs: 3000 });
  const mid = await now();
  assert.deepEqual([mid.player, mid.checking, mid.paused, mid.muted], [true, true, true, true], 'decided on the old title');
  await coveredGta();
  assert.equal((await now()).heard, 0);
});

test('a page still loading when the add-on starts: the Short it covered then stays covered', async () => {
  // The add-on listens from the start but looks at the page once it has loaded; its look then
  // cleared what an old copy might have left, its own new cover too, and the Short played
  // (ChatGPT, correctness and test review, round 2).
  await open('/shorts/early.slow.html');
  assert.equal(await js('return window.__coveredBeforeLoad'), true, 'the add-on had not covered it before the page loaded: this run proves nothing');
  // Covered at every moment from then on, not only in the end: the cover lost to the clean-up
  // came back only at the 4 s decision, and a wait for "covered" let that through.
  const until = Date.now() + 1500;
  while (Date.now() < until) {
    assert.equal((await now()).player, true, 'the player was uncovered after the page loaded');
    await sleep(100);
  }
  await waitNow('paused and muted', '(s) => s.paused && s.muted');
  // Counted from here: what the page played before the add-on had even started (it reads its
  // settings first) is beyond its reach, on any site.
  await js('window.__heard = 0');
  await sleep(800);
  const s = await now();
  assert.deepEqual([s.player, s.paused, s.muted, s.heard], [true, true, true, 0]);
});

test('a video that gets its first source late is not a new Short: no 4 s "Checking"', async () => {
  // Only a source replaced ("emptied") is the next Short; the first one ("loadstart" alone)
  // held a Short not about GTA under "Checking" for 4 s (design and correctness review, round 2).
  const { firefox } = session;
  await open('/shorts/gta.html?cat&late');
  const end = Date.now() + 2000;
  while (Date.now() < end) {
    assert.equal((await now()).player, false, 'a Short not about GTA was covered when its video came');
    await sleep(100);
  }
  await firefox.waitForPage('it plays with its sound', "const v = document.getElementById('video'); return !v.paused && !v.muted;");
});

test('the switch off on a covered Short gives its sound back and leaves it paused; on again covers it', async () => {
  const { firefox } = session;
  await open();
  await coveredGta();
  await openMenu(firefox);
  await menuKeys(firefox, ['Tab', 'Space']); // On this site: off
  await menuKeys(firefox, ['Escape']);
  await waitForBadge(firefox, 'off');
  await waitNow('uncovered, with its sound', '(s) => !s.player && !s.muted');
  await sleep(600);
  assert.equal((await now()).paused, true);
  await openMenu(firefox);
  await menuKeys(firefox, ['Tab', 'Space']); // on again
  await menuKeys(firefox, ['Escape']);
  await coveredGta();
  await waitNow('paused and muted again', '(s) => s.paused && s.muted');
});

test('a video the page had muted itself stays muted after a GTA Short', async () => {
  await open('/shorts/gta.html?muted');
  await coveredGta();
  await js('window.__scroll("cat")');
  await waitNow('the next Short playing', '(s) => !s.player && !s.paused');
  assert.equal((await now()).muted, true, 'its own setting, not "sound on"');
});

test('leaving a GTA Short in place for a page not about GTA leaves no whole-page cover behind', async () => {
  // Live, 2026-11-19: the YouTube logo on a GTA Short moved the address to Home before the
  // title, and Home was covered as about GTA for good ("Hidden page").
  const { firefox } = session;
  await open();
  await coveredGta();
  await js('window.__leave()');
  await firefox.waitForPage('the next page\u{2019}s own title', "return document.title === 'A cat video - YouTube'", { timeoutMs: 3000 });
  await sleep(500);
  assert.equal(await js("return [...document.documentElement.children].filter((e) => e.localName.startsWith('gta-blocker-page')).length"), 0);
  assert.equal(await js('return document.title'), 'A cat video - YouTube');
});

test('a page covered whole that moves in place to a Short loses its whole-page cover', async () => {
  const { firefox } = session;
  await open('/watch-gta.html');
  const HOSTS = "return [...document.documentElement.children].filter((e) => e.localName.startsWith('gta-blocker-page')).length";
  await firefox.waitForPage('the whole-page cover', `return (() => { ${HOSTS} })() === 1`);
  await js('window.__toShorts()');
  await firefox.waitForPage('the whole-page cover gone on the Short', `return (() => { ${HOSTS} })() === 0`);
  await firefox.waitForPage('the Short\u{2019}s own title in the tab', "return document.title === 'A cat meets a cucumber #shorts - YouTube'", { timeoutMs: 3000 });
  // The GTA trailer the cover held is still in the page: the cover went because the page moved
  // on, not because the trailer turned out not to be about GTA. It played with its sound on the
  // Short before (design review, round 2).
  await sleep(600);
  assert.equal(await js("return document.getElementById('video').paused"), true, 'the GTA trailer was started on the Short');
});

test('the whole-page cover pauses and mutes the page\u{2019}s video too; Show anyway gives its sound back and leaves it paused', async () => {
  // It paused but never muted before (ChatGPT review, 2026-11-19): one rule for every cover.
  const { firefox } = session;
  await open('/watch-gta.html');
  const VID = "const v = document.getElementById('video'); return { paused: v.paused, muted: v.muted };";
  await firefox.waitForPage('the video held: paused and muted', `const s = (() => { ${VID} })(); return s.paused && s.muted;`);
  await js('window.__play()');
  await sleep(400);
  assert.deepEqual(await js(VID), { paused: true, muted: true }, 'the page started it again under the cover');
  await firefox.press('Enter'); // Show anyway has the focus
  await firefox.waitForPage('its sound back', "return !document.getElementById('video').muted;");
  await sleep(600);
  assert.equal(await js("return document.getElementById('video').paused"), true, 'it stays paused: the person presses play');
});

test('a picture about GTA elsewhere in the Short is covered on its own; the Short itself is never covered whole', async () => {
  // Its side buttons (like, comments) must stay: the item is a card by name, and the general
  // rules would have covered all of it for the picture's description. In a window the size of
  // a real screen (the live checks used 1600 x 1000): in the test's own 1366 x 683 the Short is
  // over the 60% a card may take, so the general rules never chose it there and this test
  // could not fail (the mutation pass found it, 2026-11-19).
  const { firefox } = session;
  const rect = (r) => r?.value ?? r;
  const was = rect(await firefox.marionette.send('WebDriver:GetWindowRect'));
  await firefox.marionette.send('WebDriver:SetWindowRect', { width: 1600, height: 1000 });
  try {
    await open('/shorts/gta.html?thumb');
    assert.ok(await js('return innerWidth * innerHeight * 0.6 > 737 * 819'), 'the window is too small for this test to fail');
    await coveredGta();
    await firefox.waitForPage('the picture\u{2019}s button covered', "return document.getElementById('thumb').hasAttribute('data-gta-cover')");
    assert.equal(await js("return document.getElementById('reel').hasAttribute('data-gta-cover')"), false);
  } finally {
    await firefox.marionette.send('WebDriver:SetWindowRect', { width: was.width, height: was.height });
  }
});

test('a player box that cannot carry a cover: the cover goes on the box around it, and the video is still held', async () => {
  await open('/shorts/gta.html?contents');
  await session.firefox.waitForPage('the box around the player covered', "return document.querySelector('.player-wrapper').getAttribute('data-gta-word') === 'gta*'");
  assert.equal(await js("return document.getElementById('player-container').hasAttribute('data-gta-cover')"), false, 'display: contents draws no cover');
  await waitNow('the video paused and muted', '(s) => s.paused && s.muted');
});

test('a made-up "play" from the page is not a wish to play: the Short stays paused when it turns out not to be about GTA', async () => {
  // A page that sends its own "play" could have had the add-on press play for it later
  // (ChatGPT and Gemini review, 2026-11-19). The video here never started on its own.
  await open('/shorts/gta.html?still');
  await coveredGta();
  await js("document.getElementById('video').dispatchEvent(new Event('play'))");
  await js('window.__caption("A cat meets a cucumber #shorts")'); // the same Short, decided again
  await waitNow('the player shown', '(s) => !s.player');
  await sleep(600);
  assert.equal((await now()).paused, true, 'the made-up play went through');
  // The control: a real play under the cover goes through when the caption shows it is not GTA.
  await js('window.__caption("All legends #gta6")');
  await coveredGta();
  await js('window.__play()');
  await js('window.__caption("A cat meets a cucumber #shorts")');
  await playing();
});

test('when the site puts in a new player box, the cover follows it, and the old video is never started', async () => {
  const { firefox } = session;
  await open();
  await coveredGta();
  await waitForBadge(firefox, '2');
  await js('window.__swapPlayer()');
  await coveredGta(); // the new #player-container
  await waitNow('the new video paused and muted', '(s) => s.paused && s.muted');
  await sleep(600);
  assert.equal(await js('return window.__oldVideo.paused'), true, 'the old video, out of the page, was started');
  assert.equal((await iconState(firefox)).badge, '2', 'the old box is not counted any more');
});

test('a page covered whole that moves in place to a page not about GTA: the old GTA video is not started', async () => {
  // The new page's title says nothing about the video the cover held: Back from a covered GTA
  // video to Home would have started its trailer, hidden, with its sound (security review,
  // round 2). It gets its sound back and stays paused.
  const { firefox } = session;
  await open('/watch-gta.html');
  const HOSTS = "return [...document.documentElement.children].filter((e) => e.localName.startsWith('gta-blocker-page')).length";
  await firefox.waitForPage('the whole-page cover', `return (() => { ${HOSTS} })() === 1`);
  await firefox.waitForPage('the trailer held', "const v = document.getElementById('video'); return v.paused && v.muted;");
  await js('window.__toClean()');
  await firefox.waitForPage('the cover gone on the page\u{2019}s own title', `return (() => { ${HOSTS} })() === 0 && document.title === 'YouTube'`, { timeoutMs: 3000 });
  await firefox.waitForPage('its sound back', "return !document.getElementById('video').muted;");
  await sleep(600);
  assert.equal(await js("return document.getElementById('video').paused"), true, 'the GTA trailer was started on the next page');
});

test('a Short with no caption at all stays "Checking": nothing to decide on is never "not about GTA"', async () => {
  // Reading the whole Short instead took its side buttons' words as a caption and showed it
  // (design review, round 2). If YouTube changes its page, Shorts stay covered: it fails closed.
  await open('/shorts/gta.html?nocaption');
  await waitNow('the player checked', '(s) => s.player && s.checking');
  await sleep(1500);
  const s = await now();
  assert.deepEqual([s.player, s.checking, s.paused], [true, true, true]);
});

test('a page that keeps turning the sound back on under the cover is let be after a few tries', async () => {
  // The add-on mutes a held video again when the page unmutes it; against a page that answers
  // every mute with an unmute, it stops after five tries a second rather than fight for ever.
  await open();
  await coveredGta();
  await js('window.__fight()');
  await sleep(1000);
  const events = await js('return window.__volumeEvents');
  assert.ok(events > 0 && events < 30, `${events} volume events in a second: a fight that never ends, or none at all`);
  assert.equal((await now()).paused, true, 'it stays paused');
});

test('text that came into the player while it was covered is read once the Short is shown', async () => {
  // Changes inside a player's cover are left to the player's rule, which reads the caption; the
  // rest of the player was never read again (design, security, correctness review, round 2).
  await open();
  await coveredGta();
  await js('window.__overlay("GTA 6 leaked gameplay")');
  await js('window.__scroll("cat")');
  await session.firefox.waitForPage('the overlay\u{2019}s line covered once the player is shown',
    "const o = document.getElementById('overlay'); return !document.getElementById('player-container').hasAttribute('data-gta-checking') && (o.hasAttribute('data-gta-cover') || Boolean(o.closest('[data-gta-cover]')))", { timeoutMs: 4000 });
});
