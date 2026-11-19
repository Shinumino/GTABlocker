// The settings page's worked-out words: the report rows, the text "Copy all" gives, and what
// the Reset box says goes and comes back. Plain logic, tested apart from drawing it
// (tests/micro/settings-view.test.mjs); the look was agreed in docs/design/menu-preview.html.
(function (root) {
  'use strict';
  const ns = (root.GtaBlocker = root.GtaBlocker || {});
  const S = ns.settings;
  const M = ns.matcher;

  const KIND = Object.freeze({ 'not-gta': 'Not about GTA', missed: 'Missed GTA' });
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  // timeZone is for the tests; the page shows the computer's own.
  function reportRows(reports, timeZone) {
    const format = new Intl.DateTimeFormat('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone,
    });
    return reports.map((r) => {
      const missed = r.kind === 'missed';
      return {
        when: format.format(new Date(r.at)),
        kind: KIND[r.kind],
        label: missed ? 'Note' : 'Word',
        note: missed ? (r.note ? `You wrote: "${r.note}"` : '') : (r.word || ''),
        page: r.page,
      };
    });
  }

  function copyText(reports, timeZone) {
    return reportRows(reports, timeZone).map((r) => `${r.when}  ${r.kind}  ${r.note ? `${r.note}  ` : ''}${r.page}`).join('\n');
  }

  function listShort(items) {
    if (items.length <= 4) return items.join(', ');
    return `${items.slice(0, 3).join(', ')} and ${items.length - 3} more`;
  }

  // What Reset would do, in one sentence, or null when the list is already the built-in one.
  function resetText(s) {
    const list = S.entries(s);
    const own = list.filter((w) => S.isOwn(s, w));
    const back = M.DEFAULT_ENTRIES.filter((w) => !list.includes(w));
    const parts = [];
    if (own.length) parts.push(`your ${plural(own.length, 'own word goes', 'own words go')} (${listShort(own)})`);
    if (back.length) parts.push(`the ${plural(back.length, 'built-in word you removed comes', 'built-in words you removed come')} back (${listShort(back)})`);
    if (!parts.length) return null;
    const text = `${parts.join(', and ')}.`;
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  ns.settingsView = Object.freeze({ reportRows, copyText, resetText });
})(globalThis);
