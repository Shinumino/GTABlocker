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
  // search-result, shreddit-post, reddit-comment... and YouTube's newer "lockup" cards
  // (yt-lockup-view-model, ytm-shorts-lockup-view-model): without them a Short's title line was
  // covered and its GTA picture showed (user report, 2026-11-18).
  const CARD_NAME = /-(renderer|card|item|post|tile|result|comment|entry|row|cell|lockup)$|-lockup-view-model$|^(shreddit|reddit)-(post|comment)/;
  // A class token that names a card ("comment", "video-card", "search_result"). Whole tokens or
  // their last part only: "post-title" is the title of a post, not the post.
  // "/" too: Tailwind names a group by it ("group/card" is Kick's stream card, whose live
  // preview showed when only the title was covered: user report, 2026-11-19).
  const CARD_CLASS = /(^|[-_/])(card|post|comment|tile|item|result|entry|tweet|story)$/i;
  // The same last word written in camelCase ("ytGridShelfViewModelGridShelfItem", "videoCard").
  const CARD_CAMEL = /[a-z0-9](Card|Post|Comment|Tile|Item|Result|Entry|Tweet|Story)$/;
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
      || (typeof e.cls === 'string' && e.cls.split(/\s+/).some((token) => CARD_CLASS.test(token) || CARD_CAMEL.test(token)));
  }

  function tooBig(e, view) {
    return e.w * e.h > MAX_SHARE * view.w * view.h;
  }

  // The index in `chain` of the box to cover, or -1 when there is none below the page itself.
  // A card is held to the 60% limit (a "card" that big is really the whole feed). Without a
  // card, the block that holds the text (past the inline parts of its line) is covered at any
  // size, since a paragraph taller than the screen is still the thing about GTA (review,
  // 2026-11-18); a box reached by climbing past that block is held to the 60% limit too: on a
  // Reddit search the climb went through a shadow tree and wrappers with no box of their own
  // up to shreddit-app, the whole page, and striped it from edge to edge (user report,
  // 2026-11-18). With nothing small enough, that match is not covered at all.
  function chooseBox(chain, view) {
    for (let i = 0; i < chain.length && !NEVER.has(chain[i].tag); i++) {
      const e = chain[i];
      if (isCard(e) && canCarry(e) && !tooBig(e, view)) return i;
    }
    // The text's own block: past the inline parts of its line (b, a, span...). A site's own
    // (custom) element is never part of a line, even when it is inline by default: Reddit's
    // hidden screen-reader title sat under shreddit-app with only such elements between, and
    // the app counted as the text's own block (user report, 2026-11-18).
    let own = 0;
    while (own < chain.length && chain[own].display === 'inline' && chain[own].custom !== true) own++;
    for (let i = 0; i < chain.length && !NEVER.has(chain[i].tag); i++) {
      if (canCarry(chain[i]) && (i <= own || !tooBig(chain[i], view))) return i;
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

  // A tab title built from ours ("Hidden page", or a site's "(1) Hidden page") is not the site's.
  function isOurTitle(title) {
    return typeof title === 'string' && title.includes(HIDDEN_TITLE);
  }

  // The whole-page cover, one decision per change of the title or the address. The state is
  // { cover: null | { key, waiting }, revealedAt, siteTitle }: key is the address without its
  // #part, revealedAt the address the person pressed Show anyway on, siteTitle the last title
  // the site itself set. It returns { state, act } and never changes the state it is given;
  // act is 'open' (with entry), 'keep' (stay covered, the tab says Hidden page again), 'close',
  // or 'none'. lib/page.js carries the act out.
  //
  // Once a page is covered it stays covered until Show anyway, whatever the site does with its
  // title (a counter like "(1) Hidden page", a blinking "New message!" once lifted it, found in
  // review). When the address changes under the cover (a site that loads pages in place), the
  // first title the site sets for the new address decides again.
  //
  // `allowed` is the site's rule for this address (sites.js allowsPageCover): a page where it is
  // false (a YouTube Short) is never covered, and one that moved there in place loses its cover.
  // Such a page still goes through this step, like any other address (review, 2026-11-19: it
  // skipped it, so Show anyway outlived a trip through Shorts, and the next point broke):
  //
  // A GTA title shown with no cover (a Short, or after Show anyway) is kept as shownTitle,
  // { key, title }. On a new address that same title is the last page's, left behind until the
  // site sets the new one: the cover opens waiting, and the site's own title for the new address
  // decides, as above. Live, 2026-11-19: the YouTube logo on a GTA Short moved the address to
  // Home before the title, and Home was covered as about GTA for good.
  function pageStep(state, { key, title, matcher, allowed = true }) {
    const own = isOurTitle(title);
    if (!allowed) {
      const kept = state.revealedAt === key || state.revealedAt === null || state.revealedAt === undefined
        ? state : { ...state, revealedAt: null, revealedBy: null };
      const next = { ...kept, cover: null, siteTitle: own ? state.siteTitle : title };
      if (!own && pageMatch(title, matcher)) next.shownTitle = { key, title };
      else if (!own) delete next.shownTitle;
      return { state: next, act: state.cover ? 'close' : 'none' };
    }
    if (state.cover) {
      let next = state.cover.key === key ? state.cover : { key, waiting: true };
      let siteTitle = state.siteTitle;
      if (!isOurTitle(title)) {
        siteTitle = title;
        if (next.waiting) {
          next = { key, waiting: false };
          if (!pageMatch(title, matcher)) return { state: { cover: null, revealedAt: state.revealedAt, siteTitle }, act: 'close' };
        }
      }
      return { state: { cover: next, revealedAt: state.revealedAt, siteTitle }, act: 'keep' };
    }
    // Show anyway holds for the address it was pressed on; any other address forgets it.
    if (state.revealedAt === key) {
      const left = state.shownTitle;
      if (own || !pageMatch(title, matcher) || (left && left.key === key && left.title === title)) return { state, act: 'none' };
      return { state: { ...state, shownTitle: { key, title } }, act: 'none' };
    }
    // Any other address forgets the Show anyway, and why it was pressed.
    const { shownTitle: left, ...rest } = state;
    const forgot = rest.revealedAt === null || rest.revealedAt === undefined ? rest : { ...rest, revealedAt: null, revealedBy: null };
    const stale = Boolean(left) && left.key !== key && left.title === title;
    const entry = pageMatch(title, matcher);
    if (entry) return { state: { ...forgot, cover: { key, waiting: stale }, siteTitle: title }, act: 'open', entry };
    // Still the title left behind (a word list where it no longer matches): keep knowing it.
    if (stale) return { state: { ...forgot, shownTitle: left }, act: 'none' };
    return { state: forgot, act: 'none' };
  }

  // The person pressed Show anyway on this address.
  // The page at `key` is shown anyway, by the button or by "Not about GTA" on `cause` (the word):
  // the cause is kept, so that only that word's Undo lifts it (review: the Undo of any word once
  // brought back a whole-page cover the person had dismissed with the button).
  function showAnyway(state, key, cause = 'button') {
    const shown = { cover: null, revealedAt: key, revealedBy: cause, siteTitle: state.siteTitle };
    // The title on show now is this address's: a next address must not take it for its own.
    if (typeof state.siteTitle === 'string' && state.siteTitle !== '') shown.shownTitle = { key, title: state.siteTitle };
    return shown;
  }

  function undoShow(state, key, entry) {
    if (state.revealedAt !== key || state.revealedBy !== entry) return state;
    return { ...state, revealedAt: null, revealedBy: null };
  }

  // The words the person said are not about GTA, for one address: { key, entries }. They hold
  // through a restart (a word list change, the switch off and on) and end with the address, so
  // a single-page site that moves on to another page covers them again (review: they once
  // lived in one run, lost on any restart and kept forever on a single-page site).
  function dismiss(d, key, entry) {
    const now = d && d.key === key ? d : { key, entries: [] };
    return now.entries.includes(entry) ? now : { key, entries: [...now.entries, entry] };
  }

  function undismiss(d, key, entry) {
    if (!d || d.key !== key) return d;
    return { key, entries: d.entries.filter((e) => e !== entry) };
  }

  function dismissedOn(d, key) {
    return d && d.key === key ? d.entries : [];
  }

  // { entry: number of covers }. No prototype, so an own word such as "constructor" or
  // "__proto__" is counted like any other (it once read Object's own members: review).
  function countEntries(entries) {
    const out = Object.create(null);
    for (const entry of entries) out[entry] = (out[entry] || 0) + 1;
    return out;
  }

  ns.cover = Object.freeze({
    chooseBox, canCarry, layersFor, sizeFor, needsAnchor, pageMatch, isOurTitle, pageStep, showAnyway, undoShow,
    dismiss, undismiss, dismissedOn, countEntries, HIDDEN_TITLE, MAX_SHARE,
  });
})(globalThis);
