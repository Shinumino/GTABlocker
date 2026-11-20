// What the toolbar menu shows, decided from { settings, url, covers, done, version }: the
// settings, the page's address, the page's covers by word (from the background, through
// keep()), what the person did in this menu ({ entry: 'shown' | 'removed' }), and the add-on's
// version. Plain logic, so the rules are
// tested apart from drawing them (tests/micro/menu-view.test.mjs); the look and the words were
// agreed in docs/design/menu-preview.html (2026-11-18).
(function (root) {
  'use strict';
  const ns = Object.hasOwn(root, 'GtaBlocker') ? root.GtaBlocker : (root.GtaBlocker = {});
  const S = ns.settings;

  // Firefox's own pages and the add-on's pages: no content script runs there.
  const FIREFOX_PAGE = /^(about|moz-extension|view-source|chrome|resource):/i;

  // version: the add-on's own, from its manifest, shown small in a corner of the menu (the
  // user's request, 2026-11-19); anything but text leaves the corner empty.
  function view({ settings, url, covers, done, version }) {
    const site = S.siteKey(url);
    const state = S.coverState(settings, site);
    const out = { site, rows: [], state: null, note: null, count: null, groups: [], hint: false, miss: false };
    out.version = typeof version === 'string' && version.trim() ? version.trim() : null;

    // While Everywhere is off the site row is hidden: a switch that does nothing is a dead
    // control above the one that matters (design review, 2026-11-18).
    if (state.siteSwitch && settings.everywhere) out.rows.push({ kind: 'site', on: state.on, label: 'On this site', sub: site });
    out.rows.push({ kind: 'all', on: settings.everywhere, label: 'Everywhere', sub: 'Every site you visit' });

    if (!settings.everywhere) {
      out.state = 'Off everywhere. Nothing is covered on any site until you turn it back on.';
      return out;
    }
    if (typeof url !== 'string' || FIREFOX_PAGE.test(url)) {
      out.state = "Firefox's own pages are never covered.";
      return out;
    }
    if (!state.on) {
      out.state = `Off on ${site}. Nothing is covered here until you turn it back on.`;
      return out;
    }
    if (S.entries(settings).length === 0) {
      out.state = 'Your word list is empty, so nothing is covered. Add words in Settings.';
      return out;
    }
    // A local file is covered like any page; the menu says why it has no site switch.
    if (!state.siteSwitch) out.note = 'This page has no site address, so only Everywhere turns it off.';

    out.miss = true;
    let left = 0;
    for (const { entry, n } of covers) {
      const own = S.isOwn(settings, entry);
      const did = Object.hasOwn(done, entry) ? done[entry] : null;
      if (!did) left += n;
      // A cover from one of the person's own words: removing the word is the real fix, and a
      // report about their own word would help nobody (design review).
      out.groups.push({ entry, n, own, action: own ? 'remove' : 'notgta', done: did });
      if (!did && !own) out.hint = true;
    }
    if (covers.length === 0) out.count = 'Nothing covered on this page.';
    else out.count = left > 0 ? `${left} covered on this page` : 'Nothing covered on this page now';
    return out;
  }

  // The rows to show, from what the menu has seen so far ([[entry, n], ...], in the order first
  // seen) and the covers the background reports now. A word the person acted on leaves the
  // page's covers (that is the point), but its row must stay, in its place, with its Undo: the
  // row, and the focus on its Undo, once vanished on the next redraw (macro test, 2026-11-18).
  // Rows never reorder under the pointer.
  function keep(seen, covers, done) {
    const now = new Map(covers.map((c) => [c.entry, c.n]));
    const next = new Map(seen);
    for (const [entry, n] of now) next.set(entry, n);
    const rows = [...next].filter(([entry]) => now.has(entry) || Object.hasOwn(done, entry)).map(([entry, n]) => ({ entry, n }));
    return { seen: [...next], covers: rows };
  }

  ns.menuView = Object.freeze({ view, keep });
})(globalThis);
