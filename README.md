# Ganvil

> **From a one-line brief to a shipped app — forged in a generator ↔ evaluator clash.**
>
> *ganvil* = **GAN** + **anvil**: a generator and evaluator hammer each sprint toward a quality bar.

**Ganvil** is an autonomous coding harness for [Claude Code](https://claude.com/claude-code) that turns a 1–4 sentence product description into a working application through a **Planner → Generator ↔ Evaluator** pipeline with Sprint decomposition. It's GAN-inspired: the agent that generates is separate from the agent that evaluates, so quality is judged independently instead of self-graded.

Inspired by [Anthropic's harness design research](https://www.anthropic.com/engineering/harness-design-long-running-apps).

## What's in this repo

This repo is a Claude Code **plugin marketplace**:

```
.
├── ganvil/                            # the plugin itself
│   ├── agents/                        # planner + frontend/backend generator & evaluator
│   ├── skills/                        # build, plan, evaluate, frontend-design, ai-integration
│   ├── bin/team-scheduler             # stateless TEAM wave scheduler
│   ├── tests/                         # node:test suite (11 tests)
│   ├── docs/                          # TEAM_MODE.md, EVAL_REWORK.md
│   └── README.md                      # ← full docs, architecture, evaluation criteria
├── .claude-plugin/marketplace.json    # marketplace manifest
├── CHANGELOG.md
└── LICENSE                            # MIT
```

## Install

**Option A — from this marketplace** (recommended):
```bash
claude /plugin marketplace add superduke/ganvil
claude /plugin install ganvil@ganvil
```

**Option B — direct plugin dir:**
```bash
claude --plugin-dir /path/to/ganvil
```

## Quick start

```
/ganvil:build A collaborative whiteboard tool with real-time editing and AI-assisted drawing
/ganvil:plan   A data visualization dashboard for IoT sensor data
/ganvil:evaluate frontend
```

Runtime artifacts land in `ganvil-artifacts/` (spec, sprint contracts, build logs, evaluations, screenshots).

## Documentation

- **Full README & architecture** — [`ganvil/README.md`](./ganvil/README.md)
- **TEAM parallel mode** — [`ganvil/docs/TEAM_MODE.md`](./ganvil/docs/TEAM_MODE.md)
- **Frontend closed-loop evaluation** — [`ganvil/docs/EVAL_REWORK.md`](./ganvil/docs/EVAL_REWORK.md)
- **Changelog** — [`CHANGELOG.md`](./CHANGELOG.md)

## Status

v1.3.0. TEAM parallel mode (`SPRINT-TEAM`) ships serial-safe (at C=1 it's identical to serial `SPRINT`) with the scheduler plumbing in place; true multi-branch parallelism is gated behind dogfooding on real projects (`userConfig.defaultParallelism` defaults to `always-serial`).

## License

MIT © superduke
