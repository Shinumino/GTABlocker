// extension/lib/cover.js: which box gets covered, how big a cover is, when a whole page is about
// GTA. These are the rules as plain logic over plain descriptions of elements, so they run in
// Node; the real pages are the macro tests' job. Runs alone:
//   node --test tests/micro/cover-rules.test.mjs
//
// An element is described as { tag, role, cls, display, position, w, h, custom }, and a chain runs
// from the element that holds the match up to the page's root (html last).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadExtensionScripts } from '../support/extension-script.mjs';

const { GtaBlocker } = loadExtensionScripts({ until: 'lib/cover.js' });
const { cover, matcher } = GtaBlocker;

const VIEW = { w: 1280, h: 900 };
const el = (tag, props = {}) => ({ tag, role: null, display: 'block', position: 'static', w: 300, h: 40, ...props });
const page = [el('main', { w: 1280, h: 4000 }), el('body', { w: 1280, h: 4000 }), el('html', { w: 1280, h: 4000 })];
const pick = (chain) => cover.chooseBox(chain, VIEW);

test('a card around the match is chosen over the line that holds it', () => {
  const chain = [el('span', { display: 'inline' }), el('h3', { h: 20 }), el('div', { h: 60 }), el('article', { w: 300, h: 260 }), el('div', { w: 1280, h: 2000 }), ...page];
  assert.equal(pick(chain), 3);
});

test('list items, rows and elements named like a card count as cards', () => {
  for (const card of [el('li'), el('tr', { display: 'table-row' }), el('div', { role: 'article' }), el('div', { role: 'listitem' }),
    el('ytd-rich-item-renderer', { custom: true }), el('shreddit-post', { custom: true }), el('search-result', { custom: true })]) {
    assert.equal(pick([el('p'), card, ...page]), 1, card.tag + (card.role ? `[${card.role}]` : ''));
  }
});

test('a class that names a card makes a card; a class that only starts like one does not', () => {
  for (const cls of ['comment', 'post', 'video-card', 'search_result', 'feed-item', 'tile big', 'x tweet']) {
    assert.equal(pick([el('p'), el('div', { cls }), ...page]), 1, cls);
  }
  // "post-title" is the title of a post, not the post: the outer card must win.
  assert.equal(pick([el('p'), el('div', { cls: 'post-title' }), el('div', { cls: 'post', h: 200 }), ...page]), 2);
});

test('the nearest card wins when cards are nested', () => {
  const chain = [el('p'), el('li', { h: 50 }), el('ul', { h: 300 }), el('article', { w: 600, h: 500 }), ...page];
  assert.equal(pick(chain), 1);
});

test('a card over 60% of the screen is passed over for something smaller', () => {
  // A "card" that is really the whole feed: over 60% of the screen.
  const chain = [el('span', { display: 'inline' }), el('p', { w: 600, h: 60 }), el('article', { w: 1200, h: 3000 }), ...page];
  assert.equal(pick(chain), 1);
});

test('with no card, the nearest block that holds the text is covered', () => {
  const chain = [el('b', { display: 'inline' }), el('span', { display: 'inline' }), el('p', { w: 700, h: 80 }), el('div', { w: 1280, h: 2000 }), ...page];
  assert.equal(pick(chain), 2);
});

test('the page itself is never a box: html, body and main are refused', () => {
  assert.equal(pick([el('body', { w: 300, h: 100 }), el('html')]), -1);
  assert.equal(pick([el('main', { w: 300, h: 100 }), ...page.slice(1)]), -1);
});

test('elements that cannot carry a cover are passed over', () => {
  // A picture or a video cannot draw ::before or ::after; display: contents has no box at all;
  // something drawn at zero size covers nothing.
  for (const skip of [el('img', { display: 'inline' }), el('video'), el('iframe'), el('input', { display: 'inline-block' }), el('div', { display: 'contents' }), el('div', { w: 0, h: 0 })]) {
    assert.equal(pick([skip, el('div', { w: 300, h: 200 }), ...page]), 1, skip.tag);
  }
});

test('a cover sits on a box only, never on an inline run of text', () => {
  const chain = [el('a', { display: 'inline' }), el('span', { display: 'inline' }), el('td', { display: 'table-cell', w: 200, h: 30 }), ...page];
  assert.equal(pick(chain), 2);
});

test('a custom element host (reddit-comment) is chosen as the card', () => {
  const chain = [el('p'), el('div', { w: 300, h: 40 }), el('reddit-comment', { custom: true, w: 600, h: 120 }), ...page];
  assert.equal(pick(chain), 2);
});

test('a box inside a shadow tree is never covered itself: the cover styles cannot reach it', () => {
  // The page's stylesheet does not reach into shadow trees, so a cover set there is never drawn
  // (found in review, 2026-11-18). The host, in the page itself, is covered instead.
  const chain = [el('p', { inShadow: true }), el('article', { inShadow: true, h: 60 }), el('x-panel', { custom: true, h: 60 }), ...page];
  assert.equal(pick(chain), 2);
});

