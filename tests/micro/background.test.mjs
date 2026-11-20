// extension/background.js: what it does with the stored words when the add-on is updated.
// Every other decision of the background is lib/tabs.js's (tabs-rules.test.mjs). Runs alone:
//   node --test tests/micro/background.test.mjs
//
// The rule (design, correctness and security review, 0.1.2): an own word that the new version
// builds in is read as the built-in one (settings.js read()), and the background saves that
// once, after the update. Saved only on the person's next edit, what a later version did with
// the word depended on whether they had edited the list in between.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadExtensionScripts, plain } from '../support/extension-script.mjs';

const FILES = ['lib/matcher.js', 'lib/settings.js', 'lib/tabs.js', 'background.js'];

// A stand-in for browser.*, as the background uses it.
function start(stored) {
  const listeners = {};
  const sets = [];
  const gets = [];
  const on = (name) => ({ addListener: (fn) => { listeners[name] = fn; } });
  const area = (data) => ({
    get: async (key) => { gets.push(key); return typeof key === 'string' ? (key in data ? { [key]: data[key] } : {}) : { ...data }; },
    set: async (items) => { sets.push(plain(items)); Object.assign(data, items); },
  });
  const browser = {
    storage: { local: area(stored), session: area({}), onChanged: on('storageChanged') },
    runtime: { onMessage: on('message'), onInstalled: on('installed') },
    tabs: { onRemoved: on('tabRemoved') },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setBadgeTextColor: async () => {}, setTitle: async () => {} },
  };
  loadExtensionScripts({ files: FILES, globals: { browser, URL } });
  return { listeners, sets: () => sets.filter((s) => 'words' in s), reads: () => gets.filter((k) => k === 'words').length };
}

test('after an update, own words this version builds in are saved as the built-in ones, once', async () => {
  const bg = start({ words: { added: ['jason', 'Lucia', 'trevor philips', 'Rockstar'], removed: ['vice city'] } });
  assert.equal(typeof bg.listeners.installed, 'function', 'the background listens for the update');
  await bg.listeners.installed({ reason: 'update', previousVersion: '0.1.1' });
  assert.deepEqual(bg.sets(), [{ words: { added: ['trevor philips'], removed: ['vice city'] } }]);
});

test('a first install does not even read the stored words', async () => {
  // Read then, the add-on never covered some pages in the test Firefoxes (2026-11-20: whole
  // journey files, three runs in a row; mutation pass, W15).
  const bg = start({ words: { added: ['jason'], removed: [] } });
  await bg.listeners.installed({ reason: 'install' });
  assert.equal(bg.reads(), 0);
  assert.deepEqual(bg.sets(), []);
});

test('an update with nothing to change, or a first install, writes nothing', async () => {
  const same = start({ words: { added: ['trevor philips'], removed: ['vice city'] } });
  await same.listeners.installed({ reason: 'update', previousVersion: '0.1.1' });
  assert.deepEqual(same.sets(), []);
  const fresh = start({});
  await fresh.listeners.installed({ reason: 'install' });
  await fresh.listeners.installed({ reason: 'update', previousVersion: '0.1.1' });
  assert.deepEqual(fresh.sets(), [], 'nothing stored: the built-in list needs no saving');
});
