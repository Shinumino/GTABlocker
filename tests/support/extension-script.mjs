// Loads extension scripts into Node for the micro tests, the same files Firefox loads.
//
// Content scripts in Firefox are classic scripts (no import/export), and scripts listed
// together in the manifest share one global scope. So each extension file adds its part to one
// object, GtaBlocker, on that global (decided 2026-11-18: no build step, so the file Firefox
// runs is exactly the file the tests checked). Here they run in a fresh vm context, which has
// the JavaScript built-ins and nothing else: a script that reached for document, window,
// process or require would fail here as it should. A test that needs a stand-in (a fake
// document) passes it in `globals`.
//
// The order comes from the manifest itself unless a test asks for less, so the tests and
// Firefox cannot load the files in different orders and both stay green.
//
// Values made in the context belong to another realm (another Array, another Object), and
// assert.deepStrictEqual compares prototypes, so tests compare plain copies (see plain()).

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const EXTENSION_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'extension');

export function readExtensionScript(relative) {
  return fs.readFileSync(path.join(EXTENSION_DIR, relative), 'utf8');
}

// The content scripts in the order the manifest loads them.
export function manifestScripts() {
  const manifest = JSON.parse(readExtensionScript('manifest.json'));
  return manifest.content_scripts[0].js;
}

// Runs the manifest's scripts in order, up to and including `until` (default: all of them), in
// one fresh context with `globals` added, and returns { GtaBlocker, context }.
export function loadExtensionScripts({ until, files, globals = {} } = {}) {
  let list = files ?? manifestScripts();
  if (until) {
    const end = list.indexOf(until);
    if (end === -1) throw new Error(`${until} is not in the manifest's content scripts`);
    list = list.slice(0, end + 1);
  }
  const context = vm.createContext({ ...globals });
  for (const relative of list) {
    vm.runInContext(readExtensionScript(relative), context, { filename: `extension/${relative}` });
  }
  return { GtaBlocker: context.GtaBlocker, context };
}

// A copy made of this realm's objects, for deepStrictEqual.
export const plain = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
