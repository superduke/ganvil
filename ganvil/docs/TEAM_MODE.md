# TEAM 模式 — 设计规格与修改方案

> **Status:** IMPLEMENTED（v1.2.0 已落地 — 见 commit `1b9b1fa` 初版 + `28e298e` 调度器正确性修复）
> **Target:** ganvil plugin — bugfix `v1.1.1`，TEAM `v1.2.0`
> **Date:** 2026-06-22（实施 2026-06-23）
> **Author:** superduke

**Rev 4 变更**（吸收第三轮评审，设计收敛）：
- **点名并发机制**（A5b）：wave 内 generator 经 `run_in_background: true` 派发，orchestrator 派发后 **yield**、由"完成通知"唤醒——这才是"等任一返回"的真实含义。否则伪并发 = 串行住两个 worktree、**零 wall-clock 收益**。
- **单写者不变量**（B3b / 附录）：orchestrator 单线程决策 ⇒ `team-scheduler` 调用串行 ⇒ `pipeline-state.md` 无需文件锁/daemon；**背景 generator 禁止调用脚本**。
- **per-sprint 产物按 `{SprintID}` 前缀**（B4）：修 `backend-build-log.md` 固定名在并发下被覆盖。
- **纠正成本话术**（A10）：删除"≈N× token"（误导）——并行重叠**时间**不乘 token；真实权衡 = wall-clock ↓ / 总 token ≈ 串行+小额开销 / 峰值资源 ↑。
- **终评微调（两处，事件循环相关；非新修订）**：① `pipeline-state.md` 加 `TaskID` 列 + `bind`/`lookup`，让完成通知能做 `task→sprint` 关联（扛上下文压缩，不靠对话记忆）；② 每次唤醒 **drain 全部完成**而非单发处理（防同波多 agent 完成时漏处理→隐性死锁）。

**Rev 3 变更**（保留）：状态模型表（A2-d）、JSON/exit-code 契约（仅 `merge` 改 main = 失败安全）、fix-forward 取代定责回退、node + B3b 脚本级单测、C=2 per-phase、主动 dogfood 门禁。
**Rev 2 变更**（保留）：外置调度脚本、集成冒烟、运行态隔离、默认 `always-serial`、main 不变量、测试矩阵、bug 解耦。

---

## 背景与目标

ganvil plugin 当前的执行模式有三：`SPRINT`（默认，串行）、`CONTINUOUS`、`CONTINUOUS-LITE`，均把 sprint 当严格串行单元执行（`B1 → B2 → … → F1 → F2`）。

很多真实项目的 sprint 之间**没有依赖**（如"认证模块"与"报表模块"互不相交），串行执行白白消耗 wall-clock。TEAM 模式引入**阶段内并行**：依赖不相交的 sprint 在各自 git worktree 里**真正并发**执行，由无状态调度脚本 + orchestrator 协作完成 wave 级调度。

**设计约束（不可违背）**：
- 并行只发生在**阶段内**、**独立 worktree** 内（无文件竞争）；
- Generator ↔ Evaluator **不**改成实时对话（避免上下文膨胀）；
- 现有的 sprint 分解、契约协商、逐 sprint 评估、handoff artifact 全部保留；
- **有状态调度交给确定性脚本，LLM 只做判断**；
- **脚本无状态**：每次从 `spec.md DAG + git + pipeline-state.md` 重推导（Rev 3）；
- **并发靠背景派发**：generator/evaluator 经 `run_in_background: true` + 完成通知实现，不是同步循环（Rev 4 核心）。

**一句话定位**：TEAM 是 SPRINT 家族的**并行子模式**。"何时并行"交给**无状态调度脚本**，"是否升级/降级/修复"留给 orchestrator 判断，"真正的并发"靠**背景 agent + 完成通知**——三者缺一，feature 要么脆、要么静默退化为串行。

---

## 目录

