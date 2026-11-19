// What the background keeps about each tab, and every decision it makes, as plain logic over
// a plain object:
//   { [tabId]: { site, frames: { [frameId]: { entry: count } } } }
// browser.storage.session holds it: the background is an event page, unloaded when idle, and
// its memory with it. The top frame (frameId 0) starts a tab afresh on every page; frames only
// add their covers, and learn the tab's site from here, so a player embedded in a page follows
// the switch of the site the person is on. background.js only carries out what handle() says.
//
// Every number comes from a content script, and a content script sees what the page shows it,
// so a hostile page decides them: each is capped, and a report that changes nothing writes
// nothing (a page can make its content script send as often as it likes: security review).
(function (root) {
  'use strict';
  const ns = Object.hasOwn(root, 'GtaBlocker') ? root.GtaBlocker : (root.GtaBlocker = {});

  const MAX_ENTRIES = 200; // per frame: the word list holds at most 200
  const MAX_FRAMES = 64; // frames with covers, per tab
  const MAX_COUNT = 10000;
  const MAX_ENTRY_LENGTH = 200; // an own word as written (the add box takes 200 characters)
  const MAX_SITE_LENGTH = 253; // the longest host name
  const ON = Object.freeze({ color: '#E2B857', textColor: '#1F1806' }); // gold, like Show anyway
  const OFF = Object.freeze({ color: '#5B5B66', textColor: '#FBFBFE' });

  const tabOf = (s, tabId) => (Object.hasOwn(s, String(tabId)) ? s[String(tabId)] : null);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  function cleanCounts(counts) {
    const out = Object.create(null); // an own word may be named "__proto__"
    let kept = 0;
    for (const [entry, n] of Object.entries(counts)) {
      if (kept >= MAX_ENTRIES) break;
      if (!entry || entry.length > MAX_ENTRY_LENGTH) continue;
      if (typeof n !== 'number' || !Number.isFinite(n) || n < 1) continue;
      out[entry] = Math.min(Math.floor(n), MAX_COUNT);
      kept += 1;
    }
    return out;
  }

  function hello(s, tabId, frameId, site) {
    if (frameId !== 0) return s;
    return { ...s, [String(tabId)]: { site: site || null, frames: {} } };
  }

  // A frame's covers, replacing what it said before. A frame with nothing covered takes no slot
  // (the 64 slots once filled with frames that had nothing, or had gone: review), and a report
  // that changes nothing returns the very same state, so nothing is written.
  function report(s, tabId, frameId, counts) {
    const tab = tabOf(s, tabId) || { site: null, frames: {} };
    const key = String(frameId);
    const clean = cleanCounts(counts);
    const known = Object.hasOwn(tab.frames, key);
    if (Object.keys(clean).length === 0) {
      if (!known) return s;
      const frames = { ...tab.frames };
      delete frames[key];
      return { ...s, [String(tabId)]: { ...tab, frames } };
    }
    if (known && same(tab.frames[key], clean)) return s;
    if (!known && Object.keys(tab.frames).length >= MAX_FRAMES) return s;
    return { ...s, [String(tabId)]: { ...tab, frames: { ...tab.frames, [key]: clean } } };
  }

  function forget(s, tabId) {
    const out = { ...s };
    delete out[String(tabId)];
    return out;
  }

  function siteOf(s, tabId) {
    const tab = tabOf(s, tabId);
    return tab ? tab.site : null;
  }

  function byEntry(s, tabId) {
    const tab = tabOf(s, tabId);
    if (!tab) return [];
    const sums = new Map();
    for (const counts of Object.values(tab.frames)) {
      for (const [entry, n] of Object.entries(counts)) sums.set(entry, (sums.get(entry) || 0) + n);
    }
    return [...sums].map(([entry, n]) => ({ entry, n })).sort((a, b) => b.n - a.n || (a.entry < b.entry ? -1 : 1));
  }

  function total(s, tabId) {
    return byEntry(s, tabId).reduce((sum, row) => sum + row.n, 0);
  }

  function badge(on, count) {
    if (!on) return { text: 'off', ...OFF };
    return { text: count === 0 ? '' : count > 999 ? '999+' : String(count), ...ON };
  }

  // What the icon of a tab shows, from the switch ({ everywhere, offSites }). The tooltip says
  // the state in words too, as the agreed preview did: the badge alone is only for the eye.
  function paintFor(s, tabId, sw) {
    const on = ns.settings.coverState(ns.settings.read({ switch: sw }), siteOf(s, tabId)).on;
    const n = total(s, tabId);
    const title = !on ? 'GTA Blocker, off' : n === 0 ? 'GTA Blocker, nothing covered' : `GTA Blocker, ${n} covered`;
    return { tabId, ...badge(on, n), title };
  }

  // The messages the background accepts, each checked for shape; anything else is null.
  function parse(msg) {
    if (!msg || typeof msg !== 'object') return null;
    if (msg.type === 'hello') {
      const ok = msg.site === null || (typeof msg.site === 'string' && msg.site.length > 0 && msg.site.length <= MAX_SITE_LENGTH);
      return ok ? { type: 'hello', site: msg.site } : null;
    }
    if (msg.type === 'covers') {
      const ok = msg.counts && typeof msg.counts === 'object' && !Array.isArray(msg.counts);
      return ok ? { type: 'covers', counts: msg.counts } : null;
    }
    if (msg.type === 'tab-covers') {
      return Number.isInteger(msg.tabId) && msg.tabId >= 0 ? { type: 'tab-covers', tabId: msg.tabId } : null;
    }
    return null;
  }

  // What the toolbar menu may say to a page: show again, or cover again, one word on it.
  function parseForPage(msg) {
    if (!msg || typeof msg !== 'object' || (msg.type !== 'show-word' && msg.type !== 'cover-word')) return null;
    if (typeof msg.entry !== 'string' || !msg.entry || msg.entry.length > MAX_ENTRY_LENGTH) return null;
    return { type: msg.type, entry: msg.entry };
  }

  // One message, decided: { state, reply, paint }. reply is undefined for a message that gets
  // no answer; paint is the icon to draw for a tab, or null. sw is the stored switch.
  function handle(s, raw, sender, sw) {
    const none = { state: s, reply: undefined, paint: null };
    const msg = parse(raw);
    if (!msg) return none;
    if (msg.type === 'tab-covers') {
      // Only our own pages ask this (an extension page has no sender.tab): a page must never
      // read another tab's covers.
      if (sender && sender.tab) return none;
      return { state: s, reply: { covers: byEntry(s, msg.tabId) }, paint: null };
    }
    const tabId = sender && sender.tab && sender.tab.id;
    const frameId = sender && sender.frameId;
    if (!Number.isInteger(tabId) || !Number.isInteger(frameId)) return none;
    if (msg.type === 'hello') {
      const next = hello(s, tabId, frameId, msg.site);
      // The tab's site, as its top frame said it; a frame of a tab not heard of decides by its own.
      const site = tabOf(next, tabId) ? siteOf(next, tabId) : msg.site;
      return { state: next, reply: { site }, paint: paintFor(next, tabId, sw) };
    }
    const next = report(s, tabId, frameId, msg.counts);
    return { state: next, reply: {}, paint: next === s ? null : paintFor(next, tabId, sw) };
  }

  ns.tabs = Object.freeze({ hello, report, forget, siteOf, byEntry, total, badge, paintFor, parse, parseForPage, handle });
})(globalThis);
