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
    UPGRADABLE.includes(r) ||
    r.startsWith('workbench/templates/') ||
    r.startsWith('workbench/index/') ||
    r.startsWith('workbench/githooks/') ||
    r.startsWith('workbench/bin/') ||
    r === 'workbench/LEAD-MODE.md' ||
    r === 'workbench/wb-version.txt' ||
    r.startsWith('skill/') ||
    /^workbench\/start-[a-z]+\.cmd$/.test(r) ||
    /^workbench\/[0-9a-z-]+\/README\.md$/.test(r);   // 目录说明也是脚手架
  const r = copyAssets({ target: targetDir, agent, force: true, only: isUpgradable, dryRun: !!argv['dry-run'] });
  // 版本戳必须写回：否则实例里记录的一直是旧版本，迁移提示会永远重复（0.5.0 的真实缺陷）
  if (!argv['dry-run']) writeFileSync(verFile, META.version + '\n', 'utf8');
  console.log('\n' + (argv['dry-run'] ? '待更新 ' + r.changed + ' 个文件' : '已更新 ' + r.wrote + ' 个文件，' + r.skipped + ' 个无变化'));
  console.log('记录文件（00-inbox…80-archive、projects/）永远不会被 upgrade 触碰。');
  if (!argv['dry-run'] && oldVer !== META.version) {
    console.log('迁移提示：规范/模板/脚本已更新；结构性变更见 CHANGELOG.md 对应版本小节。');
  }
  return 0;
}

