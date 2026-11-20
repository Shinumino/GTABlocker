// GtaBlocker.page: the page side of covering. It reads the real page, asks the matcher and the
// rules in lib/cover.js, and covers boxes by setting attributes that content.css draws from.
// The agreed look and behaviour: docs/design/cover-preview.html and the project CLAUDE.md.
//
// What it never does: add or remove anything inside the site's page. A cover is attributes on
// the site's own box (data-gta-cover, -word, -size, -anchor, -layers, and -title, which holds
// the box's own tooltip while it is covered). The one element of ours is the whole-page cover,
// added to <html> outside the site's body, in a closed shadow tree.
//
// How text is read: each block (the nearest element that is not inline) is read on its own, and
// the pieces of one block are joined as they show on screen: "Vice <b>City</b>" is one line,
// while text on either side of a child block or a <br> is kept apart ("the vice" / "city
// council"). Picture descriptions, tooltips and screen-reader labels are read too: video tiles
// often carry their title only there. Hidden text is not covered while hidden, and is covered
// when it is shown. Text the person is typing (an editable area) is never read.

(function (root) {
  'use strict';

  const ns = Object.hasOwn(root, 'GtaBlocker') ? root.GtaBlocker : (root.GtaBlocker = {});

  const COVER = 'data-gta-cover';
  const WORD = 'data-gta-word';
  const SIZE = 'data-gta-size';
  const ANCHOR = 'data-gta-anchor';
  const LAYERS = 'data-gta-layers';
  const STASHED_TITLE = 'data-gta-title';
  const WITHIN = 'data-gta-within';
  // A site player's cover while it is checked ("Checking for GTA...", content.css), and a held
  // video's own muted setting, kept on the video so the next copy of the add-on can give it
  // back (a reload left YouTube's reused video muted for good: review, 2026-11-19).
  const CHECKING = 'data-gta-checking';
  const MUTED = 'data-gta-muted';
  // A cover with no words: a line inside a Short or a reel (its caption, a comment) whose
  // player's cover already says it (the user's choice after round 2: the same words twice on
  // one screen). Set and taken off on every pass (quietInItems).
  const QUIET = 'data-gta-quiet';
  // The whole-page cover's element: this prefix and a random rest, and the site's own title on it.
  const HOST_PREFIX = 'gta-blocker-page-';
  const LEFT_TITLE = 'data-gta-site-title';
  // A covered box's own tooltip would still show the GTA text on hover, so while it is covered
  // its title waits in data-gta-title, which is read like the title itself.
  const TEXT_ATTRS = ['alt', 'title', 'aria-label', STASHED_TITLE];
  // Changes that can show or hide something: a hidden match is looked at again after these.
  const SHOW_ATTRS = ['hidden', 'class', 'style', 'open'];
  const SKIP = new Set(['script', 'style', 'noscript', 'template', 'head', 'title', 'textarea', 'input', 'select']);
  const INLINE = new Set(['inline', 'contents']);
  const MAX_CHAIN = 40;
  const MAX_SHADOW_DEPTH = 32;
  // The ways of acting on a cover that are stopped before the site hears of them: a click (a
  // cover over a link once opened the link, found in review), a middle or right click, a key on
  // something focused before it was covered, a touch, and a hover (video sites start a preview
  // on hover).
  const GUARDED = ['click', 'auxclick', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup',
    'contextmenu', 'keydown', 'mouseover', 'mouseenter', 'pointerover', 'pointerenter', 'touchstart'];
  // Under the whole-page cover no key reaches the page: on a video page a key starts the video.
  const PAGE_KEYS = ['keydown', 'keyup', 'keypress'];
  // A video getting a new source: a site player's next item swapped into the same element.
  const SOURCE_EVENTS = ['emptied'];
  // Inside a shadow tree the page's stylesheet does not apply; this one is added to every shadow
  // tree found, so a covered host's shadow content is hidden even where the component sets it
  // visible (found in review, 2026-11-18).
  const SHADOW_CSS = `:host([${COVER}]) *, :host([${WITHIN}]) * { visibility: hidden !important; }`;

  const sheeted = new WeakSet();
  let shadowSheet = null;

  // Events inside a shadow tree stop at its root (they are not composed), so each shadow tree
  // found gets listeners of its own: ONE set per tree for the life of the frame, sending to
  // whichever run is active. One set per run piled up on every restart (the switch, a word
  // list change) and kept each stopped run alive (ChatGPT, security, correctness, round 2).
  const SHADOW_EVENTS = ['play', 'volumechange', ...SOURCE_EVENTS];
  const listenedShadows = new WeakSet();
  let activeRun = null;
  function onShadowEvent(event) {
    if (activeRun) activeRun(event);
  }

  // Starts covering this page with `matcher`. Returns { stop, show, cover, retell }:
  // - stop() undoes everything start did (observers, listeners, every cover, the whole-page
  //   cover and its tab title) and returns the page's state to pass to the next start, so a
  //   "Show anyway" and the words shown again outlive a restart (the switch, a new word list);
  // - show(entry) shows again, on this page's address, every cover made by that entry ("Not
  //   about GTA"), and cover(entry) takes that back (Undo);
  // - retell() says the covers again (a page restored by Back says nothing on its own).
  // label(entry) is the word a cover shows, and it is required: the content script never lets
  // one of the user's own words reach the page, and a caller that forgot it would leak them
  // (design review). onCovers(counts) hears { entry: number of covers } after each change.
  function start({ matcher, label, onReady = () => {}, pageState: given = null, onCovers = () => {} }) {
    if (typeof label !== 'function') throw new TypeError('page.start needs label(entry): the word a cover may show');
    const { cover, media: mediaRule, sites } = ns;
    const site = sites.rulesFor(root.location && root.location.hostname);
    const doc = root.document;
    const win = root.window || root;
    const isTop = win.top === win;
    const covered = new Map(); // box -> the entry that covered it
    const hiddenMatches = new Map(); // element -> entry, for matches that are not shown yet
    const queue = [];
    // The words the person said are not about GTA, for one address (cover.dismiss).
    let dismissed = given && given.dismissed ? given.dismissed : null;
    let scheduled = false;
    let stopped = false;
    let lastCounts = '';
    let displays = new Map();
    let visibles = new Map();

    // ---- reading the page ----

    // The parent across a shadow boundary: a shadow root's parent is its host.
    function parentOf(node) {
      if (node.parentElement) return node.parentElement;
      const parent = node.parentNode;
      return parent && parent.nodeType === 11 && parent.host ? parent.host : null;
    }

    // Firefox gives content scripts closed shadow roots too (openOrClosedShadowRoot).
    function shadowOf(el) {
      return el.openOrClosedShadowRoot || el.shadowRoot || null;
    }

    function displayOf(el) {
      let d = displays.get(el);
      if (d === undefined) {
        d = win.getComputedStyle(el).display;
        displays.set(el, d);
      }
      return d;
    }

    function isShown(el) {
      let v = visibles.get(el);
      if (v === undefined) {
        v = typeof el.checkVisibility === 'function' ? el.checkVisibility() : true;
        visibles.set(el, v);
      }
      return v;
    }

    // The element a change happened at: a shadow root stands for its host, a text for its parent.
    function elementOf(node) {
      if (!node) return null;
      if (node.nodeType === 1) return node;
      if (node.nodeType === 11) return node.host || null;
      return parentOf(node);
    }

    function blockOf(el) {
      let e = el;
      for (let i = 0; e && i < MAX_CHAIN; i++) {
        if (!INLINE.has(displayOf(e))) return e;
        e = parentOf(e);
      }
      return el;
    }

    function pseudoUsed(el, which) {
      const content = win.getComputedStyle(el, which).content;
      return content !== 'none' && content !== 'normal';
    }

    function describe(el) {
      const style = win.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        tag: el.localName, role: el.getAttribute('role'), cls: el.getAttribute('class') || '',
        display: style.display, position: style.position, w: rect.width, h: rect.height,
        custom: el.localName.includes('-'), inShadow: el.getRootNode() !== doc,
        beforeUsed: pseudoUsed(el, '::before'), afterUsed: pseudoUsed(el, '::after'),
      };
    }

    function coveredAncestor(node) {
      for (let e = node.nodeType === 1 ? node : parentOf(node), i = 0; e && i < MAX_CHAIN * 2; e = parentOf(e), i++) {
        if (e.hasAttribute(COVER)) return e;
      }
      return null;
    }

    function isOurs(node) {
      return pageCover !== null && node === pageCover.host;
    }

    function addShadowSheet(shadow) {
      if (sheeted.has(shadow)) return;
      sheeted.add(shadow);
      try {
        if (!shadowSheet) {
          shadowSheet = new win.CSSStyleSheet();
          shadowSheet.replaceSync(SHADOW_CSS);
        }
        shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, shadowSheet];
      } catch {
        // A shadow tree that refuses the sheet: its host is still covered; a child the component
        // sets visible would show. Rare, and nothing else to do from here.
      }
    }

    // Text grouped by block, and the text attributes, under `start` (an element, a shadow root or
    // the document), entering shadow trees. With `own`, only the block's own line is read (child
    // blocks are left out): enough after a change inside one line. Elements inside a cover are
    // left to recheck(), unless `all` (a site player's caption is read whole, its covered GTA
    // line too: playersPass).
    function collect(start, { own = false, all = false } = {}, out = { blocks: new Map(), attrs: [], last: null }, depth = 0) {
      const filter = {
        acceptNode(node) {
          if (node.nodeType !== 1) return 1;
          if (SKIP.has(node.localName) || isOurs(node)) return 2;
          if (!all && node.hasAttribute(COVER)) return 2;
          if (node.isContentEditable) return 2; // what the person is typing
          if (own && !INLINE.has(displayOf(node))) {
            out.last = null; // a child block sits between the pieces of the line
            return 2;
          }
          return 1;
        },
      };
      const walker = doc.createTreeWalker(start, 0x1 | 0x4, filter); // elements and text
      for (let node = walker.currentNode; node; node = walker.nextNode()) {
        if (node.nodeType === 3) {
          const parent = parentOf(node);
          if (!parent || SKIP.has(parent.localName) || node.data === '') continue;
          const block = blockOf(parent);
          let lines = out.blocks.get(block);
          if (!lines) out.blocks.set(block, (lines = [[]]));
          // Text either side of a child block or a <br> is another line, read on its own: a space
          // is not enough, since the matcher takes any gap between words ("vice" / "city").
          else if (out.last !== block) lines.push([]);
          lines[lines.length - 1].push(node.data);
          out.last = block;
        } else if (node.nodeType === 1) {
          if (node === start && (SKIP.has(node.localName) || node.isContentEditable)) return out;
          if (node.localName === 'br') out.last = null;
          for (const name of TEXT_ATTRS) {
            const value = node.getAttribute(name);
            if (value) out.attrs.push([node, value]);
          }
          const shadow = shadowOf(node);
          if (shadow && depth < MAX_SHADOW_DEPTH) {
            watch(shadow);
            addShadowSheet(shadow);
            listenShadow(shadow);
            collect(shadow, { own, all }, out, depth + 1);
          }
          if (!INLINE.has(displayOf(node)) && node !== start) out.last = null;
        }
      }
      return out;
    }

    // The matches in what was collected, as [element, entry]; a match that is not shown yet is
    // kept aside and covered once it is shown.
    function matchesIn(out) {
      const found = [];
      const take = (el, entry) => {
        if (isShown(el)) found.push([el, entry]);
        else hiddenMatches.set(el, entry);
      };
      for (const [block, lines] of out.blocks) {
        for (const line of lines) {
          const entry = matcher.find(line.join(''));
          if (entry) {
            take(block, entry);
            break;
          }
        }
      }
      for (const [el, value] of out.attrs) {
        const entry = matcher.find(value);
        if (entry) take(el, entry);
      }
      return found;
    }

    // ---- covering ----

    function boxFor(el) {
      // Inside a site player's item (a Short, a reel) a cover stays inside it: each GTA line
      // gets its own, the player is decided apart (playersPass), and the item itself is never
      // covered whole by a line (its side buttons, like and comment, stay).
      const player = playerHere();
      const item = player ? itemAround(el, player) : null;
      const chain = [];
      for (let e = el; e && chain.length < MAX_CHAIN; e = parentOf(e)) {
        if (e === item) break;
        chain.push(e);
      }
      const view = { w: win.innerWidth, h: win.innerHeight };
      const index = cover.chooseBox(chain.map(describe), view);
      return index === -1 ? null : chain[index];
    }

    // The cover's attributes on `box`; `entry` null is a player being checked; `quiet`, stripes
    // with no words.
    function drawCover(box, entry, { quiet = false } = {}) {
      if (entry === null) {
        box.setAttribute(CHECKING, '');
        box.removeAttribute(WORD);
      } else {
        box.removeAttribute(CHECKING);
        box.setAttribute(WORD, label(entry));
      }
      if (quiet) box.setAttribute(QUIET, '');
      else box.removeAttribute(QUIET);
      // Drawn already (a player going from "Checking" to GTA, or to a new word): its size and
      // layers stay. Read again, its ::before and ::after are the cover's own, and the layers
      // flipped to one, taking the site's pseudo-element (correctness review, round 2).
      if (!box.hasAttribute(COVER)) {
        const d = describe(box);
        box.setAttribute(SIZE, cover.sizeFor(d));
        box.setAttribute(LAYERS, cover.layersFor(d));
        if (cover.needsAnchor(d)) box.setAttribute(ANCHOR, '');
      }
      if (box.hasAttribute('title')) {
        box.setAttribute(STASHED_TITLE, box.getAttribute('title'));
        box.removeAttribute('title');
      }
      // Shadow hosts inside the box: their shadow content is hidden by SHADOW_CSS.
      for (const host of box.querySelectorAll('*')) if (shadowOf(host)) host.setAttribute(WITHIN, '');
      if (!box.hasAttribute(COVER)) resizes.observe(box);
      box.setAttribute(COVER, '');
      holdMedia(box);
    }

    // The attributes only. What played under it gets its sound back in releaseMedia, once it
    // is known that no cover holds it any more: a box covered again at once (a recheck) leaves
    // it muted, where it was unmuted and muted again before, which the page heard twice and
    // which undid a mute set while it was covered (review, 2026-11-19).
    function eraseCover(box) {
      for (const name of [COVER, WORD, SIZE, ANCHOR, LAYERS, CHECKING, QUIET]) box.removeAttribute(name);
      if (box.hasAttribute(STASHED_TITLE)) {
        box.setAttribute('title', box.getAttribute(STASHED_TITLE));
        box.removeAttribute(STASHED_TITLE);
      }
      for (const host of box.querySelectorAll(`[${WITHIN}]`)) host.removeAttribute(WITHIN);
      resizes.unobserve(box);
    }

    function uncover(box) {
      eraseCover(box);
      covered.delete(box);
    }

    function shownHere(entry) {
      return cover.dismissedOn(dismissed, pageKey()).includes(entry);
    }

    // Whether the person said `entry` is not about GTA where `el` is: inside a reel found from
    // its video, for that reel only (reelShown); anywhere else, on this page's address.
    function shownFor(el, entry) {
      const player = playerHere();
      if (player && player.key === 'item') {
        const item = itemAround(el, player);
        if (item) return reelShownHas(item.querySelector(player.media), entry);
      }
      return shownHere(entry);
    }

    // Inside an item (a Short, a reel) a cover shows the stripes only: playersPass sets that
    // on every pass (quietInItems), in the same task, so no cover is seen with its note first.
    function coverFrom(el, entry) {
      if (!el.isConnected || coveredAncestor(el) || shownFor(el, entry)) return;
      const box = boxFor(el);
      if (!box || box.hasAttribute(COVER)) return;
      drawCover(box, entry);
      covered.set(box, entry);
    }

    function scan(start, options) {
      for (const [el, entry] of matchesIn(collect(start, options))) coverFrom(el, entry);
    }

    // A covered box whose content changed is chosen again from scratch: it may not be about GTA
    // any more (a reused tile), or a smaller card inside it may now be the one to cover.
    function recheck(box) {
      uncover(box);
      if (!box.isConnected) return;
      scan(box);
      // Read again: what is in it now was decided. Whatever no cover holds after this may
      // play, if the page asked (releaseMedia).
      for (const el of mediaIn(box)) decided.add(el);
    }

    // ---- what plays under a cover (lib/media.js decides) ----

    const held = new Map(); // a video or sound -> its lib/media.js state, while a cover holds it
    // Media whose item was just read again and found not about GTA (recheck, a player decided,
    // the whole-page cover closed on the page's own title). Only these may play when freed:
    // any other hold that ends (the video moved, its box went, the page moved on) is "lost",
    // and a GTA video the site moved out of its card played with its sound otherwise (design
    // review, round 2).
    const decided = new Set();

    function isMedia(el) {
      return Boolean(el) && el.nodeType === 1 && (el.localName === 'video' || el.localName === 'audio')
        && typeof el.pause === 'function';
    }

    // Every video and sound under `start`, inside shadow trees too: a player component keeps
    // its video in one, and querySelectorAll does not go in (review, 2026-11-19).
    function mediaIn(start, found = [], depth = 0) {
      const walker = doc.createTreeWalker(start, 0x1);
      for (let el = walker.currentNode; el; el = walker.nextNode()) {
        if (el.nodeType !== 1) continue;
        if (isMedia(el)) found.push(el);
        const shadow = shadowOf(el);
        if (shadow && depth < MAX_SHADOW_DEPTH) {
          listenShadow(shadow);
          mediaIn(shadow, found, depth + 1);
        }
      }
      return found;
    }

    // See SHADOW_EVENTS: once per shadow tree, whatever the run.
    function listenShadow(shadow) {
      if (listenedShadows.has(shadow)) return;
      listenedShadows.add(shadow);
      for (const type of SHADOW_EVENTS) shadow.addEventListener(type, onShadowEvent, { capture: true });
    }

    function heldByCover(el) {
      return pageCover !== null || coveredAncestor(el) !== null;
    }

    function mediaStep(el, event) {
      const r = mediaRule.step(held.get(el) || null, event);
      if (r.state) {
        held.set(el, r.state);
        const value = String(r.state.mutedBefore);
        if (el.getAttribute(MUTED) !== value) el.setAttribute(MUTED, value);
      } else if (held.delete(el)) {
        el.removeAttribute(MUTED);
      }
      try {
        if (r.muted !== null) el.muted = r.muted;
        if (r.pause) el.pause();
        if (r.play) el.play().catch(() => {});
      } catch {
        // A media element that refuses: nothing more to do from here.
      }
    }

    function holdMedia(start) {
      for (const el of mediaIn(start)) mediaStep(el, { type: 'cover', playing: !el.paused, muted: el.muted });
    }

    // Every video the add-on holds that no cover holds any more, wherever it is now (the site
    // may have moved it out of the covered box: review, 2026-11-19), gets its own sound setting
    // back. Why its hold ended decides whether the page's play goes through: 'content' for one
    // whose item was just decided not about GTA; otherwise `by`, the caller's reason: 'person'
    // (Show anyway, Not about GTA, the switch) or 'lost' (moved, its box gone, the page moved
    // on). Neither plays. A person's "Not about GTA" also spends the wish first ('stay'), so a
    // player it shows is never started either.
    function releaseMedia(by) {
      for (const el of [...held.keys()]) {
        if (el.isConnected && heldByCover(el)) continue;
        const reason = decided.has(el) ? 'content' : by;
        mediaStep(el, { type: 'free', by: reason, connected: el.isConnected, paused: el.paused });
      }
      decided.clear();
    }

    // ---- a site's player (sites.js: a YouTube Short, an Instagram reel) ----

    // Each player, by what stays the same while the page changes around it: a named item (a
    // Short) by its element, a reel found from its video by its video. A reel's block is worked
    // out again on every pass and changes as the page does (alone, it reaches up to the list;
    // with a second reel, it is its row): kept by its block, the reel lost its cover for a
    // moment each time (design, security and correctness review, 2026-11-19).
    // id -> { item, box: its player box, rule: its sites.playerStep state }.
    const players = new Map();
    const playerCovers = new Map(); // a player box -> its entry, or null while it is checked
    let wakeTimer = null;
    const restarts = new Set(); // players whose video just got a new source (pageSource)
    // The words the person said are not about GTA for one reel found from its video (its video
    // -> entries): on Instagram's Reels page every reel shares the page, and the address names
    // the one being watched, so a word kept per address showed every reel with it, and the next
    // one played when scrolled to (security and correctness review, 2026-11-19). Kept over a
    // restart of the add-on, like `dismissed`.
    const reelShown = given && given.reelShown instanceof WeakMap ? given.reelShown : new WeakMap();
    function reelShownHas(video, entry) {
      const words = video ? reelShown.get(video) : undefined;
      return words !== undefined && words.has(entry);
    }

    // The site's player on this page, or null: asked each time, since a site moves between its
    // pages in place (Instagram from a reel to Explore).
    function playerHere() {
      return site.playerAt(win.location.pathname);
    }

    // The site player's item that holds `el` (or is it), or null. Named items by their selector;
    // items found from their video (Instagram) by the video in the first box around `el` that
    // holds one: that video's item, if it holds `el`.
    function itemAround(el, player) {
      if (player.kind === 'named') {
        for (let e = el; e; e = parentOf(e)) if (e.matches(player.scope)) return e;
        return null;
      }
      for (let e = el; e; e = parentOf(e)) {
        if (e.matches(player.stopAt)) return null;
        const media = e.matches(player.media) ? [e] : e.querySelectorAll(player.media);
        if (media.length > 1) return null;
        if (media.length === 1) {
          const item = itemOfMedia(media[0], player);
          return item && item.contains(el) ? item : null;
        }
      }
      return null;
    }

    // A video's item (sites.itemLevel decides from what is measured here), or null. Worked out
    // once per pass (`items`, reset with `displays`): boxFor, shownFor and the pass all ask.
    let items = new Map();
    function itemOfMedia(el, player) {
      if (items.has(el)) return items.get(el);
      const boxes = [];
      const levels = [];
      for (let e = parentOf(el); e && !e.matches(player.stopAt); e = parentOf(e)) {
        const videos = e.querySelectorAll(player.media).length;
        const posts = new Set();
        for (const a of e.querySelectorAll(player.postLinks)) posts.add(sites.postOf(a.getAttribute('href')));
        posts.delete(null);
        boxes.push(e);
        levels.push({ videos, posts: posts.size });
        if (!sites.fitsItem(levels[levels.length - 1])) break; // nothing above can be the item
      }
      const at = sites.itemLevel(levels);
      const item = at === -1 ? null : boxes[at];
      items.set(el, item);
      return item;
    }

    // The players on the page now: [{ id, item }].
    function playersNowOn(player) {
      if (player.kind === 'named') return [...doc.querySelectorAll(player.scope)].map((el) => ({ id: el, item: el }));
      const found = [];
      for (const el of doc.querySelectorAll(player.media)) {
        const item = itemOfMedia(el, player);
        if (item) found.push({ id: el, item });
      }
      return found;
    }

    // Whether a box holds words a person reads: text outside what the page never draws (SKIP:
    // the SVG <title> of Instagram's icons, "Audio is muted", is one).
    function hasWords(box) {
      const walker = doc.createTreeWalker(box, 0x4);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        if (t.data.trim() === '') continue;
        const parent = t.parentElement;
        if (parent && SKIP.has(parent.localName)) continue;
        return true;
      }
      return false;
    }

    // The box the player's cover goes on. Named: the player's box, or the first box from it up
    // to the item that can carry a cover: the same check as any cover (review: a box drawn with
    // both its pseudo-elements, or none at all, would carry an invisible one). Found from its
    // video: sites.boxLevel decides from what is measured here, and with no box it can take,
    // the item itself (a cover too big beats a GTA video playing). A box that carries the
    // player's cover already keeps it: its pseudo-elements are then the cover's own, and the
    // check would climb one box higher on every pass (found by the Shorts journey, 2026-11-19).
    function playerBox(item, id, player) {
      const carries = (e) => playerCovers.has(e) || cover.canCarry(describe(e));
      if (player.kind === 'named') {
        for (let e = item.querySelector(player.box); e; e = parentOf(e)) {
          if (carries(e)) return e;
          if (e === item) break;
        }
        return null;
      }
      const boxes = [];
      const levels = [];
      let words = false; // once a box holds words, every box around it does
      for (let e = id; e && e !== item; e = parentOf(e)) {
        if (!words && e !== id) words = hasWords(e);
        boxes.push(e);
        levels.push({ words, carries: carries(e) });
      }
      const at = sites.boxLevel(levels);
      if (at !== -1) return boxes[at];
      return carries(item) ? item : null;
    }

    // An item's caption, read whole (its covered GTA line too): the first word it matches that
    // the person has not said is not about GTA (on this address; for a reel found from its
    // video, on that reel), and the text that tells a new item apart. Named: its title. The rows
    // change apart, and a channel line that came first made the last Short's title look new
    // (ChatGPT review, round 2). No caption reads as nothing, which never decides (design
    // review, round 2: the whole item's text changed with its buttons). Found from its video:
    // the whole item is its caption, the comments too (the user's choice: no reliable way to
    // tell them apart), and what tells it apart is its words outside the player box: the
    // video's controls carry a label ("Press to play" on the user's saved page) that may change
    // as it plays.
    function captionOf(item, id, player, box) {
      const named = player.kind === 'named';
      const captionEl = named ? item.querySelector(player.caption) : item;
      if (!captionEl) return { text: '', entry: null };
      const titleEl = named ? captionEl.querySelector(player.title) : null;
      const out = collect(captionEl, { all: true });
      const lines = [];
      const outside = [];
      // Only a box with no words of its own (the usual one: the video, its controls' labels and
      // the faint copy) is left out. A box that took words with it (no smaller one could carry
      // the cover) can hold them all: read only outside it, a GTA reel stayed "Checking" for
      // good and a clean one never played (security and correctness review, round 2).
      const own = !named && hasWords(box);
      const inBox = (el) => !own && box.contains(el);
      for (const [block, pieces] of out.blocks) {
        for (const line of pieces) {
          lines.push(line.join(''));
          if (!inBox(block)) outside.push(line.join(''));
        }
      }
      for (const [el, value] of out.attrs) {
        lines.push(value);
        if (!inBox(el)) outside.push(value);
      }
      const shown = player.key === 'item' ? (e) => reelShownHas(id, e) : shownHere;
      let entry = null;
      for (const line of lines) {
        const found = matcher.find(line);
        if (found && !shown(found)) {
          entry = found;
          break;
        }
      }
      const words = named ? (titleEl || captionEl).textContent : outside.join(' ');
      return { text: words.replace(/\s+/g, ' ').trim(), entry };
    }

    function showPlayer(box, rule) {
      if (covered.has(box)) return; // a cover of its own already (a match inside the player)
      if (rule.shows === 'none') {
        if (!playerCovers.has(box)) return;
        dropPlayer(box);
        for (const el of mediaIn(box)) decided.add(el);
        // What came into the player while it was covered was never read (design review, round
        // 2): read it now, as a recheck does.
        scan(box);
        return;
      }
      const entry = rule.shows === 'gta' ? rule.entry : null;
      // Drawn already, unless the page lost it: the clean-up of an old copy's leftovers, when
      // the page has loaded, also takes this copy's own covers drawn while it loaded, and the
      // map said "covered" (a Short then played: ChatGPT, correctness and test review, round 2).
      if (playerCovers.has(box) && playerCovers.get(box) === entry && box.hasAttribute(COVER)) return;
      drawCover(box, entry);
      playerCovers.set(box, entry);
    }

    function dropPlayer(box) {
      if (!playerCovers.has(box)) return;
      eraseCover(box);
      playerCovers.delete(box);
    }

    // A cover inside an item (a Short, a reel) shows the stripes only: the item's player cover
    // carries the note. Set on every pass, so a cover drawn before its item could be found gets
    // them too (live, Instagram put the captions in 46 ms before their videos, and three caption
    // lines kept the full note under their covered reels, 2026-11-19). A player's own box is
    // never among them, so it keeps its note: a line's cover never goes on a box that carries
    // one (coverFrom), and a player box is only ever one that can carry a cover (playerBox),
    // which a covered box cannot (both its pseudo-elements are the cover's). A check for it here
    // never fired (mutation pass, I28). Never taken off: a cover outliving its item was not seen
    // (the covers inside go with it), and no stand-in could show one.
    function quietInItems() {
      const inItems = new Set([...players.values()].map((p) => p.item));
      for (const el of covered.keys()) {
        if (!el.hasAttribute(QUIET) && insideAny(el, inItems)) el.setAttribute(QUIET, '');
      }
    }

    // Each player decided by sites.playerStep: on every flush, on a new video source (the next
    // Short starts before its caption comes, so it is decided before a moment of it is heard:
    // pageSource), and when the wait for a caption that has not changed is over.
    function playersPass() {
      const player = playerHere();
      if (!player) {
        if (players.size === 0) return;
        // The site moved on in place (Instagram from a reel to Explore): a reel still on the
        // page keeps its cover until it is read as not about GTA (the user, 2026-11-19: the
        // cover stays until it is confirmed). Let go: one that is gone, one with no cover (kept
        // as a reel, a GTA comment under it got stripes with no note: correctness review,
        // round 2), and one whose word the person has now said is not about GTA here ("Not
        // about GTA" could not show it: design and correctness review, round 2).
        for (const [id, had] of [...players]) {
          const entry = playerCovers.get(had.box);
          const shown = entry !== undefined && entry !== null && shownHere(entry);
          if (id.isConnected && had.box.isConnected && playerCovers.has(had.box) && !shown) continue;
          players.delete(id);
          dropPlayer(had.box);
        }
        quietInItems();
        return;
      }
      // A reel has its own block, so a new address is not a new reel (sites.js: key).
      const key = player.key === 'item' ? 'item' : pageKey();
      const time = win.performance.now();
      let wake = Infinity;
      const seen = new Set();
      const inUse = new Set(); // player boxes in use after this pass: never dropped
      const old = []; // boxes a player had and may have let go
      for (const { id, item } of playersNowOn(player)) {
        seen.add(id);
        const had = players.get(id);
        const box = playerBox(item, id, player);
        // The site put in another player box: the old one is let go, the player keeps its state.
        if (had && had.box !== box) old.push(had.box);
        if (!box) {
          players.delete(id);
          continue;
        }
        inUse.add(box);
        const restart = restarts.has(id);
        // A new source is a new reel: the person's word was for the one before (it let the GTA
        // reel that came in play with its sound: design, security and correctness review, round 2).
        if (restart && player.key === 'item') reelShown.delete(id);
        const { text, entry } = captionOf(item, id, player, box);
        const r = sites.playerStep(had ? had.rule : null, { key, caption: text, entry, now: time, restart });
        players.set(id, { item, box, rule: r.state });
        showPlayer(box, r.state);
        // A reel's lines read before its video came were no reel's: the person's word for the
        // reel being watched (kept for its address too) left a GTA caption uncovered for good
        // (security review, round 2). Read its block once more now that it is one.
        if (!had && player.key === 'item') scan(item);
        if (r.wakeAt !== null) wake = Math.min(wake, r.wakeAt);
      }
      restarts.clear();
      for (const [id, had] of [...players]) {
        if (seen.has(id)) continue;
        players.delete(id);
        old.push(had.box);
      }
      for (const box of old) if (!inUse.has(box)) dropPlayer(box);
      quietInItems();
      if (wakeTimer !== null) win.clearTimeout(wakeTimer);
      wakeTimer = wake === Infinity ? null : win.setTimeout(() => {
        wakeTimer = null;
        schedule();
      }, Math.max(0, wake - time) + 20);
    }

    // The reel being watched, among those found from their video: the one whose player box
    // shows the largest area in the window (by area, not by the share of the box shown: on
    // Instagram the boxes are the same size). Null when none shows.
    function watchedReel() {
      let best = null;
      let most = 0;
      for (const [id, p] of players) {
        const r = p.box.getBoundingClientRect();
        const w = Math.min(r.right, win.innerWidth) - Math.max(r.left, 0);
        const h = Math.min(r.bottom, win.innerHeight) - Math.max(r.top, 0);
        if (w > 0 && h > 0 && w * h > most) {
          most = w * h;
          best = id;
        }
      }
      return best;
    }

    // A box that changes size gets the cover size that fits it. (sizeFor takes { w, h }: a
    // browser's DOMRect has width and height, and passing it as is made every cover "m".)
    const resizes = new win.ResizeObserver((entries) => {
      for (const { target } of entries) {
        if (!target.hasAttribute(COVER)) continue;
        const rect = target.getBoundingClientRect();
        target.setAttribute(SIZE, cover.sizeFor({ w: rect.width, h: rect.height }));
      }
      observer.takeRecords(); // our own writes
    });

    // ---- following the page ----

    function flush() {
      scheduled = false;
      if (stopped) return;
      displays = new Map();
      items = new Map();
      visibles = new Map();
      const records = queue.splice(0);
      const rechecks = new Set();
      const scans = new Set();
      const lines = new Set();
      const attrs = new Set();
      let maybeShown = false;
      const note = (set, el) => {
        if (!el || !el.isConnected || SKIP.has(el.localName) || isOurs(el)) return;
        const box = coveredAncestor(el);
        // A change inside a site player's cover is left to playersPass, which reads the caption.
        if (box) {
          if (!playerCovers.has(box)) rechecks.add(box);
        } else set.add(el);
      };
      for (const r of records) {
        // A change inside a shadow tree names the shadow root itself: its host stands for it.
        const target = elementOf(r.target);
        if (!target) continue;
        if (r.type === 'childList') {
          for (const n of r.addedNodes) {
            if (n.nodeType === 1) {
              note(scans, n);
              if (n.isConnected && INLINE.has(displayOf(n))) note(lines, blockOf(target));
            } else if (n.nodeType === 3) {
              note(lines, blockOf(target));
            }
          }
          // A removal can join the two pieces either side of it into one line.
          if (r.removedNodes.length > 0) note(lines, blockOf(target));
        } else if (r.type === 'characterData') {
          note(lines, blockOf(target));
        } else if (r.type === 'attributes') {
          if (SHOW_ATTRS.includes(r.attributeName)) maybeShown = true;
          else note(attrs, r.target);
        }
      }
      for (const box of covered.keys()) if (!box.isConnected) uncover(box);
      for (const box of rechecks) recheck(box);
      // Read each part once: drop a part that sits inside another one being read in full.
      for (const el of outermost(scans)) scan(el);
      for (const el of lines) if (!insideAny(el, scans)) scan(el, { own: true });
      for (const el of attrs) {
        if (insideAny(el, scans)) continue;
        const out = { blocks: new Map(), attrs: [], last: null };
        for (const name of TEXT_ATTRS) {
          const value = el.getAttribute(name);
          if (value) out.attrs.push([el, value]);
        }
        for (const [match, entry] of matchesIn(out)) coverFrom(match, entry);
      }
      if (maybeShown) {
        for (const el of [...hiddenMatches.keys()]) {
          if (!el.isConnected) hiddenMatches.delete(el);
          else if (isShown(el)) {
            // Read again: what it says may have changed while it was hidden.
            hiddenMatches.delete(el);
            if (!coveredAncestor(el)) scan(el);
          }
        }
      }
      playersPass();
      checkTitle();
      releaseMedia('lost');
      observer.takeRecords(); // everything still queued now was written by us
      tell();
    }

    // { entry: covers } for this page, the whole-page cover and players covered as about GTA
    // included (one being checked is not a find); told only when it changed.
    function counts() {
      const all = [...covered.values()];
      for (const entry of playerCovers.values()) if (entry !== null) all.push(entry);
      if (pageCover) all.push(pageCover.entry);
      return cover.countEntries(all);
    }
    function tell() {
      const now = counts();
      const text = JSON.stringify(now);
      if (text === lastCounts) return;
      lastCounts = text;
      onCovers(now);
    }

    function insideAny(el, set) {
      for (let up = parentOf(el); up; up = parentOf(up)) if (set.has(up)) return true;
      return false;
    }

    function outermost(set) {
      return [...set].filter((el) => !insideAny(el, set));
    }

    function schedule() {
      if (!scheduled && !stopped) {
        scheduled = true;
        win.setTimeout(flush, 30);
      }
    }

    const observer = new win.MutationObserver((records) => {
      queue.push(...records);
      schedule();
    });

    function watch(target) {
      observer.observe(target, {
        childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: [...TEXT_ATTRS.filter((a) => a !== STASHED_TITLE), ...SHOW_ATTRS],
      });
    }

    function guard(event) {
      for (const node of event.composedPath()) {
        if (node.nodeType === 1 && node.hasAttribute(COVER)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
      }
    }

    // ---- the whole-page cover ----

    let pageCover = null; // { host, dialog, button } while the page is covered
    // What cover.pageStep decides from; see it in lib/cover.js.
    let pageState = given ? { cover: null, revealedAt: given.revealedAt ?? null, revealedBy: given.revealedBy ?? null, siteTitle: given.siteTitle ?? null,
      ...(given.shownTitle ? { shownTitle: given.shownTitle } : {}) }
      : { cover: null, revealedAt: null, siteTitle: null };
    // The element's name changes every run: a page could define an element of a known name
    // first and break the cover with it.
    const hostName = `${HOST_PREFIX}${Math.random().toString(36).slice(2, 10)}`;

    // The page's address without its #part: a link to a place on the same page is the same visit.
    function pageKey() {
      const url = new win.URL(win.location.href);
      url.hash = '';
      return url.href;
    }

    function setTitle(text) {
      if (doc.title !== text) doc.title = text;
    }

    function pin(host) {
      // Our element, so inline styles are ours to set: a page rule like "display: none" or
      // "visibility: hidden" on it must not hide the cover.
      for (const [name, value] of [['display', 'block'], ['visibility', 'visible'], ['content-visibility', 'visible'], ['opacity', '1']]) {
        host.style.setProperty(name, value, 'important');
      }
    }

    function buildPageCover(entry) {
      const host = doc.createElement(hostName);
      pin(host);
      const shadow = host.attachShadow({ mode: 'closed' });
      const style = doc.createElement('style');
      style.textContent = PAGE_COVER_CSS;
      // Inside a frame even a non-modal dialog takes the focus when it opens, pulling the
      // keyboard out of the page the person is typing in (found in review). There the cover is
      // a plain panel that fills the frame.
      const dialog = doc.createElement(isTop ? 'dialog' : 'div');
      if (!isTop) dialog.className = 'frame-cover';
      dialog.setAttribute('aria-labelledby', 'gta-title');
      const panel = doc.createElement('div');
      panel.className = 'panel';
      const title = doc.createElement('h1');
      title.id = 'gta-title';
      title.textContent = 'This page is about GTA';
      const word = doc.createElement('p');
      word.className = 'word';
      word.textContent = `(matched: ${label(entry)})`;
      const button = doc.createElement('button');
      button.type = 'button';
      button.textContent = 'Show anyway';
      const once = doc.createElement('p');
      once.className = 'once';
      once.textContent = 'Only for this visit.';
      panel.append(title, word, button, once);
      dialog.append(panel);
      shadow.append(style, dialog);
      // The person's only way out is the button: Escape must not uncover the page.
      if (isTop) {
        dialog.addEventListener('cancel', (e) => e.preventDefault());
        dialog.addEventListener('close', () => {
          if (pageCover && pageCover.dialog === dialog) showDialog(pageCover);
        });
      }
      button.addEventListener('click', () => {
        pageState = cover.showAnyway(pageState, pageKey(), 'button');
        closePageCover();
        releaseMedia('person');
        tell();
      });
      return { host, dialog, button, entry };
    }

    // In the top page the cover is a modal window: focus stays in it and the page behind is
    // inert. Inside a frame it is drawn the same but never takes the focus: a frame must not
    // pull the keyboard out of the page the person is typing in (found in review).
    function showDialog(pc) {
      if (!isTop || pc.dialog.open) return;
      pc.dialog.showModal();
      pc.button.focus();
    }

    function openPageCover(entry) {
      pageCover = buildPageCover(entry);
      // The site's own title, kept on our element: if this copy of the add-on is removed, the
      // next copy finds it there and gives it back to the tab (see cleanLeftovers).
      if (pageState.siteTitle) pageCover.host.setAttribute(LEFT_TITLE, pageState.siteTitle);
      doc.documentElement.appendChild(pageCover.host);
      showDialog(pageCover);
      setTitle(cover.HIDDEN_TITLE);
      // Everything that plays is held, paused and muted, the same rule as under any cover.
      holdMedia(doc.documentElement);
    }

    function closePageCover() {
      const pc = pageCover;
      pageCover = null;
      if (isTop) pc.dialog.close();
      pc.host.remove();
      if (cover.isOurTitle(doc.title)) setTitle(pageState.siteTitle);
    }

    // What to do is decided by cover.pageStep (the rules and their reasons are there); this only
    // carries it out.
    function checkTitle() {
      if (!doc.documentElement) return;
      const allowed = site.allowsPageCover(win.location.pathname);
      const { state, act, entry } = cover.pageStep(pageState, { key: pageKey(), title: doc.title, matcher, allowed });
      // A page the person said is not about GTA for this word counts as shown anyway.
      if (act === 'open' && shownHere(entry)) {
        pageState = cover.showAnyway(state, pageKey(), entry);
        return;
      }
      pageState = state;
      if (act === 'open') openPageCover(entry);
      // What the whole-page cover held is never started when it closes: the new title says
      // nothing about those videos (Back from a covered GTA video to Home started its hidden
      // trailer with its sound: security review, round 2). They get their sound back, paused.
      else if (act === 'close') closePageCover();
      else if (act === 'keep') {
        setTitle(cover.HIDDEN_TITLE);
        // A page that removes the cover gets it back. A dialog taken out of the page keeps its
        // open flag but leaves the top layer, so it is closed first and opened as a modal again.
        if (!pageCover.host.isConnected) {
          if (isTop && pageCover.dialog.open) pageCover.dialog.close();
          doc.documentElement.appendChild(pageCover.host);
          showDialog(pageCover);
        }
      }
    }

    function pageKeys(event) {
      if (!pageCover) return;
      // The focus is usually on our button, so most keys are aimed at our element; the page
      // would still hear them on their way down (it heard "k" and space in review).
      event.stopImmediatePropagation();
      if (!event.composedPath().includes(pageCover.host)) event.preventDefault();
    }

    // The page started a video or a sound. Only a real one counts: a page that sends a made-up
    // "play" could have the add-on press play for it later (ChatGPT and Gemini review). A play
    // does not decide a site player itself: YouTube's new video sends "emptied" before it (live,
    // 2026-11-19), and pageSource decides then; a second pass here was never needed (the
    // mutation pass could not tell it was there).
    function pageMedia(event) {
      if (stopped || !event.isTrusted) return;
      const el = event.composedPath()[0];
      if (!isMedia(el)) return;
      // A reel's video no pass has read yet (a new video's first source sends no "emptied"):
      // read now, before it starts; it played uncovered until the next flush, up to ~30 ms
      // (security and correctness review, round 2).
      const player = playerHere();
      if (player && player.kind === 'found' && !players.has(el)) playersNow();
      mediaStep(el, { type: 'play', covered: heldByCover(el), muted: el.muted });
      tell();
    }

    // YouTube puts its own sound setting back on the video while it loads the next Short, under
    // the cover too (live, 2026-11-19; Gemini review, round 2): a held video is muted again at
    // once. A page that keeps turning it back on is let be after five tries in a second (it
    // stays paused, and a play is paused and muted at once).
    const remutes = new WeakMap(); // a video -> { at, n }: the tries this second
    function pageVolume(event) {
      if (stopped || !event.isTrusted) return;
      const el = event.composedPath()[0];
      if (!isMedia(el) || !held.has(el) || el.muted || !heldByCover(el)) return;
      const time = win.performance.now();
      const last = remutes.get(el);
      const fresh = !last || time - last.at >= 1000;
      const tries = fresh ? { at: time, n: 1 } : { at: last.at, n: last.n + 1 };
      remutes.set(el, tries);
      if (tries.n > 5) return;
      try {
        el.muted = true;
      } catch {
        // A media element that refuses: it stays paused.
      }
    }

    // A video got a new source in place of one it had ("emptied"; its first source is not a new
    // item, and held a Short under "Checking" for 4 s: design and correctness review, round 2).
    // Inside a site player's item that is the next item put into the same element: on YouTube
    // the next Short, and the first sign of it (live, 16 to 245 ms before the address changes,
    // 2026-11-19); on Instagram, where each reel has its own block, another reel's video in
    // one (not seen live). Either way the item is checked again from here.
    function pageSource(event) {
      if (stopped || !event.isTrusted) return;
      const player = playerHere();
      const el = event.composedPath()[0];
      if (!player || !isMedia(el)) return;
      // The player it belongs to: a reel found from its video is that video.
      let id = null;
      if (player.kind === 'found') id = players.has(el) || itemOfMedia(el, player) !== null ? el : null;
      else id = parentOf(el) ? itemAround(parentOf(el), player) : null;
      if (!id) return;
      restarts.add(id);
      playersNow();
      tell();
    }

    // The players decided at once, from a new video source, before a moment of a new Short is
    // heard (a flush is up to 30 ms away). The page's own changes still waiting are kept for the
    // next flush; what this writes is ours.
    function playersNow() {
      if (!playerHere()) return;
      queue.push(...observer.takeRecords());
      displays = new Map();
      items = new Map();
      visibles = new Map();
      playersPass();
      observer.takeRecords();
      schedule();
    }

    // ---- start ----

    // What an earlier copy of the add-on left on this page (removed, reloaded or updated: its
    // code stops at once and cleans nothing, checked 2026-11-18): its whole-page cover, with a
    // button that no longer works, the tab title, and its cover attributes. The next copy, this
    // one, runs in the open tab, and clears them before it looks (the user's choice).
    function cleanLeftovers() {
      for (const el of [...doc.documentElement.children]) {
        if (!el.localName.startsWith(HOST_PREFIX)) continue;
        if (cover.isOurTitle(doc.title) && el.hasAttribute(LEFT_TITLE)) setTitle(el.getAttribute(LEFT_TITLE));
        el.remove();
      }
      for (const box of doc.querySelectorAll(`[${COVER}], [${WITHIN}], [${STASHED_TITLE}]`)) {
        for (const name of [COVER, WORD, SIZE, ANCHOR, LAYERS, WITHIN, CHECKING, QUIET]) box.removeAttribute(name);
        if (box.hasAttribute(STASHED_TITLE)) {
          box.setAttribute('title', box.getAttribute(STASHED_TITLE));
          box.removeAttribute(STASHED_TITLE);
        }
      }
      // A video it held keeps its own sound setting, not that copy's mute (it stays paused).
      for (const el of mediaIn(doc.documentElement)) {
        if (!el.hasAttribute(MUTED)) continue;
        el.muted = el.getAttribute(MUTED) === 'true';
        el.removeAttribute(MUTED);
      }
    }

    for (const type of GUARDED) win.addEventListener(type, guard, { capture: true });
    for (const type of PAGE_KEYS) win.addEventListener(type, pageKeys, { capture: true });
    win.addEventListener('play', pageMedia, { capture: true });
    win.addEventListener('volumechange', pageVolume, { capture: true });
    for (const type of SOURCE_EVENTS) win.addEventListener(type, pageSource, { capture: true });
    const run = (event) => {
      if (event.type === 'play') pageMedia(event);
      else if (event.type === 'volumechange') pageVolume(event);
      else pageSource(event);
    };
    activeRun = run;
    watch(doc);
    function look() {
      displays = new Map();
      items = new Map();
      visibles = new Map();
      scan(doc.documentElement);
      playersPass();
      checkTitle();
      releaseMedia('lost');
      observer.takeRecords();
      tell();
    }
    const first = () => {
      if (stopped) return;
      cleanLeftovers();
      observer.takeRecords();
      flush();
      look();
      onReady();
    };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', first, { once: true });
    else first();

    const kept = () => ({ ...pageState, cover: null, dismissed, reelShown });

    return {
      stop() {
        if (stopped) return kept();
        stopped = true;
        observer.disconnect();
        resizes.disconnect();
        queue.length = 0;
        for (const type of GUARDED) win.removeEventListener(type, guard, { capture: true });
        for (const type of PAGE_KEYS) win.removeEventListener(type, pageKeys, { capture: true });
        win.removeEventListener('play', pageMedia, { capture: true });
        win.removeEventListener('volumechange', pageVolume, { capture: true });
        for (const type of SOURCE_EVENTS) win.removeEventListener(type, pageSource, { capture: true });
        if (activeRun === run) activeRun = null;
        doc.removeEventListener('DOMContentLoaded', first, { once: true });
        if (wakeTimer !== null) win.clearTimeout(wakeTimer);
        for (const box of [...covered.keys()]) uncover(box);
        for (const box of [...playerCovers.keys()]) dropPlayer(box);
        players.clear();
        hiddenMatches.clear();
        if (pageCover) closePageCover();
        // The person turned it off: every video gets its sound back and stays paused.
        releaseMedia('person');
        onCovers({});
        return kept();
      },
      show(entry) {
        if (stopped) return;
        const key = pageKey();
        dismissed = cover.dismiss(dismissed, key, entry);
        displays = new Map();
        items = new Map();
        visibles = new Map();
        // On a page of reels found from their video, the word counts for the reel being watched
        // only (reelShown): the covers inside the other reels, and their players, stay.
        const player = playerHere();
        const found = player !== null && player.key === 'item';
        const watched = found ? watchedReel() : null;
        if (watched) {
          const words = reelShown.get(watched) || new Set();
          words.add(entry);
          reelShown.set(watched, words);
        }
        const watchedItem = watched ? players.get(watched).item : null;
        const shows = (box) => {
          if (!found) return true;
          const item = itemAround(box, player);
          return item === null || item === watchedItem;
        };
        // The person's word counts from now: what this word's covers hold, and a player being
        // checked, never starts by itself later, even when its cover goes because the caption
        // came (ChatGPT review, round 2: pressed during the check, the Short then played).
        const theirs = [...covered].filter(([box, e]) => e === entry && shows(box)).map(([box]) => box);
        for (const [id, p] of players) {
          if (!playerCovers.has(p.box) || (found && id !== watched)) continue;
          const e = playerCovers.get(p.box);
          if (e === null || e === entry) theirs.push(p.box);
        }
        for (const box of theirs) for (const el of mediaIn(box)) mediaStep(el, { type: 'stay' });
        for (const [box, e] of [...covered]) if (e === entry && shows(box)) uncover(box);
        playersPass(); // a Short or reel covered for this word is shown: it now counts as shown there
        if (pageCover && pageCover.entry === entry) {
          pageState = cover.showAnyway(pageState, key, entry);
          closePageCover();
        }
        releaseMedia('person');
        observer.takeRecords();
        tell();
      },
      cover(entry) {
        if (stopped) return;
        const key = pageKey();
        dismissed = cover.undismiss(dismissed, key, entry);
        // On a page of reels: for the reel being watched, as "Not about GTA" was.
        const player = playerHere();
        const watched = player && player.key === 'item' ? watchedReel() : null;
        if (watched && reelShown.has(watched)) reelShown.get(watched).delete(entry);
        // Undo lifts a Show anyway only if this word caused it, never the person's own button.
        pageState = cover.undoShow(pageState, key, entry);
        look();
      },
      retell() {
        if (stopped) return;
        lastCounts = '';
        tell();
      },
    };
  }

  // The whole-page cover's look, agreed in the preview (docs/design/cover-preview.html): a panel,
  // night blue, a gold "Show anyway" button 44 px tall, on a SOLID backdrop. The preview's
  // blurred page was the first pick, but headless Firefox drew no blur (checked 2026-11-18) and
  // the page's text then showed through; the user chose solid. Deep night blue, never pure
  // black. Inside a frame it is a plain panel (.frame-cover) that fills the frame.
  const PAGE_COVER_CSS = `
    :host { all: initial; }
    dialog { border: 0; padding: 0; background: transparent; max-width: none; max-height: none; }
    dialog::backdrop { background: #10141F; }
    .frame-cover { position: fixed; inset: 0; width: 100%; height: 100%; margin: 0;
      display: grid; place-items: center; background: #10141F; z-index: 2147483647; }
    .panel { box-sizing: border-box; width: min(420px, calc(100vw - 32px)); text-align: center;
      background: #1B2233; color: #E8ECF4; border: 1px solid #2E3A55; border-radius: 16px;
      padding: 28px 28px 24px; font: 15px/1.5 system-ui, sans-serif; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .word { color: #A9B3C7; margin: 0 0 20px; }
    .once { color: #A9B3C7; font-size: 13px; margin: 10px 0 0; }
    button { font: 600 15px system-ui, sans-serif; background: #E2B857; color: #1F1806; border: 0;
      border-radius: 10px; padding: 10px 20px; min-height: 44px; cursor: pointer; }
    button:hover { filter: brightness(1.08); }
    button:focus-visible { outline: 3px solid #FFFFFF; outline-offset: 3px; }
  `;

  ns.page = Object.freeze({ start });
})(globalThis);
