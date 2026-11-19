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

test('the manifest loads every lib file, before content.js, in the agreed order', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(EXTENSION, 'manifest.json'), 'utf8'));
  assert.equal(manifest.content_scripts.length, 1);
  const listed = manifest.content_scripts[0].js;
  assert.deepEqual(listed, ['lib/matcher.js', 'lib/cover.js', 'lib/settings.js', 'lib/tabs.js', 'lib/page.js', 'content.js']);
  assert.deepEqual(manifest.content_scripts[0].css, ['content.css']);
  const background = manifest.background?.scripts ?? [];
  for (const file of fs.readdirSync(path.join(EXTENSION, 'lib'))) {
    assert.ok(listed.includes(`lib/${file}`) || background.includes(`lib/${file}`), `lib/${file} is never loaded`);
  }
});

test('the manifest asks for no permission beyond the agreed ones', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(EXTENSION, 'manifest.json'), 'utf8'));
  // Agreed 2026-11-18: page access through the content script, and storage for the settings
  // (step 4). activeTab was agreed too, then dropped: in Firefox MV3 the content script's
  // <all_urls> already lets the add-on see every tab's address (checked in the test Firefox,
  // 2026-11-18), so it added nothing but a line in about:addons. Anything else needs the
  // user's yes first, then a line here.
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.equal(manifest.host_permissions, undefined, 'host_permissions would let it read other sites from the background');
  assert.equal(manifest.optional_permissions, undefined);
  assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions, { required: ['none'] });
});

test('the background is an event page that only loads our own files', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(EXTENSION, 'manifest.json'), 'utf8'));
  // Step 4: it sets the badge and adds up the covers each frame reports. An event page (no
  // "persistent") is unloaded when idle, so it keeps nothing in memory that matters.
  assert.deepEqual(manifest.background, { scripts: ['lib/matcher.js', 'lib/settings.js', 'lib/tabs.js', 'background.js'] });
  for (const file of manifest.background.scripts) assert.ok(fs.existsSync(path.join(EXTENSION, file)), `${file} is missing`);
});

test('the toolbar menu and the settings page are the agreed pages', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(EXTENSION, 'manifest.json'), 'utf8'));
  assert.equal(manifest.action.default_popup, 'pages/menu.html');
  assert.equal(manifest.action.default_area, 'navbar', 'the icon sits in the toolbar, not in the add-ons menu');
  assert.equal(manifest.action.default_title, 'GTA Blocker');
  assert.deepEqual(manifest.options_ui, { page: 'pages/settings.html', open_in_tab: true });
  for (const page of ['pages/menu.html', 'pages/settings.html']) {
    const html = fs.readFileSync(path.join(EXTENSION, page), 'utf8');
    // Extension pages load only their own files: no outside script, style or font.
    for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      assert.ok(!/^[a-z]+:/i.test(url) && !url.startsWith('//'), `${page} loads ${url}`);
    }
  }
});
