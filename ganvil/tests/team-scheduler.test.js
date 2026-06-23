// Unit tests for bin/team-scheduler. Run:  node --test ganvil/tests/
// Each test builds a throwaway git repo + pipeline-state.md + spec DAG and
// invokes the script as a child process (stateless, as in production).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const { execFileSync } = require('child_process');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = fs;

const SCRIPT = path.join(__dirname, '..', 'bin', 'team-scheduler');

function setup(dagText, rows) {
  // Nest the repo under a unique parent so worktrees (../ganvil-wt-*) resolve
  // INSIDE that parent — isolating them per test (avoids /tmp-wide collisions).
  const parent = mkdtempSync(path.join(os.tmpdir(), 'hs-'));
  const dir = path.join(parent, 'repo');
  mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '-q', '-b', 'main', dir]);
  execFileSync('git', ['-C', dir, 'config', 'user.email', 't@t']); execFileSync('git', ['-C', dir, 'config', 'user.name', 't']);
  execFileSync('git', ['-C', dir, 'config', 'commit.gpgsign', 'false']);
  mkdirSync(path.join(dir, 'ganvil-artifacts'), { recursive: true });
  writeFileSync(path.join(dir, 'ganvil-artifacts', 'spec.md'), `# T\n\n## Sprint Dependency Graph\n${dagText}\n`);
  writeFileSync(path.join(dir, 'ganvil-artifacts', 'pipeline-state.md'), stateMd(rows));
  execFileSync('git', ['-C', dir, 'add', '-A']); execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'init']);
  return dir;
}
function stateMd(rows) {
  const H = '| Sprint | Deps | Status | Wave | Worktree | Branch | DB | Port | TaskID | Iter | Last Scores | W History | Stall | Notes |';
  const S = '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |';
  const body = rows.map(r => `| ${r.id} | [${(r.deps||[]).join(',')}] | ${r.status||'PENDING'} | ${r.wave||0} | ${r.worktree||'-'} | ${r.branch||'-'} | ${r.db||'-'} | ${r.port||'-'} | ${r.taskid||'-'} | ${r.iter||0} | ${r.scores||'-'} | ${r.whist||'-'} | ${r.stall||0} | - |`);
  return `# Pipeline State\n\n## Sprint Progress\n\n${[H,S,...body].join('\n')}\n`;
}
function run(dir, args) {
  // Clear NODE_OPTIONS for the child: the parent session may carry a broken
  // preload (e.g. a cmux wrapper) that makes plain `node` fail to start.
  const env = { ...process.env, NODE_OPTIONS: '' };
  try { return { stdout: execFileSync('node', [SCRIPT, ...args], { cwd: dir, encoding: 'utf8', env }), code: 0 }; }
  catch (e) { return { stdout: (e.stdout || '').toString(), code: e.status }; }
}
function json(res) { return JSON.parse(res.stdout.trim().split('\n').pop()); }

test('next: RUNNABLE derived from DAG (independent branches surface; dependent stays blocked)', () => {
  const dir = setup('- B1: deps []\n- B2: deps [B1]\n- B3: deps []\n- B4: deps [B2, B3]',
    [{ id: 'B1' }, { id: 'B2' }, { id: 'B3' }, { id: 'B4' }]);
  const res = json(run(dir, ['next', '2']));
  assert.ok(res.ok);
  assert.deepEqual(res.runnable.sort(), ['B1', 'B3']);   // B2 needs B1; B4 needs B2+B3
  assert.ok(!res.runnable.includes('B2') && !res.runnable.includes('B4'));
  rmSync(path.dirname(dir), { recursive: true, force: true });
});

test('allocate: assigns worktree+port+DB, status RUNNING, writes lease', () => {
  const dir = setup('- B1: deps []', [{ id: 'B1' }]);
  const res = json(run(dir, ['allocate', 'B1']));
  assert.ok(res.ok);
  assert.equal(res.id, 'B1');
  assert.match(res.branch, /backend\/B1/);
  assert.ok(res.port >= 8100 && res.port <= 8199);
  assert.match(res.db, /ganvil_b1/);
  assert.ok(fs.existsSync(path.join(dir, 'ganvil-artifacts', 'sprint-B1-lease.json')));
  rmSync(path.dirname(dir), { recursive: true, force: true });
});

