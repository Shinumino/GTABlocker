// The settings page: the word list, the sites where covering is off, and the reports, drawn
// from browser.storage.local and changed only through lib/settings.js. It follows changes made
// elsewhere (the toolbar menu) live. Reset and Clear all ask first; a removal has Undo, which
// puts back only what it removed.
(async function () {
  'use strict';
  const { settings: S, settingsView: V, dom: { el, icon } } = GtaBlocker;
  const $ = (id) => document.getElementById(id);
  const NONE = Object.freeze({ text: '', kind: 'good', undo: null });

  let settings = S.read(await browser.storage.local.get([...S.KEYS]));
  let wordMsg = NONE;
  let siteMsg = NONE;
  let repMsg = NONE;
  let newWord = null;
  const written = new Map(); // key -> the JSON this page last wrote, to know its own changes

  // Writes only the stores that changed, and remembers what it wrote: the change comes back as
  // an event, and redrawing the page for it once dropped the focus (review).
  async function save(next) {
    const before = S.toStorage(settings);
    const after = S.toStorage(next);
    settings = next;
    const changed = {};
    for (const key of S.KEYS) {
      const text = JSON.stringify(after[key]);
      if (JSON.stringify(before[key]) !== text) {
        changed[key] = after[key];
        written.set(key, text);
      }
    }
    if (Object.keys(changed).length) await browser.storage.local.set(changed);
  }

  function message(id, msg, onUndo) {
    return el('p', { class: `msg ${msg.kind}`, id, role: 'status' }, msg.text,
      msg.undo ? ' ' : null, msg.undo ? el('button', { type: 'button', class: 'link-btn', onclick: onUndo }, 'Undo') : null);
  }

  // A key that finds the same control after a redraw, so the focus stays where it was.
  const keyOf = (node) => (node && node.dataset && node.dataset.key ? node.dataset.key : null);
  function refocus(key) {
    if (!key) return;
    const again = document.querySelector(`[data-key="${CSS.escape(key)}"]`);
    if (again) again.focus();
  }

  function renderWords(focusIndex) {
    const list = S.entries(settings);
    $('n-words').textContent = `(${list.length} of ${S.MAX_WORDS})`;
    $('words-box').replaceChildren(
      message('word-msg', wordMsg, async () => {
        const { entry, index } = wordMsg.undo;
        wordMsg = { text: `"${entry}" is back.`, kind: 'good', undo: null };
        await save(S.restoreWord(settings, entry, index));
        renderWords();
        $('add-input').focus();
      }),
      list.length === 0
        ? el('p', { class: 'empty' }, 'No words, so nothing gets covered. Add one above, or use Reset to the built-in words.')
        : el('ul', { class: 'wlist' }, list.map((w, i) => el('li', { class: w === newWord ? 'new' : null },
          el('span', { class: 'w' }, w, S.isOwn(settings, w) ? el('span', { class: 'tag yours' }, 'yours') : el('span', { class: 'tag' }, 'built-in')),
          el('button', {
            type: 'button', class: 'icon-btn red', title: 'Remove', 'aria-label': `Remove ${w}`, 'data-key': `word|${w}`,
            onclick: async () => {
              wordMsg = { text: `Removed "${w}".`, kind: 'good', undo: { entry: w, index: settings.added.indexOf(w) } };
              newWord = null;
              await save(S.removeWord(settings, w));
              renderWords(i);
            },
          }, icon('bin'))))),
      el('div', { class: 'row-actions' }, el('button', { type: 'button', class: 'btn red', id: 'reset', 'data-key': 'reset', onclick: reset }, 'Reset to the built-in words')),
    );
    if (typeof focusIndex === 'number') {
      const bins = $('words-box').querySelectorAll('.wlist button');
      (bins[Math.min(focusIndex, bins.length - 1)] || $('add-input')).focus();
    }
  }

  function renderSites() {
    $('n-sites').textContent = settings.offSites.length ? `(${settings.offSites.length})` : '';
    $('sites-box').replaceChildren(
      settings.everywhere ? null : el('p', { class: 'msg warn' }, 'Off everywhere right now: nothing is covered on any site. Turn Everywhere back on in the toolbar menu.'),
      settings.offSites.length === 0
        ? el('p', { class: 'empty' }, 'None. To turn it off on a site, use the toolbar menu there.')
        : el('ul', { class: 'sites' }, settings.offSites.map((site, i) => el('li', {}, el('span', {}, site),
          el('button', {
            type: 'button', class: 'btn', 'aria-label': `Turn on ${site}`, 'data-key': `site|${site}`,
            onclick: async () => {
              await save(S.setSite(settings, site, true));
              siteMsg = { text: settings.everywhere ? `Covers are back on ${site}.` : `Covers come back on ${site} once Everywhere is on.`, kind: 'good', undo: null };
              renderSites();
              const ons = $('sites-box').querySelectorAll('.sites button');
              (ons[Math.min(i, ons.length - 1)] || $('h-sites')).focus();
            },
          }, 'Turn on')))),
      message('site-msg', siteMsg),
    );
  }

  function renderReports() {
    const rows = V.reportRows(settings.reports);
    $('n-reports').textContent = rows.length ? `(${rows.length})` : '';
    $('reports-box').replaceChildren(
      rows.length === 0
        ? el('p', { class: 'empty' }, 'No reports yet. "Not about GTA" and "Report missed GTA" in the toolbar menu add them here.')
        : el('table', { class: 'rep' },
          el('thead', {}, el('tr', {}, el('th', {}, 'When'), el('th', {}, 'Report'), el('th', {}, 'Word or note'), el('th', {}, 'Page'), el('th', {}, el('span', { class: 'sr' }, 'Remove')))),
          el('tbody', {}, rows.map((r, i) => el('tr', {},
            el('td', { class: 'when' }, r.when),
            el('td', { 'data-label': 'Report' }, r.kind),
            el('td', { 'data-label': r.label }, r.note),
            el('td', { 'data-label': 'Page' }, r.page),
            el('td', { class: 'act' }, el('button', {
              type: 'button', class: 'icon-btn red', title: 'Remove', 'aria-label': 'Remove this report', 'data-key': `report|${i}`,
              onclick: async () => {
                repMsg = { text: 'Report removed.', kind: 'good', undo: { report: settings.reports[i], index: i } };
                await save(S.removeReport(settings, i));
                renderReports();
                const bins = $('reports-box').querySelectorAll('td.act button');
                (bins[Math.min(i, bins.length - 1)] || $('h-reports')).focus();
              },
            }, icon('bin'))))))),
      rows.length === 0 ? null : el('div', { class: 'row-actions' },
        el('button', { type: 'button', class: 'btn', id: 'copy', 'data-key': 'copy', onclick: copy }, icon('copy'), 'Copy all'),
        el('button', { type: 'button', class: 'btn red', id: 'clear', 'data-key': 'clear', onclick: clear }, 'Clear all')),
      message('rep-msg', repMsg, async () => {
        const { report, index } = repMsg.undo;
        repMsg = { text: 'The report is back.', kind: 'good', undo: null };
        await save(S.restoreReport(settings, report, index));
        renderReports();
        $('h-reports').focus();
      }),
    );
  }

  function render() {
    renderWords();
    renderSites();
    renderReports();
  }

  // A confirm box for what cannot be undone. The safe button gets the focus and neither button
  // submits a form, so Enter never picks the wrong one.
  function ask(title, text, yes, no, then, back) {
    $('ask-h').textContent = title;
    $('ask-p').textContent = text;
    $('ask-yes').textContent = yes;
    $('ask-no').textContent = no;
    const box = $('ask');
    let done = false;
    $('ask-yes').onclick = () => { done = true; box.close(); then(); };
    $('ask-no').onclick = () => box.close();
    box.onclose = () => { if (!done && back) back.focus(); };
    box.showModal();
    $('ask-no').focus();
  }

  function reset() {
    const text = V.resetText(settings);
    if (!text) {
      wordMsg = { text: 'The list is already the built-in words.', kind: 'good', undo: null };
      renderWords();
      return;
    }
    ask('Reset the word list?', text, 'Reset the list', 'Keep it', async () => {
      await save(S.resetWords(settings));
      wordMsg = { text: 'Back to the built-in words.', kind: 'good', undo: null };
      newWord = null;
      renderWords();
      $('reset').focus();
    }, $('reset'));
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(V.copyText(settings.reports));
      const n = settings.reports.length;
      repMsg = { text: `Copied ${n} ${n === 1 ? 'report' : 'reports'}. Paste them into your message to Claude.`, kind: 'good', undo: null };
    } catch {
      repMsg = { text: 'Could not copy. Select the table and copy it by hand.', kind: 'bad', undo: null };
    }
    renderReports();
    $('copy').focus();
  }

  function clear() {
    const n = settings.reports.length;
    ask('Clear all reports?', `The ${n} ${n === 1 ? 'report goes' : 'reports go'} for good. Copy them first if you still want to send them.`, 'Clear all', 'Keep them', async () => {
      await save(S.clearReports(settings));
      repMsg = { text: 'Reports cleared.', kind: 'good', undo: null };
      renderReports();
      $('h-reports').focus();
    }, $('clear'));
  }

  $('add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('add-input');
    const { settings: next, refused } = S.addWord(settings, input.value);
    if (refused) {
      wordMsg = { text: refused.reason, kind: 'bad', undo: null };
      renderWords();
      input.focus();
      return;
    }
    const added = S.entries(next).find((w) => !S.entries(settings).includes(w));
    await save(next);
    newWord = added;
    wordMsg = { text: `Added "${added}".`, kind: 'good', undo: null };
    input.value = '';
    renderWords();
    input.focus();
  });
  $('add-input').addEventListener('input', () => {
    if (wordMsg.kind === 'bad') {
      wordMsg = NONE;
      $('word-msg').textContent = '';
    }
  });
  // A change made elsewhere (the toolbar menu) shows here at once, and the messages it made
  // untrue go ("reddit.com will be covered again..." once Everywhere was on: review). This
  // page's own writes come back here too, and are skipped.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const outside = S.KEYS.filter((key) => key in changes && JSON.stringify(changes[key].newValue) !== written.get(key));
    for (const key of S.KEYS) if (key in changes) written.delete(key);
    if (outside.length === 0) return;
    const focus = keyOf(document.activeElement);
    settings = S.read({ ...S.toStorage(settings), ...Object.fromEntries(outside.map((key) => [key, changes[key].newValue])) });
    wordMsg = NONE;
    siteMsg = NONE;
    repMsg = NONE;
    render();
    refocus(focus);
  });

  render();
  // For the tests: the page has drawn what is stored.
  document.documentElement.setAttribute('data-ready', '');
})();
