// The repo check, step 1 of check.cmd: refuses anything secret in what would be committed or
// signed. The rules are in repo_rules.mjs.
//
// This file always runs its check when started. It used to run only when it guessed it was
// the main script, and that guess failed through a folder junction: the check then exited 0
// having read nothing (found in review, 2026-11-18).
//
// Usage: node tools/check_repo.mjs [folder]   (default: this project)

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findProblems, gatherFiles, readSecrets } from './repo_rules.mjs';

const rootDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let files;
try {
  files = gatherFiles(rootDir);
} catch (err) {
  console.error('Repo check FAILED: could not list the files with git.');
  console.error(`  ${err.message.split('\n')[0]}`);
  console.error('  If this folder is not a git repository yet, run `git init` here, then check.cmd again.');
  process.exit(1);
}

const problems = findProblems(files, readSecrets(rootDir));
if (problems.length > 0) {
  console.error('Repo check FAILED:');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error('Take these out before committing (for a staged file: git rm --cached <file>).');
  console.error('If one was ever committed, treat that key as leaked and make a new one on addons.mozilla.org.');
  process.exit(1);
}
console.log(`Repo check OK (${files.length} files read, no keys or .env files)`);
