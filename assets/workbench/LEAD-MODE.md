# 谁当 Lead？三种部署形态

工作台的规范（`SPEC.md`）不依赖某个特定 agent。**谁当 Lead，就要承担**：拆任务、定写域、派发、**独立验收**、更新台账与看板。

| 形态 | 谁 Lead | 谁执行 | 独立验收谁来 | 适用 |
|---|---|---|---|---|
| **A 单 agent** | Claude Code | 同一个 Claude Code | ⚠️ **没人** —— 等于自验收，不可靠 | 快速试点、低风险小改 |
| **B 双 agent（推荐）** | DSH（或人） | Claude Code / Codex / OpenCode / ZCode | Lead（非执行者） | **日常**，门禁真实有效 |
| **C Claude 当 Lead** | Claude Code | 它用派发器调用其它 CLI | ⚠️ 需要另一个人/agent 复核 | 无人值守、批量任务 |

## 形态 C 怎么用（Claude Code 作为第一主 agent）

在那个目录直接开 Claude Code：`cd D:\brainwo\dax; claude` —— 它会自动加载 `.claude/skills/workbench/SKILL.md`，按 SPEC 工作。

要它派发给别的 agent，用本目录自带的派发器：

```bash
# 1) 先写任务包（自包含：背景 / 目标 / 写域 / 验收标准 / 自证要求）
#    workbench/50-exec/tasks/T-XXX.md

# 2) 派发（默认 claude；也可 codex / opencode / zcode / custom）
node workbench\bin\dispatch.mjs --task workbench/50-exec/tasks/T-XXX.md --tool codex --cwd D:\path\to\repo

# 只看命令不执行
node workbench\bin\dispatch.mjs --task … --tool codex --dry-run

# 接任意自家 agent
node workbench\bin\dispatch.mjs --task … --tool custom --cmd "my-agent --file {task}"
```

派发器会：**复用同一工作流的会话**（键 `tool@cwd#workstream`，注册表在 `50-exec/sessions.json`）、把原始输出落 `50-exec/artifacts/dispatch/`、抽取结构化结果（session_id / 退出码 / 成本）。

## 形态 C 的硬规矩（否则会失控）

1. **写域不得重叠**：同一时刻一个文件只有一个 writer；任务包里必须写死写域。
2. **并发 ≤2**：同时跑太多会互相覆盖、成本也失控。
3. **worker 的自述不是证据**：Lead 必须自己复跑关键命令、自己打开产物 —— 若有测试，**故意破坏一条规则看它是否报红**（变异验证）。
4. **执行者不得自验收**：形态 C 里 Claude 既是 Lead 又是执行者时，验收要么由**人**做，要么**另起一个 agent**（另一条会话、另一份任务包）做。
5. **状态与产物同步更新**：产物落地后立刻更新条目 `status` 与 `log/`，否则看板会骗人（`wb status` 会把"状态落后于产物"标出来）。

## 现在这台机器上可用的工具

| tool | 命令 | 备注 |
|---|---|---|
| `claude` | `claude -p … --output-format json --permission-mode bypassPermissions` | ✅ 已实测 |
| `codex` | `codex exec …` | 已确认有 `exec` 子命令 |
| `opencode` | `opencode run …` | ⚠️ 未在本机验证 |
| `zcode` | `node D:\software\ZCode\resources\glm\zcode.cjs -p … --mode yolo` | 需要 provider 配置 |
| `custom` | `--cmd "<任意命令>"` | 自己承担 shell 语法 |