test('a box whose own ::before and ::after the site both uses is passed over; one of them is fine', () => {
  // The cover draws with the box's ::before and ::after; a site that uses them for layout (a
  // clearfix, a 16:9 padding box) would move if both were taken.
  assert.equal(pick([el('div', { cls: 'card', beforeUsed: true, afterUsed: true }), el('div', { cls: 'card', h: 200 }), ...page]), 1);
  assert.equal(pick([el('div', { cls: 'card', afterUsed: true }), ...page]), 0);
  assert.equal(cover.layersFor(el('div')), 'both');
  assert.equal(cover.layersFor(el('div', { beforeUsed: true })), 'after');
  assert.equal(cover.layersFor(el('div', { afterUsed: true })), 'before');
});

test('only a card is held to the 60% limit; the nearest block is covered at any size', () => {
  // A paragraph taller than the screen is still the thing about GTA (found in review).
  assert.equal(pick([el('p', { w: 760, h: 1000 }), el('div', { w: 1280, h: 3000 }), ...page]), 0);
  const area = VIEW.w * VIEW.h * cover.MAX_SHARE;
  assert.equal(pick([el('p'), el('article', { w: 1000, h: area / 1000 }), ...page]), 1, 'exactly 60% is allowed');
  assert.equal(pick([el('p'), el('article', { w: 1000, h: area / 1000 + 1 }), ...page]), 0, 'just over 60% is not');
});

test('every card tag, role and name on the lists counts, and a word that only ends like one does not', () => {
  for (const tag of ['article', 'li', 'tr', 'figure', 'dd', 'details']) assert.equal(pick([el('span', { display: 'inline' }), el(tag), ...page]), 1, tag);
  for (const role of ['article', 'listitem', 'row', 'gridcell', 'option', 'treeitem']) assert.equal(pick([el('span', { display: 'inline' }), el('div', { role }), ...page]), 1, role);
  for (const name of ['x-renderer', 'x-card', 'x-item', 'x-post', 'x-tile', 'x-result', 'x-comment', 'x-entry', 'x-row', 'x-cell', 'shreddit-post', 'reddit-comment']) {
    assert.equal(pick([el('p'), el(name, { custom: true }), ...page]), 1, name);
  }
  assert.equal(pick([el('p'), el('div', { cls: 'signpost' }), el('div', { cls: 'post', h: 200 }), ...page]), 2, '"signpost" is not a post');
  assert.equal(pick([el('p'), el('div', { cls: 'Comment' }), ...page]), 1, 'class names are not case-sensitive here');
});

test('a card that cannot carry a cover is passed over for the next one out', () => {
  assert.equal(pick([el('p'), el('li', { display: 'contents' }), el('div', { cls: 'card', h: 200 }), ...page]), 2);
  assert.equal(pick([el('p'), el('li', { w: 300, h: 0 }), el('div', { cls: 'card', h: 200 }), ...page]), 2);
  assert.equal(pick([el('p'), el('li', { w: 0, h: 40 }), el('div', { cls: 'card', h: 200 }), ...page]), 2);
  assert.equal(pick([el('p'), el('li', { display: 'none' }), el('div', { cls: 'card', h: 200 }), ...page]), 2);
});

test('sizes at their exact edges', () => {
  assert.equal(cover.sizeFor({ w: 300, h: 23 }), 'xs');
  assert.equal(cover.sizeFor({ w: 300, h: 24 }), 's');
  assert.equal(cover.sizeFor({ w: 59, h: 100 }), 'xs');
  assert.equal(cover.sizeFor({ w: 60, h: 100 }), 'm');
  assert.equal(cover.sizeFor({ w: 199, h: 140 }), 'm');
  assert.equal(cover.sizeFor({ w: 200, h: 140 }), 'l');
});

test('sizes: no text in a tiny box, one line when short, the icon only when big', () => {
  assert.equal(cover.sizeFor({ w: 300, h: 18 }), 'xs');
  assert.equal(cover.sizeFor({ w: 50, h: 300 }), 'xs');
  assert.equal(cover.sizeFor({ w: 300, h: 36 }), 's');
  assert.equal(cover.sizeFor({ w: 300, h: 47 }), 's');
  assert.equal(cover.sizeFor({ w: 300, h: 48 }), 'm');
  assert.equal(cover.sizeFor({ w: 300, h: 139 }), 'm');
  assert.equal(cover.sizeFor({ w: 300, h: 140 }), 'l');
  // A tall but narrow box is not big: the note would wrap into the icon's room.
  assert.equal(cover.sizeFor({ w: 150, h: 300 }), 'm');
});

test('a box that is positioned already keeps its own position', () => {
  assert.equal(cover.needsAnchor({ position: 'static' }), true);
  for (const position of ['relative', 'absolute', 'fixed', 'sticky']) assert.equal(cover.needsAnchor({ position }), false, position);
});

