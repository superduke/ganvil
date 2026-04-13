# Harness Plugin for Claude Code

A long-running autonomous coding harness with **Planner → Generator ↔ Evaluator** architecture and Sprint decomposition, inspired by [Anthropic's harness design research](https://www.anthropic.com/engineering/harness-design-long-running-apps).

## What It Does

This plugin transforms a brief product description (1-4 sentences) into a working application through a multi-agent pipeline:

1. **Planner** — Expands your description into a full product spec, classifies the project type (frontend/backend/fullstack), and decomposes work into sprints with testable acceptance criteria.
2. **Generator** — Implements features sprint by sprint. Separate specialized agents for frontend (design-focused) and backend (correctness-focused) work.
3. **Evaluator** — Independently tests each sprint output against acceptance criteria. Uses browser automation for frontend QA and API testing for backend QA. Scores on four dimensions and sends actionable feedback. Iterates with the generator until quality thresholds are met.

### Key Design Decisions

- **Sprint decomposition** with context resets via handoff artifacts — works reliably within 200K context windows
- **Adaptive execution mode** — Planner chooses SPRINT or CONTINUOUS mode based on project complexity; simple projects skip sprint decomposition entirely
- **Frontend/backend separation** — different generators and evaluators with domain-specific expertise
- **Fullstack ordering** — backend sprints complete first, then frontend sprints (frontend can depend on backend APIs)
- **Sprint contract negotiation** — evaluator reviews and co-negotiates sprint contracts before the generator builds, ensuring quality gates are meaningful
- **Stall detection, not iteration limits** — generator-evaluator cycle continues while scores improve; if stalled (3+ failures with no improvement), scope reduction or escalation kicks in
- **Existing codebase awareness** — planner detects and adapts to existing projects rather than always starting from scratch
- **AI-powered feature integration** — planner weaves AI features into specs; generators follow tool-use agent patterns via the ai-integration skill
- **GAN-inspired architecture** — separating the agent that generates from the agent that evaluates solves the self-evaluation bias problem

## Installation

### Local Testing

```bash
claude --plugin-dir /path/to/harness
```

### Permanent Installation

Copy the `harness/` directory to your Claude Code plugins location, or use:

```bash
claude /plugin install /path/to/harness
```

## Usage

### Full Build Pipeline

Build a complete application from a description:

```
/harness:build A collaborative whiteboard tool with real-time editing and AI-assisted drawing
```

This will:
1. Plan → generate a full product spec in `harness-artifacts/spec.md`
2. Classify the project (e.g., FULLSTACK)
3. Execute backend sprints (if applicable), each evaluated and iterated until passing
4. Execute frontend sprints, each evaluated and iterated until passing

### Just Plan

Generate a product spec without building:

```
/harness:plan A data visualization dashboard for IoT sensor data
```

Output: `harness-artifacts/spec.md`

### Just Evaluate

QA-evaluate an existing project:

```
/harness:evaluate                          # auto-detect project type
/harness:evaluate frontend                 # evaluate frontend only
/harness:evaluate backend focus on auth    # evaluate backend with focus area
```

## Architecture

```
harness/
├── .claude-plugin/plugin.json    # Plugin manifest
├── agents/
│   ├── planner.md               # Product spec + sprint planning
│   ├── frontend-generator.md    # Frontend implementation
│   ├── backend-generator.md     # Backend implementation
│   ├── frontend-evaluator.md    # Frontend QA (4-dimension scoring)
│   └── backend-evaluator.md     # Backend QA (4-dimension scoring)
├── skills/
│   ├── harness-build/SKILL.md   # Main entry: full pipeline orchestration
│   ├── harness-plan/SKILL.md    # Planning only
│   ├── harness-evaluate/SKILL.md # Evaluation only
│   ├── frontend-design/SKILL.md # Design standards (used by planner + evaluator)
│   └── ai-integration/SKILL.md  # AI feature patterns + Anthropic API (used by planner + generators)
├── settings.json
└── README.md
```

### Communication via Files

Agents communicate through `harness-artifacts/`:

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

### Evaluation Criteria

**Frontend** (scored 1-10, threshold in parentheses):
| Dimension | Threshold | Weight | Focus |
|-----------|-----------|--------|-------|
| Design Quality | ≥7 | HIGH | Cohesive mood and identity |
| Originality | ≥7 | HIGH | Custom decisions vs. templates |
| Craft | ≥6 | Standard | Typography, spacing, color harmony |
| Functionality | ≥7 | Standard | Usability and task completion |

**Backend** (scored 1-10, threshold in parentheses):
| Dimension | Threshold | Weight | Focus |
|-----------|-----------|--------|-------|
| API Correctness | ≥7 | HIGH | Spec-compliant responses |
| Data Integrity | ≥7 | HIGH | Schema, constraints, relationships |
| Code Quality | ≥6 | Standard | Architecture, security, testing |
| Functional Completeness | ≥7 | Standard | All features working |

A sprint passes only if ALL dimensions meet their thresholds AND ≥80% of acceptance criteria pass.

## References

- [Harness Design for Long-Running Apps](https://www.anthropic.com/engineering/harness-design-long-running-apps) — Anthropic Engineering
- [Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) — Earlier harness work
- [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — Design principles
- [Frontend Design Skill](https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md) — Anthropic's official frontend design skill

## License

MIT
