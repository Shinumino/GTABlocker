// The mutation pass: break one rule at a time in a fresh copy of the project (in
// %TEMP%\gtab-mutants, never this folder), run the tests that should catch it, and report red or
// green. A test that has only ever been green has not proved anything; this is how each one is
// seen red. M = step 1 (the harness), S = step 2 (matching). Results:
// docs/mutation-pass-step1.md and docs/mutation-pass-step2.md.
//
//   node tools/mutation-pass.mjs              baseline, then every break (about 10 minutes)
//   node tools/mutation-pass.mjs M05 M58b     only these (add "base" for the baseline)
//
// Each edit must match its file exactly once, or the break is reported NOT APPLIED: when the
// code changes, update the list here rather than trusting an old result. Some breaks leak a
// test Firefox on purpose (M58b); the sweep at the end stops it.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORK = path.join(os.tmpdir(), 'gtab-mutants');
const only = process.argv.slice(2);

const T = {
  wire: 'tests/micro/marionette-wire.test.mjs', client: 'tests/micro/marionette-client.test.mjs',
  fix: 'tests/micro/fixtures-server.test.mjs', repo: 'tests/micro/check-repo.test.mjs',
  runner: 'tests/micro/test-runner.test.mjs', gate: 'tests/micro/check-gate.test.mjs',
  proc: 'tests/micro/profile-processes.test.mjs', ext: 'tests/micro/extension-rules.test.mjs',
  usefx: 'tests/micro/browser-test.test.mjs',
  loads: 'tests/macro/extension-loads.test.mjs', cleanup: 'tests/macro/harness-cleanup.test.mjs',
  matcher: 'tests/micro/matcher.test.mjs', content: 'tests/micro/content-script.test.mjs',
  source: 'tests/micro/source-text.test.mjs', update: 'tests/micro/firefox-update.test.mjs',
  parity: 'tests/macro/matcher-in-firefox.test.mjs',
};

// The line in content.js that marks the page; several breaks remove or follow it.
const MARKER_LINE = "  document.documentElement.setAttribute('data-gta-blocker', matcher.entries.length > 0 ? 'ready' : 'error');";
const MATCHER = 'extension/lib/matcher.js';

