// Runs the tests. test.cmd and check.mjs both call this, so a red run is red the same way in
// both places.
//
//   node tools/test.mjs                micro, then macro (macro only if micro is green)
//   node tools/test.mjs micro|macro    one suite
//   node tools/test.mjs <args...>      a narrow run: the args go to node --test as they are
//
// Two things node --test does not do on its own, and why this file exists:
// - It exits 0 when it finds no test files, or files with no test in them ("tests 0"). A gate
//   that ran nothing has proved nothing, so here that is red.
// - test.cmd used to chain the suites with `|| exit /b 1` inside an if-block, and cmd.exe then
//   reported exit code 0 for a red micro run (found in review, 2026-11-18).
//
// GTAB_TEST_ROOT points at another tests folder; tests/micro/test-runner.test.mjs uses it to
// run this file against small made-up suites.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testsDir = process.env.GTAB_TEST_ROOT ? path.resolve(process.env.GTAB_TEST_ROOT) : path.join(project, 'tests');

// One Firefox at a time for macro: each file starts its own, and side by side they only make
// timeouts flaky on a busy PC. --test-force-exit ends the test process when its tests are done,
// so an open handle (a server, a socket) cannot hang the run. The time limit turns a hang that
// still happens into a red run.
// GTAB_TIMEOUT_MS replaces both limits; only the runner's own tests set it, to prove that a
// hang is stopped without waiting minutes.
const override = Number(process.env.GTAB_TIMEOUT_MS) || 0;
const SUITES = {
  micro: { args: [], timeoutMs: override || 5 * 60_000 },
  macro: { args: ['--test-concurrency=1', '--test-force-exit'], timeoutMs: override || 10 * 60_000 },
};

function findTests(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return findTests(full);
    return entry.name.endsWith('.test.mjs') ? [full] : [];
  }).sort();
}

// Runs node --test with a second, machine-readable report (TAP) in a temp file, to count the
// tests that really ran.
function runNodeTest(label, args, timeoutMs) {
  const tap = path.join(os.tmpdir(), `gtab-tap-${process.pid}-${Date.now()}.tap`);
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // set inside a test; it would make node --test skip every file
  const result = spawnSync(process.execPath, [
    '--test', '--test-reporter=spec', '--test-reporter-destination=stdout',
    '--test-reporter=tap', `--test-reporter-destination=${tap}`, ...args,
  ], { cwd: project, stdio: 'inherit', timeout: timeoutMs, env });
  let report = '';
  try {
    report = fs.readFileSync(tap, 'utf8');
  } catch {
    // No report: the counts below stay at zero and the run is red.
  }
  fs.rmSync(tap, { force: true });
  if (result.error) {
    const why = result.error.code === 'ETIMEDOUT' ? `still running after ${timeoutMs / 1000} s, stopped` : result.error.message;
    console.error(`${label}: ${why}`);
    return false;
  }
  if (result.status !== 0) return false;
  const ran = Number(/^# tests (\d+)$/m.exec(report)?.[1] ?? 0);
  if (ran === 0) {
    console.error(`${label}: no test ran. Check the file names (*.test.mjs) or the name pattern.`);
    return false;
  }
  // A file with no test in it is reported as one passing "test" named after the file
  // (measured on Node 24.19), so the count above is 1, not 0. Such a file is red too.
  const empty = [...report.matchAll(/^ok \d+ - (.+\.test\.mjs)\s*$/gm)].map((m) => m[1]);
  if (empty.length > 0) {
    console.error(`${label}: no test ran in ${empty.join(', ')}`);
    return false;
  }
  return true;
}

function runSuite(name) {
  const files = findTests(path.join(testsDir, name));
  if (files.length === 0) {
    console.error(`${name}: no test files in ${path.join(testsDir, name)} (they must end in .test.mjs)`);
    return false;
  }
  return runNodeTest(name, [...SUITES[name].args, ...files], SUITES[name].timeoutMs);
}

const args = process.argv.slice(2);
let ok;
if (args.length === 0) {
  ok = runSuite('micro') && runSuite('macro');
} else if (args.length === 1 && args[0] in SUITES) {
  ok = runSuite(args[0]);
} else {
  ok = runNodeTest('tests', [...SUITES.macro.args, ...args], SUITES.macro.timeoutMs);
}
process.exit(ok ? 0 : 1);
