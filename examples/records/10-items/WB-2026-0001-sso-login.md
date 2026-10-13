---
id: WB-2026-0001
type: requirement
title: 内部工具接入公司 SSO 登录
project: demo-app
status: decided
priority: P1
tags: [auth, sso, oidc]
source:
  kind: meeting
  ref: 2026-01-06 与运营负责人的周会
  raw: null
created: 2026-01-06T10:00:00+08:00
updated: 2026-01-09T15:20:00+08:00
owner: lead
links: { related: [], duplicates: [], supersedes: [], superseded_by: [], blocks: [], blocked_by: [] }
triage:
  verdict: research
  reason: 运营同事当前共用本地账号，存在审计与离职回收问题；公司已有 IdP，接入属于低风险高收益。已确认没有现成内部方案覆盖，故进入调研。
  open_questions: ["老账号如何平滑迁移", "登录态与现有会话机制如何共存"]
  dims: { value: high, relevance: high, existing_solution: none, feasibility: high, cost: M, risk: medium, worth_research: yes }
approval: { required: true, approved_by: it-admin, approved_at: "2026-01-09T15:00:00+08:00", decision: ADR-0001 }
artifacts: { research: [RS-2026-0001], decision: ADR-0001, plan: null, acceptance: null, exec: [], verify: null }
next_action: 出 PLAN 与 ACC
---

# 内部工具接入公司 SSO 登录

## 事实 / 假设 / 待验证
- 事实：公司 IdP 支持 OIDC；现有工具用本地账号表。
- 假设：运营同事的账号与公司 AD 账号一一对应（待验证：有 3 个外包同事可能没有公司账号）。
- 待验证：并发登录时 IdP 的限流策略。

## 初筛结论与理由
价值高（审计与离职回收是合规要求）、相关性强（已有 IdP，不引入新依赖）、成本中等。结论：进入调研。

## 变更历史
- 2026-01-06 建立条目并完成初筛；
- 2026-01-09 ADR-0001 批准，状态推进为 decided。
