// tools/smoke-test.mjs — 端到端冒烟：init → build → check → 幂等 → upgrade
// 同时守住一条红线：assets/ 里绝不允许出现任何个人记录文件。
//
// 注意：子进程输出写进文件读取，而不是 piped stdio ——
// 某些受限沙箱环境不允许打开命名管道，stdio: 'pipe' 会 EPERM；写文件在沙箱与 CI 中都可用。
import { rmSync, mkdirSync, existsSync, readdirSync, openSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = dirname(HERE);
const CLI = join(PKG, 'bin', 'wb.mjs');
const TMP = join(PKG, '.smoke');

let fails = 0;
const check = (name, ok, extra) => {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  ' + extra : ''));
  if (!ok) fails++;
};
const wb = (args, cwd = TMP) => {
  const log = join(TMP, '.wb-out.log');
  const fd = openSync(log, 'w');
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, stdio: ['ignore', fd, fd] });
  closeSync(fd);
  return { code: r.status === null ? -1 : r.status, out: readFileSync(log, 'utf8') };
};
const step = (name, args, expect = 0, cwd = TMP) => {
  const res = wb(args, cwd);
  const ok = res.code === expect;
  check(name, ok, ok ? '' : 'exit=' + res.code);
  if (!ok) console.log('      --- 输出 ---\n' + res.out.split('\n').slice(0, 8).map(l => '      ' + l).join('\n'));
  return res;
};
function walk(dir, base = dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.push(relative(base, p).split('\\').join('/'));
  }
  return out;
}

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

// 1) 初始化（含 build）
step('wb init --agent=both', ['init', '.', '--agent=both']);
for (const f of ['workbench/SPEC.md', 'workbench/index/dashboard.html', 'workbench/index/workbench.sqlite', '.dsh/skills/workbench/SKILL.md', '.claude/skills/workbench/SKILL.md']) {
  check('生成 ' + f, existsSync(join(TMP, f)));
}

// 2) 自检（含结构校验）
const chk = step('wb check', ['check', '.']);
check('wb check 内含结构校验（validate OK）', /validate OK/.test(chk.out));

// 3) 幂等：重复 init 不报错、不覆盖
step('重复 init 幂等', ['init', '.']);
const again = wb(['init', '.']);
check('重复 init 跳过已存在文件', /跳过 [1-9]/.test(again.out));

// 4) 升级预览不改写
step('wb upgrade --dry-run', ['upgrade', '.', '--dry-run']);

// 5) 红线：assets 只允许规范/模板/脚本/技能
const ALLOWED = new RegExp('^(manifest\\.json|skill/workbench/SKILL\\.md|workbench/(SPEC|README|PORTABLE)\\.md|workbench/gitignore\\.txt|workbench/wb-version\\.txt|workbench/templates/[^/]+\\.md|workbench/index/(build|watch|selftest|validate|test-validate)\\.mjs|workbench/githooks/(post-merge|post-checkout)|workbench/start-(dashboard|server)\\.cmd|workbench/bin/dispatch\\.mjs|workbench/LEAD-MODE\\.md|workbench/(00-inbox|10-items|20-research|30-decisions|40-plans|50-exec|60-verify|70-knowledge|80-archive|projects|templates|index|log)/README\\.md)$');
const assets = walk(join(PKG, 'assets'));
const bad = assets.filter(f => !ALLOWED.test(f));
check('assets 白名单（无个人记录）', bad.length === 0, bad.length ? bad.slice(0, 3).join(', ') : assets.length + ' 个文件');

// 6) 版本一致性：assets 的版本戳必须等于 package.json（先 sync 后 bump 就会陈旧 —— 0.5.0 的真实缺陷）
const pkgJson = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));
const assetVer = readFileSync(join(PKG, 'assets', 'workbench', 'wb-version.txt'), 'utf8').trim();
const manifest = JSON.parse(readFileSync(join(PKG, 'assets', 'manifest.json'), 'utf8'));
check('assets/wb-version.txt == package.json', assetVer === pkgJson.version, assetVer + ' vs ' + pkgJson.version);
check('assets/manifest.json.version == package.json', manifest.version === pkgJson.version, manifest.version + ' vs ' + pkgJson.version);
const missing = manifest.files.filter(f => !existsSync(join(PKG, 'assets', f)));
check('manifest 列出的文件都真实存在', missing.length === 0, missing.slice(0, 3).join(', '));

// 7) 老实例升级：新交付物必须补发，记录文件绝不能被碰
const RECORD = join(TMP, 'workbench', '10-items', 'WB-2026-9999-probe.md');
writeFileSync(RECORD, '---\nid: WB-2026-9999\nstatus: captured\n---\n\n探针：upgrade 不许动我\n', 'utf8');
writeFileSync(join(TMP, 'workbench', '.wb-version'), '0.0.1\n', 'utf8');
for (const f of ['workbench/bin/dispatch.mjs', 'workbench/LEAD-MODE.md']) rmSync(join(TMP, f), { force: true });
step('老实例 wb upgrade', ['upgrade', '.']);
for (const f of ['workbench/bin/dispatch.mjs', 'workbench/LEAD-MODE.md']) check('upgrade 补发 ' + f, existsSync(join(TMP, f)));
const verNow = readFileSync(join(TMP, 'workbench', '.wb-version'), 'utf8').trim();
check('upgrade 写回 .wb-version', verNow === pkgJson.version, verNow);
check('upgrade 不触碰记录文件', existsSync(RECORD) && /探针/.test(readFileSync(RECORD, 'utf8')));

rmSync(TMP, { recursive: true, force: true });
console.log(fails ? 'smoke-test FAILED (' + fails + ')' : 'smoke-test OK');
process.exit(fails ? 1 : 0);
