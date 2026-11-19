// The fake outside world for the macro tests: one local HTTP server that answers for every
// hostname. Firefox's test profile resolves every name to 127.0.0.1 (see firefox.mjs), so
// http://www.youtube.com:<port>/ lands here and gets tests/fixtures/www.youtube.com/index.html.
//
// Pages are stand-ins we write by hand, never copies of the real site: a test that depends on
// what YouTube serves today is a test that fails when YouTube changes, which is not a regression.

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

// A page named *.slow.html is sent in two parts, with this pause where it says <!-- PAUSE -->:
// a page still loading when covering starts (step 4's covering starts after the settings are
// read, so a short page is always fully loaded by then).
export const PAUSE_MS = 1000;
const PAUSE = '<!-- PAUSE -->';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// Maps a request to a file under FIXTURES_DIR, or null. Hostnames and paths come from the
// browser under test, so both are checked to stay inside the fixtures folder.
export function resolveFixture(hostHeader, urlPath, root = FIXTURES_DIR) {
  const host = String(hostHeader || '').replace(/:\d+$/, '').toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(host) || host.startsWith('.')) return null;
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(urlPath, 'http://x').pathname);
  } catch {
    return null;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const siteRoot = path.join(root, host);
  const file = path.join(siteRoot, pathname);
  if (file !== siteRoot && !file.startsWith(siteRoot + path.sep)) return null;
  return file;
}

export async function startFixtureServer() {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const host = String(req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
    requests.push({ host, path: req.url });
    const file = resolveFixture(req.headers.host, req.url);
    try {
      if (!file) throw new Error('outside fixtures');
      const body = await fs.readFile(file);
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      const text = file.endsWith('.slow.html') ? body.toString('utf8') : null;
      const at = text ? text.indexOf(PAUSE) : -1;
      if (at === -1) {
        res.end(body);
      } else {
        res.write(text.slice(0, at + PAUSE.length));
        setTimeout(() => res.end(text.slice(at + PAUSE.length)), PAUSE_MS);
      }
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`no fixture for ${host}${req.url}`);
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    port,
    requests,
    url: (host, urlPath = '/') => `http://${host}:${port}${urlPath}`,
    // closeAllConnections first: Firefox keeps connections open, and close() alone waits for them.
    close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }),
  };
}
