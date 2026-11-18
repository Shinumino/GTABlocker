// Which processes are a test Firefox, and how to stop them. Kept apart from the browser helpers
// because this is the code that must never touch the user's own Firefox: they keep it open all
// day, and it starts and ends processes all the time.
//
// A process is named by its id AND its start time. Windows reuses ids within seconds, so an id
// we saw a minute ago can belong to the user's Firefox now. Every kill goes through killExact,
// which kills a process only if the same id still has the same start time.
//
// What makes a process ours, found the hard way (2026-11-18):
// - its command line names our throwaway profile (the launcher and the first browser);
// - it holds the profile's parent.lock (a browser that restarted itself has a bare command
//   line and passes the profile in its environment, so only the lock still ties it to us);
// - it is a child of a process that is ours and started after that parent did (the content
//   processes, and a restarted browser in the moment before it takes the lock). A child that
//   is older than its "parent" has a parent id that was reused, so it is somebody else's.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const PROFILE_PREFIX = 'gtablocker-ff-';
const PROFILE_NAME = /^gtablocker-ff-[A-Za-z0-9]{6}$/;
const OWNER_FILE = 'harness-owner.json';

export function assertHarnessProfile(profileDir) {
  const name = path.basename(String(profileDir));
  if (!PROFILE_NAME.test(name) || path.basename(path.resolve(String(profileDir))) !== name) {
    throw new Error(`not a harness profile: ${profileDir}`);
  }
  return name;
}

// Which processes hold a file open, from the Windows Restart Manager (the API installers use for
// "close these apps first"). Inline C#, because Windows PowerShell 5.1 on this machine runs with
// the Restricted policy, which blocks .ps1 files but not -Command.
const LOCK_HOLDERS_CS = `
using System; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class GtaRm {
  [StructLayout(LayoutKind.Sequential)] struct UNIQUE { public int Pid; public System.Runtime.InteropServices.ComTypes.FILETIME Start; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct INFO {
    public UNIQUE Process;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string App;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string Service;
    public int Type; public uint Status; public uint Session; [MarshalAs(UnmanagedType.Bool)] public bool Restartable; }
  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)] static extern int RmStartSession(out uint h, int flags, System.Text.StringBuilder key);
  [DllImport("rstrtmgr.dll")] static extern int RmEndSession(uint h);
  [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)] static extern int RmRegisterResources(uint h, uint nFiles, string[] files, uint nApps, UNIQUE[] apps, uint nSvc, string[] svc);
  [DllImport("rstrtmgr.dll")] static extern int RmGetList(uint h, out uint needed, ref uint count, [In, Out] INFO[] infos, ref uint reasons);
  public static int[] Holders(string file) {
    uint h; var key = new System.Text.StringBuilder(64);
    int r = RmStartSession(out h, 0, key); if (r != 0) throw new Exception("RmStartSession " + r);
    try {
      r = RmRegisterResources(h, 1, new[] { file }, 0, null, 0, null); if (r != 0) throw new Exception("RmRegisterResources " + r);
      uint needed = 0, count = 0, reasons = 0; INFO[] infos = null;
      for (int attempt = 0; attempt < 5; attempt++) {
        r = RmGetList(h, out needed, ref count, infos, ref reasons);
        if (r == 0) break;
        if (r != 234) throw new Exception("RmGetList " + r);
        infos = new INFO[needed]; count = needed;
      }
      if (r != 0) throw new Exception("RmGetList kept growing");
      var pids = new List<int>(); for (int i = 0; i < count; i++) pids.Add(infos[i].Process.Pid);
      return pids.ToArray();
    } finally { RmEndSession(h); }
  }
}`;

// Every process on the machine as id, parent id, start time (ms) and image name. Never a
// command line: those of the user's Firefox can hold the address they launched it with.
const ALL_PROCESSES_PS = `$all = @(Get-CimInstance -Query 'SELECT ProcessId,ParentProcessId,CreationDate,Name FROM Win32_Process' | ForEach-Object {
  $created = 0; if ($_.CreationDate) { $created = ([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() }
  [pscustomobject]@{ pid = [int]$_.ProcessId; ppid = [int]$_.ParentProcessId; created = [long]$created; name = [string]$_.Name } })`;