test('allocate: a system-occupied port is skipped (isPortFree actually probes the OS, not just pipeline-state)', async () => {
  const dir = setup('- B1: deps []', [{ id: 'B1' }]);
  // Hold 8100 from the test process; the scheduler probes in a CHILD process, so
  // it must see this via the OS (EADDRINUSE), not via pipeline-state. If 8100 was
  // already taken by something else, the assertion still holds — the blocker just
  // guarantees it. Await the bind so we don't race the child probe; try/finally so
  // a failed assertion can't leak the listener and hang the test runner.
  const blocker = net.createServer();
  let bound = true;
  await new Promise(res => {
    blocker.once('listening', res);
    blocker.once('error', () => { bound = false; res(); });
    blocker.listen(8100, '127.0.0.1');
  });
  try {
    if (bound) {                                  // 8100 ours → scheduler must skip it
      const res = json(run(dir, ['allocate', 'B1']));
      assert.ok(res.ok);
      assert.ok(res.port > 8100, 'occupied 8100 must be skipped; got ' + res.port);
    }
  } finally {
    try { blocker.close(); } catch {}
    rmSync(path.dirname(dir), { recursive: true, force: true });
  }
});

test('merge invariant: refuses to merge when a dep is not yet in main (exit 2)', () => {
  const dir = setup('- B1: deps []\n- B4: deps [B1]', [{ id: 'B1' }, { id: 'B4' }]);
  run(dir, ['allocate', 'B4']);                 // B4 RUNNING with its own branch/worktree
  const res = run(dir, ['merge', 'B4']);        // B1 not merged yet → must refuse
  assert.equal(res.code, 2);
  rmSync(path.dirname(dir), { recursive: true, force: true });
});

test('merge: succeeds once deps are merged; main stays dependency-closed', () => {
  const dir = setup('- B1: deps []\n- B2: deps [B1]', [{ id: 'B1' }, { id: 'B2' }]);
  run(dir, ['allocate', 'B1']); run(dir, ['merge', 'B1']);           // B1 → MERGED
  const before = json(run(dir, ['status'])); assert.ok(before.mainInvariantHolds);
  run(dir, ['allocate', 'B2']);
  const m = json(run(dir, ['merge', 'B2']));   // B2 dep B1 now satisfied
  assert.ok(m.ok && m.merged);
  const after = json(run(dir, ['status'])); assert.ok(after.mainInvariantHolds);
  rmSync(path.dirname(dir), { recursive: true, force: true });
});

test('port/DB lease reclaimed after merge (next allocate may reuse the port)', () => {
  const dir = setup('- B1: deps []\n- B3: deps []', [{ id: 'B1' }, { id: 'B3' }]);
  run(dir, ['allocate', 'B1']); run(dir, ['merge', 'B1']);           // B1's port freed
  const res = json(run(dir, ['allocate', 'B3']));
  assert.ok(res.ok && res.port >= 8100);
  rmSync(path.dirname(dir), { recursive: true, force: true });
});

test('orphan cleanup: plain orphan removed, escalate-tagged worktree retained', () => {
  const dir = setup('- B1: deps []', [{ id: 'B1' }]);
  const uniq = path.basename(path.dirname(dir));
  // escalated orphan: worktree on backend/B1, with an escalate-B1 tag → must survive
  execFileSync('git', ['-C', dir, 'worktree', 'add', path.join(dir, '..', 'ganvil-wt-backend-B1-' + uniq), '-b', 'backend/B1', 'main']);
  execFileSync('git', ['-C', dir, 'tag', 'escalate-B1']);
  // plain orphan: no escalate tag → must be cleaned
  execFileSync('git', ['-C', dir, 'worktree', 'add', path.join(dir, '..', 'ganvil-wt-plain-' + uniq), '-b', 'plain/' + uniq, 'main']);
  const res = json(run(dir, ['init', 'all']));
  assert.ok(res.ok);
  assert.ok(res.cleaned.length >= 1, 'plain orphan should be cleaned');
  const escWt = path.resolve(dir, '..', 'ganvil-wt-backend-B1-' + uniq);
  assert.ok(fs.existsSync(escWt), 'escalate-tagged worktree must be retained for post-mortem');
  rmSync(path.dirname(dir), { recursive: true, force: true });
});

