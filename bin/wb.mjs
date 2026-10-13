#!/usr/bin/env node
// wb — AI 技术管理与研发决策工作台 CLI
// 零依赖。命令：init / build / watch / check / upgrade / version / help
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = dirname(HERE);
const ASSETS = join(PKG, 'assets');
const META = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));
const MANIFEST = JSON.parse(readFileSync(join(ASSETS, 'manifest.json'), 'utf8'));

/* ---------- 参数 ---------- */
function parseArgs(argv) {
  const o = { _: [] };
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) o[m[1]] = m[2] === undefined ? true : m[2];
    else o._.push(a);
  }
  return o;
}
const argv = parseArgs(process.argv.slice(2));
const cmd = argv._[0] || 'help';
const targetDir = resolve(argv.dir || argv._[1] || process.cwd());
const AGENTS = ['dsh', 'claude', 'both', 'none'];
let agent = String(argv.agent === true ? (AGENTS.includes(argv._[2]) ? argv._[2] : 'both') : (argv.agent || 'both')).toLowerCase();
if (!AGENTS.includes(agent)) { console.log('未知 --agent: ' + agent + '（可选 dsh | claude | both | none），按 both 处理'); agent = 'both'; }
const rel = p => relative(process.cwd(), p) || '.';

/* ---------- 工具 ---------- */
function walk(dir, base = dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.push(relative(base, p).split('\\').join('/'));
  }
  return out;
}
function mapAsset(r, target, agent) {
  if (r === 'manifest.json') return [];
  if (r.startsWith('workbench/')) {
    let inner = r.slice('workbench/'.length);
    if (inner === 'gitignore.txt') inner = '.gitignore';
    if (inner.startsWith('githooks/')) inner = '.githooks/' + inner.slice('githooks/'.length);
    if (inner === 'wb-version.txt') inner = '.wb-version';
    return [join(target, 'workbench', inner)];
  }
  if (r.startsWith('skill/')) {
    const rest = r.slice('skill/'.length);
    const out = [];
    if (agent === 'dsh' || agent === 'both') out.push(join(target, '.dsh', 'skills', rest));
    if (agent === 'claude' || agent === 'both') out.push(join(target, '.claude', 'skills', rest));
    return out;
  }
  return [];
}
function run(script, cwd) {
  if (!existsSync(script)) { console.log('缺少脚本: ' + script); return 1; }
  const r = spawnSync(process.execPath, [script], { cwd, stdio: 'inherit' });
  return r.status === null ? 1 : r.status;
}

/* ---------- 命令 ---------- */
const UPGRADABLE = ['workbench/SPEC.md', 'workbench/README.md', 'workbench/PORTABLE.md', 'workbench/gitignore.txt'];

function copyAssets({ target, agent, force, only = null, dryRun = false, quiet = false }) {
  let wrote = 0, skipped = 0, changed = 0;
  for (const r of walk(ASSETS)) {
    if (only && !only(r)) continue;
    const dests = mapAsset(r, target, agent);
    if (!dests.length) continue;
    const content = readFileSync(join(ASSETS, r), 'utf8');
    for (const d of dests) {
      const exists = existsSync(d);
      const same = exists && readFileSync(d, 'utf8') === content;
      if (exists && same) { skipped++; continue; }
      if (exists && !force) { skipped++; if (!quiet) console.log('  skip    ' + rel(d) + '（已存在，用 --force 覆盖）'); continue; }
      if (dryRun) { changed++; console.log('  would   ' + rel(d)); continue; }
      mkdirSync(dirname(d), { recursive: true });
      writeFileSync(d, content, 'utf8');
      wrote++; if (!quiet && exists) console.log('  update  ' + rel(d));
      else if (!quiet) console.log('  create  ' + rel(d));
    }
  }
  return { wrote, skipped, changed };
}

function cmdInit() {
  console.log('wb-kit v' + META.version + ' → 初始化到 ' + targetDir);
  const r = copyAssets({ target: targetDir, agent, force: !!argv.force });
  console.log('\n文件: 新建 ' + r.wrote + '，跳过 ' + r.skipped + '（技能安装目标: ' + agent + '）');
  if (argv['no-build'] !== true) {
    console.log('\n生成索引与看板…');
    run(join(targetDir, 'workbench', 'index', 'build.mjs'), targetDir);
  }
  console.log('\n下一步');
  console.log('  1) 建一个项目: workbench/projects/<id>/PROJECT.md（复制 templates/project.md）');
  console.log('  2) 看板: 双击 workbench/index/dashboard.html');
  console.log('  3) 让 agent 接手: 说一句"读 workbench/SPEC.md，按它工作"');
  console.log('  4) 自动重建: wb watch   单次重建: wb build   自检: wb check');
  return 0;
}