- [Part A — TEAM 模式规格](#part-a--team-模式规格)
- [Part B — 完整修改方案](#part-b--完整修改方案)
- [Part C — 实施顺序与验收](#part-c--实施顺序与验收)
- [Part D — 缺陷优先级（解耦于 TEAM）](#part-d--缺陷优先级解耦于-team)
- [附录 — 决策原则 / 不变量 / 契约 / 迁移](#附录--决策原则--不变量--契约--迁移)

---

## Part A — TEAM 模式规格

### A1 定位

TEAM 是 **SPRINT 家族的并行子模式**，仍保留 sprint 分解、契约协商、逐 sprint 评估、handoff artifact。区别仅在于**同一阶段内、依赖不相交的 sprint 在各自 worktree 里真正并发执行**，由无状态调度脚本 + orchestrator + 背景派发协作完成 wave 级调度。

模式枚举：

| 模式 | 说明 |
|---|---|
| `SPRINT` | 默认，串行（等价于 v1.1.0 行为） |
| `SPRINT-TEAM` | 阶段内并行（本文档主题） |
| `CONTINUOUS` | 单 sprint，无并行可能 |
| `CONTINUOUS-LITE` | 无契约，单次收尾，无并行可能 |

- TEAM 只在 **`SPRINT-TEAM`** 下生效；`CONTINUOUS` / `CONTINUOUS-LITE` 不并行。
- 作用域**阶段内**；跨阶段默认 `backend → frontend`。
- `SPRINT-TEAM` 在 `C = 1` 时**退化到与 `SPRINT` 完全等价**——回归安全基线。
- **首版默认 `always-serial`**；`auto`/`always-team` 为显式 opt-in（A10）。

### A2 数据模型

#### (a) Sprint 依赖 DAG —— 写进 `spec.md`（脚本只读输入）

```markdown
## Sprint Dependency Graph
- B1: deps []          # data model + migrations
- B2: deps [B1]        # auth (needs user model)
- B3: deps []          # reporting (independent)
- B4: deps [B2, B3]    # dashboard (needs both)
Team-Eligible: YES — branches {B1→B2} ∥ {B3}
```

**依赖满足**的定义：被依赖 sprint **评估 PASS 且已 merge 进 main**（git 可查，= A6 不变量）。

#### (b) `pipeline-state.md` —— 唯一可变持久调度态（脚本读+写）

```
| Sprint | Deps | Status | Wave | Worktree | Branch | DB | Port | TaskID | Iter | Last Scores | Stall | Notes |
|--------|------|--------|------|----------|--------|----|------|--------|------|-------------|-------|-------|
| B1 | [] | MERGED | W1 | - | - | - | - | - | 2 | 7/7/7/8 | 0 | - |
| B3 | [] | RUNNING | W1 | ../wt-b3 | backend/b3 | ganvil_b3 | 8101 | t_a3f9 | 1 | - | 0 | - |
```

Status：`READY / RUNNING / EVAL-PENDING / MERGED / BLOCKED-CONFLICT / ESCALATED / FIXING`。

> ⭐ 这是 `team-scheduler` 的**唯一可变持久状态**，且**同一时刻只有一个写者**（orchestrator 单线程，见 B3b/附录）。wave 号、端口/DB 租约、迭代计数、stall、分数全在这里。脚本跨调用**不持有私有状态**。
>
> **TaskID 列（终评）**：记录该 sprint 当前在飞的**背景 task id**（gen 或 eval）。完成通知只带 task id、不带 sprint id，orchestrator 靠这一列做 `task_id → sprint` 关联——**必须落在文件里才能扛过上下文压缩**（不能依赖"我记得派了 T 给 B3"）。派发后 `bind` 写入，唤醒后 `lookup` 反查。

#### (c) TaskList —— orchestrator 的 UI 镜像（脚本永不碰）

TaskList 仍存在，但**仅由 orchestrator 维护**，用于给人/会话看进度。**`bin/team-scheduler` 是 fs+git 进程，不能调用 TaskList 工具，故从不读写它。** readiness 永远由脚本从 git + pipeline-state.md 推导。

**#9 双写过渡**（解析面迁移，与 TaskList 解耦）：
- **v1.2.0 双写**：evaluator 仍输出 `<!-- ORCHESTRATOR-SUMMARY -->`；orchestrator **优先读脚本 JSON 输出，回退注释**。
- **v1.3.0**：移除注释依赖。

#### (d) 状态模型与归属（Rev 3 核心）⭐

| 存储 | 角色 | 谁读 | 谁写 |
|---|---|---|---|
| `spec.md`（DAG） | 只读输入 | 脚本 + orchestrator | planner |
| **git（main + 分支）** | 已合并真相；"dep 满足" = 依赖分支在 main 里 | 脚本 | **仅脚本 `merge`** |
| **`pipeline-state.md`** | **唯一可变持久调度态，单写者** | 脚本 | 脚本（经 orchestrator 串行调用） |
| sprint contract | 每分支租约（worktree/DB/端口/数据目录） | generator/evaluator | 脚本 `allocate` |
| TaskList | 临时 UI/可观测镜像 | orchestrator | orchestrator（**脚本永不碰**） |

### A3 角色职责

| 角色 | 职责 | 为什么 |
|---|---|---|
| **Planner** | 战略：输出 DAG + 判 TEAM-eligibility + 写 mode + 理由 | 动工前唯一有全貌者 |
| **`bin/team-scheduler`（无状态 node 脚本）** | 战术执行：每次从 git+pipeline-state.md+spec DAG 重推导；算 RUNNABLE 波、管 worktree/端口/DB、跑 merge、记录状态 | 有状态控制流必须确定性、可重放、可单测 |
| **Orchestrator（LLM，单线程）** | 判断 + 派发：读脚本 JSON，决定 escalate/scope-reduce/fix-forward/降级；**背景派发** generator/evaluator 并在完成通知时反应；把进度镜像到 TaskList | LLM 擅长判断不擅长大状态机；并发靠背景 agent |
| **Evaluator** | 逐 sprint（逐 worktree）评估 + wave 收尾集成冒烟 | 保持单 sprint 作用域 |
| **User** | `userConfig.defaultParallelism` / 单次显式 | TEAM 抬峰值资源，必须可否决 |

> 切分：**无状态脚本管"能跑谁/怎么合并"，LLM 管"升级/降级/修复"，背景派发管"真正并发"，TaskList 只给人看。**

### A4 决策算法

**优先级阶梯（高者胜出）**

```
1. User 单次显式   "use team mode" / "stay serial"        → 直接生效
2. Orchestrator gate   脚本不可用 / 不支持背景派发 / 成本未授权 → 强制 SPRINT
3. userConfig        defaultParallelism = always-serial    → 串行（首版默认）
4. Planner 提议     DAG 独立 + 低重叠 + 达规模门槛         → SPRINT-TEAM，否则 SPRINT
```

**Planner 资格判定**（写进 spec）：DAG 存在 ≥ 2 条不相交分支 **且** 文件重叠低 **且** 该阶段 sprint ≥ 4。

**依赖/冲突启发式**（planner 标 DAG + 脚本算 wave）：
- 共享数据模型/表/migration、改同一批核心文件、API 命名空间重叠、明确功能调用 → **判依赖**；
- 文件不重叠但静态冲突分高 → **串行化该对**（低 ID 先跑）；
- 冲突分仅作**排序提示**，不设硬阈值，由 orchestrator 确认。

### A5 执行算法 — Wave Scheduler（无状态脚本 + 契约化接口）

**`bin/team-scheduler` 子命令**（每次调用独立进程，无状态）：

```
init <phase>           # 解析 spec DAG；重推导状态；清孤儿 worktree；初始化端口/DB 池
next                   # 输出 RUNNABLE（deps 已在 main）+ RUNNING + wave + cap
allocate <id>          # 建 worktree、领端口+DB+数据目录，写 pipeline-state.md 与 contract
bind <id> <task_id>    # 派发后把背景 task_id 写进 TaskID 列（完成通知后做 task→sprint 关联）
lookup <task_id>       # 反查 sprint + 当前 phase（gen-done / eval-pass / eval-fail）
merge <id>             # 校验 main 不变量后 merge 进 main、回收端口/DB/worktree、解锁后继
stall-recommend <id>   # 据 pipeline-state 的 W 趋势给建议：iterate | scope-reduce | escalate
wave-done?             # 本波是否全部 MERGED → 触发集成冒烟
status                 # dump 状态 + main 不变量自检
```

**接口契约** ⭐：
- **stdout**：每命令**一个严格 JSON 对象**；人类日志走 **stderr**。
- **exit code**：`0` = ok；`1` = 可恢复（orchestrator → 本阶段剩余退 SPRINT，main 原样）；`2` = 致命（中止阶段 + escalate）。malformed/超时当 `1`。
- **安全语义**：**只有 `merge` 改 main**。脚本失败 = 无 merge = **main 冻结、依赖闭合不变量自动成立**。

JSON schema（示例）：
```json
// next
{"ok":true,"runnable":["B3","B4"],"running":["B1"],"wave":2,"cap":2}
// allocate B3
{"ok":true,"id":"B3","worktree":"../ganvil-wt-backend-b3","branch":"backend/b3",
 "db":"ganvil_b3","port":8101,"datadir":"../ganvil-wt-backend-b3/var"}
// stall-recommend B3
{"ok":true,"id":"B3","recommend":"scope-reduce","reason":"W flat across 2 iters"}
```

**Orchestrator 循环（事件驱动；只剩判断 + 派发）**：

```
team-scheduler init <phase>        # 失败(exit!=0) → 整阶段退 SPRINT
loop:
  wave = team-scheduler next       # 失败 → 本阶段剩余退 SPRINT（main 已冻结，安全）
  if wave.runnable 为空:
     if team-scheduler wave-done? 全阶段 MERGED → 写 phase-handoff, break
     else if wave.running 为空      → 死锁/全 ESCALATED → 写 escalation, break
     else                           → [yield，等完成通知唤醒]（A5b）
  for s in wave.runnable (≤ C):
     lease = team-scheduler allocate <s.id>                  # 写 pipeline-state + contract
     tid   = dispatch generator(lease, run_in_background: true)   # 背景派发（A5b）
     team-scheduler bind <s.id> <tid>                        # 记 TaskID（task→sprint 关联，扛压缩）
  [yield —— orchestrator 本轮结束；由"完成通知"唤醒]   ← 这才是"等任一返回"
  on wake（一次唤醒可能携带 ≥1 个 task 完成；必须 DRAIN 全部，勿只处理一个）:
     for tid in 本次唤醒收到的所有已完成 task_id（串行处理，单写者安全）:
        sprint, phase = team-scheduler lookup <tid>          # TaskID → sprint + phase
        if phase == gen-done :  t2 = dispatch evaluator(sprint, background)；bind <sprint> <t2>
        if phase == eval-pass:  team-scheduler merge <sprint>；if wave-done? → 集成冒烟 (A7)
        if phase == eval-fail:  rec = stall-recommend <sprint>；判断 iterate|scope-reduce|escalate
     # 处理完所有已完成 task 再回 loop；漏处理会让被卡 task 等不到下一个事件 → 隐性死锁
  回 loop（重新 next）
```

> orchestrator 只读 JSON + 做 escalate/fix-forward 判断，**不解析自由文本、不持有状态机、不碰 TaskList 真相**。`allocate`/`merge`/`next` 等 **team-scheduler 调用一律串行**（单写者，见 B3b）。

### A5b 并发机制（Rev 4 核心）⭐

> A5 的"等任一返回"**不是免费的**。背景派发是整个 feature 真正并发的唯一手段，必须显式写明，否则实现者会写成同步循环——伪并发、零 wall-clock 收益、却背着全部复杂度。

- **派发方式**：wave 内 generator 用 Agent 工具的 **`run_in_background: true`** 派发（一次最多 C 个）。派发后该 tool call 立即返回 task id。
- **"等任一返回" = yield + 完成通知**：orchestrator 派发完本波后**本轮结束（yield）**；当任一背景 generator 完成时，ganvil **以完成通知重新唤起** orchestrator——这就是循环里"等任一返回"的那个点。**不是阻塞 while 循环**。
- **gen 与 eval 分离派发**（保住上下文隔离）：generator 完成通知 → orchestrator 再**背景派发**该分支的 evaluator（独立 agent context）；evaluator 完成通知 → orchestrator 读 verdict → merge / iterate。这样多个分支的 gen/eval 各自在自己的背景 context 推进，orchestrator 只做协调。
- **task↔sprint 关联（终评，扛压缩）**：完成通知只带 task id、不带 sprint id。派发后 `bind` 把 task id 写进 pipeline-state 的 TaskID 列，唤醒后 `lookup` 反查。**不靠对话记忆**——那扛不过长 build 的上下文压缩，而 pipeline-state 正是为此存在。
- **唤醒时 drain 全部完成（终评）**：C 个背景 agent 可能在两次唤醒间、或近乎同时完成，ganvil 可能只唤醒一次。每次唤醒必须**重新扫描并处理所有新完成的 task**（逐个 gen→eval、逐个 merge）再 `next`——**不要写成只处理一个的单发 handler**，否则被漏掉的那个 task 可能等不到下一个事件而卡死。单写者规则保证 drain 内的多个 merge 仍串行安全。
- **安全门**：若所在 ganvil 不支持背景派发（或被禁用），orchestrator gate 直接把该阶段退化为 `SPRINT`（A4 阶梯第 2 条）——TEAM 永远不会"看起来在跑其实串行"，而是显式降级。

### A6 Worktree 生命周期 + 运行态隔离 + 不变量 + 恢复

**生命周期**（脚本拥有）：

| 阶段 | 动作 |
|---|---|
| 建 | `git worktree add ../ganvil-wt-{phase}-{id} -b {phase}/{id}`，基线 = 当前 main HEAD |
| 跑 | generator/evaluator 在该 worktree 内作业；契约写绝对路径，agent 用绝对路径（避免 `cd`） |
| PASS 合并 | `team-scheduler merge` → `git merge --no-ff {phase}/{id}` → `git worktree remove` |
| FAIL/ESCALATED | 保留 worktree + 打 tag `escalate-{id}` |

**运行态隔离（三件套）** —— 每个 worktree 独立领，写进 contract：

| 维度 | 分配 | 例 |
|---|---|---|
| 端口 | 池 8100–8199，系统占用探测后排除 | `8101` |
| 数据库 | 每分支独立 DB 名 / 独立 sqlite 文件 | `ganvil_b3` / `./data/b3.db` |
| 数据目录 | 独立 data/cache 目录 | `../ganvil-wt-b3/var/` |

> 三件套防**正确性踩踏**（两分支同库 migration 互踩）。资源争用由 A10 的 C 上限处理。

**显式不变量** ⭐：
> **main 在任何时刻只包含"依赖闭合"的已合并 sprint 集合**——一个 sprint merge，当且仅当其所有 deps 都已在 main。`merge` 强制校验；脚本失败时无 merge，main 冻结，不变量自动成立。

**恢复 = 重推导**：
- `init` 每次从 `git + pipeline-state.md` 重推导当前状态。
- **孤儿 worktree**：凡 `git worktree list` 里有、但 `pipeline-state.md` 未记录、且无 `escalate-*` tag 的 → force-remove。Ctrl+C 中断留下的半成品同理，下次 `init` 自愈。

### A7 评估集成（fix-forward 取代定责）

1. **逐 sprint 评估**（不变）：作用域 = 单 worktree。报告带 sprint 前缀：`{front,back}end-evaluation-{SprintID}.md`。
2. **wave 收尾集成冒烟**：本波全部分支 merge 进 main 后，在 main 上跑轻量集成检查：
   - 项目自带构建（`build`/`tsc`/`cargo build` 等）必须过；
   - 冒烟：起服务打健康检查、关键 API 各打一次、前端首屏可加载（Playwright，#1 修对包名后）；
   - **不做**完整四维再评估。

**冒烟失败 → fix-forward** ⭐：
- **不定责、不回退**。跨 N 个已合并分支 bisect 定责既贵又会撕裂兄弟分支、破坏 main 不变量。
- 改为：在 main 上**追加一个修复 sprint**（`Xfix`，依赖当前已合并集合），**串行**，由 generator 以冒烟报告为输入修复；修完重跑冒烟。
- **预算封顶**：修复 sprint 复用 per-branch stall（A8，最多 3 轮 `W` 无改善）→ 超 limit **escalate 用户**。
- 哲学：**main 只前进不回退**——与"main 始终连贯"不变量一致。

> merge 冲突（同文件 textual，A9）与集成回归（合并态 semantic 坏掉，A7）是两类问题，分别处理。

### A8 Per-branch Stall + 改善定义

**改善口径（全模式统一）**：`W = 2 × (HIGH 维) + 1 × (STANDARD 维)`；"有改善" = `W` 严格 `>` 上一轮。

> **前端 W 构成（[`EVAL_REWORK.md`](./EVAL_REWORK.md) B10 耦合点）**：前端现为 5 维——HIGH: Design Quality / Originality / **Functional Completeness**；STANDARD: Craft / UX-Usability——故 `W_frontend = 2·(DQ + OG + FuncComp) + 1·(Craft + UX)`。
>
> ⚠️ **W 不跨层比较**：前端 W 满分权重为 **8**（3 HIGH + 2 STD），后端为 **6**（2 HIGH + 2 STD）。stall 只在**同一分支的历次迭代间**比较（同公式同层），故该不对称无害；绝不要把前端 W 与后端 W 直接比大小。

**per-branch stall**：某分支连 3 次 FAIL **且** 最近 2 轮 `W` 增量 ≤ 0 → `stall-recommend` 返回 `scope-reduce | escalate`；**不阻塞兄弟分支**；每分支独立 `Stall` 计数。（fix-forward 复用此机制做预算封顶。）

### A9 Merge 冲突与回退

兄弟分支先合并导致冲突：
1. 标 `BLOCKED-CONFLICT`，**不**自动 `-X ours/theirs`；
2. 等在跑兄弟落定 → `git rebase main` 后重评估；
3. 仍冲突 → 该分支**串行重跑**或 ESCALATED；
4. 全程记入 pipeline-state。

### A10 Cost/安全 gate + userConfig + 并发上限（C=2）

`plugin.json`：
```json
"userConfig": {
  "defaultParallelism": {
    "type": "string",
    "title": "Default parallelism mode",
    "default": "always-serial",
    "description": "TEAM 并行模式策略。取值：always-serial | auto | always-team。首版默认 always-serial；auto 在跑稳后改默认。"
  }
}
```

| 取值 | 行为 |
|---|---|
| `always-serial` | 永不 TEAM（**首版默认**） |
| `auto` | Planner 提议 + Orchestrator gate（跑稳后翻默认） |
| `always-team` | DAG 有 ≥ 2 分支就并行 |

**并发上限 C**：
- **默认 `C = 2`**。理由：前端评估的 Playwright/Chromium 极重，并行 = 多 dev server + 多无头浏览器 + 多 DB，**wall-clock 与内存 bound 而非 CPU bound**，C 过大会把笔记本拖到比串行还慢。
- **per-phase 差异**：backend 阶段无浏览器、较轻（`C=2–3`）；frontend 阶段浏览器重（`C=2`）。
- **资源探测（nice-to-have）**：`init` 探测空闲 RAM/核数，对 C 封顶。

**成本可见性（Rev 4 修正）** ⭐：选 `SPRINT-TEAM` 时起步 `log` **真实权衡**——并行是"把同样多的工作在时间上重叠"，**不是把 token 乘以 N**：

| 维度 | TEAM vs 串行 |
|---|---|
| wall-clock | ↓（主要收益） |
| 总 token | ≈ 串行 + 小额开销（集成冒烟 + 偶发冲突/fix-forward 重试） |
| 峰值并发 / RAM | ↑（随 C） |

`auto` 下提示"可改回 serial"。不做精确 token 预估。**禁用"≈N× token"措辞**（既错又劝退，会让人永远留在 always-serial）。

### A11 阶段边界与终止

- 阶段内全 MERGED + 集成冒烟过 → 写/更新 `phase-handoff-backend-to-frontend.md`（fullstack）→ 进入下一阶段，**重新判 eligibility**。
- 终止：所有阶段所有 sprint MERGED，或剩余全部 ESCALATED。

### A12 边界情形清单

| 情形 | 处理 |
|---|---|
| 脚本不可用 / 非 git 仓库 | 全局回退 SPRINT |
| **ganvil 不支持背景派发** | gate 退 SPRINT（A4），绝不伪并发 |
| 脚本输出 malformed / 超时 | 当 exit=1 → 本阶段剩余退 SPRINT（main 已冻结，安全） |
| 某分支死锁 | escalate 该分支，兄弟继续 |
| 并发 cap 触顶 | RUNNABLE 排队 |
| DB/migration 争用 | 每分支独立 DB（A6 三件套） |
| 端口被系统占用 | 池探测排除 |
| merge 冲突（textual） | A9 |
| wave 合并态回归（semantic） | 集成冒烟 → fix-forward（A7） |
| 用户中途 `stay serial` | 在跑分支完成、后续串行 |
| DAG 无独立分支 | 退化为纯串行 |
| 孤儿 worktree / Ctrl+C 中断 | `init` 重推导自愈（A6） |

### A13 测试矩阵（端到端）

| # | 场景 | 期望 |
|---|---|---|
| 1 | 理想路径：6-sprint `{B1→B2}∥{B3}` 全 PASS | **真并发**（背景派发）、依次 merge、冒烟过 |
| 2 | 分支 stall | ESCALATED，兄弟不受影响 |
| 3 | merge 冲突（同文件） | rebase 失败 → 串行重跑 |
| 4 | 端口冲突 | 自动跳下一端口 |
| 5 | DB 争用 | 各领独立 DB，不踩 |
| 6 | wave 合并态回归 | 冒烟失败 → fix-forward 修复 |
| 7 | 中途降级 | 在跑完成、后续串行 |
| 8 | worktree 不可用 | 全局退 SPRINT |
| 9 | `C=1` | 等价串行（零回归基线） |
| 10 | 孤儿 worktree | `init` 清理，保留 escalate 的 |
| 11 | 脚本 malformed 输出 | 当 exit=1 → 退 SPRINT，main 不变 |
| 12 | **背景派发被禁用** | gate 退 SPRINT，不静默串行 |

> 脚本内部逻辑（merge/孤儿/不变量/租约）另有**脚本级单测**（B3b）。

### A14 main 不变量复核

每个 PR 合入前，用 A13#9（C=1）+ 一个故意 escalate 的用例验证：**escalate 后 `git log main` 仍是依赖闭合序列**。

---

## Part B — 完整修改方案

### 总览

| # | 文件 | 改动 | 摘要 |
|---|---|---|---|
| B1 | `.claude-plugin/plugin.json` | 改 | 加 `userConfig`（默认 `always-serial`）；顺带修冗余键（#4） |
| B2 | `agents/planner.md` | 改 | Step 3.5 加 `SPRINT-TEAM`；Step 4 输出 DAG + 启发式 |
| B3 | `skills/build/SKILL.md` | 改（主） | Phase 1.5 加 TEAM；**背景派发** wave；调用 `bin/team-scheduler`（JSON 契约）；冒烟→fix-forward；运行态隔离契约；C=2；Context Mgmt |
| **B3b** | **`bin/team-scheduler`（node + 单测）** | **新增** | 无状态调度脚本 + JSON 契约 + exit code + **单写者/无锁** + 脚本级单测 |
| B4 | `agents/{back,front}end-generator.md` | 改 | worktree 感知；**per-sprint 产物 `{SprintID}` 前缀**；独立 DB/端口从 contract 读 |
| B5 | `agents/{back,front}end-evaluator.md` | 改（小） | 作用域=worktree；报告带前缀；冒烟由 orchestrator 触发 |
| B6 | `README.md` | 改 | 第 4 模式 + `When to Use TEAM` + userConfig + What's New |
| B7 | `.claude-plugin/marketplace.json` | 改 | 版本同步 |
| B8 | `settings.json` | 标注 | #2 坏，归 PR-A |

### B1. `plugin.json`
- 加 `userConfig.defaultParallelism`（默认 `always-serial`）。
- 顺带（#4）：删冗余 `"skills"`/`"mcpServers"`；`"agents"` 改为默认 `agents/` 自动发现。
- `version` 与 marketplace 同步。

### B2. `planner.md`
- Step 3.5 加 `SPRINT-TEAM` + 资格三条件（A4）。
- Step 4 每 sprint 标 `deps`；按 A4 启发式判依赖；输出 Dependency Graph。
- Step 5 模板插 `## Sprint Dependency Graph`。
- Important Rules 加"DAG 诚实标依赖；独立判断保守"。

### B3. `build/SKILL.md`（核心）
- Phase 1.5：模式表加 `SPRINT-TEAM`；执行 = **背景派发** wave + 调用 `bin/team-scheduler`（按 A5 JSON 契约）。
- **Phase 3' Parallel Execution**（A5 + A5b）：
  - wave 内 generator 经 `run_in_background: true` 派发（≤ C）；evaluator 同样背景派发、与 generator 分离（保隔离）；
  - orchestrator 派发后 **yield**，由完成通知唤醒——**这是"等任一返回"的实现，必须写明**，否则实现者写成同步循环=伪并发；
  - **所有 `team-scheduler` 调用串行**（单写者）；脚本失败→退 SPRINT；
  - 集成冒烟 → fix-forward；运行态隔离写进 contract；C=2（per-phase）。
- Phase 0 启动：`team-scheduler init`（含孤儿清理/重推导）。
- Context Management：加"读脚本 JSON（短）"；`pipeline-state.md` 为唯一持久态、单写者；TaskList 仅镜像。
- Important Rules：加"TEAM 只阶段内并行"、"per-branch stall 不阻塞兄弟"、"merge 不自动解冲突"、"main 依赖闭合不变量"、"脚本失败→main 冻结安全"、**"generator 背景派发、yield+通知唤醒"**、**"team-scheduler 仅 orchestrator 串行调用，背景 generator 禁用"**。

### B3b. `bin/team-scheduler`（独立交付件）⭐
- **语言：node**（跨平台、原生 JSON、`child_process` 调 git；plugin 已隐含依赖 node）。
- **无状态**：每次从 `spec.md DAG + git + pipeline-state.md` 重推导；只写 `pipeline-state.md`（+ `allocate` 写 contract、`merge` 写 git）。无私有状态文件、无 daemon。
- **单写者、无需锁**（Rev 4）⭐：因 orchestrator 单线程、`team-scheduler` 调用串行，`pipeline-state.md` 同一时刻只有一个写者——**无需文件锁/无 daemon/无并发原语**。**背景 generator 禁止调用 `team-scheduler`**（仅 orchestrator 调），避免与 orchestrator 竞争 pipeline-state/git。
- **子命令 + JSON 契约 + exit code**：见 A5。
- **`merge` 强制校验 main 依赖闭合不变量**，否则拒绝（exit 2）。
- **⚠️ 脚本级单测套件**（throwaway git repo，独立于 A13）：
  - `merge` 依赖闭合校验（拒绝未闭合）
  - 孤儿 worktree 清理（保留 escalate tag）
  - 端口/DB 租约分配与回收无重复
  - `next` 的 RUNNABLE 推导（DAG 正确性）
  - 冲突对串行化建议
  - JSON 输出 schema 与 exit code（含 malformed 拒收）

### B4. `{back,front}end-generator.md`
新增 "TEAM / Worktree Awareness"：contract 若含 `Worktree / DB / Port / DataDir`，所有操作用绝对路径、限定该 worktree，不 `cd`；连指定 DB、用指定端口起服务；git 针对本分支。
**per-sprint 产物命名（Rev 4）**：handoff/build-log 写到 main 的 `ganvil-artifacts/`，**TEAM 下所有 per-sprint 产物按 `{SprintID}` 前缀**（`backend-build-log-{SprintID}.md`、`backend-handoff-{SprintID}.md`）——`backend-build-log.md` 是固定名，不前缀会被并发 generator 互相覆盖。

### B5. `{back,front}end-evaluator.md`
顶部："评估作用域 = contract 指定的 worktree（TEAM）或主仓库（串行）；用其 DB/端口。" 报告命名带 `{SprintID}` 前缀。注明集成冒烟由 orchestrator 在 wave 收尾触发，evaluator 不负责跨 sprint。

### B6. `README.md`
模式说明补 `SPRINT-TEAM`（首版默认 `always-serial`）。新增 "When to Use TEAM Mode"：✅ 阶段 ≥4 sprint、独立特性、微服务/多模块、wall-clock 敏感；❌ 链式依赖、跨 sprint 共享 schema/config、峰值资源吃紧、CONTINUOUS/-LITE。**成本说明用 A10 的真实权衡表**（不写"N× token"）。What's New v1.2.0。

### B7. `marketplace.json`
`version` 同步（TEAM `1.2.0`；bugfix PR-A `1.1.1`）。

### B8. `settings.json`
归 PR-A（#2）：plugin 级 settings 不支持 `permissions` 键（官方只认 `agent`/`subagentStatusLine`），现规则全失效；免确认走项目/用户级 settings 或 hooks。

---

## Part C — 实施顺序与验收

### PR-A（v1.1.1，立即，与并行正交）
- #1 Playwright 包名 → `@playwright/mcp`；#2 `settings.json`（移除无效 permissions）；#3 `echo`→`printf`/多行；#5 skill 命名→`/ganvil:build` 对齐；#9 TaskList 化（双写起手）；#11 改善口径统一。
- 验收：v1.1.0 既有行为零回归 + 前端评测能起浏览器（#1）+ `.gitignore` 多行正确（#3）+ `/ganvil:build` 可调（#5）。

### PR-B（v1.2.0，TEAM 本体）

**批次 1（无并行风险）**：B2（DAG + 资格 + 启发式）、B6/B7。
- 验收：`/ganvil:plan` 输出含 Dependency Graph；串行零变化。

**批次 2（串行兼容 + 脚本骨架 + 并发机制）**：B3（**背景派发**循环 + JSON 契约 + 失败回退）+ **B3b 最小版 + 脚本级单测** + B4/B5（worktree 感知 + 运行态隔离契约 + 产物前缀）+ 集成冒烟→fix-forward。`C=1` 退化。
- **重点验收**：背景派发真的并发（`C=2` 时观察两 generator 时间重叠，而非先后）；`defaultParallelism=always-serial` 时**行为与 v1.1.1 完全一致**（A13#9）；B3b 单测全绿。

**批次 3（真并行，推迟到 dogfood 之后）** ⏸：多分支并发 + 冲突启发式 + per-branch stall + escalate + 孤儿清理 + C=2 per-phase。
- **前置门禁**：
  1. 用 3–5 个真实历史项目跑 planner，统计被判 TEAM-eligible 的比例（过低则继续后置）；
  2. **主动 dogfood**：把这些项目**显式翻成 `auto`** 实际跑并行路径——否则 always-serial 默认下并行永不被触发、批次 3 = built-but-unvalidated；
  3. **合入门禁**：≥K 次 `auto` 模式跑通且 A13 全矩阵（尤其 #5 DB 争用、#6 集成回归→fix-forward、#3 merge 冲突、#10 孤儿、#11 malformed、#12 背景派发禁用→退 SPRINT）通过。
- 端到端用例：6-sprint fullstack，backend `{B1→B2}∥{B3}`、frontend `{F1→F2→F3}`——只 backend 触发并行，frontend 退串行。

---

## Part D — 缺陷优先级（解耦于 TEAM）

> v1.1.0 当前就坏的正确性缺陷，进 PR-A（v1.1.1）立即修，不与 TEAM 耦合。

| 项 | 现状 | 归属 | 动作 |
|---|---|---|---|
| 🔴 #1 Playwright 包名 | `@anthropic-ai/playwright-mcp`（npm 404）→ 浏览器自动化起不来 | PR-A | → `@playwright/mcp` |
| 🔴 #2 settings.json permissions | plugin 级不支持该键，整块失效 | PR-A | 移除；走项目/用户级 settings 或 hooks |
| 🔴 #3 `.gitignore` echo | bash 下 `\n` 是字面量 → 单行坏文件 | PR-A | → `printf` 或多行 echo |
| 🟠 #5 skill 命名 | `/ganvil:build` 与文档 `/ganvil:build` 不符 | PR-A | 改名 `build/plan/evaluate` 或修文档 |
| 🟠 #9 注释解析脆弱 | 正则刮 HTML 注释 | PR-A 起步（双写）/ v1.3.0 完成 | 脚本 JSON 优先、注释回退；v1.3.0 移除 |
| 🟠 #11 改善口径未定义 | stall 判定无依据 | PR-A | 统一加权分 `W`（A8） |

**与 TEAM 同步**（PR-B）：#12 端口生命周期（→A6 三件套）、#9 v1.3.0 移除注释。
**可独立小 PR**：#4 manifest 冗余键、#6 缺 LICENSE、#7 仓库卫生、#8 metadata 重复。

---

## 附录 — 决策原则 / 不变量 / 契约 / 迁移

### 决策原则（战略 / 战术执行 / 判断，三层）
- **Planner 决资格**（静态）：项目有没有资格用 TEAM？→ 写 spec。
- **`team-scheduler` 决时机**（无状态、确定性、可单测）：这一波并行跑哪些、怎么合并？——脚本从 git+pipeline-state.md 推导，非 LLM，非 TaskList。
- **Orchestrator 决升级/降级/修复 + 真并发**（判断 + 背景派发）：escalate / scope-reduce / fix-forward / 降级；背景派发 gen/eval 并在完成通知时反应。
- **Evaluator** 审单 sprint + wave 集成冒烟。
- **User** 拥有否决。

### 不变量
1. **脚本无状态**：每次从 git + pipeline-state.md + spec DAG 重推导；`pipeline-state.md` 是唯一可变持久调度态。
2. **main 任何时刻依赖闭合**：仅 `merge` 改 main 且强制校验；脚本失败→main 冻结→不变量自动成立。
3. **`C=1` ≡ SPRINT**：零回归基线。
4. **运行态三件套隔离**（DB + 数据目录 + 端口）：无正确性踩踏。
5. **逐 sprint 评估 + wave 集成冒烟 → fix-forward**：合并态回归可见且只前进不回退。
6. **orchestrator 单线程 / 单写者**（Rev 4）：`team-scheduler` 串行调用、`pipeline-state.md` 同一时刻一个写者、**无需锁/daemon**；背景 generator 禁止调脚本。
7. **并发靠背景派发**（Rev 4）：gen/eval 经 `run_in_background: true` + 完成通知实现"等任一返回"；ganvil 不支持时 gate 退 SPRINT，绝不伪并发。

### 接口契约（orchestrator ↔ team-scheduler）
- stdout = 严格 JSON（per-command schema）；人类日志走 stderr。
- exit：`0` ok / `1` 可恢复（→本阶段剩余退 SPRINT）/ `2` 致命（中止+escalate）；malformed 当 `1`。
- 安全基石：**仅 `merge` 改 main** → 任何失败都让 main 停在已知连贯态。

### 迁移
- #9：v1.2.0 双写（脚本 JSON 优先、注释回退）/ v1.3.0 移除注释。
- 默认值：首版 `always-serial`，跑稳后翻 `auto`。

### 决策流示例
> Planner：8 sprint，"绘图引擎"与"用户认证"无依赖链、不重叠、规模达标 → spec 写 `SPRINT-TEAM` + DAG。首版 `always-serial` → gate 退串行。用户改 `auto`：`team-scheduler init`（重推导、清孤儿）→ `next` 给 `[B1,B3]`（cap 2）→ `allocate` 各自 worktree+DB+端口 → **背景派发** B1/B3 generator → orchestrator yield → B1 完成**通知唤醒** → 背景派发 B1 evaluator → eval 完 → `merge B1`（校验闭合）→ 解锁 B4 → 下一波 `B4 ∥ B3`；本波 `wave-done?` → 集成冒烟；冒烟挂 → fix-forward 追加 `Xfix`（预算 3 轮）→ 过 → 阶段完成。

---

*本文档为设计规格（Rev 4），**已于 v1.2.0 落地**（批次 1→2 + 调度器正确性修复）。批次 3（真并行 dogfood + 合入门禁）仍按 Part C 待办：默认 `always-serial` 下并行路径尚未在真实多分支项目上验证。*
