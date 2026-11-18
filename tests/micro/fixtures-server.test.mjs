// Which file the fixture server answers with. Runs alone:
//   node --test tests/micro/fixtures-server.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resolveFixture } from '../support/fixtures.mjs';

// Deep on purpose: with a root near the drive root, an escape upwards can land on a path that
// does not exist and a broken check would still look safe.
const root = path.join(path.sep, 'proj', 'tests', 'fixtures');
const youtube = path.join(root, 'www.youtube.com');

test('a hostname picks its own folder, and a folder path means index.html', () => {
  assert.equal(resolveFixture('www.youtube.com:51234', '/', root), path.join(youtube, 'index.html'));
  assert.equal(resolveFixture('WWW.Reddit.com', '/r/games/?sort=new', root), path.join(root, 'www.reddit.com', 'r', 'games', 'index.html'));
  assert.equal(resolveFixture('x.com', '/home.html', root), path.join(root, 'x.com', 'home.html'));
});

test('a request can never reach a file outside its own site folder', () => {
  for (const [host, urlPath] of [
    ['www.youtube.com', '/../../secret.txt'],
    ['www.youtube.com', '/%2e%2e/%2e%2e/secret.txt'],
    ['www.youtube.com', '/..%5c..%5csecret.txt'],
    // A sibling folder whose name starts with this one's: www.youtube.com.br.
    ['www.youtube.com', '/..%5cwww.youtube.com.br%5cx.html'],
    ['..', '/x'],
    ['.youtube.com', '/x'],
    ['you tube', '/x'],
    ['', '/x'],
  ]) {
    const file = resolveFixture(host, urlPath, root);
    assert.ok(file === null || file.startsWith(youtube + path.sep), `${host} ${urlPath} -> ${file}`);
  }
});

test('the hostname ".." alone is refused, not mapped to the folder above', () => {
  assert.equal(resolveFixture('..', '/tests/micro/check-repo.test.mjs', root), null);
});
