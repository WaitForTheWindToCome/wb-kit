# 工作台规范（Workbench SPEC）

> **这份文件是唯一权威。** 任何 agent（DSH / Claude Code / 其他）在 `workbench/` 内写入之前，先读这一份。
> 目录可以加、字段可以扩，但第 1 节的四条铁律不可绕过。
> 版本：v0.1 ｜ 建立：2026-10-13 ｜ 修改本文件 = 一次需要留痕的决策（见 §12）。

---

## 0. 一句话定位

`workbench/` 是一个**本地、纯文本、面向 AI 写入**的技术管理与研发决策档案库：

- 内容 = 本地 Markdown（YAML frontmatter + 正文），可以直接 git、可以直接 grep、可以被任何编辑器打开；
- 写入 = 只由 AI agent 完成（人只审批、只阅读、只提问）；
- 索引 = SQLite 与看板是**从 Markdown 派生**出来的，随时可删可重建；
- 边界 = 它**不执行代码**（执行交给 Claude Code 等编程 agent），只负责"该不该做、做什么、做完怎么算过"。

---

## 1. 四条铁律（不可绕过）

1. **唯一真相源是 Markdown。**
   SQLite、DASHBOARD、任何 UI 都是派生视图。禁止产生"只存在于数据库或看板里"的信息。删掉 `index/` 必须不影响任何结论。

2. **原始输入永不改写。**
   `00-inbox/` 是 append-only：写进去就不再编辑、不再删除、不再"清洗"。清洗结果写到 `10-items/`，并在条目正文里用 `## 原始输入` 原样保留原文 + `sha256`。原文与结论不一致时，以原文为准判断"是否偏离原意"。

3. **没有证据不算完成。**
   任何"已完成 / 已通过"必须能给出：执行命令、退出码、原始输出文件路径、产物 `sha256`、引用到行号。
   **编程 agent 的自述不是证据**；验收必须由非执行者产出（`60-verify/`）。

4. **先验收标准，后实现。**
   进入 `executing` 之前，`40-plans/` 里必须同时存在 PLAN 与 ACC（验收计划）两份文件，且 ACC 的每条标准都可测、写明证据获取方式。开发后补写验收标准 = 无效验收。

---

## 2. 目录：什么东西放哪里

| 目录 | 放什么 | 不放什么 | 可变性 |
|---|---|---|---|
| `00-inbox/` | 原始想法、需求、问题、Bug、会议记录、聊天粘贴。文件名 `YYYY-MM-DD-HHmm-类型-摘要.md` | 清洗后的结论、分析、评分 | **append-only** |
| `10-items/` | 结构化条目：一个"需要被决策的事项"一个文件。含 frontmatter、原始输入、事实/假设/待验证三段、拆分出的子条目 | 长篇调研（放 20）、方案细节（放 40） | 可变，状态字段驱动 |
| `20-research/` | 技术调研报告：问题、结论、来源清单、已证实/推断/待验证三档、实验与基准数据 | 最终决策（放 30）、泛泛综述无来源 | 可变（补充证据） |
| `30-decisions/` | 决策记录（ADR 风格）：背景、备选方案、推荐方案与理由、**被放弃方案的理由**、风险与失败场景、重估触发条件、审批人 | 未审批的草稿（草案状态 `proposed` 可留在此目录） | **批准后不可改**，只能新增 superseding 记录 |
| `40-plans/` | `PLAN-*` 开发计划（阶段/里程碑/任务/依赖/关键路径/成本）与 `ACC-*` 验收计划（验收标准 ↔ 需求映射、测试、边界、证据获取方式） | 执行结果（放 50） | 可变，变更需写变更原因 |
| `50-exec/` | 每次派发的任务包 + 执行结果：agent、会话 id、写域、起止时间、输出摘要、成本、证据文件路径、失败原因 | 验收结论（放 60） | 追加式（同一次执行一个文件） |
| `60-verify/` | 独立验收记录：逐条对照 ACC 的通过/不通过 + 证据引用 + 复跑结果 + 返工条件是否触发 | 执行者的自述、直接改别人产物的内容 | **写定后追加修订块**，不覆盖旧结论 |
| `70-knowledge/` | 可复用结论、失败经验、复盘、模式与反模式、术语表 | 原始记录（应回链而非复制） | 可变（可被后续结论 supersede） |
| `80-archive/` | 终止态条目：放弃、重复、过期、已完成交付 | 仍在推进的任何事项 | 冻结 |
| `projects/` | `projects/<project-id>/PROJECT.md`：项目章程、目标、当前里程碑、仓库/路径、相关方、类型 | 项目下的具体需求与任务（那些进 10/40/50） | 可变 |
| `templates/` | 各类文件的模板。新建文件 = 复制模板 | 已填内容的实例 | 可变 |
| `index/` | 派生产物：`workbench.sqlite`（目录索引）、`DASHBOARD.md`（人看的总览） | 任何原始信息 | **可随时删除重建** |
| `log/` | 变更日志：谁在何时改了哪条状态、为什么（按月一个文件） | 具体内容正文 | append-only |

