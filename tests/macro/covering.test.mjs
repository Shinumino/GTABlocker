// Journey 1: GTA content is covered on a page, the way it was agreed (step 3), in the installed
// Firefox with the real extension. The pages are made-up fixtures under cover.test
// (tests/fixtures/cover.test/); the agreed look is docs/design/cover-preview.html.
//
// The rules proven here, each a decision of 2026-11-18:
// - the smallest card around the match is covered, with the matched word and a size;
// - the site's layout never moves, and nothing is added or removed inside the site's page;
// - a cover cannot be clicked through, and nothing inside it shows through;
// - covers follow the page: a reused tile is uncovered or covered, new content is checked;
// - a page whose title is about GTA gets the whole-page cover, and the tab says "Hidden page".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useFirefox, EXTENSION_DIR } from '../support/browser-test.mjs';

const session = useFirefox({ extensionDir: EXTENSION_DIR });
const open = async (file) => {
  const { firefox, fixtures } = session;
  await firefox.navigate(fixtures.url('cover.test', `/${file}`));
  await firefox.waitForPage('the extension to finish its first look', "return document.documentElement.getAttribute('data-gta-blocker') === 'ready'");
};
const covers = () => session.firefox.evaluate(
  "return [...document.querySelectorAll('[data-gta-cover]')].map((e) => [e.id, e.getAttribute('data-gta-word'), e.getAttribute('data-gta-size')]).sort()",
);
const center = (id) => session.firefox.evaluate(
  'const r = document.getElementById(arguments[0]).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2];', [id],
);

test('GTA tiles, lines and comments are covered on the right box, with the word and a size', async () => {
  await open('grid.html');
  assert.deepEqual(await covers(), [
    ['c-joao', 'gta*', 'm'],
    ['split', 'vice city', 's'],
    ['t-alt', 'vice city', 'l'], // matched by the picture's description only
    ['t-gta', 'gta*', 'l'],
    ['t-label', 'rockstar games', 'l'], // matched by the screen-reader label only
    ['u-gta', 'grand theft auto', 's'],
  ]);
});

test('two separate lines are not read as one ("the vice" + "city council")', async () => {
  await open('grid.html');
  assert.equal(await session.firefox.evaluate("return document.getElementById('separate').closest('[data-gta-cover]') === null && document.querySelector('#separate [data-gta-cover]') === null"), true);
});

test('the layout never moves and nothing is added or removed inside the page', async () => {
  await open('grid.html');
  const result = await session.firefox.evaluate(`
    const size = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return [r.width, r.height]; };
    return {
      gta: size('t-gta'), dog: size('t-dog'), comment: size('c-joao'), other: size('c-ana'),
      scroll: document.documentElement.scrollHeight, before: window.__layout.scrollHeight,
      changes: window.__changes,
    };`);
  assert.deepEqual(result.gta, result.dog, 'a covered tile changed size');
  assert.deepEqual(result.comment, result.other, 'a covered comment changed size');
  assert.equal(result.scroll, result.before, 'the page got taller or shorter');
  assert.deepEqual(result.changes, [], 'the extension added or removed elements inside the page');
});

test('a click on a cover does nothing; a click elsewhere still works', async () => {
  await open('grid.html');
  const [x, y] = await center('t-gta');
  await session.firefox.clickAt(x, y);
  assert.equal(await session.firefox.evaluate('return location.hash'), '', 'a click on a cover opened the GTA link');
  const [dx, dy] = await center('t-dog');
  await session.firefox.clickAt(dx, dy);
  assert.equal(await session.firefox.evaluate('return location.hash'), '#t-dog-opened');
});

test('nothing inside a cover shows through, not even what the site forces visible', async () => {
  await open('grid.html');
  const seen = await session.firefox.evaluate(`
    const badge = document.getElementById('badge-gta');
    const r = badge.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { visibility: getComputedStyle(badge).visibility, onTop: at === badge };`);
  assert.equal(seen.visibility, 'hidden');
  assert.equal(seen.onTop, false);
});

test('a reused tile is uncovered when its new video is not about GTA, and covered when it is', async () => {
  await open('grid.html');
  await session.firefox.evaluate(`
    const gta = document.querySelector('#t-gta h3'); gta.textContent = 'Puppies sleeping';
    const cook = document.querySelector('#t-cook h3'); cook.textContent = 'Los Santos at night, in 4K';`);
  await session.firefox.waitForPage('the reused tiles to be checked again', `
    return !document.getElementById('t-gta').hasAttribute('data-gta-cover')
      && document.getElementById('t-cook').getAttribute('data-gta-word') === 'los santos';`);
});