const NEW_KINDS = {
  item: { dir: '10-items', tpl: 'item.md' },
  research: { dir: '20-research', tpl: 'research.md' },
  decision: { dir: '30-decisions', tpl: 'decision.md' },
  plan: { dir: '40-plans', tpl: 'plan.md' },
  acceptance: { dir: '40-plans', tpl: 'acceptance.md' },
  exec: { dir: '50-exec', tpl: 'exec.md' },
  verify: { dir: '60-verify', tpl: 'verify.md' },
  knowledge: { dir: '70-knowledge', tpl: 'knowledge.md' },
};
function maxSeq(wb, prefix) {
  const re = prefix === 'ADR' ? /^ADR-(\d{4})/ : new RegExp('^' + prefix + '-\\d{4}-(\\d{4})');
  const grp = 1;
  let max = 0;
  const stack = [wb];
  while (stack.length) {
    const d = stack.pop();
    if (!existsSync(d)) continue;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'index') stack.push(p); continue; }
      const m = re.exec(e.name);
      if (m) max = Math.max(max, Number(m[grp]));
    }
  }
  return max;
}
function slugify(t) {
  return String(t).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-').slice(0, 40) || 'untitled';
}
function cmdNew() {
  const kind = argv._[1];
  const title = argv._[2] || '';
  const spec = NEW_KINDS[kind];
  if (!spec) { console.log('用法: wb new <' + Object.keys(NEW_KINDS).join(' | ') + '> "<标题>"'); return 1; }
  if (!title) { console.log('缺少标题： wb new ' + kind + ' "<标题>"'); return 1; }
  const wb = join(targetDir, 'workbench');
  const tplPath = join(wb, 'templates', spec.tpl);
  if (!existsSync(tplPath)) { console.log('找不到模板： ' + tplPath); return 1; }
  // ID 前缀按 SPEC §3：ADR 是全局四位；其余是 <TYPE>-<年份>-<四位>
  const prefix = { '10-items': 'WB', '20-research': 'RS', '30-decisions': 'ADR', '40-plans': null, '50-exec': 'EX', '60-verify': 'VR', '70-knowledge': 'KB' }[spec.dir];
  let pfx = prefix;
  if (spec.dir === '40-plans') pfx = (spec.tpl === 'plan.md') ? 'PLAN' : 'ACC';
  const n = maxSeq(wb, pfx) + 1;
  const id = pfx === 'ADR' ? 'ADR-' + String(n).padStart(4, '0') : pfx + '-' + new Date().getFullYear() + '-' + String(n).padStart(4, '0');
  const now = new Date().toISOString().slice(0, 19) + '+08:00';
  let t = readFileSync(tplPath, 'utf8');
  t = t.replace(/^id:.*$/m, 'id: ' + id);
  t = t.replace(/^title:.*$/m, 'title: ' + title);
  t = t.replace(/^created:.*$/m, 'created: ' + now);
  t = t.replace(/^updated:.*$/m, 'updated: ' + now);
  t = t.replace(/^# <.*>$/m, '# ' + title);
  const dir = join(wb, spec.dir);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, id + '-' + slugify(title) + '.md');
  if (existsSync(file)) { console.log('已存在，未覆盖： ' + rel(file)); return 1; }
  writeFileSync(file, t, 'utf8');
  console.log('已创建 ' + rel(file));
  console.log('ID: ' + id + '   下一步：把 frontmatter 填全，或让 agent 按 SPEC 补内容。');
  if (argv['no-build'] !== true && existsSync(join(wb, 'index', 'build.mjs'))) run(join(wb, 'index', 'build.mjs'), targetDir);
  return 0;
}
function cmdStatus() {
  const wb = join(targetDir, 'workbench');
  const fmField = (t, k) => { const m = new RegExp('^' + k + ': *(.+)$', 'm').exec(t); if (!m) return ''; return m[1].replace(/\s+#.*$/, '').replace(/^[\"']|[\"']$/g, '').trim(); };
  const KIND = { '00-inbox': '收件箱', '10-items': '条目', '20-research': '调研', '30-decisions': '决策', '40-plans': '计划', '50-exec': '执行', '60-verify': '验收', '70-knowledge': '知识', '80-archive': '归档', 'projects': '项目' };
  const rows = [];
  const stack = [wb];
  while (stack.length) {
    const d = stack.pop();
    if (!existsSync(d)) continue;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) { if (!['node_modules', 'index', 'artifacts', 'templates', 'log'].includes(e.name)) stack.push(p); continue; }
      if (!/\.(md|html)$/i.test(e.name) || e.name.toUpperCase() === 'README.MD') continue;
      const segs = relative(wb, p).split('\\').join('/').split('/');
      if (segs.length < 2) continue;              // 根目录的 SPEC/PORTABLE 等不算记录
      const top = segs[0];
      const t = readFileSync(p, 'utf8');
      const isHtml = /\.html$/i.test(e.name);
      rows.push({ kind: KIND[top] || (isHtml ? '页面' : '其他'), id: fmField(t, 'id') || e.name.replace(/\.(md|html)$/i, ''), status: isHtml ? 'page' : (fmField(t, 'status') || '-'), updated: fmField(t, 'updated') || fmField(t, 'created'), title: fmField(t, 'title') || '' });
    }
  }
  console.log('工作台 ' + wb + '（' + rows.length + ' 条记录）');
  const byKind = {};
  for (const r of rows) byKind[r.kind] = (byKind[r.kind] || 0) + 1;
  console.log('按类型： ' + Object.entries(byKind).map(([k, v]) => k + ' ' + v).join(' · '));
  const byStatus = {};
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  console.log('按状态： ' + Object.entries(byStatus).map(([k, v]) => k + ' ' + v).join(' · '));
  const TERMINAL = new Set(['accepted', 'rejected', 'archived', 'complete', 'page', 'succeeded', 'pass', 'superseded']);
  const open = rows.filter(r => !TERMINAL.has(r.status));
  if (open.length) {
    console.log('未收口（' + open.length + '）：');
    for (const r of open.slice(0, 20)) {
      const days = r.updated ? Math.floor((Date.now() - Date.parse(r.updated)) / 86400000) : NaN;
      const flag = Number.isFinite(days) && days > 30 ? '  ⚠ ' + days + ' 天未动' : '';
      console.log('  ' + r.status.padEnd(10) + ' ' + r.id + '  ' + (r.title || '').slice(0, 40) + flag);
    }
  }
  console.log('健康检查请用： wb check    ｜ 打开看板： 双击 workbench/start-dashboard.cmd');
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
    '  new <kind> "<标题>"  按模板 + 自动编号建一条记录（kind: item|research|decision|plan|acceptance|exec|verify|knowledge）',
    '  status [dir]     终端速览：各类型/各状态计数 + 未收口事项',
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
const table = { init: cmdInit, upgrade: cmdUpgrade, help: cmdHelp, new: cmdNew, status: cmdStatus };
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