**为什么按"阶段"分目录、而不是按"项目"分目录**：跨项目复用（需求去重、历史方案检索、失败经验）是这套系统的核心价值，按项目分库会让它失效。项目维度用条目的 `project` 字段做筛选。只有当某个项目需要独立交付/独立权限时，才另开一个 workbench 实例。

---

## 3. 命名与 ID

- 条目 ID：`<TYPE>-<YYYY>-<NNNN>`，序号按类型全局递增，永不复用，永不改 ID（改名只改 slug）。
- **多人协作时**：创建前扫描现有最大编号 +1（agent 负责）；合并冲突时后入库者改号，并在 `log/` 记录一次改号。审批的强制执行靠 git（CODEOWNERS + 分支保护），不靠自觉。
- 类型前缀：`WB`(条目) / `RS`(调研) / `ADR`(决策，全局 `ADR-0007`) / `PLAN` / `ACC` / `EX` / `VR` / `KB`。
- 文件名：`<ID>-<slug>.md`，slug 用 kebab-case（≤6 词，允许中文但优先英文/拼音，便于命令行检索）。
- 目录内不建子目录（除 `projects/<id>/` 与 `50-exec/` 附件目录 `50-exec/artifacts/<EX-ID>/`）。
- 附件（日志、截图、基准原始数据）一律放 `50-exec/artifacts/<EX-ID>/` 或 `20-research/artifacts/<RS-ID>/`，正文用相对路径链接。

---

## 4. 条目 frontmatter 模式（`10-items/`）

```yaml
---
id: WB-2026-0001
type: requirement          # requirement | bug | idea | question | risk | improvement
title: 一句话标题（≤40 字，陈述待决策的事，不是复述原文）
project: dev/workbench     # 对应 projects/<id>；跨项目写 global
status: captured           # §5 状态机
priority: P2               # P0 立刻 / P1 本周期 / P2 排期 / P3 观察
tags: [spec-driven, agent]
source:                    # 来源可追溯
  kind: chat               # chat | meeting | issue | email | docs | incident
  ref: "2026-10-13 与 Lead 的对话"
  raw: 00-inbox/2026-10-13-1700-想法-技术管理闭环.md
created: 2026-10-13T17:00:00+08:00
updated: 2026-10-13T17:12:00+08:00
owner: lead                # lead | claude | zcode | human:<name>
links:                     # 关系必须显式，禁止"心里知道"
  related: []
  duplicates: []           # 命中的历史重复项
  supersedes: []
  superseded_by: []
  blocks: []
  blocked_by: []
triage:                    # status ≥ triaged 时必填，见 §6
  verdict: null            # research | clarify | spike | backlog | watch | archive
  reason: null             # 必填：判断理由（文字，不允许只给分数）
  fact_hypothesis_unknown: { facts: [], assumptions: [], unknowns: [] }
  open_questions: []
  dims: { value: null, relevance: null, existing_solution: null, feasibility: null, cost: null, risk: null, worth_research: null }
approval:                  # 见 §7 门禁
  required: false
  approved_by: null
  approved_at: null
  decision: null           # ADR-xxxx
artifacts:
  research: []
  decision: null
  plan: null
  acceptance: null
  exec: []
  verify: null
next_action: 等待 AI 清洗与初筛
---
```