test('a page is about GTA when its title matches', () => {
  const m = matcher.compile(matcher.DEFAULT_ENTRIES);
  assert.equal(cover.pageMatch('GTA 6 trailer 3: everything we spotted - YouTube', m), 'gta*');
  assert.equal(cover.pageMatch('My dog learned to open the fridge - YouTube', m), null);
  assert.equal(cover.pageMatch('', m), null);
});

test('the tab says "Hidden page" while a whole page is covered', () => {
  assert.equal(cover.HIDDEN_TITLE, 'Hidden page');
});

test("YouTube's Shorts card (a \"lockup\") is covered whole, picture and title, not only its title", () => {
  // The chain from a Shorts title up, as YouTube built it on 2026-11-18 (read from the live
  // search page): only the title line was covered and the GTA picture showed (user report).
  const chain = [
    el('h3', { display: 'flow-root', w: 201, h: 44, cls: 'shortsLockupViewModelHostMetadataTitle shortsLockupViewModelHostOutsideMetadataTitle' }),
    el('div', { w: 201, h: 68 }),
    el('div', { w: 237, h: 76, position: 'relative', cls: 'shortsLockupViewModelHostOutsideMetadata shortsLockupViewModelHostMetadataRounded' }),
    el('ytm-shorts-lockup-view-model', { custom: true, display: 'inline-block', position: 'relative', w: 237, h: 432, cls: 'shortsLockupViewModelHost' }),
    el('ytm-shorts-lockup-view-model-v2', { custom: true, position: 'relative', w: 237, h: 435 }),
    el('div', { display: 'flex', w: 237, h: 435, cls: 'ytGridShelfViewModelGridShelfItem' }),
    el('div', { display: 'flex', w: 1250, h: 435, cls: 'ytGridShelfViewModelGridShelfRow ytd-item-section-renderer grid-shelf-with-top-margin' }),
    ...page,
  ];
  assert.equal(pick(chain), 3);
  // YouTube's video card of the same family.
  assert.equal(pick([el('h3'), el('div'), el('yt-lockup-view-model', { custom: true, w: 400, h: 300 }), ...page]), 2);
});

test('a class written in camelCase names a card the same way ("ShelfItem", "videoCard")', () => {
  for (const cls of ['ytGridShelfViewModelGridShelfItem', 'videoCard', 'searchResult', 'feedPost x']) {
    assert.equal(pick([el('p'), el('div', { cls }), ...page]), 1, cls);
  }
  // Only the last word counts, and only those words: a row, a list, a title, a menu are not cards.
  for (const cls of ['ytGridShelfViewModelGridShelfRow', 'itemList', 'cardTitle', 'postHeader', 'ItemS']) {
    assert.notEqual(pick([el('p'), el('div', { cls }), ...page]), 1, cls);
  }
});

test('a climb past the block that holds the text never covers a page-wide container (Reddit)', () => {
  // User report, 2026-11-18: a Reddit search was striped from edge to edge. The match sat in a
  // shadow tree, its wrappers had no box of their own, and the climb reached shreddit-app, the
  // whole page, which the fallback covered at any size.
  const chain = [
    el('span', { inShadow: true, display: 'inline' }),
    el('div', { inShadow: true, w: 500, h: 20 }),
    el('faceplate-tracker', { custom: true, display: 'contents' }),
    el('search-dynamic-id-cache-controller', { custom: true, display: 'inline' }),
    el('shreddit-app', { custom: true, w: 1280, h: 4000 }),
    ...page,
  ];
  assert.equal(pick(chain), -1);
  // A box of a sensible size on the way up is covered instead.
  const withBox = [chain[0], chain[1], chain[2], el('div', { w: 600, h: 200 }), chain[4], ...page];
  assert.equal(pick(withBox), 3);
});

test("the block that holds the text is still covered at any size, even when the word sits in a bold part", () => {
  assert.equal(pick([el('b', { display: 'inline' }), el('a', { display: 'inline' }), el('p', { w: 800, h: 2000 }), ...page]), 2);
  assert.equal(pick([el('p', { w: 800, h: 2000 }), ...page]), 0);
});

test("a site's own elements are never part of a line: the climb stops at them (Reddit's hidden title)", () => {
  // From the saved Reddit page (2026-11-18): the screen-reader message "gta - Reddit Search!"
  // sits under shreddit-app with only Reddit's custom elements between, all inline by default,
  // so the app counted as the text's own block and was covered at any size.
  const chain = [
    el('span', { display: 'inline' }),
    el('faceplate-screen-reader-content', { custom: true, display: 'inline', w: 1, h: 1 }),
    el('screen-reader-alert-outlet', { custom: true, display: 'inline' }),
    el('shreddit-async-loader', { custom: true, display: 'inline' }),
    el('shreddit-app', { custom: true, w: 1584, h: 1634 }),
    ...page,
  ];
  assert.equal(pick(chain), -1);
});
