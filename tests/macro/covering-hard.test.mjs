// Journey 1, the hard cases: boxes and pages that real sites build and that the step 3 reviews
// (2026-11-18) showed the first version got wrong or that its tests could not see. Fixture:
// tests/fixtures/cover.test/hard.html (each GTA box has a twin without GTA to compare with).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useFirefox, EXTENSION_DIR } from '../support/browser-test.mjs';

const session = useFirefox({ extensionDir: EXTENSION_DIR });
const open = async (file = 'hard.html') => {
  const { firefox, fixtures } = session;
  await firefox.navigate(fixtures.url('cover.test', `/${file}`));
  await firefox.waitForPage('the first look', "return document.documentElement.getAttribute('data-gta-blocker') === 'ready'");
};
const js = (script, args) => session.firefox.evaluate(script, args);
const word = (id) => js("const e = document.getElementById(arguments[0]); return e && e.getAttribute('data-gta-word');", [id]);
const size = (id) => js('const r = document.getElementById(arguments[0]).getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)];', [id]);
const center = (id) => js('const r = document.getElementById(arguments[0]).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2];', [id]);

test('the page is not marked ready while it is still being read', async () => {
  await open();
  assert.equal(await js('return window.__markerWhileParsing'), null);
});

test('a page still loading when covering starts is marked ready only once its first look is done', async () => {
  // Sent in two parts, a second apart (tests/support/fixtures.mjs): covering starts while the
  // page is loading, and "ready" must wait for the first look (mutation pass, step 4: the short
  // page above is fully loaded before covering starts, so it can no longer tell).
  const { firefox, fixtures } = session;
  await firefox.navigate(fixtures.url('cover.test', '/stream.slow.html'));
  await firefox.waitForPage('ready', "return document.documentElement.getAttribute('data-gta-blocker') === 'ready'");
  assert.equal(await js('return window.__coversAtReady'), 2, 'both parts were covered when the page was marked ready');
});

test('a cover never changes a box\'s size, even when the site uses the box\'s own ::before or ::after', async () => {
  await open();
  for (const [gta, twin] of [['auto-gta', 'auto-dog'], ['cf-gta', 'cf-dog'], ['ratio-gta', 'ratio-dog']]) {
    assert.ok(await word(gta), `${gta} was not covered`);
    assert.equal(await word(twin), null, `${twin} was covered`);
    assert.deepEqual(await size(gta), await size(twin), `covering ${gta} changed its size`);
  }
});

test('no click, middle click, right click or hover on a cover reaches the link around it', async () => {
  await open();
  assert.equal(await word('wrapped-gta'), 'gta*');
  const [x, y] = await center('wrapped-gta');
  await session.firefox.hoverAt(x, y);
  await session.firefox.clickAt(x, y);
  await session.firefox.clickAt(x, y, { button: 1 });
  await session.firefox.clickAt(x, y, { button: 2 });
  assert.deepEqual(await js('return window.__heard'), [], 'the page heard an event aimed at a cover');
  assert.equal(await js('return location.hash'), '', 'the link around the cover was followed');
});

test('a badge the site forces visible with !important stays hidden', async () => {
  await open();
  assert.equal(await js("return getComputedStyle(document.getElementById('forced-badge')).visibility"), 'hidden');
});

test('a positioned box keeps its own position', async () => {
  await open();
  for (const [id, position] of [['abs-gta', 'absolute'], ['sticky-gta', 'sticky']]) {
    assert.ok(await word(id), `${id} was not covered`);
    assert.equal(await js('return document.getElementById(arguments[0]).hasAttribute("data-gta-anchor")', [id]), false, id);
    assert.equal(await js('return getComputedStyle(document.getElementById(arguments[0])).position', [id]), position, id);
  }
  assert.deepEqual(await size('abs-gta'), [300, 80]);
});

test('a card taller than the screen is passed over; a paragraph is covered at any size', async () => {
  await open();
  assert.equal(await word('tall'), null, 'the whole tall article was covered');
  assert.equal(await word('tall-p'), 'grand theft auto');
  assert.equal(await word('huge-p'), 'los santos');
});

test('a box whose tooltip is about GTA is covered, and the tooltip comes back only when it is uncovered', async () => {
  await open();
  assert.equal(await word('titled'), 'gta*');
  assert.equal(await js("return document.getElementById('titled').getAttribute('title')"), null, 'the tooltip still shows the GTA text');
  await js("const e = document.getElementById('titled'); e.setAttribute('data-gta-title', 'Puppies'); e.textContent = 'A dog video';");
  await session.firefox.waitForPage('the box to be uncovered', "return !document.getElementById('titled').hasAttribute('data-gta-cover')");
  assert.equal(await js("return document.getElementById('titled').getAttribute('title')"), 'Puppies');
});