- 字段缺失 = 该阶段未完成，**不允许用空值蒙混**；未知就显式写 `unknown` 并进入 `triage.open_questions`。
- 所有时间用 ISO8601 带时区；所有链接用相对路径（保证换机器还能打开）。

---

- 正文支持 **Markdown + 安全子集 HTML**（`<details>` 折叠、`<table>` 表、`<img>` 图等）；看板原样渲染，含 `on*=` / `javascript:` 的标签与其余 HTML 一律转义为文本（ADR-0004）。想展示字面标签请用行内代码包裹。
- **附件**（原始数据、日志、单文件 HTML 原型等）放 `<阶段目录>/artifacts/<ID>/`（或 frontmatter 的 `artifacts_dir`）；看板会在条目详情里列出并可点击打开，`.html` 在浏览器里直接渲染。

## 5. 状态机

```
captured → triaged ─┬→ clarify ──→ triaged
                    ├→ spike ─────→ triaged / researching
                    ├→ researching → decided
                    ├→ backlog ───→ (排期时) triaged
                    ├→ watch ─────→ triaged / archived
                    └→ archive(放弃/重复)
decided → planned → ready → executing → verifying ─┬→ accepted → archived
                                                    ├→ rework → ready
                                                    └→ rejected → archived
```

- 状态只由 AI 更新，但**门禁（§7）由人把守**；人不在场时，事项停在 `triaged` 或 `proposed`，不得越过门禁。
- 每次状态变更写一行到 `log/YYYY-MM.md`：`时间 | ID | 旧→新 | 触发者 | 依据文件`。
- 被 accepted 之后若产物再次变更（hash 不同），自动降级为 `rework`（见铁律 3 的 hash 锚点）。

---

## 6. 初筛：评估维度与结论（`triage`）

对着需求文档 §3.3 的七个维度逐项给结论，**每一项都必须带一句理由**，且必须区分事实 / 假设 / 待验证：

| 字段 | 取值 | 说明 |
|---|---|---|
| `dims.value` | high / medium / low | 潜在价值与预期收益 |
| `dims.relevance` | high / medium / low / none | 与现有目标、项目、技术路线的相关性 |
| `dims.existing_solution` | none / partial / solved | 现有方案是否已经解决（"solved" 时默认结论为 archive） |
| `dims.feasibility` | high / medium / low / unknown | 技术可行性与关键未知因素 |
| `dims.cost` | S / M / L | 实施+时间+维护成本（含维护，不只是首版） |
| `dims.risk` | low / medium / high | 风险、依赖、机会成本 |
| `dims.worth_research` | yes / no | 是否值得进一步研究或实验 |

`triage.verdict` 只能取六种：`research`(进入研究) / `clarify`(补信息) / `spike`(低成本验证) / `backlog`(待办) / `watch`(观察) / `archive`(归档或放弃)。
**禁止**只输出分数或模型主观打分；`triage.reason` 少于 2 句视为未完成初筛。

---

## 7. 门禁（Gates）与人工审批

| 门 | 位置 | 通过条件 | 谁批 |
|---|---|---|---|
| G1 进研究 | triaged → researching | `triage.reason` 完整 + ≥1 条 `open_questions` + 已检索历史重复项（`links.duplicates/related` 已填） | AI 自动 |
| G2 立项 | researching → decided | ADR 含备选方案、被放弃理由、风险、**重估触发条件**；成本 ≥ M 或涉及路线变更时必须人批 | 人 |
| G3 进开发 | decided → ready | PLAN + ACC 同时存在；ACC 每条可测、有证据获取方式；任务包写域互不重叠 | 人（低风险可预授权） |
| G4 验收 | verifying → accepted | VR 由非执行者产出；逐条对照 ACC 有证据；关键命令已复跑；无未解释的偏差 | 人 |
| G5 归档 | accepted → archived | `70-knowledge/` 已沉淀 ≥1 条可复用结论或复盘 | AI 自动 |

**必须人批的动作清单**（对应需求 §5）：正式立项与高成本投入、重大技术路线变更、范围扩大或关键需求修改、高风险文件操作/生产环境操作/数据删除、合并与发布、验收标准的修改或豁免。
其余（分类、去重、提取、检索、资料收集、计划草拟、用例生成、状态更新、日志整理、低风险自动化测试与汇总）默认自动执行，并留下记录。

