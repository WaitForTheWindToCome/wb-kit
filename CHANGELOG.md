# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与[语义化版本](https://semver.org/lang/zh-CN/)。

## [0.1.0] — 2026-10-13

首个可用版本。

### Added
- `wb init [dir]` —— 把台账目录、规范（SPEC.md）、10 个模板、agent 技能一次性初始化到任意项目
- `wb build [dir]` —— 扫描 Markdown，重建 `index/workbench.sqlite`（FTS5 全文索引）与 `index/dashboard.html`
- `wb watch [dir]` —— 监听 Markdown 变化自动重建
- `wb check [dir]` —— 自检：看板可渲染、索引已生成、模板齐全
- `wb upgrade [dir]` —— 更新规范/模板/脚本，**永不触碰用户记录**（支持 `--dry-run`）
- `--agent=dsh|claude|both|none` —— 技能安装目标可选
- 只读看板：按状态分组的看板 + 可筛选表格 + 条目全文（单文件，无外链、无服务端）
- 零运行时依赖（仅用 Node 内置模块；索引依赖 `node:sqlite`）

### Notes
- 索引与看板均为派生产物，删除后可随时重建；Markdown 是唯一真相源。
