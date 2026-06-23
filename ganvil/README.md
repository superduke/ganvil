# Ganvil — Autonomous Coding Harness for Claude Code

A long-running autonomous coding harness with **Planner → Generator ↔ Evaluator** architecture and Sprint decomposition, inspired by [Anthropic's harness design research](https://www.anthropic.com/engineering/harness-design-long-running-apps).

## What It Does

This plugin transforms a brief product description (1-4 sentences) into a working application through a multi-agent pipeline:

1. **Planner** — Expands your description into a full product spec, classifies the project type (frontend/backend/fullstack), and decomposes work into sprints with testable acceptance criteria.
2. **Generator** — Implements features sprint by sprint. Separate specialized agents for frontend (design-focused) and backend (correctness-focused) work.
3. **Evaluator** — Independently tests each sprint output against acceptance criteria. Uses browser automation for frontend QA and API testing for backend QA. Scores on four dimensions and sends actionable feedback. Iterates with the generator until quality thresholds are met.

### Key Design Decisions

- **Sprint decomposition** with context resets via handoff artifacts — works reliably within 200K context windows
- **Four execution modes** — SPRINT (default, serial), SPRINT-TEAM (phase-internal parallelism via the stateless `team-scheduler`), CONTINUOUS (simple projects), and CONTINUOUS-LITE (user opt-in for advanced models)
- **Frontend/backend separation** — different generators and evaluators with domain-specific expertise
- **Fullstack ordering** — backend sprints complete first, then frontend sprints (frontend can depend on backend APIs)
- **Sprint contract negotiation** — evaluator reviews and co-negotiates sprint contracts before the generator builds, ensuring quality gates are meaningful
- **Stall detection, not iteration limits** — generator-evaluator cycle continues while scores improve; if stalled (3+ failures with no improvement), scope reduction or escalation kicks in
- **Existing codebase awareness** — planner detects and adapts to existing projects rather than always starting from scratch
- **AI-powered feature integration** — planner weaves AI features into specs; generators follow tool-use agent patterns via the ai-integration skill
- **GAN-inspired architecture** — separating the agent that generates from the agent that evaluates solves the self-evaluation bias problem
- **Browser automation via Playwright MCP** — evaluator interacts with running applications, takes mandatory screenshots as evidence
- **Few-shot calibration** — evaluators use anchored scoring examples to prevent score drift across iterations
- **Strategic feedback response** — generators make explicit Refine vs. Pivot (frontend) or Patch vs. Refactor (backend) decisions based on score trends
- **Git discipline** — version control initialized at project start, commit conventions enforced, safety tags before fixes
- **Design Reference Library** — 12 real-world design systems from [awesome-design-md](https://github.com/VoltAgent/awesome-design-md) used for calibration and inspiration

## Installation

### Local Testing

```bash
claude --plugin-dir /path/to/ganvil
```

### Permanent Installation

Copy the `ganvil/` directory to your Claude Code plugins location, or use:

```bash
claude /plugin install /path/to/ganvil
```

## Usage

### Full Build Pipeline

Build a complete application from a description:

```
/ganvil:build A collaborative whiteboard tool with real-time editing and AI-assisted drawing
```

This will:
1. Plan → generate a full product spec in `ganvil-artifacts/spec.md`
2. Classify the project (e.g., FULLSTACK)
3. Execute backend sprints (if applicable), each evaluated and iterated until passing
4. Execute frontend sprints, each evaluated and iterated until passing

### Just Plan

Generate a product spec without building:

```
/ganvil:plan A data visualization dashboard for IoT sensor data
```

Output: `ganvil-artifacts/spec.md`

### Just Evaluate

QA-evaluate an existing project:

```
/ganvil:evaluate                          # auto-detect project type
/ganvil:evaluate frontend                 # evaluate frontend only
/ganvil:evaluate backend focus on auth    # evaluate backend with focus area
```

## Architecture

```
ganvil/
├── .claude-plugin/plugin.json    # Plugin manifest
├── .mcp.json                     # Playwright MCP for browser automation
├── agents/
│   ├── planner.md               # Product spec + sprint planning
│   ├── frontend-generator.md    # Frontend implementation (with Refine/Pivot strategy)
│   ├── backend-generator.md     # Backend implementation (with Patch/Refactor strategy)
│   ├── frontend-evaluator.md    # Frontend QA (4-dimension scoring + screenshots)
│   └── backend-evaluator.md     # Backend QA (4-dimension scoring + calibration)
├── skills/
│   ├── build/SKILL.md     # Main entry: full pipeline orchestration
│   ├── plan/SKILL.md      # Planning only
│   ├── evaluate/SKILL.md  # Evaluation only
│   ├── frontend-design/SKILL.md # Design standards + calibration examples + reference library
│   └── ai-integration/SKILL.md  # AI feature patterns + Anthropic API
├── settings.json
└── README.md
```

### Communication via Files

Agents communicate through `ganvil-artifacts/`:

| File | Producer | Consumer |
|------|----------|----------|
| `spec.md` | Planner | Generator, Evaluator |
| `pipeline-state.md` | Orchestrator | Orchestrator (external memory across sprints) |
| `sprint-{ID}-contract.md` | Orchestrator | Evaluator (review), Generator, Evaluator |
| `sprint-{ID}-contract-review.md` | Evaluator | Orchestrator (to finalize contract) |
| `backend-build-log.md` | Backend Generator | Backend Evaluator |
| `frontend-build-log.md` | Frontend Generator | Frontend Evaluator |
| `backend-evaluation.md` | Backend Evaluator | Orchestrator (SUMMARY only), Backend Generator (full report) |
| `frontend-evaluation.md` | Frontend Evaluator | Orchestrator (SUMMARY only), Frontend Generator (full report) |
| `backend-handoff-sprint-{N}.md` | Backend Generator | Backend Generator (next sprint) |
| `frontend-handoff-sprint-{N}.md` | Frontend Generator | Frontend Generator (next sprint) |
| `phase-handoff-backend-to-frontend.md` | Orchestrator | Frontend Generator (API contracts, env setup) |
| `escalation-sprint-{ID}.md` | Orchestrator | User (manual intervention) |
| `screenshots/sprint-{N}-*.png` | Frontend Evaluator | Frontend Generator (visual evidence of issues) |

### Evaluation Criteria

**Frontend** (scored 1-10, threshold in parentheses) — five dimensions, with a Functional Completeness axis that checks features close end-to-end:
| Dimension | Threshold | Weight | Focus |
|-----------|-----------|--------|-------|
| Design Quality | ≥7 | HIGH | Cohesive mood and identity |
| Originality | ≥7 | HIGH | Custom decisions vs. templates |
| **Functional Completeness** | ≥7 | HIGH | Feature loops close: UI → persistence (survives refresh) → reverse → failure |
| Craft | ≥6 | Standard | Typography, spacing, color harmony |
| UX-Usability | ≥7 | Standard | Usability and task completion |

Frontend weighted improvement: `W = 2·(DQ + OG + FuncComp) + 1·(Craft + UX)`.

**Backend** (scored 1-10, threshold in parentheses):
| Dimension | Threshold | Weight | Focus |
|-----------|-----------|--------|-------|
| API Correctness | ≥7 | HIGH | Spec-compliant responses |
| Data Integrity | ≥7 | HIGH | Schema, constraints, relationships |
| Code Quality | ≥6 | Standard | Architecture, security, testing |
| Functional Completeness | ≥7 | Standard | All features working |

A sprint passes only if ALL dimensions meet their thresholds AND ≥80% of acceptance criteria pass.

## What's New in v1.2.0

- **TEAM mode (SPRINT-TEAM)** — phase-internal parallelism: independent sprints run concurrently in separate worktrees, scheduled by a stateless `bin/team-scheduler` (JSON + exit-code contract; `main` stays dependency-closed). Default `always-serial`; opt in via `userConfig.defaultParallelism = auto|always-team`. See [`docs/TEAM_MODE.md`](docs/TEAM_MODE.md).
- **Frontend closed-loop evaluation** — new HIGH-weight Functional Completeness dimension backed by a Feature Loop Matrix (6 stages, incl. survives-refresh) and a persistence veto. Pretty-but-hollow apps now FAIL. See [`docs/EVAL_REWORK.md`](docs/EVAL_REWORK.md).
- **Bugfixes (from v1.1.1)** — correct Playwright MCP package (`@playwright/mcp`), portable `.gitignore` generation, `/ganvil:build|plan|evaluate` invocations, explicit improvement metric `W`, TaskList progress mirroring.

### When to Use TEAM Mode
- ✅ Good fit: ≥4 sprints per phase with independent features (auth + reporting + analytics); microservices / multi-module; wall-clock sensitive.
- ❌ Poor fit: chain dependencies (B2 needs B1's API); shared schema/config across sprints; tight token budgets (TEAM overlaps time, doesn't multiply tokens — but peak resource use rises with C); CONTINUOUS / CONTINUOUS-LITE.

## What's New in v1.1.0

- **Playwright MCP integration** — Frontend evaluator now uses Playwright for deterministic browser testing (with find-skills fallback)
- **Mandatory screenshot evidence** — Evaluations must include at least 4 screenshots (landing, key flow, mobile, error state)
- **Few-shot calibration examples** — Both frontend and backend evaluators have anchor examples with full score breakdowns to prevent score drift
- **Refine vs. Pivot framework** — Frontend generator makes explicit strategic decisions based on score trends
- **Patch vs. Refactor framework** — Backend generator chooses between targeted fixes and architectural restructuring
- **Git Discipline** — Version control initialized at project start; commit conventions, safety tags, and revert strategies enforced
- **Design Reference Library** — 12 real-world design systems from [awesome-design-md](https://github.com/VoltAgent/awesome-design-md) as evaluation anchors
- **CONTINUOUS-LITE mode** — Optional sprint-free execution for advanced models, only when user explicitly requests

## References

- [Harness Design for Long-Running Apps](https://www.anthropic.com/engineering/harness-design-long-running-apps) — Anthropic Engineering (Mar 2026)
- [Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) — Anthropic Engineering (Nov 2025)
- [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — Design principles
- [awesome-design-md](https://github.com/VoltAgent/awesome-design-md) — Design system references for calibration

## License

MIT
