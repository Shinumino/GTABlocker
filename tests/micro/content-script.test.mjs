// extension/content.js: it reads the user's switch and words, asks the background which site
// the tab is on, and starts the page side (lib/page.js) only when the switch says so, with the
// user's word list; it follows every change of the settings live, keeps the page's state (Show
// anyway, the words shown again) from one start to the next, and never lets the user's own
// words reach the page. The page is marked "ready" only when the page side says its first look
// is done (or covering is off), so Journey 0 (tests/macro/extension-loads.test.mjs) can only go
// green on a working extension. Runs alone:
//   node --test tests/micro/content-script.test.mjs
//
// The page side needs a real page, and browser.* a real Firefox; here stand-ins record what
// they were asked, and the test decides what they answer.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadExtensionScripts, readExtensionScript } from '../support/extension-script.mjs';

const LIBS = ['lib/matcher.js', 'lib/cover.js', 'lib/settings.js', 'lib/tabs.js'];
const DEFAULTS = [...loadExtensionScripts({ files: ['lib/matcher.js'] }).GtaBlocker.matcher.DEFAULT_ENTRIES];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const json = (v) => JSON.parse(JSON.stringify(v));

function fakeDocument() {
  const attributes = new Map();
  return { attributes, documentElement: { setAttribute: (name, value) => attributes.set(name, String(value)) } };
}

// A stand-in for GtaBlocker.page: remembers each start, and what each run was asked.
function fakePage({ ready = true } = {}) {
  const runs = [];
  return {
    runs,
    page: {
      start(options) {
        const run = { options, stopped: false, shown: [], covered: [], retold: 0 };
        runs.push(run);
        if (ready) options.onReady();
        return {
          stop: () => { run.stopped = true; return { cover: null, revealedAt: 'kept', siteTitle: 't', dismissed: { key: 'k', entries: ['gta*'] } }; },
          show: (entry) => run.shown.push(entry),
          cover: (entry) => run.covered.push(entry),
          retell: () => { run.retold += 1; },
        };
      },
    },
  };
}

// A stand-in for browser.*. stored: { switch, words } as browser.storage.local holds them;
// tabSite: what the background answers hello with; helloHangs: it never answers (a backed-up
// queue); onGet: runs while the settings are being read.
function fakeBrowser({ stored, tabSite, helloFails = false, helloHangs = false, onGet } = {}) {
  const sent = [];
  const asked = [];
  const storageListeners = [];
  const messageListeners = [];
  const api = {
    sent, asked,
    change: (changes) => storageListeners.forEach((fn) => fn(Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, { newValue: v }])), 'local')),
    message: (msg) => messageListeners.forEach((fn) => fn(msg)),
  };
  api.browser = {
    storage: {
      local: {
        get: async (keys) => {
          asked.push(keys);
          if (onGet) onGet(api);
          return stored === undefined ? {} : { ...stored };
        },
      },
      onChanged: { addListener: (fn) => storageListeners.push(fn) },
    },
    runtime: {
      sendMessage: async (msg) => {
        sent.push(msg);
        if (msg.type === 'hello') {
          if (helloFails) throw new Error('no background');
          if (helloHangs) return new Promise(() => {});
          return { site: tabSite === undefined ? msg.site : tabSite };
        }
        return {};
      },
      onMessage: { addListener: (fn) => messageListeners.push(fn) },
    },
  };
  return api;
}

function fakeWindow() {
  const listeners = {};
  return {
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    fire: (type, event) => (listeners[type] || []).forEach((fn) => fn(event)),
  };
}

const globalsFor = ({ document, browser, url, page, window }) => ({
  document, browser, window, location: { href: url }, URL, setTimeout, clearTimeout, GtaBlocker: { page },
});

async function boot({ stored, tabSite, url = 'https://www.youtube.com/watch?v=1', helloFails, helloHangs, ready, onGet, wait = 20 } = {}) {
  const document = fakeDocument();
  const { runs, page } = fakePage({ ready });
  const fake = fakeBrowser({ stored, tabSite, helloFails, helloHangs, onGet });
  const window = fakeWindow();
  const { GtaBlocker } = loadExtensionScripts({ files: [...LIBS, 'content.js'], globals: globalsFor({ document, browser: fake.browser, url, page, window }) });
  await sleep(wait);
  return { document, runs, fake, window, GtaBlocker };
}

test('with nothing stored, the page side starts with the built-in list, and the page is marked ready', async () => {
  const { document, runs } = await boot();
  assert.equal(runs.length, 1);
  assert.deepEqual([...runs[0].options.matcher.entries], DEFAULTS);
  assert.equal(runs[0].options.matcher.find('GTA 6 trailer'), 'gta*');
  assert.equal(document.attributes.get('data-gta-blocker'), 'ready');
});

