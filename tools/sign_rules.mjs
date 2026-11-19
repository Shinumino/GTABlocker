// The rules of the signing command (step 7); tools/sign.mjs only runs them. Mozilla signs the
// extension for self-distribution ("unlisted": never published on addons.mozilla.org, only
// signed, so Firefox installs the file for good) and the signed .xpi lands in web-ext-artifacts\.
//
// The order is the rule, cheapest refusal first, nothing sent on any refusal:
// 1. the keys, from .env only (the user writes it; a variable left in the environment leaks
//    into every shell): both present, once each, as text Notepad saves (not UTF-16), and the
//    issuer shaped like one;
// 2. a version higher than any signed already (Mozilla signs each version once);
// 3. the extension folder exactly as committed (so each signed version is one commit, and what
//    is signed is what the gate and the reviews saw), with no ignored file in it either (web-ext
//    would pack it);
// 4. the whole gate (check.mjs) green, then the folder checked again unchanged;
// 5. only then web-ext uploads. The keys reach it through its environment only, never its
//    command line (shown in Task Manager and process logs), which holds only names it needs;
//    no web-ext config file is read; what it prints is masked as it comes.
// Where the keys come from and how to change them: docs/secrets.md.

import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { SECRET_NAMES, parseEnv } from './repo_rules.mjs';