function cmdUpgrade() {
  const verFile = join(targetDir, 'workbench', '.wb-version');
  const oldVer = existsSync(verFile) ? readFileSync(verFile, 'utf8').trim() : '(未记录，视为 0.1.0 之前)';
  console.log('wb-kit v' + META.version + ' → 更新规范/模板/脚本到 ' + targetDir + (argv['dry-run'] ? '（dry-run）' : ''));
  console.log('实例规范版本：' + oldVer + ' → ' + META.version);
  const isUpgradable = r =>
    UPGRADABLE.includes(r) || r.startsWith('workbench/templates/') || r.startsWith('workbench/index/');
  const r = copyAssets({ target: targetDir, agent, force: true, only: isUpgradable, dryRun: !!argv['dry-run'] });
  console.log('\n' + (argv['dry-run'] ? '待更新 ' + r.changed + ' 个文件' : '已更新 ' + r.wrote + ' 个文件，' + r.skipped + ' 个无变化'));
  console.log('记录文件（00-inbox…80-archive、projects/）永远不会被 upgrade 触碰。');
  if (!argv['dry-run'] && oldVer !== META.version) {
    console.log('迁移提示：规范/模板/脚本已更新；结构性变更见 CHANGELOG.md 对应版本小节。');
  }
  return 0;
}

function cmdHelp() {
  console.log(['wb — AI 技术管理与研发决策工作台 CLI  v' + META.version, '',
    '用法:  wb <命令> [目录] [选项]', '',
    '命令:',
    '  init [dir]       把台账 + 规范 + 模板 + agent 技能初始化到目标目录（默认当前目录）',
    '  build [dir]      扫描 Markdown，重建 index/workbench.sqlite 与 dashboard.html',
    '  watch [dir]      监听 Markdown 变化并自动重建（前台常驻）',
    '  check [dir]      自检：看板能否渲染、索引是否生成、模板是否齐全',
    '  upgrade [dir]    更新规范/模板/脚本（不碰任何记录文件）',
    '  version          打印版本', '',
    '选项:',
    '  --dir=<path>     目标目录（等价于 init/watch/check/upgrade 的位置参数）',
    '  --agent=<a>      技能安装目标：dsh | claude | both（默认 both）| none',
    '  --force          init 时覆盖已存在文件',
    '  --no-build       init 后不自动生成看板',
    '  --dry-run        upgrade 只预览不改写', '',
    '例子:',
    '  npx wb-kit init ./my-project --agent=claude',
    '  npx wb-kit init --dir=C:\\work\\team-repo --force',
    '  wb watch ./my-project', '',
    '设计原则: Markdown 是唯一真相源；索引与看板都是派生物，删了能重建；写入只由 agent 完成。'
  ].join('\n'));
  return 0;
}

let code = 0;
try {
const table = { init: cmdInit, upgrade: cmdUpgrade, help: cmdHelp };
if (table[cmd]) code = table[cmd]();
else if (cmd === 'version' || argv.version) console.log(META.version);
else if (cmd === 'build') code = run(join(targetDir, 'workbench', 'index', 'build.mjs'), targetDir);
else if (cmd === 'watch') code = run(join(targetDir, 'workbench', 'index', 'watch.mjs'), targetDir);
else if (cmd === 'check') {
  console.log('— 结构校验（frontmatter / ID / links / 门禁）—');
  const v = run(join(targetDir, 'workbench', 'index', 'validate.mjs'), targetDir);
  console.log('\n— 渲染自检（看板 / 索引 / 陈旧检测）—');
  const ok = run(join(targetDir, 'workbench', 'index', 'selftest.mjs'), targetDir);
  const need = ['SPEC.md', 'templates/item.md', 'index/build.mjs', 'index/validate.mjs', '.githooks/post-merge'];
  for (const n of need) {
    const p = join(targetDir, 'workbench', n);
    console.log((existsSync(p) ? '  ok      ' : '  MISSING ') + 'workbench/' + n);
  }
  code = (ok !== 0 || v !== 0) ? 1 : 0;
} else { console.log('未知命令: ' + cmd + '\n'); code = cmdHelp() || 1; }
} catch (e) { console.error('错误: ' + ((e && e.message) || e)); process.exit(1); }
process.exit(code);
