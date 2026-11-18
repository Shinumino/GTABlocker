// Promises about the shipped extension that are easy to break by accident, made into tests.
// Runs alone:
//   node --test tests/micro/extension-rules.test.mjs
//
// "No network access" was a promise until this file: a content script that runs on every
// page may call fetch() on any address, and nothing in Firefox stops it. Here it is a rule.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXTENSION = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'extension');

function scripts(dir = EXTENSION) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return scripts(full);
    return /\.(m?js|html)$/.test(entry.name) ? [full] : [];
  });
}

// Every way a page script can reach the network on its own.
const NETWORK = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|RTCPeerConnection)\b/;

test('no extension code reaches the network', () => {
  const files = scripts();
  assert.ok(files.length > 0, 'found no extension scripts to check');
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const hit = NETWORK.exec(text);
    assert.equal(hit, null, `${path.relative(EXTENSION, file)} uses ${hit?.[0]}`);
  }
});

test('the manifest asks for no permission beyond the agreed ones', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(EXTENSION, 'manifest.json'), 'utf8'));
  // Agreed 2026-11-18: page access through the content script, and storage for the settings
  // (from step 4). Anything else needs the user's yes first, then a line here.
  const allowed = new Set(['storage']);
  for (const permission of manifest.permissions ?? []) {
    assert.ok(allowed.has(permission), `unagreed permission: ${permission}`);
  }
  assert.equal(manifest.host_permissions, undefined, 'host_permissions would let it read other sites from the background');
  assert.equal(manifest.background, undefined, 'a background script is not part of the design yet');
  assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions, { required: ['none'] });
});