export const ARTIFACTS = 'web-ext-artifacts';
// The file web-ext itself writes into the source folder after an upload (hidden: never packed).
export const UPLOAD_ID_FILE = '.amo-upload-uuid';
export const SIGN_ARGS = Object.freeze(['--no-config-discovery', 'sign', '--channel=unlisted', '--source-dir', 'extension', '--artifacts-dir', ARTIFACTS]);
// A JWT issuer looks like user:<account>:<number>.
const ISSUER = /^user:\d+:\d+$/;
// What web-ext may see of the environment, beyond the keys: what Windows and Node need to run
// and to reach the network. No WEB_EXT_* option, no proxy, no NODE_OPTIONS (review, step 7).
const ALLOWED_ENV = new Set(['SYSTEMROOT', 'WINDIR', 'PATH', 'PATHEXT', 'COMSPEC', 'TEMP', 'TMP', 'USERPROFILE',
  'APPDATA', 'LOCALAPPDATA', 'HOMEDRIVE', 'HOMEPATH', 'OS', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE']);

// ---- pure rules ----

// What .env holds, from its bytes: { keys, problems } (problems: one line each, never a value).
export function readKeyFile(bytes) {
  if (bytes === null) return { keys: {}, problems: ['no .env file'] };
  // Windows PowerShell 5.1 writes UTF-16: it parsed as nothing and read as "missing".
  if (bytes.includes(0)) return { keys: {}, problems: ['.env is saved as UTF-16: save it again as UTF-8 (Notepad: Save as, Encoding: UTF-8)'] };
  const keys = {};
  const problems = [];
  for (const [name, value] of parseEnv(bytes.toString('utf8'))) {
    if (name in keys) problems.push(`${name} is in .env more than once: keep one line`);
    else if (value) keys[name] = value;
  }
  for (const name of SECRET_NAMES) if (!keys[name] && !problems.some((p) => p.startsWith(name))) problems.push(`${name} is missing or empty`);
  if (keys.WEB_EXT_API_KEY && !ISSUER.test(keys.WEB_EXT_API_KEY)) {
    problems.push('WEB_EXT_API_KEY does not look like a JWT issuer (user:<number>:<number>): the two values may be swapped');
  }
  return { keys, problems };
}

// Dot-separated numbers compared as numbers ("0.10.0" > "0.9.0"); a missing part counts as 0.
export function compareVersions(a, b) {
  const x = String(a).split('.').map(Number);
  const y = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

// The highest version among signed files (<name>-<version>.xpi), or null.
export function highestSigned(names) {
  let top = null;
  for (const name of names) {
    const m = /-(\d+(?:\.\d+)*)\.xpi$/.exec(name);
    if (m && (top === null || compareVersions(m[1], top) > 0)) top = m[1];
  }
  return top;
}

// What to do, from what is known before anything runs. { ok: true, args, env } or
// { ok: false, reason }. The order of the refusals is the rule above.
export function signPlan({ keyFile, version, signed, folder }) {
  if (keyFile.problems.length > 0) return { ok: false, reason: `Not signing: ${keyFile.problems.join('; ')}.`, kind: 'keys' };
  const top = highestSigned(signed);
  if (top !== null && compareVersions(version, top) <= 0) {
    const same = compareVersions(version, top) === 0;
    return { ok: false, kind: 'version', reason: same
      ? `Not signing: version ${version} is signed already, and its file is in ${ARTIFACTS}. Install that file. To sign changes, first set a higher "version" in extension\\manifest.json (for example ${version} to ${bump(version)}).`
      : `Not signing: version ${version} is lower than ${top}, signed already. Set "version" in extension\\manifest.json higher than ${top}.` };
  }
  if (!folder.clean) {
    return { ok: false, kind: 'folder', reason: `Not signing: the extension folder is not exactly as committed (${folder.changes.join(', ')}). Commit or undo those first: only committed code is signed.` };
  }
  const env = {};
  for (const name of SECRET_NAMES) env[name] = keyFile.keys[name];
  return { ok: true, args: [...SIGN_ARGS], env };
}

function bump(version) {
  const parts = String(version).split('.').map(Number);
  parts[parts.length - 1] += 1;
  return parts.join('.');
}

// `text` with every occurrence of every non-empty secret value replaced by ***.
export function mask(text, secrets) {
  let out = String(text);
  for (const value of secrets) if (typeof value === 'string' && value !== '') out = out.split(value).join('***');
  return out;
}

// The environment web-ext runs with: only the allowed names from `base`, then `extra` (the keys).
export function childEnv(base, extra) {
  const env = {};
  for (const [name, value] of Object.entries(base)) if (ALLOWED_ENV.has(name.toUpperCase())) env[name] = value;
  return { ...env, ...extra };
}

// The environment the gate runs with: everything but WEB_EXT_* (no keys) and GTAB_* (they point
// the tests at another folder, which would make a green gate prove another copy: review, step 7).
export function gateEnv(base) {
  const env = {};
  for (const [name, value] of Object.entries(base)) if (!/^(WEB_EXT_|GTAB_)/i.test(name)) env[name] = value;
  return env;
}

// The names-only report (`sign.cmd --keys`): what is wrong with .env, never a value.
export function keysReport({ keyFile, strayFiles }) {
  const lines = [];
  for (const name of SECRET_NAMES) lines.push(`${name}: ${keyFile.keys[name] ? 'present' : 'missing'}`);
  for (const problem of keyFile.problems) lines.push(`Problem: ${problem}.`);
  for (const name of strayFiles) lines.push(`Found ${name}: it must be named .env exactly (Notepad: Save as type "All files").`);
  if (keyFile.problems.length === 0 && strayFiles.length === 0) lines.push('The keys look right. The values are not shown.');
  return { lines, ok: keyFile.problems.length === 0 && strayFiles.length === 0 };
}

// ---- the run ----

// Every outside thing comes in `seams` (the tests fake them, or point the real ones at a
// throwaway folder). Resolves to the exit code.
export async function sign(seams, { mode = 'sign' } = {}) {
  const { log } = seams;
  const keyFile = readKeyFile(seams.readKeyBytes());
  if (mode === 'keys') {
    const report = keysReport({ keyFile, strayFiles: seams.strayKeyFiles() });
    for (const line of report.lines) log(line);
    return report.ok ? 0 : 1;
  }
  const version = seams.readVersion();
  const before = seams.listSigned();
  const folder = seams.folderState();
  const plan = signPlan({ keyFile, version, signed: before, folder });
  if (!plan.ok) {
    log(plan.reason);
    if (plan.kind === 'keys') {
      for (const name of seams.strayKeyFiles()) log(`Found ${name}: it must be named .env exactly (Notepad: Save as type "All files").`);
      log(`The keys go in ${seams.keyFilePath()}. How: docs\\secrets.md, "First time".`);
    }
    return 1;
  }
  log(`Signing version ${version}. First the full check, the same as check.cmd:`);
  const gate = await seams.runGate();
  if (gate !== 0) {
    log('The check failed (see above): nothing was sent to Mozilla. Fix that, or send the lines above to Claude, then run sign.cmd again.');
    return 1;
  }
  const after = seams.folderState();
  if (!after.clean || after.tree !== folder.tree || seams.readVersion() !== version) {
    log('The extension folder changed while the check ran: nothing was sent to Mozilla. Run sign.cmd again.');
    return 1;
  }
  log('The check passed. Sending the add-on to Mozilla to be signed (unlisted: never published, only signed).');
  log('This can take several minutes, and it may show nothing for a while: keep this window open.');
  const secrets = Object.values(plan.env);
  const code = await seams.runWebExt(plan.args, plan.env, (line) => log(mask(line, secrets)));
  const made = seams.listSigned().filter((name) => !before.includes(name) && name.endsWith('.xpi'));
  if (code !== 0) {
    for (const name of made) log(`A file was written, but the run failed, so it may be incomplete: delete ${seams.artifactPath(name)}.`);
    log(`No signed file came back (exit code ${code}). The reason is in the lines above, with the keys shown as ***: you can send them to Claude.`);
    log(`Mozilla may already have version ${version}: if a link was printed above, the signed file can be downloaded there once it is ready; otherwise set a higher "version" before you run sign.cmd again.`);
    return code;
  }
  if (made.length === 0) {
    log(`Mozilla answered, but no new signed file is in ${ARTIFACTS}. Send the lines above to Claude.`);
    return 1;
  }
  for (const name of made) log(`Signed: ${seams.artifactPath(name)}`);
  log('To install it: in Firefox open about:addons, click the gear icon, choose "Install Add-on From File...", pick that file, and click Add.');
  return 0;
}

// ---- the real seams, for a project folder ----

// `webExt` and `gate`: the scripts to run (the project's own, or a test's fakes). `env`: the
// environment to start from.
export function realSeams({ root, webExt, gate, env = process.env, log = (line) => console.log(line) }) {
  const at = (...parts) => path.join(root, ...parts);
  const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return {
    log,
    keyFilePath: () => at('.env'),
    readKeyBytes: () => {
      try {
        return fs.readFileSync(at('.env'));
      } catch {
        return null;
      }
    },
    // Notepad's ".env.txt", and other near names, which nothing reads.
    strayKeyFiles: () => {
      try {
        return fs.readdirSync(root).filter((name) => /^\.?env(\..+)?$/i.test(name) && name !== '.env' && name.toLowerCase() !== '.env.example');
      } catch {
        return [];
      }
    },
    readVersion: () => JSON.parse(fs.readFileSync(at('extension', 'manifest.json'), 'utf8')).version,
    listSigned: () => {
      try {
        return fs.readdirSync(at(ARTIFACTS));
      } catch {
        return [];
      }
    },
    artifactPath: (name) => at(ARTIFACTS, name),
    // Exactly as committed: nothing changed, new or ignored in extension/ (web-ext packs ignored
    // files too), but the upload id web-ext writes itself; and the committed tree's id.
    folderState: () => {
      const status = git(['status', '--porcelain', '--ignored', '--untracked-files=all', '--', 'extension']);
      const tree = git(['rev-parse', 'HEAD:extension']);
      if (status.status !== 0 || tree.status !== 0) return { clean: false, changes: ['git could not read it'], tree: null };
      const changes = status.stdout.split('\n').filter((l) => l.trim() !== '' && !l.endsWith(`extension/${UPLOAD_ID_FILE}`)).map((l) => l.slice(3));
      return { clean: changes.length === 0, changes, tree: tree.stdout.trim() };
    },
    runGate: () => run(process.execPath, [gate], { cwd: root, env: gateEnv(env), inherit: true }),
    runWebExt: (args, keys, onLine) => run(process.execPath, [webExt, ...args], { cwd: root, env: childEnv(env, keys), onLine }),
  };
}

// A child process; with `onLine`, its output is read and handed on line by line as it comes
// (so it can be masked), else it prints straight through. Resolves to its exit code (1 when
// killed by a signal).
function run(file, args, { cwd, env, inherit = false, onLine = null }) {
  return new Promise((resolve) => {
    const child = spawn(file, args, { cwd, env, stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'] });
    if (!inherit) {
      for (const stream of [child.stdout, child.stderr]) {
        let rest = '';
        stream.setEncoding('utf8');
        stream.on('data', (chunk) => {
          const parts = (rest + chunk).split(/\r?\n/);
          rest = parts.pop();
          for (const line of parts) onLine(line);
        });
        stream.on('end', () => { if (rest !== '') onLine(rest); });
      }
    }
    child.on('error', () => resolve(1));
    child.on('close', (code) => resolve(code ?? 1));
  });
}
