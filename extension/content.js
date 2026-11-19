// Runs in every page and frame the user opens, after lib/matcher.js, lib/cover.js,
// lib/media.js, lib/sites.js, lib/settings.js, lib/tabs.js and lib/page.js (the manifest
// lists them in that order, and scripts listed together share one global scope, where
// GtaBlocker lives). It reads the user's switch and words (never the reports), asks the
// background which site the tab is on, and covers when the switch says so, following every
// change live (the toolbar menu, the settings page), without a reload.
//
// Wrapped in a function so that nothing here lands in that shared scope: a top-level const
// would clash with the same name in a later file and stop it.
//
// The page is marked "ready" once the first look at it is done (or covering is off here). The
// marker is visible to the page's own scripts, so a site can tell the extension is there; that
// is accepted, and nothing about the user is in it: never the word list, never the switch.
(function () {
  'use strict';
  const { settings: S, tabs: T, page } = GtaBlocker;
  const root = document.documentElement;
  const mark = (value) => { if (root) root.setAttribute('data-gta-blocker', value); };
  // How long covering waits for the background's answer. A page can back up the background's
  // queue (security review, 2026-11-18): past this, the frame decides by its own address.
  const HELLO_WAIT_MS = 1000;

  let settings = null;
  let tabSite = null; // the site of the tab the person is on, as the background said it
  let run = null; // what page.start returned, while covering
  let running = null; // what it was started for: the word list, or 'off'
  let pageState = null; // Show anyway and the words shown again, kept from one start to the next

  // Covers by word, to the background (for the icon and the menu), at most every 200 ms.
  let pending = null;
  let timer = null;
  function send(counts) {
    pending = counts;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      browser.runtime.sendMessage({ type: 'covers', counts: pending }).catch(() => {});
    }, 200);
  }

  function update() {
    const on = S.coverState(settings, tabSite).on;
    const list = on ? S.entries(settings) : null;
    const key = on ? JSON.stringify(list) : 'off';
    // Nothing that matters here changed: no restart, and nothing sent (a frame that is off once
    // re-sent "no covers" on every change of the settings, a saved report included: review).
    if (key === running) return;
    if (run) {
      pageState = run.stop();
      run = null;
    }
    running = key;
    if (!on) {
      send({});
      mark('ready');
      return;
    }
    const matcher = GtaBlocker.matcher.compile(list);
    if (list.length > 0 && matcher.entries.length === 0) {
      // A list that is there but that the matcher refuses whole: never silently cover nothing.
      mark('error');
      return;
    }
    const current = settings;
    run = page.start({
      matcher,
      pageState,
      label: (entry) => S.coverWord(current, entry),
      onCovers: send,
      onReady: () => mark('ready'),
    });
  }

  // The tab's site, as its top frame told the background; a frame follows it. Never waits for
  // the background more than a moment.
  function hello(own) {
    const asked = browser.runtime.sendMessage({ type: 'hello', site: own })
      .then((reply) => (reply && (reply.site === null || typeof reply.site === 'string') ? reply.site : own))
      .catch(() => own);
    return Promise.race([asked, new Promise((resolve) => setTimeout(() => resolve(own), HELLO_WAIT_MS))]);
  }

  async function boot() {
    // Listen first: a change made while the settings are being read must not be lost (review).
    const seen = {};
    let booted = false;
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || (!changes.switch && !changes.words)) return;
      if (changes.switch) seen.switch = changes.switch.newValue;
      if (changes.words) seen.words = changes.words.newValue;
      if (!booted) return;
      settings = S.read(seen);
      update();
    });
    const own = S.siteKey(location.href);
    const [stored, site] = await Promise.all([browser.storage.local.get(['switch', 'words']), hello(own)]);
    for (const key of ['switch', 'words']) if (!(key in seen)) seen[key] = stored[key];
    settings = S.read(seen);
    tabSite = site;
    booted = true;
    // From the toolbar menu: "Not about GTA" for a word on this page, and its Undo.
    browser.runtime.onMessage.addListener((raw) => {
      const msg = T.parseForPage(raw);
      if (!msg || !run) return undefined;
      if (msg.type === 'show-word') run.show(msg.entry);
      else run.cover(msg.entry);
      return undefined;
    });
    // Only Firefox's own events count: a page can dispatch fake ones on window, as often as it
    // likes, and each once sent a message to the background (security review).
    window.addEventListener('pagehide', (event) => {
      if (!event.isTrusted) return;
      browser.runtime.sendMessage({ type: 'covers', counts: {} }).catch(() => {});
    });
    // A page restored by Back (the back-forward cache) runs no script again: it says hello and
    // its covers again, or the icon shows the page left behind (found in review, checked in
    // Firefox 2026-11-18). Frames wait a moment, so the top frame's hello comes first.
    window.addEventListener('pageshow', (event) => {
      if (!event.isTrusted || !event.persisted) return;
      hello(own).then(() => setTimeout(() => { if (run) run.retell(); else send({}); }, 300));
    });
    update();
  }

  boot().catch(() => mark('error'));
})();
