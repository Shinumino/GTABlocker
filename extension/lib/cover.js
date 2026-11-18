// GtaBlocker.cover: the rules for covering, as plain logic over plain descriptions of elements,
// so the micro tests can prove them without a browser. The page side (reading real elements,
// setting the attributes) is lib/page.js.
//
// An element is described as { tag, role, cls, display, position, w, h, custom, inShadow,
// beforeUsed, afterUsed } (cls: its class attribute; custom: a custom element, like YouTube's
// ytd-rich-item-renderer; inShadow: it sits in a shadow tree; beforeUsed / afterUsed: the site
// draws something with the element's own ::before / ::after). A chain runs from
// the element that holds a match up to the page's root.
//
// Which box is covered: the smallest card around the match (a post, a comment, a video tile, a
// search result, a list item, an article), never more than 60% of the screen; with no card, the
// nearest block that holds the text, at any size. Never the page itself (html, body, main): a page about GTA
// gets the whole-page cover instead. Site rules (step 6) fix what these general rules get wrong.

(function (root) {
  'use strict';

  const ns = Object.hasOwn(root, 'GtaBlocker') ? root.GtaBlocker : (root.GtaBlocker = {});

  // Past these the chain is the page itself.
  const NEVER = new Set(['html', 'body', 'main', 'head']);
  // Elements that cannot draw ::before or ::after (the cover's two layers), or wrap one that
  // cannot. A box further out is covered instead.
  const NO_PSEUDO = new Set(['img', 'video', 'audio', 'iframe', 'object', 'embed', 'canvas', 'svg',
    'picture', 'input', 'textarea', 'select', 'option', 'br', 'hr']);
  const CARD_TAGS = new Set(['article', 'li', 'tr', 'figure', 'dd', 'details']);
  const CARD_ROLES = new Set(['article', 'listitem', 'row', 'gridcell', 'option', 'treeitem']);
  // Custom elements named like a card: ytd-rich-item-renderer, ytd-comment-thread-renderer,
  // search-result, shreddit-post, reddit-comment...
  const CARD_NAME = /-(renderer|card|item|post|tile|result|comment|entry|row|cell)$|^(shreddit|reddit)-(post|comment)/;
  // A class token that names a card ("comment", "video-card", "search_result"). Whole tokens or
  // their last part only: "post-title" is the title of a post, not the post.
  const CARD_CLASS = /(^|[-_])(card|post|comment|tile|item|result|entry|tweet|story)$/i;
  const MAX_SHARE = 0.6;
  const HIDDEN_TITLE = 'Hidden page';

  // Whether the cover can be drawn on this element. Not inside a shadow tree: the page's
  // stylesheet (content.css) never reaches in there, so a cover set there is not drawn at all
  // (found in review, 2026-11-18); the host, in the page itself, gets it instead. Not when the
  // site already uses both the box's ::before and ::after: the cover needs at least one of them,
  // and taking one the site uses for layout (a clearfix, a 16:9 padding box) moves the page.
  function canCarry(e) {
    return !NO_PSEUDO.has(e.tag) && e.display !== 'contents' && e.display !== 'none'
      && e.display !== 'inline' && e.w > 0 && e.h > 0
      && e.inShadow !== true && !(e.beforeUsed === true && e.afterUsed === true);
  }

  // Which of the box's pseudo-elements the cover may use: both when the site uses neither; only
  // the free one otherwise (the cover is then drawn as one layer, surface and note together).
  function layersFor(e) {
    if (e.beforeUsed === true) return 'after';
    if (e.afterUsed === true) return 'before';
    return 'both';
  }

  function isCard(e) {
    return CARD_TAGS.has(e.tag) || (e.role != null && CARD_ROLES.has(e.role))
      || (e.custom === true && CARD_NAME.test(e.tag))
      || (typeof e.cls === 'string' && e.cls.split(/\s+/).some((token) => CARD_CLASS.test(token)));
  }

  function tooBig(e, view) {
    return e.w * e.h > MAX_SHARE * view.w * view.h;
  }

  // The index in `chain` of the box to cover, or -1 when there is none below the page itself.
  // Only a card is held to the 60% limit (a "card" that big is really the whole feed); the
  // nearest block is covered at any size, since a paragraph taller than the screen is still the
  // thing about GTA (found in review, 2026-11-18).
  function chooseBox(chain, view) {
    for (let i = 0; i < chain.length && !NEVER.has(chain[i].tag); i++) {
      const e = chain[i];
      if (isCard(e) && canCarry(e) && !tooBig(e, view)) return i;
    }
    for (let i = 0; i < chain.length && !NEVER.has(chain[i].tag); i++) {
      if (canCarry(chain[i])) return i;
    }
    return -1;
  }

  // The cover's size, from the box's size (agreed in the preview, docs/design/cover-preview.html):
  // xs = no room for text (the striped surface only), s = one line, l = big enough for the paw,
  // m = the rest. A tall narrow box is not big: the note would wrap into the paw's room.
  function sizeFor({ w, h }) {
    if (h < 24 || w < 60) return 'xs';
    if (h < 48) return 's';
    if (h >= 140 && w >= 200) return 'l';
    return 'm';
  }

  // A cover's layers are positioned against the box; a box that is already positioned is its own
  // anchor, and making it "relative" would move it (an absolute or sticky box).
  function needsAnchor({ position }) {
    return position === 'static';
  }

  // The entry that makes the whole page about GTA, or null.
  function pageMatch(title, matcher) {
    return title ? matcher.find(title) : null;
  }

  ns.cover = Object.freeze({ chooseBox, layersFor, sizeFor, needsAnchor, pageMatch, HIDDEN_TITLE, MAX_SHARE });
})(globalThis);
