# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与[语义化版本](https://semver.org/lang/zh-CN/)。

## [0.4.0] — 2026-10-14

本版全部修正来自**真实使用的反馈**（D:\brainwo\dax 的实际会话记录）。

### Added
- **HTML 页面成为一等记录**：构建器索引 `.html`，在看板上以「页面原型」列显示，详情给出可点开的链接（此前 7 个原型页堆在 `70-knowledge/` 里、看板完全看不见）
- 看板自带 `cache-control: no-store`，不再出现"刷新还是旧版"
- `start-server.cmd` 顺带启动 watcher：**只要服务在跑，看板就不会过期**（端口统一 8799）

### Changed
- **校验器新增两条规则**：① **跨文件 ID 冲突**（`.md`/`.html`/附件统一检测）—— 实测能抓出 `KB-2026-0002` 被两个文件占用；② **状态落后于产物**（已有调研/计划/执行/验收产物，状态却还停在 `triaged` 等早期阶段）→ WARN
- **SPEC 新增 §8.1**：视图类交付的验收标准 = **用户能打开一个入口并实际操作；截图不算交付、不算证据**
- **SPEC §4 新增三条约定**：HTML 页面归属、**一个 ID 只能对应一个文件**、**起服务只用 `start-server.cmd`（8799），agent 不得自选端口**
- **SKILL 新增四条工作方式**：① 先讲人话再落台账（把答案埋进 frontmatter = 没回答）；② 轻量模式（纯咨询/小改动不建条目不派发）；③ 刹车条件（连续 3 轮只有台账产出就停下问用户）；④ **默认必须派发**给编程 agent 并由非执行者验收

### Fixed
- `selftest.mjs` 的扫描集与 `build.mjs` 不一致（少了 `log/`、也没算 `.html`），会误报"索引落后于源文件" —— 由陈旧检测自己抓出来的

## [0.3.0] — 2026-10-14

### Added
- **记录支持安全子集 HTML**：`<details>` 折叠、`<table>` 表、`<img>` 图、`<kbd>` 等原样渲染（此前全部被转义成文字）；含 `on*=` 或 `javascript:` 的标签以及其他 HTML 仍然转义，普通文本里的 `<` `>` 也照旧安全
- **看板显示条目附件**：自动扫描 `<阶段目录>/artifacts/<ID>/`（及 frontmatter 的 `artifacts_dir`），在条目详情里列出文件名与大小，**可点击打开**；`.html` 附件（如单文件前端原型）直接在浏览器渲染

### Why
真实使用里：① 记录里写 HTML 只看到文字；② 派发产生的大量附件（原始数据、日志、HTML 原型）在磁盘上有、在看板上却看不见。

## [0.2.2] — 2026-10-14

### Added
- **`workbench/start-dashboard.cmd`** —— 双击直接打开看板（纯静态网页，可点击/筛选/搜索，不需要任何服务）
- **`workbench/start-server.cmd`** —— 双击起一个本地服务并在浏览器打开 `http://127.0.0.1:8799/index/dashboard.html`（可给同事用内网地址访问）

### Why
有人（合理但错误地）把"可视化"理解成"截个图给我看" —— 截图不能点、不能筛。看板本来就是**可交互的静态网页**，缺的只是一个双击入口。现在每个实例自带这两个入口。

## [0.2.1] — 2026-10-13

### Added
- `index/test-validate.mjs` —— **校验器自己的回归测试**（6 个用例、123 条断言；断言"独立复核实际 ERROR 行数与退出码"，不信任摘要行）
- `docs/walkthrough.md` —— 从想法到交付的十步闭环与常见问题
- CI 新增一步：对**随包发布的校验器**跑它自己的测试

### Notes
- 该测试经过**变异验证**：静默禁用"ID 重复"检查后测试必须报红（实测 exit=1 并指出"实际 0 行"），恢复后 exit=0。详见仓库内 EX-2026-0003 / VR-2026-0002。

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
