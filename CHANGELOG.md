# Changelog

All notable changes to **ganvil** are documented here.
(Renamed from `harness` in v1.3.0.)

## [v1.3.0] — 2026-06-23

### Renamed `harness` → `ganvil`
- **ganvil** = **GAN** + **anvil**: an adversarial coding harness where a generator and an evaluator hammer each sprint toward a quality bar.
- Plugin name, the `harness/` directory, skill subdirs (`harness-{build,plan,evaluate}` → `{build,plan,evaluate}`), and every runtime token (`ganvil-artifacts/`, `ganvil-wt-` worktrees, `ganvil_` DB prefix, `/ganvil:build|plan|evaluate`, `ganvil: merge`).
- Preserved: Anthropic paper citations ("Harness Design…", "Effective Harnesses…") and the "coding harness" category descriptor.

### Pipeline-state schema unified
- Serial and TEAM modes now share one 14-column schema (the one `bin/team-scheduler` reads/writes): `Sprint | Deps | Status | Wave | Worktree | Branch | DB | Port | TaskID | Iter | Last Scores | W History | Stall | Notes`.
- Stall terms aligned across modes: `Score Trend` → `W History`, `Stall Count` → `Stall`.

## [v1.2.0] — 2026-06-23

### TEAM parallel mode (SPRINT-TEAM)
- Phase-internal parallelism: independent sprints run concurrently in separate worktrees, scheduled by a stateless `bin/team-scheduler` (JSON + exit-code contract over git + pipeline-state + spec DAG). `main` stays dependency-closed.
- Background-dispatch wave loop; per-branch stall; fix-forward (no revert/bisect). Runtime isolation triad (DB + data-dir + port). Concurrency cap C=2 by default.
- `userConfig.defaultParallelism` (`always-serial` | `auto` | `always-team`), defaulting to `always-serial` until dogfooded on real multi-branch projects.

### Frontend closed-loop evaluation rework
- 5 dimensions — Design Quality / Originality / **Functional Completeness** (HIGH); Craft / UX-Usability (STANDARD).
- Feature Loop Matrix (6 stages, incl. survives-refresh) + **persistence veto**: pretty-but-hollow apps now hard-FAIL.
- State matrix, FuncComp calibration, Wire/Fix generator strategy, cross-sprint regression check.

### `team-scheduler` correctness pass
- Fixed: orphan-cleanup path mismatch (relative vs absolute — live worktrees were unprotected on resume), `isPortFree` async port probe (EADDRINUSE is an event, not a throw), escalate-tagged worktree retention, hardcoded `main` integration branch, clear-before-remove in merge, branch leak on port exhaustion.
- `cmdStall` now implements A8 (3 consecutive FAILs AND last-2-rounds ΔW ≤ 0) via the `W History` column.
- Tests 7 → 11 (added bind/lookup, wave-done?, stall-recommend, occupied-port probe, real escalate retention).

### PR-A bugfixes
- Correct Playwright MCP package (`@playwright/mcp`); portable multi-line `.gitignore`; `/ganvil:build|plan|evaluate` skill naming; explicit improvement metric `W = 2×HIGH + 1×STD`; TaskList progress mirroring.

## [v1.1.0] — spec completion improvements
- Planner spec-completion refinements (feature priority tagging, sprint dependency graph).

[v1.3.0]: https://github.com/superduke/ganvil/releases/tag/v1.3.0
[v1.2.0]: https://github.com/superduke/ganvil/releases/tag/v1.2.0
[v1.1.0]: https://github.com/superduke/ganvil/releases/tag/v1.1.0
