# 搬迁与协作（Portable & Team）

> 结论先行：**这不是一个应用。** 没有安装包、没有服务端、没有数据库进程、没有前端工程。
> 它 = 一个目录包（Markdown 账本 + 规范 + 模板）+ 一份 agent 技能 + 3 个零依赖脚本。
> **最快路径**：`npx wb-kit init <目录>` —— 一条命令把台账、规范、模板与 agent 技能装到任意项目（等价于下面第二节的手动复制）。
> **复制 = 搬家；删除 = 卸载干净**（除了机器上的 Node / git / Python / Obsidian，系统里不留任何东西）。

## 一、搬迁实测记录（2026-10-13）

把 `workbench/` 与 `.dsh/skills/workbench/` 整体复制到新位置，删掉 `index/` 里的派生物后重建：

| 检查项 | 结果 |
|---|---|
| 复制文件数 | 38 个 |
| 硬编码绝对路径 | **0 处**（脚本用自身文件位置推导根目录） |
| 新位置重建 | `node workbench/index/build.mjs` → records=10, sqlite=10 rows, fts5=trigram |
| 自测 | `node workbench/index/selftest.mjs` → selftest OK |
| 产物 | dashboard.html 50.2 KB + workbench.sqlite 180 KB，内容完整 |

## 二、搬到另一台机器（个人用）

1. 拷贝两个目录：
   - `workbench/` —— 账本、规范、模板、脚本
   - `.dsh/skills/workbench/` —— 技能（DSH 从项目根的 `.dsh/skills` 自动发现）
2. 目标机要求：
   - **Node ≥ 22.5**（`node:sqlite` 需要；更低版本仍能生成看板，sqlite 段被 try/catch 兜住，只是没有索引）
   - 可选：git（留痕与协作）、Python（起静态服务）、Obsidian（桌面视图）
3. 跑三步：
   ```
   node workbench/index/build.mjs      # 生成 index/workbench.sqlite + dashboard.html
   node workbench/index/selftest.mjs   # 自测
   # 看：双击 workbench/index/dashboard.html
   ```
4. 让 agent 接手：新会话说一句"读 `workbench/SPEC.md`，按它工作"。DSH 会把 `workbench` 技能挂在能力表里。

## 三、一个团队一起用

1. **`workbench/` 独立成一个 git 仓库**（推荐），或作为现有仓库的子目录。
2. 每人 clone。**一个事项一个文件**（SPEC 铁律），所以冲突面天然很小。
3. 编号分配（SPEC §3）：创建前扫描现有最大编号 +1；合并冲突时后入库者改号，并在 `log/` 记一行改号原因。
4. **把审批落到 git 上**（这是唯一的强制执行手段）：
   - `30-decisions/**`、`40-plans/*ACC-*` 配 `CODEOWNERS`，必须 PR 审批才能合并；
   - 分支保护 + 必过检查：`node workbench/index/selftest.mjs`。
5. **拉取后自动重建索引**（推荐，一次配置）：
   ```bash
   git config core.hooksPath <workbench 路径>/.githooks
   ```
   `post-merge` / `post-checkout` 会在 pull、merge、切分支后自动重建；不想用 hook 就常驻 `wb watch`（**二者别同时开**）。
   索引不进版本库，每台机器各自重建——见 SPEC §9.2。
6. 派生物不进版本库：见 `workbench/.gitignore`（默认忽略 `index/*.sqlite` 与 `index/dashboard.html`；若要向别人发布只读看板，再单独提交发布副本）。

## 四、给不装 agent 的人看

- **最省事**：把 `index/dashboard.html` 直接发给他（单文件 50 KB，自带全部内容与样式，双击即开）；
- **内网共享**：`python -m http.server 8788 --bind 0.0.0.0 --directory workbench`，同事浏览器访问你的 8788 端口（只读；注意别把敏感内容放进去）；
- **对外发布**：日后需要更好看的站点，再上 Quartz（能渲染 vault 与 `.base` 视图）。

## 五、换别的编程 agent

- **Claude Code**：同样支持 `SKILL.md` 形式的技能（本机 2.1.296 的帮助里明确提到 Skills 解析与 CLAUDE.md 自动发现）。把同一份技能放到它的技能目录 `.claude/skills/workbench/SKILL.md`；若你的版本目录约定不同，退化为在仓库根放 `CLAUDE.md`，内容一行："按 `workbench/SPEC.md` 工作"。
- **任何 agent**：一句话交接——"先读 `workbench/SPEC.md`，写入前先声明写域，验收要给证据"。

## 六、搬迁自检清单

- [ ] `node --version` ≥ 22.5
- [ ] `node workbench/index/build.mjs` 退出码 0
- [ ] `node workbench/index/selftest.mjs` 输出 `selftest OK`
- [ ] `workbench/index/dashboard.html` 双击能开、筛选与详情可用
- [ ] 新增一个 `.md` 后看板出现新卡片（或重跑一次 build）
- [ ] 说一句"读 SPEC 按它工作"，agent 能复述四条铁律
