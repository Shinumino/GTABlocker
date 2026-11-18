// No file in the project contains an invisible or direction-changing character. Runs alone:
//   node --test tests/micro/source-text.test.mjs
//
// Such a character can make an editor or a review tool show a line differently from what it
// really is (a direction override can reorder the visible text of a line). On 2026-11-18 the
// file tool used to write this project turned typed \uXXXX escapes into the real characters,
// and matcher.js ended up holding a raw U+202E. Write them as \u{...} escapes instead.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKIP = new Set(['node_modules', '.git']);
const TEXT = /\.(m?js|json|md|cmd|html|css|txt)$|^\.git(ignore|attributes)$/;

function textFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIP.has(entry.name)) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return textFiles(full);
    return TEXT.test(entry.name) ? [full] : [];
  });
}

// Format characters and default-ignorable code points: zero-width spaces and joiners, the soft
// hyphen, direction marks, overrides and isolates, tags, the BOM.
const HIDDEN = /[\p{Cf}\p{DI}]/u;

test('no project file holds an invisible or direction-changing character', () => {
  const files = textFiles(PROJECT);
  assert.ok(files.length > 20, `found only ${files.length} files to check`);
  const hits = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const ch of line) {
        if (HIDDEN.test(ch)) hits.push(`${path.relative(PROJECT, file)}:${i + 1} U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
      }
    });
  }
  assert.deepEqual(hits, []);
});