审批记录落在 ADR 与条目 `approval` 字段：`approved_by` / `approved_at` / `decision`。**口头同意不算审批**，没写进文件就等于没批。

---

## 8. 证据与独立验收

- 执行记录（`50-exec/EX-*.md`）必须含：任务包快照、agent 与会话 id、写域、命令、退出码、原始输出文件、耗时与成本、失败原因（若失败）。
- 验收记录（`60-verify/VR-*.md`）必须逐条回答：ACC 第 N 条 → 通过/不通过 → 证据（文件 + 行号 或 命令 + 输出片段）→ 复跑结果。
- 产物用 `sha256` 锚定版本；产物变了，旧验收结论自动失效。
- 出现以下任一情况即判不通过：证据缺失、只引用 agent 自述、验收者与执行者同一上下文、标准被事后修改。

---

## 9. 检索与索引

三层，按需升级，不要一上来就上向量库：

1. **零成本**：`rg` 全文 + frontmatter 过滤（`rg 'status: researching'`）。
2. **推荐**：`index/workbench.sqlite` —— 由脚本解析 frontmatter 生成（表：items / research / decisions / plans / exec / verify + FTS5 全文），配 `DASHBOARD.md`。数据库是派生产物，可删可重建。
3. **后期**：需要语义检索时再加 embedding 列，仍然以文件为准。

检索入口固定三条：按 `project`、按 `status`、按 `tags`；重复需求判定必须走 `links.duplicates`。

### 9.1 可视化（只读契约）

- 默认 UI = **用 Obsidian 把 `workbench/` 作为 vault 打开**（本机已装）。视图用 **Bases**（核心插件；`.base` 文件本身就是 vault 内的纯 YAML，**由 agent 生成**）：
  - `index/views/items-by-status.base`：按 `status` 分组的看板（**Kanban 布局需 Obsidian ≥ 1.14**；1.12 只有 Table / Cards）；
  - `index/views/by-project.base`：按 `project` 过滤的表格——软件 / 人生 / 考试同库不同视图。
- **视图只读**：拖拽卡片会写回文件属性，写回是 agent 的职责，人不要用拖拽改状态。
- Bases 不需要索引文件，因此 `index/workbench.sqlite` 只在需要 SQL 聚合或全文检索时才生成；它永远是派生产物。
- git 卫生：`.obsidian/workspace.json`、`workspaces.json` 进 `.gitignore`（每次开文件都变）；**`.base` 视图文件必须进 git**。
- 备选：VS Code + Foam（免安装、仅预览表格）；需要对外发布只读看板时用 Quartz 渲染站点。

---

### 9.2 索引的定位与多机协作（ADR-0003）

**索引永远不共享、永远可重建、永远不是真相源。** 使用模式已确认：**单人、每人一台机器、文档通过 git 分发**。

- `index/workbench.sqlite` 与 `index/dashboard.html` **不进版本库**（见 `workbench/.gitignore`）。二进制派生物入库只会污染 diff、制造无意义冲突，并诱导人把它当成权威。
- **每台机器各自重建**：分发的内容只有 `md` + frontmatter（可读、可 diff、可合并）；索引是本地补齐的缓存。
- **陈旧即不可信**：索引带 `fingerprint`（"会成为记录的文件"集合的 sha256 前 12 位）。看板页头显示指纹与生成时间；`node index/selftest.mjs`（即 `wb check`）会重算指纹并比对，不一致就报 `WARN 索引落后于源文件`。
  ⚠️ 指纹是**本机陈旧标记**，不是跨机身份：`git clone` 后 mtime 全部相同也无妨，因为每台机器本来就要各自重建一次。
- **并发安全**：先写 `workbench.sqlite.tmp`、成功后再原子改名；看板同样先写临时文件再替换。避免 watcher 与手工 `wb build` 同时写坏产物。
- **ID 分配不依赖数据库**：编号由扫描现有文件得出（§3），因此**不存在"只活在 sqlite 里的状态"**——删掉整个 `index/`，信息零损失。
- **拉取后自动重建**：`git config core.hooksPath <workbench>/.githooks`（提供 `post-merge` / `post-checkout`），或常驻 `wb watch`。二者任选其一，别两个都开。
- 冲突只可能发生在 `md` 上；因为"一个事项一个文件"，实际冲突面很小。

