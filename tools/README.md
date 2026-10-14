# tools/ —— 仓库维护脚本

`assets/` 就是用户 `wb init` 拿到的一切，**它是发布内容的唯一来源**。改内容有两条路：

1. **直接改 `assets/`**（推荐）：把仓库当成唯一的维护现场，改完 `npm test` 即可。
2. **从某个 dogfood 实例抽回来**：先在真实实例里改，再
   `node tools/sync-assets.mjs --src <工作台目录> [--skill <SKILL.md>]`（白名单复制，绝不带走任何记录文件）。

## 发布顺序（顺序错了就会出现「包里的版本戳陈旧」）

```bash
node -e "…改 package.json version…"   # 1. 先 bump 版本
node tools/sync-assets.mjs --src <工作台目录>   # 2. 再抽资产（版本戳跟着 package.json）
node tools/smoke-test.mjs               # 3. 冒烟（含版本一致性、升级补发、不碰记录）
node assets/workbench/index/test-validate.mjs   #    校验器回归（123 条断言）
# npm test 等价于上面两条；本机若没装 npm 就直接跑 node
git commit && git push                  # 4. pre-push 钩子会再跑一遍 npm test
npm pack --dry-run                      # 5. 看包内容，再 tag + Release
```

## 脚本

| 文件 | 作用 |
|---|---|
| `sync-assets.mjs` | 从工作台实例抽取规范/模板/脚本/技能到 `assets/`（白名单，带 `manifest.json`） |
| `smoke-test.mjs` | 端到端：init → check → 幂等 → upgrade → 版本一致性 → 升级补发交付物 |

## 发布脚本（仓库内，不入库）

`.publish/` 里有 GitHub token 与推送脚本，已被 `.gitignore` 排除：

```powershell
pwsh -File .publish\push.ps1          # 推送 main（自动带 token、git CA/代理）
pwsh -File .publish\gh.ps1 release list   # 等价 gh，带长期 token
```

脚本位置无关：从 `$PSScriptRoot` 推导仓库与 token 位置，仓库搬家后不需要修改。
