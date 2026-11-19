// Driving the add-on's own interface in the test Firefox, the way a person does: the real
// toolbar icon, its real menu, and the settings page. Needs a Firefox started with
// systemAccess (see firefox.mjs), because the toolbar is Firefox's own interface.
//
// What works, checked on Firefox 160 (2026-11-18): a WebDriver click on the icon's button in the
// chrome context opens the menu (a plain .click() does not); the menu is a separate process, so
// a test cannot switch into it, but real key presses reach it. So a test drives the menu with
// the keyboard and checks what the menu DID: the page, the icon's badge, the settings page.

export const ADDON_ID = '{b5f8e9f0-9312-4fa5-90f0-2c21a45ed256}';
// A fixed moz-extension:// address for the add-on in the test Firefox, so a test can open the
// settings page (Firefox gives each install a random one otherwise).
export const ADDON_UUID = '5d1f3a2e-0000-4000-8000-00000000c0de';
export const ADDON_PREFS = { 'extensions.webextensions.uuids': JSON.stringify({ [ADDON_ID]: ADDON_UUID }) };
const WIDGET = `${ADDON_ID.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}-browser-action`;
const BUTTON = `#${WIDGET.replace(/[{}]/g, '\\$&')} toolbarbutton`;
const POPUP = 'browser.webextension-popup-browser';
export const SETTINGS_URL = `moz-extension://${ADDON_UUID}/pages/settings.html`;
export const MENU_URL = `moz-extension://${ADDON_UUID}/pages/menu.html`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function inChrome(firefox, fn) {
  await firefox.marionette.send('Marionette:SetContext', { value: 'chrome' });
  try {
    return await fn();
  } finally {
    await firefox.marionette.send('Marionette:SetContext', { value: 'content' });
  }
}

const chromeScript = async (firefox, script, args = []) => (await firefox.marionette.send('WebDriver:ExecuteScript', { script, args }))?.value;

async function keys(firefox, values) {
  const codes = { Escape: '\u{E00C}', Enter: '\u{E007}', Tab: '\u{E004}', Space: ' ', ShiftTab: null };
  const actions = [];
  for (const name of values) {
    if (name === 'ShiftTab') {
      actions.push({ type: 'keyDown', value: '\u{E008}' }, { type: 'keyDown', value: codes.Tab }, { type: 'keyUp', value: codes.Tab }, { type: 'keyUp', value: '\u{E008}' });
      continue;
    }
    const value = codes[name] ?? (name.length === 1 ? name : undefined);
    if (value === undefined) throw new Error(`no key code for ${name}`);
    actions.push({ type: 'keyDown', value }, { type: 'keyUp', value });
  }
  await firefox.marionette.send('WebDriver:PerformActions', { actions: [{ type: 'key', id: 'keyboard', actions }] });
  await firefox.marionette.send('WebDriver:ReleaseActions');
}

// What the toolbar icon shows: its badge text ('' when none) and its tooltip.
export async function iconState(firefox) {
  return inChrome(firefox, () => chromeScript(firefox, `
    const b = document.querySelector(arguments[0]);
    return b ? { badge: b.getAttribute('badge') || '', label: b.getAttribute('label') || '' } : null;`, [BUTTON]));
}

// Waits for the icon's badge to read `text`.
export async function waitForBadge(firefox, text, { timeoutMs = 5_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await iconState(firefox);
    if (last && last.badge === text) return last;
    await sleep(100);
  }
  throw new Error(`the icon's badge did not read ${JSON.stringify(text)}; last: ${JSON.stringify(last)}`);
}

// Opens the real menu with a real click on the icon, and waits until its page has loaded.
export async function openMenu(firefox) {
  await inChrome(firefox, async () => {
    const found = await firefox.marionette.send('WebDriver:FindElement', { using: 'css selector', value: BUTTON });
    await firefox.marionette.send('WebDriver:ElementClick', { id: Object.values(found.value ?? found)[0] });
    const deadline = Date.now() + 5_000;
    for (;;) {
      const ready = await chromeScript(firefox, `
        const p = document.querySelector(arguments[0]);
        return Boolean(p && p.closest('panel') && p.closest('panel').state === 'open' && p.contentTitle === 'GTA Blocker menu');`, [POPUP]);
      if (ready) break;
      if (Date.now() > deadline) throw new Error('the menu did not open');
      await sleep(100);
    }
    // A Firefox with a window gives an opened menu the keyboard; headless Firefox does not
    // (checked 2026-11-18: the focus stayed on the browser window, and keys went nowhere), so
    // the test does what the windowed Firefox does on its own.
    await chromeScript(firefox, 'document.querySelector(arguments[0]).focus();', [POPUP]);
    // The menu fills itself from the background; give it a moment to draw.
    await sleep(300);
  });
}

export async function menuIsOpen(firefox) {
  return inChrome(firefox, () => chromeScript(firefox, `
    const p = document.querySelector(arguments[0]);
    return Boolean(p && p.closest('panel') && p.closest('panel').state === 'open');`, [POPUP]));
}

// Real key presses into the open menu: 'Tab', 'ShiftTab', 'Space', 'Enter', 'Escape', or text.
export async function menuKeys(firefox, values) {
  await inChrome(firefox, () => keys(firefox, values));
  await sleep(250);
}

// Opens one of the add-on's pages in a new tab and switches the test to it. Returns the handle
// of the tab the test was on, to come back with backToTab. The menu page opened this way runs
// in a tab of its own (its tab is an add-on page, so it shows only Everywhere): it lets a test
// click inside it, which the real menu's separate process does not allow.
export async function openPage(firefox, url) {
  const value = (r) => r?.value ?? r;
  const prev = value(await firefox.marionette.send('WebDriver:GetWindowHandle'));
  const known = value(await firefox.marionette.send('WebDriver:GetWindowHandles'));
  await inChrome(firefox, () => chromeScript(firefox, `
    const tab = gBrowser.addTab(arguments[0], { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
    gBrowser.selectedTab = tab;`, [url]));
  const added = value(await firefox.marionette.send('WebDriver:GetWindowHandles')).find((h) => !known.includes(h));
  if (!added) throw new Error(`${url} did not open`);
  await firefox.marionette.send('WebDriver:SwitchToWindow', { handle: added });
  return prev;
}

// Opens the settings page in a new tab and switches the test to it. Returns the handle of the
// tab the test was on, to come back with backToTab.
export async function openSettings(firefox) {
  const value = (r) => r?.value ?? r;
  const prev = value(await firefox.marionette.send('WebDriver:GetWindowHandle'));
  const known = value(await firefox.marionette.send('WebDriver:GetWindowHandles'));
  await inChrome(firefox, () => chromeScript(firefox, `
    const tab = gBrowser.addTab(arguments[0], { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
    gBrowser.selectedTab = tab;`, [SETTINGS_URL]));
  const added = value(await firefox.marionette.send('WebDriver:GetWindowHandles')).find((h) => !known.includes(h));
  if (!added) throw new Error('the settings tab did not open');
  await firefox.marionette.send('WebDriver:SwitchToWindow', { handle: added });
  await firefox.waitForPage('the settings page', "return document.readyState === 'complete' && document.documentElement.hasAttribute('data-ready')");
  return prev;
}

export async function backToTab(firefox, handle) {
  await firefox.marionette.send('WebDriver:CloseWindow');
  await firefox.marionette.send('WebDriver:SwitchToWindow', { handle });
  await inChrome(firefox, () => chromeScript(firefox, 'return true;'));
}