const M = [
  ['M01', 'Marionette length prefix counts UTF-8 bytes', 'prefix counts characters', 'tests/support/marionette.mjs',
    [["  const body = Buffer.from(JSON.stringify(value), 'utf8');\n  return Buffer.concat([Buffer.from(`${body.length}:`, 'ascii'), body]);",
      "  const text = JSON.stringify(value);\n  const body = Buffer.from(text, 'utf8');\n  return Buffer.concat([Buffer.from(`${text.length}:`, 'ascii'), body]);"]], [T.wire]],
  ['M02', 'a message split anywhere comes out whole', 'drop the start of the next message', 'tests/support/marionette.mjs',
    [['      if (this.#pending.length < end) return messages;', '      if (this.#pending.length < end) { if (messages.length) this.#pending = Buffer.alloc(0); return messages; }']], [T.wire]],
  ['M03', 'bodies are decoded as UTF-8', 'decode as latin1', 'tests/support/marionette.mjs',
    [[".subarray(colon + 1, end).toString('utf8');", ".subarray(colon + 1, end).toString('latin1');"]], [T.wire]],
  ['M04', 'a stream that is not Marionette fails at once', 'drop the no-prefix check', 'tests/support/marionette.mjs',
    [["        if (this.#pending.length > MAX_PREFIX_DIGITS) {\n          throw new Error('Marionette frame has no length prefix');\n        }\n", '']], [T.wire]],
  ['M05', 'a frame that is not a reply does not crash', 'drop the reply-shape check', 'tests/support/marionette.mjs',
    [['      if (!Array.isArray(message) || message.length !== 4) {', '      if (false) {']], [T.client]],
  ['M06', 'a close before the hello fails at once', 'drop the close-before-hello reject', 'tests/support/marionette.mjs',
    [["        settle(new Error('Marionette closed the connection before its hello'));\n", '']], [T.client]],
  ['M07', 'replies reach the command they answer', 'answer the oldest waiter instead', 'tests/support/marionette.mjs',
    [['      const waiter = this.#waiting.get(id);', '      const waiter = this.#waiting.get(this.#waiting.keys().next().value);']], [T.client]],
  ['M08', 'an error reply rejects', 'ignore errors', 'tests/support/marionette.mjs',
    [['      if (error) waiter.reject(', '      if (false) waiter.reject(']], [T.client]],
  ['M09', 'a request stays inside its own site folder', 'prefix check without the separator', 'tests/support/fixtures.mjs',
    [['!file.startsWith(siteRoot + path.sep)) return null;', '!file.startsWith(siteRoot)) return null;']], [T.fix]],
  ['M10', 'the hostname ".." is refused', 'drop the leading-dot check', 'tests/support/fixtures.mjs',
    [[" || host.startsWith('.')", '']], [T.fix]],
  ['M11', 'hostnames are matched without case', 'drop toLowerCase', 'tests/support/fixtures.mjs',
    [["const host = String(hostHeader || '').replace(/:\\d+$/, '').toLowerCase();", "const host = String(hostHeader || '').replace(/:\\d+$/, '');"]], [T.fix]],
  ['M12', 'no request reaches a file outside the fixtures', 'drop the containment check', 'tests/support/fixtures.mjs',
    [['  if (file !== siteRoot && !file.startsWith(siteRoot + path.sep)) return null;\n', '']], [T.fix]],
  ['M13', 'secret values are found in UTF-16', 'drop the UTF-16 search', 'tools/repo_rules.mjs',
    [[" || bytes.includes(Buffer.from(value, 'utf16le'))", '']], [T.repo]],
  ['M14', 'every .env file is refused', 'refuse only ".env" itself', 'tools/repo_rules.mjs',
    [['const ENV_FILE = /^\\.env(\\..+)?$/;', 'const ENV_FILE = /^\\.env$/;']], [T.repo]],
  ['M15', 'no piece of a secret is printed', 'print the first 8 characters', 'tools/repo_rules.mjs',
    [['problems.push(`${label}: contains the value of ${name}`);', 'problems.push(`${label}: contains the value of ${name} (${value.slice(0, 8)})`);']], [T.repo]],
  ['M16', 'a too-short secret is ignored', 'minimum length 0', 'tools/repo_rules.mjs',
    [['const MIN_SECRET_LENGTH = 8;', 'const MIN_SECRET_LENGTH = 0;']], [T.repo]],
  ['M17', 'the .env file is searched too', 'read the environment only', 'tools/repo_rules.mjs',
    [['  const pairs = parseEnv(text);', '  const pairs = [];']], [T.repo]],
  ['M18', '"export KEY=" lines are read', 'drop export support', 'tools/repo_rules.mjs',
    [['(?:export\\s+)?', '']], [T.repo]],
  ['M19', 'a trailing # comment is not part of the value', 'keep the comment', 'tools/repo_rules.mjs',
    [[" : value.replace(/\\s+#.*$/, '')", ' : value']], [T.repo]],
  ['M20', 'staged copies are checked', 'skip the staged copies', 'tools/repo_rules.mjs',
    [['  for (const staged of readStagedFiles(rootDir)) files.push', '  for (const staged of []) files.push']], [T.repo]],
  ['M21', 'every file under extension/ is checked', 'skip the extension folder walk', 'tools/repo_rules.mjs',
    [["  for (const p of walk(path.join(rootDir, 'extension'), rootDir)) onDisk.add(p);\n", '']], [T.repo]],
  ['M22', 'new files are listed', 'drop --others', 'tools/repo_rules.mjs',
    [["'--cached', '--others', '--exclude-standard'", "'--cached', '--exclude-standard'"]], [T.repo]],
  ['M23', 'a git failure fails the check', 'swallow git errors', 'tools/repo_rules.mjs',
    [['  if (result.error || result.status !== 0) {\n    const why', '  if (false) {\n    const why']], [T.repo]],
  ['M24', 'an API key shape is found in UTF-16', 'latin1 only', 'tools/repo_rules.mjs',
    [[' || AMO_KEY_PATTERN.test(utf16Text(bytes))', '']], [T.repo]],
  ['M25', 'the command exits 1 on a problem', 'exit 0 on problems', 'tools/check_repo.mjs',
    [["make a new one on addons.mozilla.org.');\n  process.exit(1);", "make a new one on addons.mozilla.org.');\n  process.exit(0);"]], [T.repo]],
  ['M26', 'a git failure says what to do', 'rethrow (stack trace)', 'tools/check_repo.mjs',
    [["} catch (err) {\n  console.error('Repo check FAILED: could not list", "} catch (err) {\n  throw err;\n  console.error('Repo check FAILED: could not list"]], [T.repo]],
  ['M27', 'a run where no test ran is red', 'drop the zero-tests check', 'tools/test.mjs',
    [['  if (ran === 0) {', '  if (false) {']], [T.runner]],
  ['M28', 'a file with no test in it is red', 'drop the empty-file check', 'tools/test.mjs',
    [['  if (empty.length > 0) {', '  if (false) {']], [T.runner]],
  ['M29', 'a suite with no files is red', 'empty suite passes', 'tools/test.mjs',
    [['(they must end in .test.mjs)`);\n    return false;', '(they must end in .test.mjs)`);\n    return true;']], [T.runner]],
  ['M30', 'macro runs only after green micro', 'always run both', 'tools/test.mjs',
    [["  ok = runSuite('micro') && runSuite('macro');", "  ok = [runSuite('micro'), runSuite('macro')].every(Boolean);"]], [T.runner]],
  ['M31', 'a red suite fails the run', 'ignore the exit status', 'tools/test.mjs',
    [['  if (result.status !== 0) return false;\n', '']], [T.runner]],
  ['M32', 'a run started inside a test still runs', 'keep NODE_TEST_CONTEXT', 'tools/test.mjs',
    [['  delete env.NODE_TEST_CONTEXT;', '  // (mutant) NODE_TEST_CONTEXT kept;']], [T.runner]],
  ['M33', 'a hanging test is stopped', 'no time limit on the suite', 'tools/test.mjs',
    [["], { cwd: project, stdio: 'inherit', timeout: timeoutMs, env });", "], { cwd: project, stdio: 'inherit', env });"]], [T.runner]],
  ['M34', 'test.cmd passes the exit code on', 'old if-block layout', 'test.cmd',
    [['node tools\\test.mjs %*', 'if "%~1"=="" (\r\n  node tools\\test.mjs micro || exit /b 1\r\n  node tools\\test.mjs macro || exit /b 1\r\n) else (\r\n  node tools\\test.mjs %*\r\n)']], [T.runner]],
  ['M35', 'cheap gate steps run first', 'lint before micro', 'tools/check.mjs',
    [["  ['micro tests', [node, 'tools/test.mjs', 'micro'], 6 * MINUTE],\n", ''],
     ["'--warnings-as-errors'], 3 * MINUTE],\n", "'--warnings-as-errors'], 3 * MINUTE],\n  ['micro tests', [node, 'tools/test.mjs', 'micro'], 6 * MINUTE],\n"]], [T.gate]],
  ['M36', 'the first red step stops the gate', 'carry on after a red step', 'tools/check.mjs',
    [["      console.error(`\\nCHECK FAILED at: ${name}${why}`);\n      process.exit(1);", "      console.error(`\\nCHECK FAILED at: ${name}${why}`);\n      continue;"]], [T.gate]],
  ['M37', 'a missing tool is red before any step', 'drop the web-ext check', 'tools/check.mjs',
    [['  if (!fs.existsSync(webExt)) {', '  if (false) {']], [T.gate]],
  ['M38', 'a hanging gate step is stopped', 'no time limit on steps', 'tools/check.mjs',
    [["const result = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', timeout });", "const result = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' });"]], [T.gate]],
  ['M39', 'a child older than its parent is not ours', 'any child of ours is ours', 'tests/support/firefox-process.mjs',
    [['  if (parent) return p.created >= parent.created;', '  if (parent) return true;']], [T.proc]],
  ['M40', 'a lock holder must be firefox.exe', 'any lock holder', 'tests/support/firefox-process.mjs',
    [["    if (p && p.name.toLowerCase() === 'firefox.exe') take(p);", '    if (p) take(p);']], [T.proc]],
  ['M41', 'a reused process id is not ours', 'match known by id only', 'tests/support/firefox-process.mjs',
    [['    if (p && p.created === k.created) take(p);', '    if (p) take(p);']], [T.proc]],
  ['M42', 'a restarted browser is found through its dead parent', 'drop dead-parent lineage', 'tests/support/firefox-process.mjs',
    [['  if (!k) return false;\n  const holder', '  return false;\n  const holder']], [T.proc]],
  ['M43', 'a child born after its parent was seen gone is not ours', 'drop the goneSince bound', 'tests/support/firefox-process.mjs',
    [['    && p.created <= (k.goneSince ?? now)\n', '']], [T.proc]],
  ['M44', 'a child of a reused parent id must be older than the holder', 'drop the holder bound', 'tests/support/firefox-process.mjs',
    [['    && (!holder || p.created < holder.created);', ';']], [T.proc]],
  ['M45', 'stopping fails loudly when a process will not die', 'never throw', 'tests/support/firefox-process.mjs',
    [['  if (left.length > 0) {\n    throw new Error(`Firefox still running', '  if (false) {\n    throw new Error(`Firefox still running']], [T.proc]],
  ['M46', 'a browser caught mid-restart is stopped', 'drop the settle look', 'tests/support/firefox-process.mjs',
    [['    await sleep(settleMs);\n    left = tracker.current();\n    if (left.length === 0) break;', '    break;']], [T.proc]],
  ['M47', 'a profile that cannot be deleted fails loudly', 'swallow the delete error', 'tests/support/firefox-process.mjs',
    [['  throw new Error(`could not delete the test profile ${dir}: ${lastError.message}`);', '  return;']], [T.proc]],
  ['M48', 'only harness profiles are ever deleted', 'drop the name guard in delete', 'tests/support/firefox-process.mjs',
    [['export async function removeProfile(dir, { attempts = 20, waitMs = 250 } = {}) {\n  assertHarnessProfile(dir);', 'export async function removeProfile(dir, { attempts = 20, waitMs = 250 } = {}) {']], [T.proc]],
  ['M49', 'kill only the exact process (id and start time)', 'kill by id only', 'tests/support/firefox-process.mjs',
    [['    if (!alive.some((a) => a.pid === p.pid && a.created === p.created)) continue;', '    if (!alive.some((a) => a.pid === p.pid)) continue;']], [T.proc]],
  ['M50', 'a profile still in use is not swept', 'sweep regardless of owner', 'tests/support/firefox-process.mjs',
    [['    if (owner && table.all.some((p) => p.pid === owner.pid && p.created === owner.created)) continue;\n', '']], [T.proc]],
  ['M51', 'a harness profile name is exact', 'loosen the name pattern', 'tests/support/firefox-process.mjs',
    [['const PROFILE_NAME = /^gtablocker-ff-[A-Za-z0-9]{6}$/;', 'const PROFILE_NAME = /^gtablocker-ff-[A-Za-z0-9]*$/;']], [T.proc]],
  ['M52', 'a failed start leaves no profile', 'drop the cleanup on a failed start', 'tests/support/firefox.mjs',
    [['    try {\n      await stopAndRemove(profileDir, tracker);\n    } catch (cleanupErr) {', '    try {\n    } catch (cleanupErr) {']], [T.proc]],
  ['M53', 'the fixture server closes even when quit throws', 'no finally', 'tests/support/browser-test.mjs',
    [['    try {\n      await session.firefox?.quit();\n    } finally {\n      await session.fixtures?.close();\n    }', '    await session.firefox?.quit();\n    await session.fixtures?.close();']], [T.usefx]],
  ['M54', 'no extension code reaches the network', 'add a fetch', 'extension/content.js',
    [[MARKER_LINE, `${MARKER_LINE}\n  fetch('https://example.com/');`]], [T.ext]],
  ['M55', 'no unagreed permission', 'ask for "tabs"', 'extension/manifest.json',
    [['"manifest_version": 3,', '"manifest_version": 3,\n  "permissions": ["tabs"],']], [T.ext]],
  ['M56', 'the content script runs on a page', 'remove the marker line', 'extension/content.js',
    [[MARKER_LINE, '']], [T.loads]],
  ['M57', 'test pages never come from the internet', 'drop network.dns.forceResolve', 'tests/support/firefox.mjs',
    [["  'network.dns.forceResolve': '127.0.0.1',\n", '']], [T.loads]],
  ['M58', 'a restarted browser is still tracked', 'drop the lock AND the lineage', 'tests/support/firefox-process.mjs',
    [["    if (p && p.name.toLowerCase() === 'firefox.exe') take(p);", ''], ['  if (!k) return false;\n  const holder', '  return false;\n  const holder']], [T.cleanup]],
  ['M58b', 'a restarted browser is still tracked', 'drop the lock AND every child link', 'tests/support/firefox-process.mjs',
    [["    if (p && p.name.toLowerCase() === 'firefox.exe') take(p);", ''], ['      if (ours.has(p.pid) || !isOurChild(p, ours, known, alive, now)) continue;', '      if (true) continue;']], [T.cleanup]],
  ['M59', 'quit stops what did not stop by itself', 'never kill', 'tests/support/firefox-process.mjs',
    [['      kill(left);\n', '']], [T.cleanup]],

  // Step 2: matching.
  ['S01', 'full-width letters count as normal ones', 'drop NFKC on the text', MATCHER,
    [["      .replace(SYMBOL, symbolAsGap)\n      .normalize('NFKC')\n", '      .replace(SYMBOL, symbolAsGap)\n']], [T.matcher]],
  ['S02', 'invisible characters are removed from the text', 'drop the INVISIBLE replace', MATCHER,
    [["      .replace(INVISIBLE, '')\n      .replace(/&/g, ' and ');", "      .replace(/&/g, ' and ');"]], [T.matcher]],
  ['S03', 'every format and default-ignorable character counts as invisible', 'go back to a short hand-written list', MATCHER,
    [['const INVISIBLE = /[\\p{Cf}\\p{DI}]/gu;', 'const INVISIBLE = /[\\u{AD}\\u{200B}-\\u{200F}\\u{FEFF}]/gu;']], [T.matcher]],
  ['S04', 'piles of combining marks cannot slow normalization', 'keep the mark piles', MATCHER,
    [["      .replace(MARK_PILE, '')\n", '']], [T.matcher]],
  ['S05', 'accents on Latin letters do not matter', 'keep the accents', MATCHER,
    [["      .replace(ACCENT, '')\n", '']], [T.matcher]],
  ['S06', 'marks that are part of a letter stay (Japanese, Devanagari)', 'strip every mark', MATCHER,
    [['const ACCENT = /(?<=[\\p{Script=Latin}\\p{Script=Greek}\\p{Script=Cyrillic}])\\p{M}+/gu;', 'const ACCENT = /\\p{M}+/gu;']], [T.matcher]],
  ['S07', 'camel case is split (#ViceCity, PlayGTA)', 'drop the split', MATCHER,
    [["    if (camel) s = s.replace(CAMEL, '$1 $2');", '']], [T.matcher]],
  ['S08', 'case never matters (gTA 6, YouTube)', 'read only the split text', MATCHER,
    [['        const whole = prepare(text, false);\n        return whole === split ? null : first(whole);', '        return null;']], [T.matcher]],
  ['S09', '"&" means "and"', 'leave & as punctuation', MATCHER,
    [["\n      .replace(/&/g, ' and ');", '\n      ;']], [T.matcher]],
  ['S10', 'trademark signs are gaps, not letters', 'let NFKC turn them into TM', MATCHER,
    [['      .replace(SYMBOL, symbolAsGap)\n', '']], [T.matcher]],
  ['S11', 'German sharp s equals ss', 'drop the fold', MATCHER,
    [["      .replace(/\\u{DF}/gu, 'ss') // German sharp s\n", '']], [T.matcher]],
  ['S12', 'Greek final sigma equals sigma', 'drop the fold', MATCHER,
    [["      .replace(/\\u{3C2}/gu, '\\u{3C3}') // Greek final sigma\n", '']], [T.matcher]],
  ['S13', 'any run of gap characters becomes one space', 'do not collapse gaps', MATCHER,
    [["      .replace(GAP_RUN, ' ');", '      ;']], [T.matcher]],
  ['S14', 'the words of an entry may be written together', 'require a space between them', MATCHER,
    [["words.map(literal).join(' ?')", "words.map(literal).join(' ')"]], [T.matcher]],
  ['S15', 'a match starts at a word start', 'drop the start boundary', MATCHER,
    [["(before ? `(?<!${before})` : '')", "''"]], [T.matcher]],
  ['S16', 'a match ends at a word end (unless *)', 'drop the end boundary', MATCHER,
    [["(after ? `(?!${after})` : '')", "''"]], [T.matcher]],
  ['S17', 'a letter of another script ends a word (我在玩GTA5)', 'any letter continues a word', MATCHER,
    [['      if (test.test(ch)) return `[\\\\p{Script=${name}}\\\\p{M}]`;', '      if (test.test(ch)) return `[\\\\p{L}\\\\p{M}]`;']], [T.matcher]],
  ['S17b', 'a digit ends a word (Leonida2026)', 'digits continue a word', MATCHER,
    [['      if (test.test(ch)) return `[\\\\p{Script=${name}}\\\\p{M}]`;', '      if (test.test(ch)) return `[\\\\p{Script=${name}}\\\\p{M}\\\\p{N}]`;']], [T.matcher]],
  ['S17c', 'scripts without spaces have no word ends', 'give them a boundary', MATCHER,
    [['    return null;\n  }\n\n  // A trademark-like sign', "    return '[\\\\p{L}]';\n  }\n\n  // A trademark-like sign"]], [T.matcher]],
  ['S18', 'what reaches the pattern is escaped (second lock)', 'drop literal()', MATCHER,
    [['    return word.replace(', '    return word; word.replace(']], [T.matcher]],
  ['S19', 'a star is read after normalizing (full-width, invisible)', 'look for it before', MATCHER,
    [["    let text = entry.normalize('NFKC').replace(INVISIBLE, '').trim();", '    let text = entry.trim();']], [T.matcher]],
  ['S20', 'a star anywhere but the end is refused', 'allow it', MATCHER,
    [["    if (text.includes('*')) return { code: 'star-not-at-end' };\n", '']], [T.matcher]],
  ['S21', 'the length is measured after normalizing', 'measure the raw entry', MATCHER,
    [["    if ([...joined].length > LIMITS.maxLength) return { code: 'too-long' };", "    if (entry.trim().length > LIMITS.maxLength) return { code: 'too-long' };"]], [T.matcher]],
  ['S22', '80 characters is allowed', 'refuse 80 too', MATCHER,
    [["    if ([...joined].length > LIMITS.maxLength) return { code: 'too-long' };", "    if ([...joined].length >= LIMITS.maxLength) return { code: 'too-long' };"]], [T.matcher]],
  ['S23', 'at most 10 words', 'drop the cap', MATCHER,
    [["    if (words.length > LIMITS.maxWords) return { code: 'too-many-words' };\n", '']], [T.matcher]],
  ['S24', '3 letters or digits, punctuation not counted', 'count characters', MATCHER,
    [['(joined.match(LETTERS) || []).length < LIMITS.minChars', 'joined.length < LIMITS.minChars']], [T.matcher]],
  ['S25', 'repeats and refused entries take no place', 'count them against the cap', MATCHER,
    [["      if (!code && accepted.length >= LIMITS.maxEntries) code = 'list-full';", "      if (!code && accepted.length + rejected.length >= LIMITS.maxEntries) code = 'list-full';"]], [T.matcher]],
  ['S26', 'a repeat is reported, with what it repeats', 'drop it silently', MATCHER,
    [["      if (!code && seen.has(parsed.key)) code = 'duplicate';", '      if (!code && seen.has(parsed.key)) return;']], [T.matcher]],
  ['S27', 'a match names the entry as written', 'name the normalized key', MATCHER,
    [['      entry: entry.trim(),', '      entry: joined,']], [T.matcher]],
  ['S28', 'blank lines are skipped, not refused', 'refuse them', MATCHER,
    [["    if (text === '') return { blank: true };", "    if (text === '') return { code: 'too-short' };"]], [T.matcher]],
  ['S29', 'the first entry in the list wins a tie', 'reverse the list order', MATCHER,
    [["accepted.map((a) => `(${a.pattern})`).join('|')", "accepted.map((a) => `(${a.pattern})`).reverse().join('|')"]], [T.matcher]],
  ['S30', 'a GtaBlocker reachable only through the page is not ours', 'take any GtaBlocker', MATCHER,
    [["  const ns = Object.hasOwn(root, 'GtaBlocker') ? root.GtaBlocker : (root.GtaBlocker = {});", '  const ns = root.GtaBlocker || (root.GtaBlocker = {});']], [T.matcher]],
  ['S31', 'the page is marked ready only after the matcher compiled', 'mark it ready at once', 'extension/content.js',
    [[`  const matcher = GtaBlocker.matcher.compile(GtaBlocker.matcher.DEFAULT_ENTRIES);\n${MARKER_LINE}`, "  document.documentElement.setAttribute('data-gta-blocker', 'ready');"]], [T.content]],
  ['S32', 'content.js leaves nothing in the shared scope', 'unwrap it', 'extension/content.js',
    [["(function () {\n  'use strict';\n", ''], ['})();\n', '']], [T.content]],
  ['S33', 'the manifest loads the matcher before content.js', 'swap the order', 'extension/manifest.json',
    [['"js": ["lib/matcher.js", "content.js"],', '"js": ["content.js", "lib/matcher.js"],']], [T.ext]],
  ['S34', 'no file holds a direction-changing character', 'plant a raw U+202E in a comment', 'extension/content.js',
    [['(function () {', '// \u{202E}\n(function () {']], [T.source]],
  ['S35', 'every waiting update state is caught', 'catch only "pending"', 'tools/firefox_update.mjs',
    [['const WAITING = /^(pending|pending-service|pending-elevate|applied|applied-service|applying)\\b/;', 'const WAITING = /^(pending)\\b/;']], [T.update]],
  ['S36', 'the older update folder is checked too', 'skip %LOCALAPPDATA%', 'tools/firefox_update.mjs',
    [["    ...(roots.localAppData ? listDirs(path.join(roots.localAppData, 'Mozilla', 'updates')) : []),\n", '']], [T.update]],
  ['S37', 'no test Firefox starts while an update waits', 'skip the check in startFirefox', 'tests/support/firefox.mjs',
    [['  assertNoWaitingUpdate(updateRoots);\n', '']], [T.update]],
  ['S38', 'run.cmd stops while an update waits', 'the check exits 0', 'tools/check_firefox_update.mjs',
    [['  process.exit(1);', '  process.exit(0);']], [T.update]],
  ['S39', 'the secret check never crashes Node on an odd slice', 'decode the slice directly', 'tools/repo_rules.mjs',
    [['AMO_KEY_PATTERN.test(utf16Text(bytes))', "AMO_KEY_PATTERN.test(bytes.toString('utf16le'))"]], [T.repo]],
  ['S40', 'the UTF-16 copy keeps every whole character', 'drop the last one', 'tools/repo_rules.mjs',
    [['  const even = Buffer.alloc(bytes.length - (bytes.length % 2));', '  const even = Buffer.alloc(Math.max(0, bytes.length - (bytes.length % 2) - 2));']], [T.repo]],
  ['S41', 'Firefox applies the same rules (macro parity)', 'drop the camel split', MATCHER,
    [["    if (camel) s = s.replace(CAMEL, '$1 $2');", '']], [T.parity]],
];