test('a tile covered for its picture description is uncovered when the description changes', async () => {
  await open('grid.html');
  assert.equal(await session.firefox.evaluate("return document.getElementById('t-alt').getAttribute('data-gta-word')"), 'vice city');
  await session.firefox.evaluate("document.querySelector('#t-alt img').alt = 'A beach at sunset';");
  await session.firefox.waitForPage('the tile to be uncovered', "return !document.getElementById('t-alt').hasAttribute('data-gta-cover')");
});

test('content added later is checked too', async () => {
  await open('grid.html');
  await session.firefox.evaluate(`
    const c = document.createElement('div'); c.className = 'comment'; c.id = 'c-late'; c.setAttribute('data-test-made', '');
    c.textContent = 'Lucia and Jason forever'; document.getElementById('comments').appendChild(c);`);
  await session.firefox.waitForPage('the new comment to be covered', "return document.getElementById('c-late').getAttribute('data-gta-word') === 'lucia and jason'");
});

test('content inside a shadow tree and inside a frame is covered', async () => {
  await open('parts.html');
  await session.firefox.waitForPage('the post in a shadow tree to be covered', "return document.getElementById('post-gta').getAttribute('data-gta-word') === 'leonida'");
  assert.equal(await session.firefox.evaluate("return document.getElementById('post-dog').hasAttribute('data-gta-cover')"), false);
  await session.firefox.waitForPage('the comment in the frame to be covered', `
    const doc = document.getElementById('frame').contentDocument;
    return doc && doc.getElementById('fc-gta') && doc.getElementById('fc-gta').getAttribute('data-gta-word') === 'gta*'
      && !doc.getElementById('fc-cat').hasAttribute('data-gta-cover');`);
});

// The whole-page cover is ours, on <html>, under a name that changes every run (a page could
// otherwise define an element of that name first). The tests find it as html's child that
// is neither head nor body.
const PAGE_COVER = "[...document.documentElement.children].find((e) => e.localName.startsWith('gta-blocker-page'))";
const coverState = () => session.firefox.evaluate(`
  const host = ${PAGE_COVER};
  const r = document.getElementById('behind').getBoundingClientRect();
  return { host: !!host, title: document.title, focus: !!host && document.activeElement === host,
           onTop: !!host && document.elementFromPoint(r.left + 5, r.top + 5) === host };`);

test('a page whose title is about GTA gets the whole-page cover, and the tab says "Hidden page"', async () => {
  await open('about-gta.html');
  assert.deepEqual(await coverState(), { host: true, title: 'Hidden page', focus: true, onTop: true });
});

test('the whole-page cover stays when the site changes its title, even into something else', async () => {
  const { firefox } = session;
  await open('about-gta.html');
  for (const title of ['GTA 6: the new map - a video site', 'New message!', '(1) Hidden page']) {
    await firefox.evaluate('document.title = arguments[0]', [title]);
    await new Promise((r) => setTimeout(r, 150));
    assert.deepEqual(await coverState(), { host: true, title: 'Hidden page', focus: true, onTop: true }, `after the site set "${title}"`);
  }
  // "(1) Hidden page" was built from our title, so it is not the site's: Show anyway gives the
  // tab the last title the site really set.
  await firefox.press('Enter');
  await firefox.waitForPage('the page to be shown', `return !${PAGE_COVER}`);
  assert.equal(await firefox.evaluate('return document.title'), 'New message!');
});

test('Escape does not close the whole-page cover', async () => {
  const { firefox } = session;
  await open('about-gta.html');
  await firefox.press('Escape');
  await firefox.press('Escape');
  assert.deepEqual(await coverState(), { host: true, title: 'Hidden page', focus: true, onTop: true });
});

test('keys do not reach the page under the whole-page cover, and its sound is paused', async () => {
  const { firefox } = session;
  await open('about-gta.html');
  // Letters only: the focus is on Show anyway, and Space or Enter rightly presses it.
  await firefox.press('k');
  await firefox.press('j');
  assert.deepEqual(await firefox.evaluate('return window.__keys'), [], 'the page heard keys under the cover');
  await firefox.evaluate("document.getElementById('sound').play().catch(() => {});");
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(await firefox.evaluate("return document.getElementById('sound').paused"), true, 'the page\'s sound plays under the cover');
});

test('a page that removes the whole-page cover gets it back', async () => {
  const { firefox } = session;
  await open('about-gta.html');
  await firefox.evaluate(`${PAGE_COVER}.remove();`);
  await firefox.waitForPage('the cover to come back', `return !!${PAGE_COVER}`);
  assert.equal((await coverState()).onTop, true);
});

