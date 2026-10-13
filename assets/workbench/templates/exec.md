---
id: EX-YYYY-NNNN
item: WB-YYYY-NNNN
plan: PLAN-YYYY-NNNN
agent: claude                # claude | dsh | zcode | human:<name>
session_id: null
write_scope: []              # 只允许写这些路径
status: queued               # queued | running | succeeded | failed | blocked | deviated
started: 
ended: 
cost: null
artifacts_dir: 50-exec/artifacts/EX-YYYY-NNNN/
---

# 任务包（自包含，不依赖会话历史）

## 背景
## 目标
## 写域（越界即失败）
## 必须遵守的约束
## 验收标准（逐条，来自 ACC）
## 自证要求（命令 + 原始输出）

# 执行结果

## 产出与变更文件（路径 + sha256）

## 证据
| 命令 | 退出码 | 原始输出 |
|---|---|---|

## 偏差、失败原因与阻塞

## 回收的结构化信息
session_id / num_turns / cost_usd / is_error：