function copyProject(dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(PROJECT, dest, { recursive: true, filter: (src) => !/[\\/](node_modules|\.git)([\\/]|$)/.test(src.slice(PROJECT.length)) });
}

function run(dir, tests) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  // Plain node --test, never the copy's own tools/test.mjs: a break in that file must not be
  // the judge of itself (the first pass got M31 wrong that way).
  const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-force-exit', ...tests], { cwd: dir, encoding: 'utf8', env, timeout: 300_000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const failed = [...new Set([...out.matchAll(/^✖ (.+?) \(\d/gm)].map((m) => m[1]))].filter((n) => !/failing tests/.test(n));
  return { status: r.status, error: r.error?.code, failed };
}

fs.mkdirSync(WORK, { recursive: true });
const results = [];
const base = path.join(WORK, 'base');
if (only.length === 0 || only.includes('base')) {
  copyProject(base);
  const all = Object.values(T);
  const r = run(base, all);
  console.log(`BASELINE (unbroken copy, all ${all.length} test files): ${r.status === 0 ? 'green' : 'RED ' + JSON.stringify(r)}`);
  fs.rmSync(base, { recursive: true, force: true });
  if (r.status !== 0) process.exit(1);
}
for (const [id, rule, brk, file, edits, tests] of M) {
  if (only.length && !only.includes(id)) continue;
  const dir = path.join(WORK, id);
  copyProject(dir);
  const target = path.join(dir, file);
  let text = fs.readFileSync(target, 'utf8');
  let applied = true;
  for (const [find, replace] of edits) {
    const count = text.split(find).length - 1;
    if (count !== 1) { applied = false; console.log(`${id}: NOT APPLIED (found ${count} times): ${JSON.stringify(find.slice(0, 60))}`); break; }
    text = text.replace(find, () => replace);
  }
  if (!applied) { results.push({ id, rule, brk, result: 'NOT APPLIED' }); fs.rmSync(dir, { recursive: true, force: true }); continue; }
  fs.writeFileSync(target, text);
  const t0 = Date.now();
  const r = run(dir, tests);
  const result = r.status === 0 ? 'green (SURVIVED)' : 'RED';
  results.push({ id, rule, brk, tests: tests.map((t) => path.basename(t)).join(', '), result, failed: r.failed.slice(0, 2), secs: Math.round((Date.now() - t0) / 1000), error: r.error });
  console.log(`${id} ${result} in ${Math.round((Date.now() - t0) / 1000)} s: ${rule} | break: ${brk} | caught by: ${r.failed.slice(0, 2).join(' / ')}${r.error ? ' | ' + r.error : ''}`);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { console.log(id + ': copy not deleted (' + e.code + '), something still holds it'); }
}
fs.writeFileSync(path.join(os.tmpdir(), 'gtab-mutation-results.json'), JSON.stringify(results, null, 1));
// Breaks like M58b leave a test Firefox running on purpose; the real sweep stops it.
const { sweepStaleProfiles } = await import(pathToFileURL(path.join(PROJECT, 'tests', 'support', 'firefox-process.mjs')).href);
const swept = await sweepStaleProfiles();
if (swept.length) console.log(`swept ${swept.length} test profile(s) left by the breaks: ${swept.join(', ')}`);
try { fs.rmSync(WORK, { recursive: true, force: true }); } catch {}
console.log(`\n${results.filter((r) => r.result === 'RED').length} red, ${results.filter((r) => r.result !== 'RED').length} not red, of ${results.length}`);
