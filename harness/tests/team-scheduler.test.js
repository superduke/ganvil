// Unit tests for bin/team-scheduler. Run:  node --test harness/tests/
// Each test builds a throwaway git repo + pipeline-state.md + spec DAG and
// invokes the script as a child process (stateless, as in production).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = fs;

const SCRIPT = path.join(__dirname, '..', 'bin', 'team-scheduler');

function setup(dagText, rows) {
  // Nest the repo under a unique parent so worktrees (../harness-wt-*) resolve
  // INSIDE that parent — isolating them per test (avoids /tmp-wide collisions).
  const parent = mkdtempSync(path.join(os.tmpdir(), 'hs-'));
  const dir = path.join(parent, 'repo');
  mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '-q', '-b', 'main', dir]);
  execFileSync('git', ['-C', dir, 'config', 'user.email', 't@t']); execFileSync('git', ['-C', dir, 'config', 'user.name', 't']);
  execFileSync('git', ['-C', dir, 'config', 'commit.gpgsign', 'false']);
  mkdirSync(path.join(dir, 'harness-artifacts'), { recursive: true });
  writeFileSync(path.join(dir, 'harness-artifacts', 'spec.md'), `# T\n\n## Sprint Dependency Graph\n${dagText}\n`);
  writeFileSync(path.join(dir, 'harness-artifacts', 'pipeline-state.md'), stateMd(rows));
  execFileSync('git', ['-C', dir, 'add', '-A']); execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'init']);
  return dir;
}
function stateMd(rows) {
  const H = '| Sprint | Deps | Status | Wave | Worktree | Branch | DB | Port | TaskID | Iter | Last Scores | Stall | Notes |';
  const S = '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |';
  const body = rows.map(r => `| ${r.id} | [${(r.deps||[]).join(',')}] | ${r.status||'PENDING'} | ${r.wave||0} | - | - | - | - | - | ${r.iter||0} | ${r.scores||'-'} | ${r.stall||0} | - |`);
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
  assert.match(res.db, /harness_b1/);
  assert.ok(fs.existsSync(path.join(dir, 'harness-artifacts', 'sprint-B1-lease.json')));
  rmSync(path.dirname(dir), { recursive: true, force: true });
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

test('orphan worktree cleanup: init removes unrecorded worktree, keeps escalate-tagged', () => {
  const dir = setup('- B1: deps []', [{ id: 'B1' }]);
  // create an orphan worktree not recorded in pipeline-state
  execFileSync('git', ['-C', dir, 'worktree', 'add', path.join(dir, '..', 'harness-wt-orphan-' + path.basename(dir)), '-b', 'orphan/' + path.basename(dir), 'main']);
  const res = json(run(dir, ['init', 'all']));
  assert.ok(res.ok);
  assert.ok(res.cleaned.length >= 1, 'orphan should be cleaned');
  rmSync(path.dirname(dir), { recursive: true, force: true });
});

test('JSON contract + exit codes: unknown command is fatal (exit 2)', () => {
  const dir = setup('- B1: deps []', [{ id: 'B1' }]);
  const res = run(dir, ['bogus']);
  assert.equal(res.code, 2);
  const errObj = JSON.parse(res.stdout.trim().split('\n').pop());
  assert.equal(errObj.ok, false);
  rmSync(path.dirname(dir), { recursive: true, force: true });
});