function runPowerShell(script, env = {}) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...env },
  });
  if (result.error || result.status !== 0) {
    throw new Error(`could not read the process list: ${(result.stderr || result.error?.message || '').trim()}`);
  }
  return JSON.parse(result.stdout);
}

const asArray = (value) => (value === null || value === undefined ? [] : Array.isArray(value) ? value : [value]);

export function readAllProcesses() {
  return asArray(runPowerShell(`$ErrorActionPreference = 'Stop'\n${ALL_PROCESSES_PS}\nConvertTo-Json -InputObject $all -Compress`));
}

// One look at the machine for one profile: every process (as above), the firefox.exe whose
// command line names the profile (matched inside WMI, so no command line leaves it), and
// whoever holds the profile's parent.lock.
export function readProcessTable(profileDir) {
  const name = assertHarnessProfile(profileDir);
  const script = [
    `$ErrorActionPreference = 'Stop'`,
    ALL_PROCESSES_PS,
    // The name is checked by assertHarnessProfile (letters, digits and hyphens only), so it
    // cannot carry a WQL wildcard or a quote.
    `$named = @(Get-CimInstance -Query ("SELECT ProcessId FROM Win32_Process WHERE Name='firefox.exe' AND CommandLine LIKE '%" + $env:GTAB_PROFILE_NAME + "%'") | ForEach-Object { [int]$_.ProcessId })`,
    `$lock = Join-Path $env:GTAB_PROFILE_DIR 'parent.lock'; $holders = @()`,
    `if (Test-Path -LiteralPath $lock) { Add-Type -TypeDefinition $env:GTAB_LOCK_CS; $holders = @([GtaRm]::Holders($lock)) }`,
    `ConvertTo-Json -Compress -Depth 4 -InputObject ([pscustomobject]@{ all = $all; named = $named; lockHolders = $holders })`,
  ].join('\n');
  const raw = runPowerShell(script, { GTAB_PROFILE_DIR: profileDir, GTAB_PROFILE_NAME: name, GTAB_LOCK_CS: LOCK_HOLDERS_CS });
  return { all: asArray(raw.all), named: asArray(raw.named), lockHolders: asArray(raw.lockHolders) };
}

// Pure: which processes in `table` are ours. `known` maps a pid we attributed earlier to
// { created, goneSince } (goneSince: when we first saw it gone, or null). `now` is the time of
// this look. See the header for the three ways a process becomes ours.
export function selectOurs(table, known, now) {
  const alive = new Map(table.all.map((p) => [p.pid, p]));
  const ours = new Map();
  const take = (p) => { if (p) ours.set(p.pid, p); };
  for (const pid of table.named) take(alive.get(pid));
  for (const pid of table.lockHolders) {
    const p = alive.get(pid);
    if (p && p.name.toLowerCase() === 'firefox.exe') take(p);
  }
  for (const [pid, k] of known) {
    const p = alive.get(pid);
    if (p && p.created === k.created) take(p);
  }
  for (let grew = true; grew;) {
    grew = false;
    for (const p of table.all) {
      if (ours.has(p.pid) || !isOurChild(p, ours, known, alive, now)) continue;
      ours.set(p.pid, p);
      grew = true;
    }
  }
  return [...ours.values()];
}

function isOurChild(p, ours, known, alive, now) {
  const parent = ours.get(p.ppid);
  if (parent) return p.created >= parent.created;
  // The parent is not ours right now: either it has gone, or its id now belongs to someone
  // else. It can still be our dead parent, if the child started after the parent did, before
  // we saw the parent gone, and before whoever holds that id now.
  const k = known.get(p.ppid);
  if (!k) return false;
  const holder = alive.get(p.ppid);
  return p.created >= k.created
    && p.created <= (k.goneSince ?? now)
    && (!holder || p.created < holder.created);
}

// Remembers what was ours across looks, so a process that has gone can still be a parent.
export class ProfileProcesses {
  constructor(profileDir, { readTable = readProcessTable, clock = Date.now } = {}) {
    assertHarnessProfile(profileDir);
    this.profileDir = profileDir;
    this.readTable = readTable;
    this.clock = clock;
    this.known = new Map();
  }

