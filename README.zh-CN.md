# wb-kit

**给 AI 辅助研发团队用的、可审计的决策台账。**

[![CI](https://github.com/WaitForTheWindToCome/wb-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/WaitForTheWindToCome/wb-kit/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22.5-brightgreen.svg)](https://nodejs.org)

[English](README.md) · **[在线看板 demo](https://waitforthewindtocome.github.io/wb-kit/)** —— 由 [`examples/records/`](examples/records/) 里的示例台账生成

---

编程 agent（Claude Code、Codex、DSH……）擅长**写代码**，不擅长**判断什么值得写**。wb-kit 在它们前面放一本轻量、可审计的台账：

> **收集 → 清洗 → 初筛 → 调研 → 决策 → 计划 → 验收标准 → 执行 → 独立验收 → 沉淀**

一条命令，把一套纯 Markdown 工作台和一份 agent 技能，装进任意项目。写入由 agent 完成，你只审批和阅读。它不是平台、不是服务、不是数据库 —— 是**一套约定 + 一个只读视图**。

## 安装

wb-kit **还没有发布到 npm registry** —— 直接从本仓库安装：

```bash
# 不安装，直接跑
npx github:WaitForTheWindToCome/wb-kit init ./my-project

# 或全局安装
npm i -g github:WaitForTheWindToCome/wb-kit
wb init ./my-project
```

也可以从 [Releases](https://github.com/WaitForTheWindToCome/wb-kit/releases) 下载 `wb-kit-0.1.0.tgz`，然后 `npm i -g ./wb-kit-0.1.0.tgz`。

## 为什么

"AI 项目管理"通常死在同样三个地方。wb-kit 把对策写死成四条铁律：

1. **Markdown 是唯一真相源**：SQLite 与看板都是派生物，删掉能重建；不允许存在"只活在视图里"的信息。
2. **原始输入永不改写**：`00-inbox/` 只追加；每个条目原样保留原文 + 哈希。这是你发现"AI 清洗偏离原意"的唯一手段。
3. **没有证据不算完成**：任何"已完成"必须给出命令、退出码、原始输出文件、产物哈希与行号引用。**agent 的自述不是证据**，且验收者不得是执行者。
4. **先验收标准，后实现**：进入执行前必须同时存在计划与验收计划；开发后补写验收标准 = 验收无效。

## 你会得到什么

```
my-project/
├─ workbench/
│  ├─ SPEC.md            规范（唯一权威）：目录、字段、状态机、门禁、证据规则
│  ├─ PORTABLE.md        搬迁、协作、团队使用说明
│  ├─ 00-inbox/          原始想法，只追加，永不改写
│  ├─ 10-items/          结构化条目（一个事项一个文件，YAML frontmatter）
│  ├─ 20-research/       调研报告：来源 + 已证实 / 推断 / 待验证
│  ├─ 30-decisions/      决策记录 ADR，含被放弃方案理由与重估触发条件
│  ├─ 40-plans/          PLAN 计划 + ACC 验收计划
│  ├─ 50-exec/           派发与执行记录（命令、退出码、原始输出、成本）
│  ├─ 60-verify/         独立验收（验收者 ≠ 执行者）
│  ├─ 70-knowledge/      可复用结论与复盘
│  ├─ 80-archive/        终止态
│  ├─ projects/          项目注册表 —— 软件项目、人生目标、考试备考同构
│  ├─ templates/         10 个模板
│  └─ index/             零依赖脚本：build / watch / selftest
├─ .dsh/skills/workbench/SKILL.md      DeepSeek Harness 技能
└─ .claude/skills/workbench/SKILL.md   Claude Code 技能
```

## 命令

| 命令 | 作用 |
|---|---|
| `wb init [dir]` | 初始化台账、规范、模板与 agent 技能（`--agent=dsh\|claude\|both\|none`） |
| `wb build [dir]` | 扫描 Markdown → 重建 `index/workbench.sqlite`（FTS5）与 `index/dashboard.html` |
| `wb watch [dir]` | Markdown 变化时自动重建 |
| `wb check [dir]` | 自检：看板可渲染、索引已生成、模板齐全 |
| `wb upgrade [dir]` | 更新规范/模板/脚本 —— **永不触碰你的记录文件**（支持 `--dry-run`） |

## 看板

`index/dashboard.html` 是单文件网页（约 50 KB，无外链、无服务端）：按 `status` 分组的看板、可筛选表格、点开看条目全文。**设计上就是只读的** —— 写入归 agent。

## 和 agent 一起用

把 agent 指向规范，然后让它干活：

> "读 `workbench/SPEC.md` 并照它工作。写入前先声明写域；声称完成的必须有证据。"

初始化出来的技能会把常见请求（"清洗 inbox""这需求值得做吗""出计划""验收一下"）映射到正确的目录与门禁。

## 环境要求

- Node ≥ 22.5（`node:sqlite`；更低版本仍能生成看板，只是没有索引）
- 可选：git（留痕与协作）、Python（内网共享看板）、Obsidian（桌面视图）

## 设计约束（请保持）

- **零运行时依赖** —— 只用 Node 内置模块；
- 工具**永不编辑内容**，内容由 agent 写；
- `assets/` 只允许放规范、模板、脚本、技能，**绝不允许放用户数据**；CI 里的 `tools/smoke-test.mjs` 会强制执行这条。

## 贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。发 PR 前请先跑 `node tools/smoke-test.mjs`，CI 会在 Node 22 / 24 上跑它。

## 许可证

MIT —— 见 [LICENSE](LICENSE)。