## 10. 多域扩展：软件 / 人生 / 考试 都是项目

`project.type` 取值：`software` | `life` | `exam` | `ops` | `research` | `other`。
**核心 schema 与目录一律不变**，只有模板与部分字段语义不同——这是"同一套流程管理任何目标"的关键。

| workbench 概念 | 软件开发 | 考试备考 | 个人目标（人生） |
|---|---|---|---|
| 条目 | 需求 / Bug | 知识点缺口、错题类型、待报考事项 | 想做的事、要解决的问题 |
| 调研（20） | 技术选型、基准测试 | 资料/课程/题库对比 | 方案与资源对比 |
| 决策（30） | 架构选型 ADR | 资料与时间分配决策 | 重大选择记录 |
| 计划（40） | 迭代计划 | 复习计划（阶段=周） | 行动计划 |
| 验收（40-ACC） | 功能/性能/回归测试 | 模考分数阈值、错题复现率 | 可度量的结果定义 |
| 执行（50） | Claude Code 任务 | 每日学习记录 | 行动记录 |
| 验收（60） | 独立验收 | 模考复盘 vs 目标分 | 阶段回顾 |
| 复盘（70） | 事故/失败经验 | 错题规律、提分经验 | 经验教训 |

新增一个领域时：在 `projects/` 建 PROJECT.md，选 `type`，必要时在 `templates/` 加一套模板；**不要新增目录层级**。

---

## 11. 与编程 agent（Claude Code 等）的接口

- 任务包 = `50-exec/EX-*.md` 的任务部分：背景、目标、写域（只允许写哪些路径）、验收标准、自证要求。任务包必须自包含，不依赖会话历史。
- 派发沿用仓库里已有的 `.crew/bin/crew.ps1`（`claude -p ... --output-format json --resume <sessionId>`），产出日志落到 `50-exec/artifacts/<EX-ID>/`。
- 结果回收：CLI 的结构化输出（`session_id` / `is_error` / `num_turns` / `total_cost_usd` / `result`）回填 EX 文件。
- **同一文件同一时刻只有一个 writer**；写域重叠的任务必须串行。
- 已知缺陷（来自 .crew 第 1 轮评审，落地时必须修）：会话键 `tool@cwd` 缺工作流维度 → 并行任务会共用同一会话；注册表读改写无锁。修法：键改为 `tool@cwd#workstream`，写注册表用临时文件 + 原子改名。

---

## 11.1 与 Spec Kit 的分工（ADR-0002）

引入 Spec Kit 后，真源分区如下，**禁止互相复制**：

| 真源范围 | 位置 |
|---|---|
| 收集 / 清洗 / 初筛 / 决策记录 / 执行与验收证据 / 知识沉淀 | `workbench/` |
| 单次变更的规格 spec、技术计划 plan、任务拆解 tasks | 代码仓库内 `.specify/`、`specs/NNN-*/` |

- `40-plans/PLAN-*` 只写里程碑、依赖、资源与关键路径；任务清单引用 Spec Kit 的 `tasks.md` 路径。
- `40-plans/ACC-*`（验收标准）以 workbench 为准；Spec Kit 的 checklist 必须回链 ACC 编号。
- 执行证据只落 `50-exec/artifacts/`，验收结论只落 `60-verify/`。
- **命名冲突裁定（来自 Spec Kit assess 的 B5）**：`research.md` 在三处含义不同 —— 本台账 `20-research/RS-*.md`（**决策依据**）、`.specify/assessments/<slug>/research.md`（评估过程）、`specs/<feature>/research.md`（实现期调研）。**三者并存、互不替代**，引用一律写全路径；凡"该不该做"的结论以本台账为准。任何情况下都不要再引入第四套命名。

## 12. 治理与变更

- 改本 SPEC = 提一个 `ADR`，写清动机、影响范围、迁移方式；不写 ADR 就改目录结构视为无效变更。
- 每个季度做一次归档与去重巡检：`80-archive/` 增长、重复条目、过期状态（>30 天未动的 `researching`/`executing`）。
- 备份 = git（`workbench/` 可独立成仓）；`index/` 不进 git。
