#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const readline = require('readline');

const root = process.cwd();
const reportsDir = path.join(root, 'reports', 'argent');
const runsDir = path.join(reportsDir, 'runs');
const managerFile = path.join(reportsDir, '.manager.json');
const runScript = path.join(root, 'scripts', 'run-argent-audit.sh');

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function readJsonl(filePath) {
  try {
    return fs
      .readFileSync(filePath, 'utf8')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function listRunDirs() {
  try {
    return fs
      .readdirSync(runsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort();
  } catch {
    return [];
  }
}

function resolveRunId(explicitRunId) {
  if (explicitRunId) return explicitRunId;
  const runs = listRunDirs();
  return runs.length ? runs[runs.length - 1] : null;
}

function runPaths(runId) {
  const base = path.join(runsDir, runId, 'session', 'coord');
  return {
    commands: path.join(base, 'commands.jsonl'),
    events: path.join(base, 'events.jsonl'),
    state: path.join(base, 'state.json'),
  };
}

function parseArg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  if (i === -1 || i + 1 >= process.argv.length) return fallback;
  return process.argv[i + 1];
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function ensureReportsDir() {
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.mkdirSync(runsDir, { recursive: true });
}

function managerState() {
  return readJson(managerFile, {});
}

function isPidAlive(pid) {
  if (!pid || Number.isNaN(Number(pid))) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

function summarize(runId) {
  const p = runPaths(runId);
  const state = readJson(p.state, {});
  const commands = readJsonl(p.commands);
  const events = readJsonl(p.events);
  const acked = new Set(events.filter(e => e.type === 'command_ack').map(e => e.command_id));
  const resulted = new Set(events.filter(e => e.type === 'command_result').map(e => e.command_id));
  const pending = commands.filter(
    c => c.to === 'worker' && !acked.has(c.id) && !resulted.has(c.id)
  );
  return { runId, state, commands, events, pending };
}

function readRunCliLog(runId) {
  const file = path.join(reportsDir, `cli-${runId}.log`);
  try {
    return fs.readFileSync(file, 'utf8').split('\n');
  } catch {
    return [];
  }
}

function parseRunMeta(runId, events) {
  const lines = readRunCliLog(runId);
  let supervisorIntervalSec = null;
  let discoveredFlows = null;
  let watchdogTimeoutSec = null;
  let maxRunTimeSec = null;
  let runWorkspaceDir = null;
  let startedAtLine = null;

  for (const l of lines) {
    if (!l) continue;
    if (!startedAtLine && l.startsWith('Starting Argent audit at ')) {
      startedAtLine = l.replace('Starting Argent audit at ', '').trim();
    }
    if (runWorkspaceDir === null && l.startsWith('Run workspace directory: ')) {
      runWorkspaceDir = l.replace('Run workspace directory: ', '').trim();
    }
    if (discoveredFlows === null && l.startsWith('Discovered flow files: ')) {
      discoveredFlows = Number(l.replace('Discovered flow files: ', '').trim());
    }
    if (watchdogTimeoutSec === null && l.startsWith('Watchdog idle timeout (0 disables): ')) {
      watchdogTimeoutSec = Number(
        l.replace('Watchdog idle timeout (0 disables): ', '').replace(' seconds', '').trim()
      );
    }
    if (maxRunTimeSec === null && l.startsWith('Max run time per attempt: ')) {
      maxRunTimeSec = Number(
        l.replace('Max run time per attempt: ', '').replace(' seconds', '').trim()
      );
    }
    if (supervisorIntervalSec === null && l.startsWith('Supervisor agent enabled: ')) {
      const m = l.match(/interval=(\d+)s/);
      if (m) supervisorIntervalSec = Number(m[1]);
    }
  }

  const supervisorStarts = events.filter(e => e.type === 'supervisor_pass_start');
  const lastSupervisorStartTs = supervisorStarts.length
    ? supervisorStarts[supervisorStarts.length - 1].ts
    : null;

  return {
    supervisorIntervalSec,
    discoveredFlows,
    watchdogTimeoutSec,
    maxRunTimeSec,
    runWorkspaceDir,
    startedAtLine,
    lastSupervisorStartTs,
  };
}

function msToHuman(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'n/a';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtAgeFromIso(isoTs) {
  const age = isoAge(isoTs);
  if (age === null) return 'n/a';
  return `${msToHuman(age)} ago`;
}

function sortEvents(events) {
  return [...events].sort((a, b) => {
    const at = Date.parse(a.ts || '');
    const bt = Date.parse(b.ts || '');
    if (Number.isNaN(at) && Number.isNaN(bt)) return 0;
    if (Number.isNaN(at)) return 1;
    if (Number.isNaN(bt)) return -1;
    return at - bt;
  });
}

function isoAge(isoTs) {
  if (!isoTs) return null;
  const ts = Date.parse(isoTs);
  if (Number.isNaN(ts)) return null;
  return Date.now() - ts;
}

function printDashboard(runId) {
  const s = summarize(runId);
  const worker = s.state.worker || {};
  const supervisor = s.state.supervisor || {};
  const mgr = managerState();
  const pid = mgr.pid;
  const alive = isPidAlive(pid);
  const meta = parseRunMeta(runId, s.events);

  const managerUptime = mgr.started_at ? msToHuman(isoAge(mgr.started_at)) : 'n/a';
  const runElapsed = Number(worker.elapsed_seconds || 0);
  const runElapsedHuman = msToHuman(runElapsed * 1000);
  const maxRemaining =
    meta.maxRunTimeSec && runElapsed > 0
      ? msToHuman(Math.max(0, (meta.maxRunTimeSec - runElapsed) * 1000))
      : 'n/a';

  let supervisorNextIn = 'n/a';
  if (meta.supervisorIntervalSec) {
    if (meta.lastSupervisorStartTs) {
      const nextAt = Date.parse(meta.lastSupervisorStartTs) + meta.supervisorIntervalSec * 1000;
      supervisorNextIn = msToHuman(nextAt - Date.now());
    } else {
      supervisorNextIn = `<= ${meta.supervisorIntervalSec}s (awaiting first pass)`;
    }
  }

  let oldestPending = 'none';
  if (s.pending.length) {
    const ages = s.pending
      .map(c => ({ id: c.id, age: isoAge(c.ts), priority: c.priority || 'normal' }))
      .filter(x => x.age !== null)
      .sort((a, b) => b.age - a.age);
    if (ages.length) {
      oldestPending = `${ages[0].id} (${ages[0].priority}, age=${msToHuman(ages[0].age)})`;
    }
  }

  console.log(`Run: ${runId}`);
  console.log(`Runner PID=${pid || 'none'} alive=${alive ? 'yes' : 'no'} uptime=${managerUptime}`);
  console.log(
    `Worker=${worker.status || 'unknown'} elapsed=${runElapsedHuman} bytes=${worker.output_bytes || 0}`
  );
  console.log(`Supervisor=${supervisor.status || 'unknown'} next-pass-in=${supervisorNextIn}`);
  console.log(
    `Run details: flows=${meta.discoveredFlows ?? '?'} watchdog=${meta.watchdogTimeoutSec ?? '?'}s max=${meta.maxRunTimeSec ?? '?'}s remaining=${maxRemaining}`
  );
  if (meta.runWorkspaceDir) {
    console.log(`Workspace: ${meta.runWorkspaceDir}`);
  }
  console.log(
    `Queue: commands=${s.commands.length} pending=${s.pending.length} events=${s.events.length} oldest-pending=${oldestPending}`
  );
  if (s.pending.length > 0) {
    console.log('Alerts:');
    for (const c of s.pending.slice(-3)) {
      console.log(
        `- pending ${c.id} [${c.priority || 'normal'}] ${c.command || 'unknown'} (${fmtAgeFromIso(c.ts)})`
      );
    }
  }
}

function runMessageLogPath(runId) {
  return path.join(reportsDir, `agent-${runId}.log`);
}

function parseHumanMessages(runId, limit) {
  const file = runMessageLogPath(runId);
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const lines = raw
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);
    const messages = [];
    for (const line of lines) {
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      if (parsed.type !== 'assistant') continue;
      const parts = parsed.message?.content || [];
      for (const p of parts) {
        if (!p?.text) continue;
        const text = String(p.text).replace(/\s+/g, ' ').trim();
        if (!text) continue;
        // Ignore token fragments from partial stream chunks.
        if (text.length < 24 || !text.includes(' ')) continue;
        if (messages.length === 0 || messages[messages.length - 1] !== text) {
          messages.push(text);
        }
      }
    }
    return messages.slice(-limit);
  } catch {
    return [];
  }
}

function printStatus(runId) {
  const s = summarize(runId);
  printDashboard(runId);
  console.log(
    `Commands total=${s.commands.length} pending=${s.pending.length} | Events=${s.events.length}`
  );
  if (s.pending.length) {
    console.log('Pending:');
    for (const c of s.pending.slice(-5)) {
      console.log(`- ${c.id} [${c.priority || 'normal'}] ${c.command || 'unknown'}`);
    }
  }
  const recent = s.events.slice(-5);
  if (recent.length) {
    console.log('Recent events:');
    for (const e of recent) {
      const note = e.notes || e.note || '';
      console.log(`- ${e.ts || '?'} ${e.type || 'event'} ${note}`.trim());
    }
  }
}

function watch(runId, interval, lines) {
  let prevEventCount = -1;
  let prevMsgSignature = '';
  let tickCount = 0;
  const spinnerFrames = ['|', '/', '-', '\\'];

  const shorten = (text, max = 170) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

  const tick = () => {
    tickCount += 1;
    const spinner = spinnerFrames[tickCount % spinnerFrames.length];
    readline.cursorTo(process.stdout, 0, 0);
    readline.clearScreenDown(process.stdout);

    console.log(`[watch ${spinner}] run=${runId} interval=${interval}ms`);
    printDashboard(runId);
    const s = summarize(runId);
    const sortedEvents = sortEvents(s.events);
    const msgs = parseHumanMessages(runId, Math.max(6, Math.floor(lines / 2)));
    const msgSignature = msgs.slice(-4).join('|');
    const newEvents = prevEventCount >= 0 ? Math.max(0, s.events.length - prevEventCount) : 0;
    const newMsgs = prevMsgSignature && prevMsgSignature !== msgSignature ? 1 : 0;

    console.log(
      `\nUpdates: +${newEvents} event(s) | ${newMsgs ? 'new human message(s)' : 'no new human messages'}`
    );
    console.log(`\nTimeline (latest ${lines}, chronological):`);
    for (const e of sortedEvents.slice(-lines)) {
      const note = (e.notes || e.note || e.rationale || '').trim();
      const ts = e.ts || '?';
      const age = fmtAgeFromIso(e.ts);
      if (note) {
        console.log(`${ts} (${age}) | ${e.type || 'event'} | ${note}`);
      } else {
        console.log(`${ts} (${age}) | ${e.type || 'event'}`);
      }
    }
    if (msgs.length) {
      console.log('\nLatest human-readable messages:');
      for (const m of msgs.slice(-3)) {
        console.log(`- ${shorten(m)}`);
      }
    }
    console.log('\nCtrl+C to exit | yarn argent:inject "..." --priority urgent');

    prevEventCount = s.events.length;
    prevMsgSignature = msgSignature;
  };
  tick();
  const timer = setInterval(tick, interval);
  process.on('SIGINT', () => {
    clearInterval(timer);
    process.stdout.write('\n');
    process.exit(0);
  });
}

function inject(runId, message, priority, commandName) {
  const p = runPaths(runId);
  const entry = {
    id: `cmd-${crypto.randomUUID()}`,
    ts: new Date().toISOString(),
    run_id: runId,
    from: 'human-operator',
    to: 'worker',
    priority,
    command: commandName,
    payload_text: message,
  };
  fs.appendFileSync(p.commands, `${JSON.stringify(entry)}\n`, 'utf8');
  console.log(`Injected ${entry.id} -> ${runId}`);
}

function listRuns() {
  const runs = listRunDirs().reverse();
  if (!runs.length) {
    console.log('No runs found.');
    return;
  }
  console.log('Recent runs:');
  for (const r of runs.slice(0, 20)) {
    console.log(`- ${r}`);
  }
}

function startRun() {
  ensureReportsDir();
  if (!fs.existsSync(runScript)) {
    console.error(`Missing run script: ${runScript}`);
    process.exit(1);
  }
  const current = managerState();
  if (current.pid && isPidAlive(current.pid)) {
    console.log(`Runner already active (pid=${current.pid}).`);
    return;
  }
  const child = spawn(runScript, {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();
  writeJson(managerFile, {
    pid: child.pid,
    started_at: new Date().toISOString(),
    source: 'yarn-argent',
  });
  console.log(`Started runner (pid=${child.pid}).`);
}

function stopRun() {
  const current = managerState();
  if (!current.pid) {
    console.log('No managed runner pid found.');
    return;
  }
  const pid = Number(current.pid);
  if (!isPidAlive(pid)) {
    console.log(`Runner pid ${pid} is already stopped.`);
    try {
      fs.unlinkSync(managerFile);
    } catch (_error) {
      // Best effort cleanup when manager file is already absent.
    }
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch (_error) {
      // Ignore: process may have exited between checks.
    }
  }
  console.log(`Sent stop signal to runner pid ${pid}.`);
}

function restartRun() {
  stopRun();
  setTimeout(() => startRun(), 400);
}

function removeIfExists(filePath) {
  try {
    fs.rmSync(filePath, { recursive: true, force: true });
  } catch (_error) {
    // Ignore cleanup failures; caller tracks intended removals.
  }
}

function cleanArtifacts(removeRuns) {
  ensureReportsDir();
  const mgr = managerState();
  if (mgr.pid && isPidAlive(mgr.pid)) {
    console.error(`Runner is active (pid=${mgr.pid}). Stop it first: yarn argent stop`);
    process.exit(1);
  }

  const removed = [];
  const topLevel = fs.readdirSync(reportsDir, { withFileTypes: true });
  for (const entry of topLevel) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    if (name.startsWith('agent-') || name.startsWith('cli-') || name.startsWith('verifier-')) {
      const target = path.join(reportsDir, name);
      removeIfExists(target);
      removed.push(target);
    }
  }

  const runs = listRunDirs();
  for (const runId of runs) {
    const runDir = path.join(runsDir, runId);
    const files = fs.readdirSync(runDir, { withFileTypes: true });
    for (const f of files) {
      if (!f.isFile()) continue;
      if (f.name.startsWith('verifier-pass-')) {
        const target = path.join(runDir, f.name);
        removeIfExists(target);
        removed.push(target);
      }
    }
    if (removeRuns) {
      removeIfExists(runDir);
      removed.push(runDir);
    }
  }

  removeIfExists(managerFile);
  removed.push(managerFile);

  console.log(
    removeRuns
      ? 'Cleaned working artifacts and removed all runs.'
      : 'Cleaned working artifacts (kept run folders).'
  );
  console.log(`Removed ${removed.length} path(s).`);
}

function printMessages(runId, lines) {
  const msgs = parseHumanMessages(runId, lines);
  if (!msgs.length) {
    console.log('No human-readable messages found yet.');
    return;
  }
  console.log(`Messages for run ${runId}:`);
  for (const m of msgs) {
    console.log(`- ${m}`);
  }
}

function usage() {
  console.log('Argent operator CLI');
  console.log('');
  console.log('Run control:');
  console.log('  yarn argent start');
  console.log('  yarn argent stop');
  console.log('  yarn argent restart');
  console.log('  yarn argent clean [--all]');
  console.log('  yarn argent runs');
  console.log('');
  console.log('Observability:');
  console.log('  yarn argent status [--run <id>]');
  console.log('  yarn argent watch [--run <id>] [--interval <ms>] [--lines <n>]');
  console.log('  yarn argent messages [--run <id>] [--lines <n>]');
  console.log('');
  console.log('Control plane:');
  console.log(
    '  yarn argent inject <message> [--run <id>] [--priority normal|urgent] [--command <name>]'
  );
}

function main() {
  const cmd = process.argv[2];
  if (!cmd || cmd === '--help' || cmd === '-h') {
    usage();
    process.exit(0);
  }
  if (cmd === 'start') {
    startRun();
    return;
  }
  if (cmd === 'stop') {
    stopRun();
    return;
  }
  if (cmd === 'restart') {
    restartRun();
    return;
  }
  if (cmd === 'clean') {
    cleanArtifacts(hasFlag('--all'));
    return;
  }
  if (cmd === 'runs') {
    listRuns();
    return;
  }

  const runId = resolveRunId(parseArg('--run'));
  if (!runId) {
    console.error('No runs found in reports/argent/runs');
    process.exit(1);
  }
  if (cmd === 'status') {
    printStatus(runId);
    return;
  }
  if (cmd === 'watch') {
    watch(runId, Number(parseArg('--interval', '2000')), Number(parseArg('--lines', '12')));
    return;
  }
  if (cmd === 'messages') {
    printMessages(runId, Number(parseArg('--lines', '30')));
    return;
  }
  if (cmd === 'inject') {
    const message = process.argv[3];
    if (!message || message.startsWith('--')) {
      console.error('inject requires a message');
      process.exit(1);
    }
    inject(
      runId,
      message,
      parseArg('--priority', 'normal'),
      parseArg('--command', 'human_instruction')
    );
    return;
  }
  usage();
  process.exit(1);
}

main();