test('a full list of own words still uses every built-in word, a later version\u{2019}s new ones included', async () => {
  // The cap of 200 is on what the person adds. The matcher had a cap of its own, so a list full
  // under 0.1.0 (186 own words and 14 built-in) lost "jason" and "lucia" without a word
  // (correctness and security review, 0.1.2).
  const added = Array.from({ length: 186 }, (_, i) => `own word ${i}`);
  const { runs } = await boot({ stored: { words: { added, removed: [] } } });
  assert.equal(runs[0].options.matcher.entries.length, 186 + DEFAULTS.length);
  assert.equal(runs[0].options.matcher.find('Jason'), 'jason');
});

test('the page is not marked ready before the page side has finished its first look', async () => {
  const { document, runs } = await boot({ ready: false });
  assert.equal(document.attributes.get('data-gta-blocker'), undefined);
  runs[0].options.onReady();
  assert.equal(document.attributes.get('data-gta-blocker'), 'ready');
});

test('a page reads only the switch and the words, never the reports', async () => {
  const { fake } = await boot();
  assert.deepEqual(json(fake.asked), [['switch', 'words']]);
});

test('off on this site: the page side never starts, the icon is told "no covers", the page is ready', async () => {
  const { document, runs, fake } = await boot({ stored: { switch: { offSites: ['youtube.com'] } } });
  assert.equal(runs.length, 0);
  assert.equal(document.attributes.get('data-gta-blocker'), 'ready');
  await sleep(250);
  assert.deepEqual(json(fake.sent.filter((m) => m.type === 'covers')), [{ type: 'covers', counts: {} }]);
});

test('a frame follows the site of the tab, as the background tells it', async () => {
  const off = await boot({ stored: { switch: { offSites: ['reddit.com'] } }, url: 'https://www.youtube.com/embed/x', tabSite: 'reddit.com' });
  assert.equal(off.runs.length, 0, 'a YouTube player inside Reddit is off with Reddit');
  assert.deepEqual(json(off.fake.sent[0]), { type: 'hello', site: 'youtube.com' });
  const on = await boot({ stored: { switch: { offSites: ['youtube.com'] } }, url: 'https://www.youtube.com/embed/x', tabSite: 'reddit.com' });
  assert.equal(on.runs.length, 1);
});

test('a page with no site address (a local file) is covered, and follows Everywhere', async () => {
  assert.equal((await boot({ url: 'file:///C:/page.html' })).runs.length, 1);
  assert.equal((await boot({ url: 'file:///C:/page.html', stored: { switch: { everywhere: false } } })).runs.length, 0);
});

test('without an answer from the background, the frame decides by its own address', async () => {
  const { runs } = await boot({ stored: { switch: { offSites: ['youtube.com'] } }, helloFails: true });
  assert.equal(runs.length, 0);
});

test('a background that does not answer holds covering up for a moment only', async () => {
  // A page can back up the background's queue (security review): covering must not wait on it.
  const { runs } = await boot({ helloHangs: true, wait: 50 });
  assert.equal(runs.length, 0, 'still waiting, briefly');
  await sleep(1100);
  assert.equal(runs.length, 1, 'covering started without the answer, by its own address');
});

test('a settings change made while the page starts is not lost', async () => {
  // The switch goes off at the moment the page reads its settings: the old value is read, and
  // the change must still arrive (security and correctness reviews).
  const { runs } = await boot({ onGet: (fake) => fake.change({ switch: { everywhere: false } }) });
  assert.ok(runs.length === 0 || runs.every((r) => r.stopped), 'off, as the person set it');
});

test('a settings change is followed live: off stops, on starts again with the page state kept', async () => {
  const { runs, fake } = await boot();
  fake.change({ switch: { offSites: ['youtube.com'] } });
  assert.equal(runs[0].stopped, true);
  assert.equal(runs.length, 1);
  fake.change({ switch: { offSites: [] } });
  assert.equal(runs.length, 2);
  assert.equal(runs[1].options.pageState.revealedAt, 'kept', 'Show anyway outlives the switch');
  assert.deepEqual(json(runs[1].options.pageState.dismissed), { key: 'k', entries: ['gta*'] }, 'so do the words shown again');
  // A change that is not about covering here does not restart the page side.
  fake.change({ switch: { offSites: ['reddit.com'] } });
  fake.change({ reports: [] });
  assert.equal(runs.length, 2);
});

test('a frame that stays off sends nothing more when the settings change (one report once woke every frame)', async () => {
  const { fake } = await boot({ stored: { switch: { offSites: ['youtube.com'] } } });
  await sleep(250);
  const before = fake.sent.length;
  fake.change({ switch: { offSites: ['youtube.com', 'reddit.com'] } });
  fake.change({ words: { added: ['trevor philips'] } });
  await sleep(250);
  assert.equal(fake.sent.length, before);
});

