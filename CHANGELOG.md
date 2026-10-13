# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与[语义化版本](https://semver.org/lang/zh-CN/)。

## [0.2.0] — 2026-10-13

### Added
- `index/validate.mjs` —— **结构校验器**：frontmatter 必填、状态合法、ID 唯一、`links` 指向存在、项目已注册、门禁一致性（缺 PLAN/ACC 报警、禁止自验收、执行缺证据锚点报警）；支持 `gate_exempt` 显式豁免
- `wb check` 改为**先结构校验、再渲染自检**，两者都过才返回 0
- 索引**指纹自证**：看板页头显示源指纹与生成时间，陈旧时自检报 `WARN 索引落后于源文件`
- `.githooks`（post-merge / post-checkout）：`git pull`、切分支后自动重建；一行安装 `git config core.hooksPath <workbench>/.githooks`
- `workbench/.wb-version`：实例记录自己遵循的规范版本，`wb upgrade` 打印版本迁移

### Changed
- 索引与校验**跳过 `log/` 与 `spikes/`**：变更日志与实验目录不是台账记录
- 索引与看板改为**原子写**（临时文件 + 替换），并发重建不再有损坏风险

### Fixed
- `wb check` 在空台账下不再误报失败

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
