// The background: an event page, unloaded when idle. It sets the toolbar icon (badge and
// tooltip) and keeps, per tab, the site and the covers each frame reports, in
// browser.storage.session, because its own memory goes when it is unloaded. Every decision is
// lib/tabs.js's handle() (micro-tested); this file only reads, writes and paints. It reaches no
// network and reads no page: it hears only our own content scripts and our own menu (Firefox
// gives web pages no way to message an extension).
(function () {
  'use strict';
  const { tabs: T } = GtaBlocker;
  const KEY = 'tabs';

  const readSwitch = async () => (await browser.storage.local.get('switch')).switch;

  async function paint(p) {
    if (!p) return;
    try {
      await browser.action.setBadgeText({ tabId: p.tabId, text: p.text });
      await browser.action.setBadgeBackgroundColor({ tabId: p.tabId, color: p.color });
      await browser.action.setBadgeTextColor({ tabId: p.tabId, color: p.textColor });
      await browser.action.setTitle({ tabId: p.tabId, title: p.title });
    } catch {
      // The tab closed meanwhile: nothing to paint.
    }
  }

  // One change at a time: two frames reporting at once must not both read the old state and
  // write over each other. A step that changes nothing writes nothing.
  let queue = Promise.resolve();
  function change(fn) {
    const next = queue.then(async () => {
      const state = (await browser.storage.session.get(KEY))[KEY] || {};
      const result = await fn(state);
      if (result.state !== state) await browser.storage.session.set({ [KEY]: result.state });
      return result;
    });
    queue = next.catch(() => {});
    return next;
  }

  browser.runtime.onMessage.addListener((raw, sender) => {
    if (!T.parse(raw)) return undefined;
    return change(async (state) => {
      const result = T.handle(state, raw, sender, await readSwitch());
      await paint(result.paint);
      return result;
    }).then((result) => result.reply);
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    change(async (state) => ({ state: T.forget(state, tabId) }));
  });

  // A change of the switch repaints every tab's icon at once ("off" or the count).
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.switch) return;
    change(async (state) => {
      await Promise.all(Object.keys(state).map((id) => paint(T.paintFor(state, Number(id), changes.switch.newValue))));
      return { state };
    });
  });
})();
