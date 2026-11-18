// The gate: everything a release must pass, cheapest first. check.cmd runs this. The signing
// command (step 7, not built yet) will run it first and send nothing to Mozilla on a red run.
//
// There is no CI service behind this project (no remote), so this file is the whole of it.
// Each step runs as its own process and the first red one stops the run with exit 1. A step
// that cannot start, or runs past its time limit, is red as well.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;
const webExt = path.join(root, 'node_modules', 'web-ext', 'bin', 'web-ext.js');
// npm ships next to node. Calling its script directly avoids npm.cmd, which Node refuses to
// spawn without a shell since the 2024 batch-file fix.
const npmCli = path.join(path.dirname(node), 'node_modules', 'npm', 'bin', 'npm-cli.js');

const MINUTE = 60_000;
// GTAB_STEP_TIMEOUT_MS replaces every step's limit; only the gate's own tests set it, to prove
// that a hanging step is stopped and counted red without waiting minutes.
const stepOverride = Number(process.env.GTAB_STEP_TIMEOUT_MS) || 0;
const STEPS = [
  ['repo: no keys or .env files would be committed or signed', [node, 'tools/check_repo.mjs'], 2 * MINUTE],
  ['micro tests', [node, 'tools/test.mjs', 'micro'], 6 * MINUTE],
  // Mozilla's own linter, the one signing runs. Warnings fail too: signing shows them to
  // Mozilla's reviewers, and a warning today is often an error in the next linter.
  ['lint: Mozilla add-ons linter', [node, webExt, 'lint', '--source-dir', 'extension', '--warnings-as-errors'], 3 * MINUTE],
  // Red when offline, on purpose: a gate that passes when it could not look is not a gate.
  ['dependency audit (npm audit, needs the internet)', [node, npmCli, 'audit', '--audit-level=low'], 3 * MINUTE],
  ['macro tests (installed Firefox, headless)', [node, 'tools/test.mjs', 'macro'], 12 * MINUTE],
];

function main() {
  if (!fs.existsSync(npmCli)) {
    console.error(`npm was not found next to node (${npmCli}). Reinstall Node 24, which includes it.`);
    process.exit(1);
  }
  if (!fs.existsSync(webExt)) {
    console.error('web-ext is missing from node_modules. Run setup.cmd first.');
    process.exit(1);
  }
  const started = Date.now();
  for (const [name, [cmd, ...args], stepTimeout] of STEPS) {
    const timeout = stepOverride || stepTimeout;
    console.log(`\n=== ${name}`);
    const result = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', timeout });
    if (result.error || result.status !== 0) {
      const why = result.error?.code === 'ETIMEDOUT' ? ` (still running after ${timeout / 1000} s, stopped)`
        : result.error ? ` (${result.error.message})` : '';
      console.error(`\nCHECK FAILED at: ${name}${why}`);
      process.exit(1);
    }
  }
  console.log(`\nCHECK OK (${Math.round((Date.now() - started) / 1000)} s)`);
}

main();