test('text the person is typing is never covered', async () => {
  await open();
  assert.equal(await word('editor'), null);
  assert.equal(await js("return document.getElementById('editor').closest('[data-gta-cover]')"), null);
});

test('hidden text is not covered while hidden, and is covered when it is shown', async () => {
  await open();
  assert.equal(await word('nav'), null, 'a menu was covered for a hidden item in it');
  assert.equal(await js("return document.querySelector('[data-gta-cover] #later, #later[data-gta-cover]')"), null);
  await js("document.getElementById('later').hidden = false;");
  await session.firefox.waitForPage('the shown box to be covered', "return document.getElementById('later').getAttribute('data-gta-word') === 'gta*'");
});

test('text is joined within a line, never across lines', async () => {
  await open();
  assert.equal(await word('glue'), null, '"the vice" and "city council" were read as one line');
  assert.equal(await word('inline-join'), 'gta*', 'G<b>TA</b> was not read as one word');
});

test('removing a piece of a line, changing text in place or changing a picture text is noticed', async () => {
  await open();
  assert.equal(await word('removal'), null);
  await js("document.getElementById('loading').remove();");
  await session.firefox.waitForPage('the joined line to be covered', "return document.getElementById('removal').getAttribute('data-gta-word') === 'vice city'");
  await js("document.getElementById('retext').firstChild.data = 'Vice City at last';");
  await session.firefox.waitForPage('the cover to name the new word', "return document.getElementById('retext').getAttribute('data-gta-word') === 'vice city'");
});

test('a cover is chosen again when what made it changes', async () => {
  await open();
  assert.equal(await word('shelf'), 'gta*', 'the shelf was not covered for its heading');
  await js("document.getElementById('shelf-head').textContent = 'Dog shelf'; document.getElementById('shelf-item').textContent = 'Back to Vice City';");
  await session.firefox.waitForPage('the item, not the shelf, to be covered', `
    return !document.getElementById('shelf').hasAttribute('data-gta-cover')
      && document.getElementById('shelf-item').getAttribute('data-gta-word') === 'vice city';`);
});

test('a box that changes size gets the cover size that fits', async () => {
  await open();
  assert.equal(await js("return document.getElementById('auto-gta').getAttribute('data-gta-size')"), 'm');
  await js("document.getElementById('auto-gta').style.height = '20px'; document.getElementById('auto-gta').style.overflow = 'hidden';");
  await session.firefox.waitForPage('the size to follow the box', "return document.getElementById('auto-gta').getAttribute('data-gta-size') === 's'");
});

test('content in a shadow tree is covered through its host, open or closed', async () => {
  await open();
  for (const id of ['panel-open', 'panel-closed']) {
    await session.firefox.waitForPage(`${id} to be covered`, 'return document.getElementById(arguments[0]).getAttribute("data-gta-word") === "gta*"'.replace('arguments[0]', `'${id}'`));
  }
  assert.equal(await js("return getComputedStyle(document.getElementById('panel-open').shadowRoot.querySelector('.sbadge')).visibility"), 'hidden',
    'a badge inside the shadow tree shows through');
  // A change inside the shadow tree after the page loaded is noticed too.
  await js("document.getElementById('panel-open').shadowRoot.querySelector('p').textContent = 'A dog in a shadow tree';");
  await session.firefox.waitForPage('the host to be uncovered', "return !document.getElementById('panel-open').hasAttribute('data-gta-cover')");
});

test('a covered box the page removes is let go, and comes back fresh if it is put back', async () => {
  await open();
  await js("window.__kept = document.getElementById('cf-gta'); window.__kept.remove();");
  await js("document.body.appendChild(document.createElement('p')).textContent = 'nudge';");
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(await js('return window.__kept.hasAttribute("data-gta-cover")'), false, 'a removed box kept its cover');
  await js("window.__kept.querySelector('.float').textContent = 'Cats'; document.body.appendChild(window.__kept);");
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(await js('return window.__kept.hasAttribute("data-gta-cover")'), false, 'a box put back with new content was covered');
});

test('an embedded GTA player does not take the keyboard from the page', async () => {
  await open('with-frame.html');
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(await js("return document.activeElement && document.activeElement.id"), 'search');
});