  current() {
    const now = this.clock();
    const table = this.readTable(this.profileDir);
    const ours = selectOurs(table, this.known, now);
    for (const p of ours) this.known.set(p.pid, { created: p.created, goneSince: null });
    const alive = new Map(table.all.map((p) => [p.pid, p]));
    for (const [pid, k] of this.known) {
      const p = alive.get(pid);
      if ((!p || p.created !== k.created) && k.goneSince === null) k.goneSince = now;
    }
    return ours;
  }
}

// Kills each process only if the same id still has the same start time; never /T, because
// /T follows parent ids, which Windows does not keep honest. Children are in the list already.
export function killExact(procs, { readAll = readAllProcesses, taskkill = runTaskkill } = {}) {
  if (procs.length === 0) return;
  const alive = readAll();
  for (const p of procs) {
    if (!alive.some((a) => a.pid === p.pid && a.created === p.created)) continue;
    taskkill(p.pid);
  }
}

function runTaskkill(pid) {
  spawnSync('taskkill', ['/PID', String(pid), '/F'], { stdio: 'ignore', windowsHide: true });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Stops every Firefox on the profile (waiting graceMs for it to go by itself first), looks once
// more after settleMs for a browser caught mid-restart, then deletes the profile. Throws if a
// process will not die or the folder will not go: a leaked browser must fail the run.
export async function stopAndRemove(profileDir, tracker, {
  graceMs = 0, kill = killExact, pollMs = 250, killWaitMs = 5_000, settleMs = 1_000, rounds = 3,
} = {}) {
  const waitForNone = async (ms) => {
    const deadline = Date.now() + ms;
    for (;;) {
      const left = tracker.current();
      if (left.length === 0 || Date.now() >= deadline) return left;
      await sleep(pollMs);
    }
  };
  let left = await waitForNone(graceMs);
  for (let pass = 0; pass < rounds; pass++) {
    for (let r = 0; left.length > 0 && r < rounds; r++) {
      kill(left);
      left = await waitForNone(killWaitMs);
    }
    if (left.length > 0) break; // it will not die
    // A browser that is restarting can be invisible for a moment: the old one has gone and
    // the new one has not taken the lock yet. One more look after a pause catches it.
    await sleep(settleMs);
    left = tracker.current();
    if (left.length === 0) break;
  }
  if (left.length > 0) {
    throw new Error(`Firefox still running on ${profileDir} (PIDs ${left.map((p) => p.pid).join(', ')})`);
  }
  await removeProfile(profileDir);
}

export async function removeProfile(dir, { attempts = 20, waitMs = 250 } = {}) {
  assertHarnessProfile(dir);
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      if (!fs.existsSync(dir)) return;
      lastError = new Error('it is still there');
    } catch (err) {
      lastError = err;
    }
    // Firefox can hold profile files for a moment after it exits.
    await sleep(waitMs);
  }
  throw new Error(`could not delete the test profile ${dir}: ${lastError.message}`);
}

// The test process that owns a profile writes its own id and start time into it, so a later
// run can tell a profile whose run died (Ctrl+C, a crash) from one still in use.
export function writeOwner(profileDir, { readAll = readAllProcesses } = {}) {
  const me = readAll().find((p) => p.pid === process.pid);
  if (!me) throw new Error('could not find this test process in the process list');
  fs.writeFileSync(path.join(profileDir, OWNER_FILE), JSON.stringify({ pid: me.pid, created: me.created }));
}

// Stops and deletes harness profiles whose test run has died. A profile with no owner file is
// left alone for its first minute, since another run may be creating it right now.
export async function sweepStaleProfiles({ tmp = os.tmpdir(), readTable = readProcessTable, ...stopOptions } = {}) {
  const swept = [];
  let names;
  try {
    names = fs.readdirSync(tmp).filter((n) => PROFILE_NAME.test(n));
  } catch {
    return swept;
  }
  for (const name of names) {
    const dir = path.join(tmp, name);
    let owner = null;
    try {
      owner = JSON.parse(fs.readFileSync(path.join(dir, OWNER_FILE), 'utf8'));
    } catch {
      try {
        if (Date.now() - fs.statSync(dir).mtimeMs < 60_000) continue;
      } catch {
        continue;
      }
    }
    const table = readTable(dir);
    if (owner && table.all.some((p) => p.pid === owner.pid && p.created === owner.created)) continue;
    await stopAndRemove(dir, new ProfileProcesses(dir, { readTable }), stopOptions);
    swept.push(name);
  }
  return swept;
}
