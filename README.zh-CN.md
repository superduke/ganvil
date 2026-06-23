# Ganvil

[English](./README.md) | 中文

> **一句话需求 → 可交付的应用 —— 在生成器 ↔ 评估器的对抗中淬炼成型。**
>
> *ganvil* = **GAN** + **anvil**(铁砧):生成器与评估器在每个 sprint 里把产品锤打到质量门槛。

**Ganvil** 是一个面向 [Claude Code](https://claude.com/claude-code) 的自主编码 harness:把 1–4 句的产品描述,通过 **Planner → Generator ↔ Evaluator** 流水线 + Sprint 分解,变成可运行的应用。灵感来自 GAN(生成式对抗)—— 负责"生成"的 agent 和负责"评估"的 agent 相互独立,质量由独立方判定,而非自我打分。

灵感来自 [Anthropic 的 harness 设计研究](https://www.anthropic.com/engineering/harness-design-long-running-apps)。

## 仓库里有什么

本仓库是一个 Claude Code **插件市场(plugin marketplace)**:

```
.
├── ganvil/                            # 插件本体
│   ├── agents/                        # planner + 前端/后端 的 generator 与 evaluator
│   ├── skills/                        # build、plan、evaluate、frontend-design、ai-integration
│   ├── bin/team-scheduler             # 无状态 TEAM 波次调度器
│   ├── tests/                         # node:test 测试集(11 个用例)
│   ├── docs/                          # TEAM_MODE.md、EVAL_REWORK.md
│   └── README.md                      # ← 完整文档、架构、评测标准
├── .claude-plugin/marketplace.json    # 市场清单
├── CHANGELOG.md
└── LICENSE                            # MIT
```

## 安装

**方式 A —— 从本市场安装**(推荐):
```bash
claude /plugin marketplace add superduke/ganvil
claude /plugin install ganvil@ganvil
```

**方式 B —— 直接指定插件目录:**
```bash
claude --plugin-dir /path/to/ganvil
```

## 快速上手

```
/ganvil:build 一个支持实时协作和 AI 辅助绘图的白板工具
/ganvil:plan   一个 IoT 传感器数据可视化看板
/ganvil:evaluate frontend
```

运行产物都落在 `ganvil-artifacts/`(spec、sprint 契约、构建日志、评测报告、截图)。

## 文档

- **完整 README 与架构** —— [`ganvil/README.md`](./ganvil/README.md)
- **TEAM 并行模式** —— [`ganvil/docs/TEAM_MODE.md`](./ganvil/docs/TEAM_MODE.md)
- **前端闭环评测改造** —— [`ganvil/docs/EVAL_REWORK.md`](./ganvil/docs/EVAL_REWORK.md)
- **更新日志** —— [`CHANGELOG.md`](./CHANGELOG.md)

> 注:`ganvil/README.md` 与两份设计文档为英文;中文版目前仅此根 README。

## 状态

v1.3.0。TEAM 并行模式(`SPRINT-TEAM`)已具备串行安全基线(C=1 时与串行 `SPRINT` 完全等价),调度器管线就位;真正的多分支并行暂为门禁状态 —— 需先在真实项目上 dogfood(`userConfig.defaultParallelism` 默认 `always-serial`)。

## 协议

MIT © superduke
