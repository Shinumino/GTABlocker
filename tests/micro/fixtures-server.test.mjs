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

test('a page named *.slow.html is sent in two parts, with a pause where it says <!-- PAUSE -->', async () => {
  // A page still loading when covering starts: the only way to see the page marked "ready"
  // too early, now that covering starts after the settings are read (mutation pass, step 4).
  const { startFixtureServer, PAUSE_MS, FIXTURES_DIR } = await import('../support/fixtures.mjs');
  const http = await import('node:http');
  const fs = await import('node:fs');
  const server = await startFixtureServer();
  try {
    const parts = await new Promise((resolve, reject) => {
      // Firefox reaches the server by name; Node, which resolves no test name, by address.
      http.get({ host: '127.0.0.1', port: server.port, path: '/stream.slow.html', headers: { host: `cover.test:${server.port}` } }, (res) => {
        const got = [];
        res.on('data', (chunk) => got.push([Date.now(), chunk.toString('utf8')]));
        res.on('end', () => resolve(got));
      }).on('error', reject);
    });
    const whole = parts.map(([, text]) => text).join('');
    assert.equal(whole, fs.readFileSync(path.join(FIXTURES_DIR, 'cover.test', 'stream.slow.html'), 'utf8'));
    const pauseAt = parts.findIndex(([, text]) => text.includes('<!-- PAUSE -->'));
    assert.ok(pauseAt >= 0, 'the first part ends at the pause');
    assert.ok(parts.at(-1)[0] - parts[pauseAt][0] >= PAUSE_MS - 50, `the rest came ${parts.at(-1)[0] - parts[pauseAt][0]} ms later`);
  } finally {
    await server.close();
  }
});
