// The user's settings and every change to them, as plain logic over a plain object:
//   { everywhere, offSites, added, removed, reports }
// everywhere: false turns covering off on every site; offSites: the sites turned off one by one
// ("this site" is the address's host without "www."); added: the person's own words, newest
// first; removed: the built-in words they took out; reports: what "Not about GTA" and "Report
// missed GTA" saved, newest first, the last 50. Only on this PC: nothing is ever sent anywhere.
//
// The word list is the person's own words, then the built-in ones minus the removed: stored as
// what changed, not as a copy, so a built-in word added in a later version reaches an edited
// list too, and a built-in word dropped later never turns into one of "their own" (the user's
// choice, 2026-11-18; the design review found the copy did both).
//
// It is stored as three keys (KEYS): the switch, the words and the reports. A page reads only
// the first two: the reports hold addresses of other sites (a little browsing history), and
// no site's process needs them (security review, 2026-11-18).
//
// Every surface (the content script, the background, the toolbar menu, the settings page)
// changes settings only through these functions, so the rules cannot drift between them. Each
// returns a new object and never changes the one it is given; read() takes whatever is stored
// back defensively (a field of the wrong type falls back to its default). withDefaults(list)
// gives the same rules over another built-in list: a later version's, in the tests.
(function (root) {
  'use strict';
  const ns = Object.hasOwn(root, 'GtaBlocker') ? root.GtaBlocker : (root.GtaBlocker = {});
  const M = ns.matcher;

  const KEYS = Object.freeze(['switch', 'words', 'reports']);
  // What a cover says instead of one of the user's own words: a page can read its own content,
  // and so the cover's text, so it must never learn what is on the user's list.
  const OWN_LABEL = 'a word from your list';
  const MAX_REPORTS = 50;
  const MAX_SITES = 1000;
  const MAX_WORDS = M.LIMITS.maxEntries;
  const CAPS = Object.freeze({ page: 2000, note: 200, word: 200 });
  const KINDS = Object.freeze(['not-gta', 'missed']);
  const BLANK = Object.freeze({ code: 'blank', reason: 'Type a word or phrase first.' });

  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const arr = (v) => (Array.isArray(v) ? v : []);
  const unique = (list) => [...new Set(list)];

  function webUrl(text) {
    if (typeof text !== 'string' || !text) return null;
    let url;
    try {
      url = new root.URL(text);
    } catch {
      return null;
    }
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  }

  // "This site": the host without "www." (when a name is left after it) and without a final
  // dot. m.youtube.com stays its own site: a list of domain endings would be needed to merge it
  // with youtube.com safely (.com.br), and the user chose the address without www (2026-11-18).
  function siteKey(text) {
    const url = webUrl(text);
    if (!url) return null;
    let host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (host.startsWith('www.') && host.slice(4).includes('.')) host = host.slice(4);
    return host || null;
  }

  function cleanSite(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    const text = value.trim();
    return siteKey(text.includes('://') ? text : `https://${text}`);
  }

  // A report keeps the full address but its #part (the user's choice, 2026-11-18: a video id
  // lives in the ?part; the settings table shows exactly what "Copy all" copies).
  function cleanReport(r) {
    if (!r || typeof r !== 'object' || !KINDS.includes(r.kind)) return null;
    if (typeof r.at !== 'string' || Number.isNaN(Date.parse(r.at))) return null;
    const url = webUrl(r.page);
    if (!url) return null;
    url.hash = '';
    const out = { at: r.at, kind: r.kind, page: url.href.slice(0, CAPS.page) };
    if (typeof r.word === 'string' && r.word) out.word = r.word.slice(0, CAPS.word);
    if (typeof r.note === 'string' && r.note.trim()) out.note = r.note.trim().slice(0, CAPS.note);
    return out;
  }
  const sameReport = (a, b) => a.at === b.at && a.kind === b.kind && a.page === b.page && (a.word || '') === (b.word || '') && (a.note || '') === (b.note || '');

  // Blank as the matcher sees it: nothing left once invisible characters and spacing are gone
  // (a word made only of a zero-width space was once added as an empty own word: review).
  function isBlank(text) {
    if (typeof text !== 'string') return true;
    const c = M.compile([text]);
    return c.entries.length === 0 && c.rejected.length === 0;
  }

  function make(DEFAULTS) {
    const defaults = Object.freeze([...DEFAULTS]);

    function read(raw) {
      const r = obj(raw);
      const sw = obj(r.switch);
      const w = obj(r.words);
      const added = unique(arr(w.added).filter((x) => !isBlank(x))).slice(0, MAX_WORDS);
      // An own word that this version has built in becomes the built-in one, as typing it in
      // does (addWord): kept as the person's own, the list showed it twice and its covers said
      // "a word from your list" (the user's "Rockstar", built in on 2026-11-19).
      const builtIn = builtInsRepeated(added);
      const repeated = new Set(builtIn.values());
      return {
        everywhere: typeof sw.everywhere === 'boolean' ? sw.everywhere : true,
        offSites: unique(arr(sw.offSites).map(cleanSite).filter(Boolean)).slice(0, MAX_SITES),
        added: added.filter((x) => !builtIn.has(x)),
        // Only a word still built in can be removed: one dropped from the built-in list is
        // simply forgotten. One the person also has as their own stays in the list.
        removed: unique(arr(w.removed).filter((x) => defaults.includes(x) && !repeated.has(x))),
        reports: arr(r.reports).map(cleanReport).filter(Boolean).slice(0, MAX_REPORTS),
      };
    }

    function toStorage(s) {
      return {
        switch: { everywhere: s.everywhere, offSites: s.offSites },
        words: { added: s.added, removed: s.removed },
        reports: s.reports,
      };
    }

    // ---- the switch ----

    // One rule for the content script, the background and the menu (three copies once
    // disagreed about a local file: review). tabSite is the site of the tab the person is on
    // (a frame is told it), or null for a page with no site address, such as a local file:
    // such a page is covered and follows Everywhere only (the user's choice, 2026-11-18).
    function coverState(s, tabSite) {
      const site = typeof tabSite === 'string' && tabSite ? tabSite : null;
      return { on: s.everywhere && (site === null || !s.offSites.includes(site)), siteSwitch: site !== null };
    }

    function setSite(s, site, on) {
      if (!site) return s;
      const rest = s.offSites.filter((x) => x !== site);
      return { ...s, offSites: on ? rest : [...rest, site].slice(-MAX_SITES) };
    }

    function setEverywhere(s, on) {
      return { ...s, everywhere: Boolean(on) };
    }

    // ---- the word list ----

    function entries(s) {
      return [...s.added, ...defaults.filter((w) => !s.removed.includes(w))];
    }

    function isOwn(s, entry) {
      return s.added.includes(entry);
    }

    function coverWord(s, entry) {
      return isOwn(s, entry) ? OWN_LABEL : entry;
    }

    // Of the person's own words, the ones that repeat a built-in entry: own word -> that entry.
    // One reading of the whole list, by the matcher, as builtInFor does for one word.
    function builtInsRepeated(own) {
      const found = new Map();
      for (const r of M.compile([...defaults, ...own]).rejected) {
        if (r.code === 'duplicate' && r.sameAs < defaults.length) found.set(own[r.index - defaults.length], defaults[r.sameAs]);
      }
      return found;
    }

    // The built-in entry the text repeats ("Vice  City" is "vice city"), or null. The matcher
    // decides what counts as the same entry, so this can never disagree with what it covers.
    function builtInFor(text) {
      const r = M.compile([...defaults, text]).rejected.find((x) => x.index === defaults.length);
      return r && r.code === 'duplicate' ? defaults[r.sameAs] : null;
    }

    const repeats = (entry) => ({ code: 'duplicate', reason: `Already in the list as "${entry}".` });

    // Returns { settings, refused }: refused is null, or { code, reason } in the matcher's own
    // words (a repeat also names the entry it repeats), and then the settings are the ones given.
    function addWord(s, text) {
      if (isBlank(text)) return { settings: s, refused: BLANK };
      const list = entries(s);
      const builtIn = builtInFor(text);
      if (builtIn !== null) {
        if (list.includes(builtIn)) return { settings: s, refused: repeats(builtIn) };
        if (list.length >= MAX_WORDS) return { settings: s, refused: { code: 'list-full', reason: M.REASONS['list-full'] } };
        // Typed back in: built-in again, in its own place and spelling.
        return { settings: { ...s, removed: s.removed.filter((w) => w !== builtIn) }, refused: null };
      }
      const r = M.compile([...list, text]).rejected.find((x) => x.index === list.length);
      if (r) return { settings: s, refused: r.code === 'duplicate' ? repeats(list[r.sameAs]) : { code: r.code, reason: r.reason } };
      return { settings: { ...s, added: [text.trim(), ...s.added] }, refused: null };
    }

    function removeWord(s, entry) {
      if (s.added.includes(entry)) return { ...s, added: s.added.filter((w) => w !== entry) };
      if (defaults.includes(entry) && !s.removed.includes(entry)) return { ...s, removed: [...s.removed, entry] };
      return s;
    }

    // Undo of removeWord: puts back only that word, an own one at `index` in the own words.
    // Anything removed or added meanwhile stays as it is (a whole saved copy once brought a
    // second removed word back: review).
    function restoreWord(s, entry, index) {
      if (defaults.includes(entry)) {
        return s.removed.includes(entry) ? { ...s, removed: s.removed.filter((w) => w !== entry) } : s;
      }
      if (s.added.includes(entry)) return s;
      const added = [...s.added];
      added.splice(Math.max(0, Math.min(Number.isInteger(index) ? index : 0, added.length)), 0, entry);
      return { ...s, added };
    }

    function resetWords(s) {
      return { ...s, added: [], removed: [] };
    }

    // ---- reports ----

    // report: { kind: 'not-gta' | 'missed', page, word?, note? }; now is passed in, so a test can
    // hold the clock. A report that is not well formed is not kept.
    function addReport(s, report, now) {
      const r = cleanReport({ ...report, at: now.toISOString() });
      if (!r) return s;
      return { ...s, reports: [r, ...s.reports].slice(0, MAX_REPORTS) };
    }

    function removeReport(s, index) {
      if (!Number.isInteger(index) || index < 0 || index >= s.reports.length) return s;
      return { ...s, reports: s.reports.filter((_, i) => i !== index) };
    }

    // Undo of removeReport: puts back only that report, near where it was; a report saved
    // meanwhile stays.
    function restoreReport(s, report, index) {
      const r = cleanReport(report);
      if (!r || s.reports.some((x) => sameReport(x, r))) return s;
      const reports = [...s.reports];
      reports.splice(Math.max(0, Math.min(Number.isInteger(index) ? index : 0, reports.length)), 0, r);
      return { ...s, reports: reports.slice(0, MAX_REPORTS) };
    }

    function clearReports(s) {
      return { ...s, reports: [] };
    }

    return Object.freeze({
      KEYS, OWN_LABEL, MAX_REPORTS, MAX_WORDS, siteKey, read, toStorage, coverState, setSite, setEverywhere,
      entries, isOwn, coverWord, addWord, removeWord, restoreWord, resetWords,
      addReport, removeReport, restoreReport, clearReports, withDefaults: make,
    });
  }

  ns.settings = make(M.DEFAULT_ENTRIES);
})(globalThis);
