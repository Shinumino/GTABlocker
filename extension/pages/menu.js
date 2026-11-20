// The toolbar menu: draws what pages/menu-view.js decides, and carries out the person's
// choices. Settings change only through lib/settings.js and go to browser.storage.local (every
// page follows them live); "Not about GTA" and its Undo go to every frame of the tab; a report
// is saved only on this PC.
(async function () {
  'use strict';
  const { settings: S, menuView: V, dom: { el } } = GtaBlocker;
  const box = document.getElementById('menu');

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const version = browser.runtime.getManifest().version;
  let settings = S.read(await browser.storage.local.get([...S.KEYS]));
  let seen = []; // every word this menu has shown, in the order first seen (menuView.keep)
  let covers = [];
  const done = Object.create(null); // entry -> 'shown' | 'removed', for this menu
  const undos = Object.create(null); // entry -> what its Undo needs: the report, or the word's place
  let message = '';
  let missOpen = false;
  let missCount = 0;

  async function loadCovers() {
    let now = [];
    try {
      const reply = await browser.runtime.sendMessage({ type: 'tab-covers', tabId: tab.id });
      now = reply && Array.isArray(reply.covers) ? reply.covers : [];
    } catch {
      // The background did not answer: show what this menu knew.
    }
    ({ seen, covers } = V.keep(seen, now, done));
  }

  // Takes the new settings, draws them, then writes only the stores that changed: a report must
  // not wake every page (pages listen to the switch and the words only). Drawing comes first
  // and nothing waits before the write starts: the menu closes the moment the person clicks
  // elsewhere or presses Escape, and whatever was still waiting is lost (macro test, 2026-11-18).
  function commit(next, focus) {
    const before = S.toStorage(settings);
    const after = S.toStorage(next);
    const changed = {};
    for (const key of S.KEYS) if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changed[key] = after[key];
    settings = next;
    render(focus);
    return Object.keys(changed).length ? browser.storage.local.set(changed) : undefined;
  }

  // A key that finds the same control after a redraw, so the focus never jumps elsewhere.
  const keyOf = (node) => (node && node.dataset && node.dataset.act ? `${node.dataset.act}|${node.dataset.entry || ''}` : null);

  function render(focus = keyOf(document.activeElement)) {
    const v = V.view({ settings, url: tab.url, covers, done, version });
    const parts = [];
    for (const row of v.rows) {
      const button = el('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': String(row.on), 'aria-label': row.label, 'data-act': row.kind },
        el('span', { class: 'knob' }));
      // The whole row is the target, not only the 44 px switch. A click on the switch itself,
      // its knob included, is the switch's own: passing it on once more turned it back
      // (correctness review, checked in Firefox 2026-11-18).
      parts.push(el('div', { class: 'sw-row', onclick: (e) => { if (!e.target.closest('button')) button.click(); } },
        el('div', {}, el('b', {}, row.label), el('small', {}, row.sub)), button,
        el('span', { class: row.on ? 'sw-word on' : 'sw-word' }, row.on ? 'On' : 'Off')));
    }
    if (v.note) parts.push(el('p', { class: 'state' }, v.note));
    if (v.state) parts.push(el('p', { class: 'state' }, v.state));
    if (v.count) parts.push(el('p', { class: 'count' }, v.count));
    if (v.groups.length) {
      parts.push(el('ul', { class: 'groups' }, v.groups.map((g) => {
        if (g.done) {
          return el('li', { class: 'done' },
            el('span', { class: 'gw' }, g.entry, el('br'), g.done === 'removed' ? 'Removed from your list.' : 'Shown again on this page.'),
            el('button', { type: 'button', class: 'btn', 'data-act': 'undo', 'data-entry': g.entry }, 'Undo'));
        }
        return el('li', {},
          el('span', { class: 'gw' }, g.entry, g.own ? el('span', { class: 'tag yours' }, 'yours') : null),
          el('span', { class: 'gn', 'aria-label': `${g.n} ${g.n === 1 ? 'cover' : 'covers'}` }, String(g.n)),
          g.action === 'remove'
            ? el('button', { type: 'button', class: 'btn red', 'data-act': 'remove', 'data-entry': g.entry }, 'Remove from my list')
            : el('button', { type: 'button', class: 'btn', 'data-act': 'notgta', 'data-entry': g.entry }, 'Not about GTA'));
      })));
      if (v.hint) parts.push(el('p', { class: 'hint' }, 'Not about GTA shows them again on this page and saves a report.'));
    }
    if (missOpen) {
      parts.push(el('div', { class: 'miss' },
        el('label', { for: 'miss-input' }, 'What did you see? (optional)'),
        el('input', { id: 'miss-input', autocomplete: 'off', maxlength: '200', placeholder: 'like a GTA video in the sidebar', 'data-act': 'miss-input' }),
        el('div', { class: 'row' },
          el('button', { type: 'button', class: 'btn gold', 'data-act': 'miss-save' }, 'Save report'),
          el('button', { type: 'button', class: 'btn', 'data-act': 'miss-cancel' }, 'Cancel'))));
    }
    parts.push(el('p', { class: 'msg good', role: 'status' }, message));
    parts.push(el('div', { class: 'pfoot' },
      v.miss && !missOpen ? el('button', { type: 'button', class: 'btn', 'data-act': 'miss' }, 'Report missed GTA') : null,
      el('button', { type: 'button', class: 'btn', 'data-act': 'settings' }, 'Settings'),
      v.version ? el('span', { class: 'ver', title: `GTA Blocker ${v.version}` }, v.version) : null));
    box.replaceChildren(...parts);
    if (focus) {
      const again = [...box.querySelectorAll('[data-act]')].find((n) => keyOf(n) === focus);
      if (again) again.focus();
    }
  }

  async function saveMiss() {
    const input = document.getElementById('miss-input');
    const note = input ? input.value.trim() : '';
    missCount += 1;
    missOpen = false;
    message = missCount === 1 ? "Saved to your reports, with this page's address." : `Saved again: ${missCount} reports from this page.`;
    if (note) message += ` You wrote: "${note}".`;
    await commit(S.addReport(settings, { kind: 'missed', note, page: tab.url }, new Date()), 'miss|');
  }

  // Each action decides, draws and saves at once (see commit); a page is told before anything.
  async function act(name, entry) {
    if (name === 'site') {
      const site = S.siteKey(tab.url);
      message = '';
      return commit(S.setSite(settings, site, !S.coverState(settings, site).on));
    }
    if (name === 'all') {
      message = '';
      return commit(S.setEverywhere(settings, !settings.everywhere));
    }
    if (name === 'notgta' || name === 'remove') {
      // A second quick click on the same row does nothing: the first already acted (two clicks
      // inside one save once saved two reports, and one could never be taken back: review).
      if (Object.hasOwn(done, entry)) return undefined;
      let next;
      if (name === 'notgta') {
        browser.tabs.sendMessage(tab.id, { type: 'show-word', entry }).catch(() => {});
        next = S.addReport(settings, { kind: 'not-gta', word: entry, page: tab.url }, new Date());
        undos[entry] = { report: next.reports[0] };
        done[entry] = 'shown';
      } else {
        undos[entry] = { index: settings.added.indexOf(entry) };
        next = S.removeWord(settings, entry);
        done[entry] = 'removed';
      }
      message = '';
      // The focus goes to this row's Undo, never onto the next row's button, which a double
      // click or a second Enter would press (design review, 2026-11-18).
      return commit(next, `undo|${entry}`);
    }
    if (name === 'undo') {
      if (!Object.hasOwn(done, entry)) return undefined;
      const was = done[entry];
      const u = undos[entry] || {};
      let next;
      if (was === 'removed') {
        next = S.restoreWord(settings, entry, u.index);
        message = 'Back in your list and covered again.';
      } else {
        browser.tabs.sendMessage(tab.id, { type: 'cover-word', entry }).catch(() => {});
        const at = u.report ? settings.reports.findIndex((r) => r.at === u.report.at && r.page === u.report.page && r.word === u.report.word) : -1;
        next = at === -1 ? settings : S.removeReport(settings, at);
        message = 'Covered again; the report is taken back.';
      }
      delete done[entry];
      delete undos[entry];
      return commit(next, `${was === 'removed' ? 'remove' : 'notgta'}|${entry}`);
    }
    if (name === 'miss') {
      missOpen = true;
      message = '';
      render('miss-input|');
      return undefined;
    }
    if (name === 'miss-save') return saveMiss();
    if (name === 'miss-cancel') {
      missOpen = false;
      render('miss|');
      return undefined;
    }
    if (name === 'settings') {
      await browser.runtime.openOptionsPage();
      window.close();
    }
    return undefined;
  }

  box.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-act]');
    if (button) act(button.dataset.act, button.dataset.entry);
  });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'miss-input') {
      e.preventDefault();
      saveMiss();
    }
  });
  // The page's covers change after a switch or a "Not about GTA": redraw when the background
  // hears of it.
  browser.storage.onChanged.addListener(async (changes, area) => {
    if (area === 'session' && changes.tabs) {
      await loadCovers();
      render();
    }
  });

  await loadCovers();
  render();
  // Drawn: the tests wait for this title (the menu's window shows no title to the person).
  document.title = 'GTA Blocker menu';
})();
