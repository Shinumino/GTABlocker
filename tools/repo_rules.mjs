// The rules behind tools/check_repo.mjs: nothing secret may be committed or signed.
//
// The only secrets this project has are the Mozilla add-ons signing keys (WEB_EXT_API_KEY and
// WEB_EXT_API_SECRET, for `web-ext sign` in step 7). They live in .env, which .gitignore leaves
// out; this check exists because an ignore line is a promise, and `git add -f` or a renamed
// file breaks it without a sound.
//
// What is read, and why each part is there:
// - the files git WOULD pick up (tracked, plus new files not ignored), as they are on disk;
// - what is STAGED, read from git itself: a key added and then removed from the working copy
//   only is still in the next commit (found in review, 2026-11-18);
// - every file under extension/, ignored or not, because signing uploads that whole folder.
//
// Nothing here prints a secret: only file names and the name of the variable that matched.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const SECRET_NAMES = ['WEB_EXT_API_KEY', 'WEB_EXT_API_SECRET'];

// A Mozilla add-ons API key (the JWT issuer) looks like user:<account>:<number>.
const AMO_KEY_PATTERN = /user:\d{4,}:\d{1,6}/;

// Values shorter than this are placeholders, and an empty one would match every file.
const MIN_SECRET_LENGTH = 8;

const ENV_FILE = /^\.env(\..+)?$/;

// The bytes as UTF-16 text, decoded from a fresh copy of even length. Node 24.19 kills the
// whole process with no message (Windows reports heap corruption, 0xC0000374; Git Bash showed
// exit 127) decoding a slice that starts at an odd byte with an odd length of a few KB, and
// staged copies are slices of git's single output buffer. A fresh Buffer.alloc starts at
// offset 0, and an odd last byte cannot hold a UTF-16 character anyway.
function utf16Text(bytes) {
  const even = Buffer.alloc(bytes.length - (bytes.length % 2));
  bytes.copy(even, 0, 0, even.length);
  return even.toString('utf16le');
}

// files: [{ path, bytes }]. secrets: [[name, value]]. Returns one line per problem.
export function findProblems(files, secrets) {
  const problems = [];
  const known = secrets.filter(([, value]) => typeof value === 'string' && value.length >= MIN_SECRET_LENGTH);
  for (const { path: label, bytes } of files) {
    // A label can end in " (staged)"; the rule is about the file's own name.
    const base = path.posix.basename(label.replace(/ \(staged\)$/, '').replaceAll('\\', '/'));
    if (ENV_FILE.test(base) && base !== '.env.example') {
      problems.push(`${label}: an .env file would be committed (it holds the signing keys)`);
      continue;
    }
    if (AMO_KEY_PATTERN.test(bytes.toString('latin1')) || AMO_KEY_PATTERN.test(utf16Text(bytes))) {
      problems.push(`${label}: contains something shaped like a Mozilla add-ons API key (user:<number>:<number>)`);
    }
    for (const [name, value] of known) {
      if (bytes.includes(Buffer.from(value, 'utf8')) || bytes.includes(Buffer.from(value, 'utf16le'))) {
        problems.push(`${label}: contains the value of ${name}`);
      }
    }
  }
  return problems;
}

// Reads KEY=value lines the way people write them: optional `export `, optional quotes, and a
// ` # comment` after an unquoted value. Returns [[name, value]] for the signing keys only.
export function parseEnv(text) {
  const pairs = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || !SECRET_NAMES.includes(match[1])) continue;
    let value = match[2];
    const quoted = /^(['"])(.*)\1$/.exec(value);
    value = quoted ? quoted[2] : value.replace(/\s+#.*$/, '');
    pairs.push([match[1], value]);
  }
  return pairs;
}

// The signing keys from the environment AND from the project's .env, both searched: a stale
// variable in the environment must not hide the real key in the file.
export function readSecrets(rootDir, env = process.env) {
  let text = '';
  try {
    text = fs.readFileSync(path.join(rootDir, '.env'), 'utf8');
  } catch {
    // No .env is fine: there may be no keys yet.
  }
  const pairs = parseEnv(text);
  for (const name of SECRET_NAMES) if (env[name]) pairs.push([name, env[name]]);
  const seen = new Set();
  return pairs.filter(([name, value]) => value && !seen.has(name + '\0' + value) && seen.add(name + '\0' + value));
}

function git(rootDir, args, input) {
  const result = spawnSync('git', args, { cwd: rootDir, input, maxBuffer: 512 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    const why = result.error?.message || result.stderr.toString().trim();
    throw new Error(`git could not read ${rootDir}: ${why}`);
  }
  return result.stdout;
}

// Paths relative to rootDir, as git sees them: tracked, plus new files that are not ignored.
export function listRepoFiles(rootDir) {
  return git(rootDir, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).toString('utf8').split('\0').filter(Boolean);
}

// The staged copy of every file, read from git's index: [{ path, bytes }].
export function readStagedFiles(rootDir) {
  const entries = git(rootDir, ['ls-files', '-s', '-z']).toString('utf8').split('\0').filter(Boolean).map((entry) => {
    const [meta, filePath] = entry.split('\t');
    const [mode, sha] = meta.split(' ');
    return { mode, sha, path: filePath };
  }).filter((e) => e.mode !== '160000'); // a submodule entry is a commit, not a file
  if (entries.length === 0) return [];
  const out = git(rootDir, ['cat-file', '--batch'], entries.map((e) => e.sha).join('\n') + '\n');
  const files = [];
  let offset = 0;
  for (const entry of entries) {
    const newline = out.indexOf(0x0a, offset);
    const header = out.subarray(offset, newline).toString('utf8').split(' ');
    if (header[1] !== 'blob') throw new Error(`git did not return the staged copy of ${entry.path}`);
    const size = Number(header[2]);
    files.push({ path: entry.path, bytes: out.subarray(newline + 1, newline + 1 + size) });
    offset = newline + 1 + size + 1;
  }
  return files;
}

function walk(dir, rootDir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full, rootDir);
    return entry.isFile() ? [path.relative(rootDir, full).replaceAll('\\', '/')] : [];
  });
}

// Everything the check reads, labelled: working copy, the extension folder, and the staged copies.
export function gatherFiles(rootDir) {
  const onDisk = new Set(listRepoFiles(rootDir));
  for (const p of walk(path.join(rootDir, 'extension'), rootDir)) onDisk.add(p);
  const files = [];
  for (const p of onDisk) {
    const full = path.join(rootDir, p);
    // Listed by git but gone from disk (deleted, not yet staged): its staged copy is read below.
    if (!fs.existsSync(full)) continue;
    files.push({ path: p, bytes: fs.readFileSync(full) });
  }
  for (const staged of readStagedFiles(rootDir)) files.push({ path: `${staged.path} (staged)`, bytes: staged.bytes });
  return files;
}
