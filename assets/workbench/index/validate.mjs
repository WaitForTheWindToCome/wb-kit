// workbench/index/validate.mjs — 台账结构校验器（不是"看板能不能渲染"，而是"数据对不对"）
// 用法: node workbench/index/validate.mjs [--strict]   （--strict 时警告也计入失败）
// 检查：必填字段 / 状态合法 / ID 唯一 / links 指向存在 / 项目存在 / 门禁一致性
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const STRICT = process.argv.includes('--strict');
const SKIP_DIRS = new Set(['index', 'templates', 'node_modules', 'artifacts', 'spikes', 'log']);
const KIND = { '00-inbox':'inbox','10-items':'item','20-research':'research','30-decisions':'decision','40-plans':'plan','50-exec':'exec','60-verify':'verify','70-knowledge':'knowledge','80-archive':'archive','projects':'project' };

const ALLOWED_STATUS = new Set([
  // 条目（10-items）
  'captured','triaged','clarify','spike','researching','backlog','watch','decided','planned','ready','executing','verifying','accepted','rework','rejected','archived',
  // 调研 / 计划 / 决策
  'draft','complete','proposed','accepted','superseded','rejected','approved','active',
  // 执行（50-exec）
  'queued','running','succeeded','failed','blocked','deviated',
  // 验收（60-verify）
  'pending','pass','fail','partial',
  // 项目
  'paused','done',
]);
const ALLOWED_TYPE = new Set(['requirement','bug','idea','question','risk','improvement']);
const LINK_KEYS = ['related','duplicates','supersedes','superseded_by','blocks','blocked_by'];
const ADVANCED = new Set(['planned','ready','executing','verifying','accepted']); // 需要 PLAN + ACC 的状态

/* ---- 极简 YAML 读取（只取校验需要的字段） ---- */
function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return null;
  const data = {};
  let cur = null;
  for (const raw of m[1].split(/\r?\n/)) {
    if (!raw.trim() || /^\s*#/.test(raw)) continue;
    const ind = raw.match(/^\s*/)[0].length;
    const line = raw.trim();
    const ci = line.indexOf(':');
    if (ci < 0) continue;
    const k = line.slice(0, ci).trim();
    const v = line.slice(ci + 1).trim();
    if (ind === 0) {
      cur = v === '' ? k : null;
      if (v !== '') data[k] = v.replace(/^["']|["']$/g, '');
    } else if (cur) {
      (data[cur] = data[cur] || {})[k] = v.replace(/^["']|["']$/g, '');
    }
  }
  return data;
}
function walk(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p, acc); }
    else if (e.name.endsWith('.md') && e.name.toUpperCase() !== 'README.MD') {
      if (relative(ROOT, p).split('\\').join('/').includes('/')) acc.push(p);
    }
  }
  return acc;
}

const records = [];
for (const f of walk(ROOT)) {
  const rel = relative(ROOT, f).split('\\').join('/');
  const kind = KIND[rel.split('/')[0]] || 'other';
  const text = readFileSync(f, 'utf8');
  const fm = frontmatter(text);
  const h1 = (/^# +(.+)$/m.exec(text) || [])[1] || '';
  records.push({ rel, kind, fm: fm || {}, hasFm: fm !== null, h1 });
}

const errors = [], warns = [];
const ids = new Map();
for (const r of records) {
  const fm = r.fm;
  const id = fm.id || (r.kind === 'inbox' ? '(inbox 无 id)' : '');
  if (!r.hasFm) errors.push(r.rel + ': 缺少 frontmatter');
  if (r.kind !== 'inbox' && !fm.id) errors.push(r.rel + ': 缺少 id');
  if (!fm.title && !r.h1) warns.push(r.rel + ': 缺少 title（frontmatter 与正文 H1 都没有）');
  if (fm.status && !ALLOWED_STATUS.has(fm.status)) errors.push(r.rel + ': 非法 status "' + fm.status + '"');
  if (r.kind === 'item' && !fm.status) errors.push(r.rel + ': 条目缺少 status');
  if (r.kind === 'item' && fm.type && !ALLOWED_TYPE.has(fm.type)) errors.push(r.rel + ': 非法 type "' + fm.type + '"');
  if (fm.id) {
    if (ids.has(fm.id)) errors.push(r.rel + ': ID 重复（已出现在 ' + ids.get(fm.id) + '）');
    else ids.set(fm.id, r.rel);
  }
}

// links 指向必须存在
for (const r of records) {
  const fm = r.fm;
  for (const k of LINK_KEYS) {
    const val = fm[k];
    if (!val || !val.includes('[')) continue;
    const items = val.slice(val.indexOf('[') + 1, val.lastIndexOf(']')).split(',').map(s => s.trim()).filter(Boolean);
    for (const t of items) if (!ids.has(t)) errors.push(r.rel + ': links.' + k + ' 指向不存在的 ID "' + t + '"');
  }
}

// 项目必须已注册
const projectIds = new Set(records.filter(r => r.kind === 'project' && r.fm.id).map(r => r.fm.id));
for (const r of records) {
  const p = r.fm.project;
  if (p && !p.includes('{') && p !== 'global' && !projectIds.has(p)) warns.push(r.rel + ': project "' + p + '" 未在 projects/ 注册');
}

// 门禁一致性（SPEC 铁律 4 与 §7）
for (const r of records) {
  const fm = r.fm, status = fm.status || '';
  if (r.kind === 'item' && ADVANCED.has(status) && !fm.gate_exempt) {
    const arts = fm.artifacts || '(无 artifacts 行)';
    if (/plan: *null/.test(arts) || /acceptance: *null/.test(arts)) {
      warns.push(r.rel + ': status=' + status + ' 但缺 PLAN/ACC（SPEC 铁律 4）。若为试点期豁免，请加 gate_exempt 字段说明');
    }
  }
  if (r.kind === 'item' && fm.gate_exempt) warns.push('NOTE   ' + r.rel + ': 门禁豁免——' + fm.gate_exempt);
  if (r.kind === 'decision' && status === 'accepted' && !fm.approved_by) warns.push(r.rel + ': status=accepted 但没有 approved_by（审批未留痕）');
  if (r.kind === 'verify' && fm.verifier && fm.executor && fm.verifier === fm.executor) errors.push(r.rel + ': 验收者 = 执行者（SPEC 禁止自验收）');
  if (r.kind === 'exec' && status === 'succeeded' && !fm.artifacts_dir) warns.push(r.rel + ': 执行成功但没有 artifacts_dir（证据未锚定）');
}

console.log('校验 ' + records.length + ' 份文档：' + errors.length + ' 个错误，' + warns.length + ' 个警告');
for (const e of errors) console.log('  ERROR  ' + e);
for (const w of warns) console.log(/^[A-Z]{4,}/.test(w) ? '  ' + w : '  WARN   ' + w);
const notes = warns.filter(w => /^NOTE/.test(w)).length;
if (notes) console.log('（其中 ' + notes + ' 条为显式豁免说明）');
const bad = errors.length + (STRICT ? warns.length : 0);
console.log(bad ? '\nvalidate FAILED' : '\nvalidate OK');
process.exit(bad ? 1 : 0);