test("a new word list restarts the page side with it; the user's own words never reach the page", async () => {
  const { runs, fake } = await boot();
  fake.change({ words: { added: ['trevor philips'], removed: DEFAULTS.filter((w) => w !== 'gta*') } });
  assert.equal(runs[0].stopped, true);
  const { options } = runs[1];
  assert.deepEqual([...options.matcher.entries], ['trevor philips', 'gta*']);
  assert.equal(options.label('trevor philips'), 'a word from your list');
  assert.equal(options.label('gta*'), 'gta*');
});

test('"Not about GTA" and its Undo from the menu reach the page side; anything else is ignored', async () => {
  const { runs, fake } = await boot();
  fake.message({ type: 'show-word', entry: 'gta*' });
  fake.message({ type: 'cover-word', entry: 'gta*' });
  fake.message({ type: 'show-word', entry: 'x'.repeat(201) });
  fake.message({ type: 'show-word', entry: 42 });
  fake.message({ type: 'covers', entry: 'gta*' });
  fake.message(null);
  assert.deepEqual(runs[0].shown, ['gta*']);
  assert.deepEqual(runs[0].covered, ['gta*']);
});

test('page events a site can fake are ignored; only a real pagehide takes the covers off the icon', async () => {
  const { fake, window } = await boot();
  await sleep(250);
  const before = fake.sent.length;
  for (let i = 0; i < 50; i++) window.fire('pagehide', { isTrusted: false });
  assert.equal(fake.sent.length, before, 'a page flooding fake pagehide events sends nothing');
  window.fire('pagehide', { isTrusted: true });
  assert.deepEqual(json(fake.sent.at(-1)), { type: 'covers', counts: {} });
});

test('a page restored by Back says hello and its covers again', async () => {
  const { fake, window, runs } = await boot();
  const hellos = () => fake.sent.filter((m) => m.type === 'hello').length;
  window.fire('pageshow', { isTrusted: true, persisted: false });
  window.fire('pageshow', { isTrusted: false, persisted: true });
  assert.equal(hellos(), 1, 'a first load, or a fake event: no second hello');
  window.fire('pageshow', { isTrusted: true, persisted: true });
  await sleep(400);
  assert.equal(hellos(), 2);
  assert.equal(runs[0].retold, 1);
});

test('the covers sent to the icon are throttled, and the last one always arrives', async () => {
  const { fake, runs } = await boot();
  const covers = () => fake.sent.filter((m) => m.type === 'covers');
  await sleep(250);
  const at = covers().length;
  for (let i = 1; i <= 5; i++) runs[0].options.onCovers({ 'gta*': i });
  await sleep(250);
  assert.equal(covers().length, at + 1, 'five changes, one message');
  assert.deepEqual(json(covers().at(-1)), { type: 'covers', counts: { 'gta*': 5 } });
});

test('a list that the matcher refuses whole marks the page "error" and starts nothing', async () => {
  const { document, runs } = await boot({ stored: { words: { added: ['ab', 'x*y'], removed: DEFAULTS } } });
  assert.equal(runs.length, 0);
  assert.equal(document.attributes.get('data-gta-blocker'), 'error');
});

test('an empty list covers nothing and is not an error', async () => {
  const { document, runs } = await boot({ stored: { words: { added: [], removed: DEFAULTS } } });
  assert.equal(runs.length, 1);
  assert.deepEqual([...runs[0].options.matcher.entries], []);
  assert.equal(document.attributes.get('data-gta-blocker'), 'ready');
});

test('the page marker only ever says ready or error: never the list, never the switch', async () => {
  for (const stored of [undefined, { words: { added: ['trevor philips'] } }, { switch: { everywhere: false } }, { switch: { offSites: ['youtube.com'] } }]) {
    const { document } = await boot({ stored });
    assert.deepEqual([...document.attributes.keys()], ['data-gta-blocker']);
    assert.ok(['ready', 'error'].includes(document.attributes.get('data-gta-blocker')));
  }
});

test('without the libraries loaded first, content.js stops before marking anything', () => {
  const document = fakeDocument();
  assert.throws(() => loadExtensionScripts({ files: ['content.js'], globals: { document } }), /GtaBlocker is not defined/);
  assert.equal(document.attributes.size, 0);
});

test('content.js leaves nothing of its own in the shared global scope', async () => {
  // Scripts listed together share one global scope; a top-level const there would clash with
  // the same name in a later file and stop it with a SyntaxError.
  const document = fakeDocument();
  const { page } = fakePage();
  const fake = fakeBrowser();
  const { context } = loadExtensionScripts({ files: LIBS, globals: globalsFor({ document, browser: fake.browser, url: 'https://x.test/', page, window: fakeWindow() }) });
  const before = new Set(Object.keys(context));
  vm.runInContext(readExtensionScript('content.js'), context, { filename: 'extension/content.js' });
  assert.deepEqual(Object.keys(context).filter((k) => !before.has(k)), []);
  assert.doesNotThrow(() => vm.runInContext(readExtensionScript('content.js'), context), 'running it twice clashed');
  await sleep(20);
});