test('Show anyway shows the page for this visit and gives the tab its title back', async () => {
  const { firefox } = session;
  await open('about-gta.html');
  await firefox.evaluate("document.title = 'GTA 6: the new map - a video site'");
  await firefox.press('Enter'); // the focused button: Show anyway
  await firefox.waitForPage('the page to be shown', `return !${PAGE_COVER} && document.title === 'GTA 6: the new map - a video site'`);
  // Prove a later look really happened, then that it did not bring the cover back.
  await firefox.evaluate("const p = document.createElement('p'); p.id = 'later'; p.textContent = 'GTA 6 again'; document.body.appendChild(p);");
  await firefox.waitForPage('the new paragraph to be covered', "return document.getElementById('later').hasAttribute('data-gta-cover')");
  assert.equal(await firefox.evaluate(`return !!${PAGE_COVER}`), false, 'the cover came back on a page the person chose to see');
  // The tab keeps the site's title, and covering still runs (mutation pass, step 4: a Show
  // anyway that was not remembered put "Hidden page" back and broke covering, and the cover
  // check alone stayed green).
  assert.equal(await firefox.evaluate('return document.title'), 'GTA 6: the new map - a video site');
  await firefox.evaluate("const p = document.createElement('p'); p.id = 'later2'; p.textContent = 'Vice City tonight'; document.body.appendChild(p);");
  await firefox.waitForPage('the second paragraph to be covered', "return document.getElementById('later2').hasAttribute('data-gta-cover')");
  assert.equal(await firefox.evaluate('return document.title'), 'GTA 6: the new map - a video site');
  // A link to a place on the same page is still the same visit.
  await firefox.evaluate("location.hash = 'comments';");
  await firefox.evaluate("document.getElementById('later').textContent = 'GTA 6 once more';");
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(await firefox.evaluate(`return !!${PAGE_COVER}`), false, 'a #link brought the cover back');
});

test('moving to another address that is not about GTA lifts the whole-page cover', async () => {
  const { firefox } = session;
  await open('about-gta.html');
  await firefox.evaluate("history.pushState({}, '', '/other.html'); document.title = 'A normal page';");
  await firefox.waitForPage('the cover to lift', `return !${PAGE_COVER} && document.title === 'A normal page'`);
});

test("nothing of the page shows through the whole-page cover's backdrop", async () => {
  // Headless Firefox draws no backdrop blur at all (checked 2026-11-18), and a see-through
  // backdrop left the page's text readable. The user chose a solid backdrop. The proof is a real
  // screenshot: every pixel where the link under the backdrop sits must be the same colour.
  const { firefox } = session;
  await open('about-gta.html');
  const shot = await firefox.marionette.send('WebDriver:TakeScreenshot', {});
  const colours = await firefox.evaluate(`
    const [png, rect] = arguments;
    const img = new Image();
    img.src = 'data:image/png;base64,' + png;
    return img.decode().then(() => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(rect.x, rect.y, rect.w, rect.h).data;
      const seen = new Set();
      for (let i = 0; i < data.length; i += 4) seen.add(data[i] + ',' + data[i + 1] + ',' + data[i + 2]);
      return [...seen];
    });`, [shot.value, await firefox.evaluate(
    "const r = document.getElementById('behind').getBoundingClientRect(); return { x: Math.floor(r.left), y: Math.floor(r.top), w: Math.ceil(r.width), h: Math.ceil(r.height) };",
  )]);
  assert.equal(colours.length, 1, `the link behind the cover shows through (${colours.length} colours where it sits)`);
});

test('2,000 tiles at once: all 200 GTA ones are covered within 5 seconds', async () => {
  const { firefox } = session;
  const started = Date.now();
  await open('many.html');
  await firefox.waitForPage('all 200 GTA tiles to be covered', "return document.querySelectorAll('[data-gta-cover]').length === 200", { timeoutMs: 10_000 });
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 5_000, `took ${elapsed} ms`);
  assert.equal(await firefox.evaluate("return document.querySelectorAll('li:not([data-gta-cover])').length"), 1800);
});

test("a YouTube Short is covered whole, its picture too, not only its title", async () => {
  // User report, 2026-11-18: on the Shorts shelf only each title line was covered, and the
  // GTA picture above it showed. The fixture is shaped like the shelf YouTube served that day.
  const { firefox, fixtures } = session;
  await firefox.navigate(fixtures.url('www.youtube.com', '/shorts.html'));
  await firefox.waitForPage('the extension to finish its first look', "return document.documentElement.getAttribute('data-gta-blocker') === 'ready'");
  assert.deepEqual(await covers(), [['s-gta', 'gta*', 'l']]);
  assert.equal(await firefox.evaluate("return document.getElementById('s-gta-pic').checkVisibility({ visibilityProperty: true })"), false, 'the picture is hidden under the cover');
});
