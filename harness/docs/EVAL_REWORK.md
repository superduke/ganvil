# 评价体系改造 — 前端功能闭环评价轴

> **Status:** DRAFT（未实施，待评审）
> **Target:** harness plugin — 评测改造 `v1.2.x`（建议独立 **PR-C**）
> **Date:** 2026-06-22
> **Author:** zhangyabei
> **与 TEAM 的关系：** **正交**。本改造提升**串行与并行通用**的前端评测质量；唯一耦合点是 [`TEAM_MODE.md`](./TEAM_MODE.md) **A8 的 W-score**（前端 W 构成由本文 B10 重定义）。两者可独立开发，合并时对齐 A8 即可。

---

## 背景与目标

harness 的后端评测已相当成熟：有 `Functional Completeness` 维度（count-based、stub=0、半成品=0.5）、A/B/C 三档 calibration、防膨胀规则。**前端是欠债方**——4 个维度里 3 个是美学（Design Quality / Originality / Craft），唯一的 `Functionality` 讲的是"可用性"（能否理解/找到/完成），**不是功能完整度或闭环**。而 W-score `2×HIGH + 1×STD` 把这个偏斜放大成激励问题：一个半数功能坏掉但很漂亮的 app 照样能 PASS。

**目标**：给前端补上"功能闭环"评价轴，向后端的功能严谨度看齐，但**适配前端的闭环语义**——UI 操作 → 真实 API → 持久化 → UI 反映 → 刷新存活 → 逆向闭合 → 失败有交代。让前端评测从"评海报"变成"评产品"。

**适用范围**：串行与 TEAM 模式通用。TEAM 的 A7 wave 集成冒烟只管 merge 时刻；本改造的跨 sprint 回归（B9）补的是 per-sprint 的闭环回归，串行模式同样需要。

---

## 目录

