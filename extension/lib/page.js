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
  // Inside a shadow tree the page's stylesheet does not apply; this one is added to every shadow
  // tree found, so a covered host's shadow content is hidden even where the component sets it
  // visible (found in review, 2026-11-18).
  const SHADOW_CSS = `:host([${COVER}]) *, :host([${WITHIN}]) * { visibility: hidden !important; }`;

  const sheeted = new WeakSet();
  let shadowSheet = null;

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
    const { cover } = ns;
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
    // left to recheck().
    function collect(start, { own = false } = {}, out = { blocks: new Map(), attrs: [], last: null }, depth = 0) {
      const filter = {
        acceptNode(node) {
          if (node.nodeType !== 1) return 1;
          if (SKIP.has(node.localName) || isOurs(node)) return 2;
          if (node.hasAttribute(COVER)) return 2;
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
            collect(shadow, { own }, out, depth + 1);
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
      const chain = [];
      for (let e = el; e && chain.length < MAX_CHAIN; e = parentOf(e)) chain.push(e);
      const view = { w: win.innerWidth, h: win.innerHeight };
      const index = cover.chooseBox(chain.map(describe), view);
      return index === -1 ? null : chain[index];
    }

    function apply(box, entry) {
      const d = describe(box);
      box.setAttribute(WORD, label(entry));
      box.setAttribute(SIZE, cover.sizeFor(d));
      box.setAttribute(LAYERS, cover.layersFor(d));
      if (cover.needsAnchor(d)) box.setAttribute(ANCHOR, '');
      if (box.hasAttribute('title')) {
        box.setAttribute(STASHED_TITLE, box.getAttribute('title'));
        box.removeAttribute('title');
      }
      // Shadow hosts inside the box: their shadow content is hidden by SHADOW_CSS.
      for (const host of box.querySelectorAll('*')) if (shadowOf(host)) host.setAttribute(WITHIN, '');
      box.setAttribute(COVER, '');
      if (!covered.has(box)) resizes.observe(box);
      covered.set(box, entry);
    }

    function uncover(box) {
      for (const name of [COVER, WORD, SIZE, ANCHOR, LAYERS]) box.removeAttribute(name);
      if (box.hasAttribute(STASHED_TITLE)) {
        box.setAttribute('title', box.getAttribute(STASHED_TITLE));
        box.removeAttribute(STASHED_TITLE);
      }
      for (const host of box.querySelectorAll(`[${WITHIN}]`)) host.removeAttribute(WITHIN);
      covered.delete(box);
      resizes.unobserve(box);
    }

    function shownHere(entry) {
      return cover.dismissedOn(dismissed, pageKey()).includes(entry);
    }

    function coverFrom(el, entry) {
      if (!el.isConnected || coveredAncestor(el) || shownHere(entry)) return;
      const box = boxFor(el);
      if (box) apply(box, entry);
    }

    function scan(start, options) {
      for (const [el, entry] of matchesIn(collect(start, options))) coverFrom(el, entry);
    }

    // A covered box whose content changed is chosen again from scratch: it may not be about GTA
    // any more (a reused tile), or a smaller card inside it may now be the one to cover.
    function recheck(box) {
      uncover(box);
      if (box.isConnected) scan(box);
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
        if (box) rechecks.add(box);
        else set.add(el);
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
      checkTitle();
      observer.takeRecords(); // everything still queued now was written by us
      tell();
    }

    // { entry: covers } for this page, the whole-page cover included; told only when it changed.
    function counts() {
      return cover.countEntries(pageCover ? [...covered.values(), pageCover.entry] : covered.values());
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
    let pageState = given ? { cover: null, revealedAt: given.revealedAt ?? null, revealedBy: given.revealedBy ?? null, siteTitle: given.siteTitle ?? null }
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

    function pauseMedia() {
      for (const media of doc.querySelectorAll('video, audio')) {
        try {
          media.pause();
        } catch {
          // A media element that will not pause: nothing more to do from here.
        }
      }
    }

    function openPageCover(entry) {
      pageCover = buildPageCover(entry);
      // The site's own title, kept on our element: if this copy of the add-on is removed, the
      // next copy finds it there and gives it back to the tab (see cleanLeftovers).
      if (pageState.siteTitle) pageCover.host.setAttribute(LEFT_TITLE, pageState.siteTitle);
      doc.documentElement.appendChild(pageCover.host);
      showDialog(pageCover);
      setTitle(cover.HIDDEN_TITLE);
      pauseMedia();
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
      const { state, act, entry } = cover.pageStep(pageState, { key: pageKey(), title: doc.title, matcher });
      // A page the person said is not about GTA for this word counts as shown anyway.
      if (act === 'open' && shownHere(entry)) {
        pageState = cover.showAnyway(state, pageKey(), entry);
        return;
      }
      pageState = state;
      if (act === 'open') openPageCover(entry);
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

    function pageMedia(event) {
      if (!pageCover) return;
      const media = event.composedPath()[0];
      if (media && typeof media.pause === 'function') media.pause();
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
        for (const name of [COVER, WORD, SIZE, ANCHOR, LAYERS, WITHIN]) box.removeAttribute(name);
        if (box.hasAttribute(STASHED_TITLE)) {
          box.setAttribute('title', box.getAttribute(STASHED_TITLE));
          box.removeAttribute(STASHED_TITLE);
        }
      }
    }

    for (const type of GUARDED) win.addEventListener(type, guard, { capture: true });
    for (const type of PAGE_KEYS) win.addEventListener(type, pageKeys, { capture: true });
    win.addEventListener('play', pageMedia, { capture: true });
    watch(doc);
    function look() {
      displays = new Map();
      visibles = new Map();
      scan(doc.documentElement);
      checkTitle();
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

    const kept = () => ({ ...pageState, cover: null, dismissed });

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
        doc.removeEventListener('DOMContentLoaded', first, { once: true });
        for (const box of [...covered.keys()]) uncover(box);
        hiddenMatches.clear();
        if (pageCover) closePageCover();
        onCovers({});
        return kept();
      },
      show(entry) {
        if (stopped) return;
        const key = pageKey();
        dismissed = cover.dismiss(dismissed, key, entry);
        for (const [box, e] of [...covered]) if (e === entry) uncover(box);
        if (pageCover && pageCover.entry === entry) {
          pageState = cover.showAnyway(pageState, key, entry);
          closePageCover();
        }
        observer.takeRecords();
        tell();
      },
      cover(entry) {
        if (stopped) return;
        const key = pageKey();
        dismissed = cover.undismiss(dismissed, key, entry);
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