test('bind + lookup: task↔sprint correlation survives a fresh (stateless) process', () => {
  const dir = setup('- B1: deps []', [{ id: 'B1' }]);
  const b = json(run(dir, ['bind', 'B1', 'task-42']));
  assert.ok(b.ok && b.id === 'B1' && b.taskid === 'task-42');
  const l = json(run(dir, ['lookup', 'task-42']));                 // fresh process — reads pipeline-state
  assert.ok(l.ok && l.sprint === 'B1');
  const miss = run(dir, ['lookup', 'nope']);                       // unknown task → recoverable exit 1
  assert.equal(miss.code, 1);
  rmSync(path.dirname(dir), { recursive: true, force: true });
});

test('wave-done?: false while a sprint is RUNNING, true when none active', () => {
  const dirA = setup('- B1: deps []', [{ id: 'B1', status: 'RUNNING' }]);
  const mid = json(run(dirA, ['wave-done?']));
  assert.ok(mid.ok && mid.done === false);
  assert.deepStrictEqual(mid.active, ['B1']);
  rmSync(path.dirname(dirA), { recursive: true, force: true });

  const dirB = setup('- B1: deps []\n- B2: deps []', [{ id: 'B1', status: 'MERGED' }, { id: 'B2', status: 'MERGED' }]);
  const end = json(run(dirB, ['wave-done?']));
  assert.ok(end.ok && end.done === true && end.active.length === 0);
  rmSync(path.dirname(dirB), { recursive: true, force: true });
});

test('stall-recommend: A8 — 3 fails + flat W stalls; improving W or <3 fails iterates', () => {
  // stalled + has deps → scope-reduce (W 30/28/28 → ΔW -2,0)
  const dirS = setup('- B4: deps [B1]', [{ id: 'B4', stall: 3, whist: '30/28/28' }]);
  const s = json(run(dirS, ['stall-recommend', 'B4']));
  assert.ok(s.ok);
  assert.equal(s.recommend, 'scope-reduce');
  rmSync(path.dirname(dirS), { recursive: true, force: true });

  // stalled + no deps → escalate
  const dirE = setup('- B1: deps []', [{ id: 'B1', stall: 3, whist: '30/28/28' }]);
  const e = json(run(dirE, ['stall-recommend', 'B1']));
  assert.ok(e.ok);
  assert.equal(e.recommend, 'escalate');
  rmSync(path.dirname(dirE), { recursive: true, force: true });

  // 3 fails but W still improving (28/30/32 → ΔW +2,+2) → iterate
  const dirI = setup('- B4: deps [B1]', [{ id: 'B4', stall: 3, whist: '28/30/32' }]);
  const i = json(run(dirI, ['stall-recommend', 'B4']));
  assert.ok(i.ok);
  assert.equal(i.recommend, 'iterate');
  rmSync(path.dirname(dirI), { recursive: true, force: true });

  // <3 fails even with flat W → iterate (A8 is a conjunction)
  const dirF = setup('- B4: deps [B1]', [{ id: 'B4', stall: 2, whist: '30/28/28' }]);
  const f = json(run(dirF, ['stall-recommend', 'B4']));
  assert.ok(f.ok);
  assert.equal(f.recommend, 'iterate');
  rmSync(path.dirname(dirF), { recursive: true, force: true });
});

test('JSON contract + exit codes: unknown command is fatal (exit 2)', () => {
  const dir = setup('- B1: deps []', [{ id: 'B1' }]);
  const res = run(dir, ['bogus']);
  assert.equal(res.code, 2);
  const errObj = JSON.parse(res.stdout.trim().split('\n').pop());
  assert.equal(errObj.ok, false);
  rmSync(path.dirname(dir), { recursive: true, force: true });
});