- [Part A — 诊断](#part-a--诊断)
- [Part B — 改进方案](#part-b--改进方案)
- [Part C — 落点表](#part-c--落点表)
- [Part D — 分阶段](#part-d--分阶段)
- [Part E — 对 PR-A / PR-B 的归属](#part-e--对-pr-a--pr-b-的归属)
- [附录](#附录)

---

## Part A — 诊断

### A1 维度结构失衡
前端 4 维里 3 个是美学；`Functionality` 的定义（`frontend-evaluator.md` 评分段）是可用性，**不是完整度**。后端有显式 `Functional Completeness`（count spec 功能 vs 实际可用，stub=0、半成品=0.5），**前端无对应物**。

### A2 W-score 放大偏斜
`W = 2·(DQ+OG) + 1·(Craft+FN)`，FN 在满分权重 6 里只占 **1**。漂亮空壳 W 照样高、照样"有改善"、照样 PASS。**数学上奖励"好看"压过"能用"。**

### A3 闭环从未被定义
"完整逻辑闭环"对前端（尤其全栈）= UI 操作 → 真实 API → DB 持久 → UI 反映 → **刷新后仍在** → 反向闭合 → 失败路径有交代。当前评测只提 "create→edit→delete" 流程，**无刷新存活、无跨视图传播、无真实 vs mock、无失败路径矩阵**。

### A4 评价单元是"零散 criterion"，不是"功能闭环"
criteria 是 checkbox PASS/FAIL，门槛 80%。100% criteria 通过 **≠** 任何一个功能闭环完整。evaluator 自由点击探索，**无 Feature × 闭环环节 的覆盖矩阵**，漏测逆向路径与边界态几乎必然。

### A5 无单点否决
80% criteria + 4 维过线即 PASS。某 spec 一级功能核心闭环完全断裂（创建不持久化、刷新丢数据），只要其他点够多照样 PASS。

### A6 假闭环未被识别
前端用 mock / hardcode / 乐观更新假装成功。evaluator 被要求测 running app，但**未强制刷新持久化检查、未识别 mock/写死数据**。全栈尤其危险——前端可能 mock 了后端，闭环断了却看不出来。

### A7 校准在反向激励
`frontend-design/SKILL.md` Example C（3D 美术馆，FN=6 但 PASS，因 DQ=9/OG=10）明确示范"视觉惊艳可盖过功能硬伤"——与"严控闭环"背道而驰。且前端**无"漂亮但空心"的校准锚**。

---

## Part B — 改进方案

### B1 维度重设计（前端 4 → 5 维）

| 维度 | 权重 | 阈值 | 说明 |
|---|---|---|---|
| Design Quality | HIGH | ≥7 | 不变（反 AI-slop） |
| Originality | HIGH | ≥7 | 不变 |
| **Functional Completeness / 闭环度** ⭐NEW | **HIGH** | **≥7 + 双重 gate** | count-based，源自 Feature Loop Matrix（B2） |
| Craft | STD | ≥6 | 不变 |
| UX-Usability（原 Functionality 拆出的"可用性"） | STD | ≥7 | 保留"能否理解/找到/完成" |

> 新 FuncComp **既是计分维度**（喂 W，给 generator 改善信号），**又是一票否决 gate**（硬 FAIL）。只做 gate 丢改善趋势；只做维度漂亮空壳仍踩线过——两者都要。
> 5 维不必担心"注意力摊薄"：FuncComp 是 **count-based**，**比美学维度更不飘**。

### B2 Feature Loop Matrix（核心结构化产物）⭐

每个 spec feature × **6 环节**，cell = `✅完整 / ⚠️部分 / ❌缺失 / 🔗假闭环`：

| 环节 | 含义 |
|---|---|
| 1 入口可达 | feature 从 UI 可触发 |
| 2 交互完整 | 主操作触发 + 即时反馈（loading / 乐观态） |
| 3 状态正确且传播 | 列表 + 详情 + 计数 + 导航都更新 |
| 4 **持久化（刷新存活）** ⭐ | 见 B3，**分类型**断言 |
| 5 逆向 / 退出闭合 | 编辑改得动、删除真没了、撤销可用 |
| 6 失败路径有交代 | 校验错 / 网络错显式、不静默、不卡 spinner |

**FuncComp 计分** = `✅` 占比（`⚠️=0.5`）映射 1–10。矩阵写进评测报告，任何 P0 feature 的 `❌/🔗` 是 blocker。

> **`🔗`（假闭环）专门抓"乐观更新造假 / mock / hardcode"**——AI 生成前端的高频死法；计分等同 `❌`，但报告里标注，驱动 generator 走 **Wire**（B8）而非视觉重做。

### B3 闭环验证协议（每个 P0 feature 逐条走）

1. UI 触发操作
2. 验证即时反馈（loading / 乐观态）
3. **★ 刷新页面 / 重新导航 → 确认状态存活**（抓乐观更新造假）
4. 验证传播到所有应反映的视图
5. 验证逆向闭合（编辑 / 删除）
6. 触发失败路径（校验错 / 网络错）→ UI 有交代

**环节 3（刷新存活）的持久化定义分类型** ⭐：
- **FULLSTACK**：刷新 → 数据经**真实 API + DB** 往返；assert 网络面板有真实调用、显示数据 == 接口返回（**非 mock**）。
- **FRONTEND-only**：刷新 → 状态经**客户端持久**（localStorage / sessionStorage / store）存活；功能天生瞬时须 spec 注明。

**硬规则**：任何 create/update/delete 后**不刷新验证持久化** → 该 feature 判未闭环；**刷新后丢失 = Critical**（B4 单独否决）。

### B4 Pass/Fail 升级（多重 gate）

```
PASS 当且仅当：
  - 5 维全部过阈值
  - 任意 P0 feature 的【持久化环节(4)】为 🔗/❌ → 硬 FAIL（持久化否决）
  - 任意 P0 feature ≥3 环节 🔗/❌          → 硬 FAIL
  - P0 criteria 100% + P1/P2 criteria ≥80%（planner 标 P0/P1/P2）
```

> 持久化断裂**单独否决**（不必凑够 3 个）——它是"伪完成"的头号死法。

### B5 状态矩阵强制（替代单张 error 截图）

P0 feature 的 **空 / 加载 / 成功 / 错误** 四态各实测 + 截图。聚合 4 张总览截图保留；per-feature 截图**仅附在失败 cell**（控成本）。

### B6 校准增补（`skills/frontend-design/SKILL.md`）

- 加 **Example D "漂亮但空心"**：Kanban 卡片精美、拖拽流畅（DQ=8），刷新后卡片全复位（持久化 🔗）→ FuncComp=3，**FAIL**。
- **Example C 注一句**：C 是**设计**天花板，不是**产品**天花板——真实 app 带 C 的功能缺口会因 FuncComp FAIL。（保留 C 的反 AI-slop 价值，不毁它。）
- 加防膨胀规则："任意 P0 feature 持久化 🔗 → FuncComp ≤ 4"。

### B7 上游（planner，序列靠后）

- spec feature 列表打 **P0 / P1 / P2**。
- acceptance criteria 按 **6 环节模板**组织 → 矩阵可直接回填，"评价单元"从源头就是闭环。

### B8 generator 涟漪（`agents/frontend-generator.md`）

Refine / Pivot 之外加第三轴：**FuncComp 低 → "Wire/Fix"**（接持久层、删 mock、补逆向路径），**禁止**用视觉 pivot 回应闭环问题。cell 语义驱动响应：`🔗` → Wire；`⚠️` 多 → Refine；DQ/OG 低 → Pivot。

### B9 跨 sprint 回归（always-on）

每个前端 sprint 收尾前，对**前序 P0** feature 复验环节 4（持久化）+ 5（逆向）。**串行模式也要做**（F3 悄悄打断 F1 的闭环在串行下同样发生）；TEAM 的 A7 wave-smoke 只管 merge 时刻，**不替代它**。

### B10 W-score 同步（耦合 TEAM_MODE A8）

前端 W 重定义——**本改造与 TEAM 的唯一耦合点**：

```
W_frontend = 2·(DQ + OG + FuncComp) + 1·(Craft + UX-Usability)   # 满分权重 8，闭环占 2/8
```

> PR-A 的 #11 先把改善口径（加权 W）统一；本改造在 PR-C 里**扩展前端 W 的构成**（加 FuncComp 项）。顺序：#11 定义 W → PR-C 重定义前端 W。

---

## Part C — 落点表

| 改动 | 文件 | 解决诊断 |
|---|---|---|
| 5 维 + FuncComp(HIGH/双重 gate) | `agents/frontend-evaluator.md` 评分段 | A1 A2 |
| Feature Loop Matrix + 闭环协议 | `agents/frontend-evaluator.md` 报告模板 + 测试段 | A3 A4 A6 |
| 多重 gate（持久化否决 + ≥3 + P0 100%） | `agents/frontend-evaluator.md` Pass/Fail 段 | A5 |
| 状态矩阵强制 | `agents/frontend-evaluator.md` 截图要求 | A3（状态） |
| Example D + 注 C + 防膨胀 | `skills/frontend-design/SKILL.md` 校准段 | A7 |
| Wire/Fix 策略轴 | `agents/frontend-generator.md` 策略段 | A6（generator 响应） |
| P0/P1/P2 + 6 环节 criteria | `agents/planner.md` + contract 模板 | A4（上游） |
| 跨 sprint 回归 | `agents/frontend-evaluator.md` + `skills/harness-build/SKILL.md` | A5（跨 sprint） |
| 前端 W 构成 | `docs/TEAM_MODE.md` **A8**（仅此项耦合） | A2（权重） |

> 后端 evaluator 暂不动（已成熟）。可选：后端也采用 Feature Loop Matrix 以保持一致，低优先级。

---

## Part D — 分阶段

**Phase 1（最高杠杆，仅 evaluator + 校准）**：
- B1 FuncComp 维度 + B3 持久化硬规则 + B2 Feature Loop Matrix 进报告 + B6 Example D。
- **验收**：一个"漂亮但刷新丢数据"的 demo → FuncComp ≤4、硬 FAIL（改造前会 PASS）。
- 这一步就把前端从"评海报"变成"评产品"。

**Phase 2（gating + 状态矩阵 + generator）**：
- B4 多重 gate + B5 状态矩阵强制 + B8 Wire/Fix 策略轴 + B10 前端 W 构成（动 TEAM_MODE A8）。
- **验收**：P0 持久化 🔗 的 app 不再能 PASS；generator 对 FuncComp 低走 Wire 而非 Pivot。

**Phase 3（上游 + 回归）**：
- B7 planner P0/P1/P2 + 6 环节 criteria 模板 + B9 跨 sprint 回归。
- **验收**：criteria 按闭环结构生成；F3 打断 F1 闭环被复验抓到。

---

## Part E — 对 PR-A / PR-B 的归属

| PR | 内容 | 与本改造关系 |
|---|---|---|
| **PR-A (v1.1.1, bugfix)** | #1 Playwright 包名、#2 settings、#3 `.gitignore`、#5 skill 命名、#9 TaskList、#11 W 口径统一 | **本改造的前置依赖**：#1（真实浏览器闭环测试要 Playwright 起得来）、#11（W 公式基础） |
| **PR-B (v1.2.0, TEAM)** | 并行调度 | **正交**。唯一交点是 TEAM_MODE A8 的前端 W（本改造 B10）。两者独立开发，合并时对齐 A8 |
| **PR-C (v1.2.x, EVAL_REWORK)** ⭐本改造 | 前端闭环评价轴 | 独立 PR，**序列在 PR-A 之后**；可与 PR-B 并行开发，A8 为唯一集成点 |

**建议**：本改造作为独立 **PR-C**，**不并入 PR-B**（两个大改动耦合会让 review/回滚都变难）。序列：

```
PR-A (v1.1.1)  →  PR-B (TEAM) ∥ PR-C (EVAL_REWORK)  →  集成时对齐 A8
```

Phase 1 可**先行合入**（纯 evaluator + 校准，零耦合、零回归风险）。

---

## 附录

### 6 环节闭环（canonical）
入口可达 → 交互完整 → 状态正确且传播 → **持久化（刷新存活）** → 逆向/退出闭合 → 失败路径有交代。

### Cell 语义 → generator 策略
- `✅` 完成 / `⚠️` 部分 → Refine
- `❌` 缺失 → 视位置 Refine 或补实现
- `🔗` 假闭环（mock / 乐观造假 / hardcode）→ **Wire**（接持久层、删 mock），**非**视觉 pivot

### 前端 W 新构成
`W = 2·(DQ+OG+FuncComp) + 1·(Craft+UX)`，满分 8，闭环 2/8（原 FN 1/6）。

### 交叉引用
- [`TEAM_MODE.md`](./TEAM_MODE.md) **A8**（W-score）：本改造 B10 重定义前端 W。
- [`TEAM_MODE.md`](./TEAM_MODE.md) **A7**（wave 集成冒烟）：merge 时刻；本改造 B9 补 per-sprint 闭环回归（串行也要）。
- 后端 evaluator 已是范式（FC + count-based + A/B/C + 防膨胀）；本改造是"前端向后端看齐"。

---

*本文档为设计规格（DRAFT），尚未实施。实施前评审 Part A/B；按 Part D 分阶段、Part E 归 PR-C 落地。*
