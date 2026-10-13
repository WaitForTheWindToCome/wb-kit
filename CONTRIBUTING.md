# 贡献指南

## 这是什么

一个**约定 + 模板 + 只读视图**的工具包：让 AI agent 按固定规范记录"想法 → 清洗 → 评估 → 调研 → 决策 → 计划 → 验收 → 执行 → 独立验收 → 沉淀"的全过程。

## 设计红线（改动前请先读）

1. **Markdown 是唯一真相源**——任何新增数据都不许只存在于 sqlite / 看板 / 其它视图里；
2. **写入只由 agent 完成**，工具保持只读，不引入"在工具里编辑内容"的功能；
3. **零运行时依赖**——只允许 Node 内置模块（`node:fs` / `node:path` / `node:sqlite` 等），不引入 npm 依赖；
4. **assets/ 里不许出现任何个人数据**——只放规范、模板、脚本、技能；`tools/smoke-test.mjs` 会用白名单守住这条红线；
5. 兼容性：Node ≥ 22.5（`node:sqlite`）；更低版本仍应能生成看板。

## 本地开发

```bash
git clone <repo> && cd wb-kit
node tools/smoke-test.mjs     # 端到端冒烟（发 PR 前必须全绿）
npm pack --dry-run            # 看打包内容
```

如果你在**自己的实例**上改了 `workbench/SPEC.md` 或模板，用 `node tools/sync-assets.mjs` 把它们同步进 `assets/`（该脚本按白名单抽取，不会带走记录文件）。

## 提 PR

- 一次 PR 只做一件事；说明"为什么"而不是"改了什么"；
- 改了用户可见行为，请同时更新 `CHANGELOG.md`；
- 改了规范或模板，请说明迁移方式（老实例用 `wb upgrade` 升级）；
- CI 会跑 Node 22 与 24 两个版本。
