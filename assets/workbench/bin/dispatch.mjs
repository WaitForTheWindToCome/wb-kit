#!/usr/bin/env node
// workbench/bin/dispatch.mjs — 工具无关的派发器：把任务包交给任意编程 agent，并回收结构化结果
//
// 用法：
//   node workbench/bin/dispatch.mjs --task 50-exec/tasks/T-001.md [--tool claude|codex|opencode|zcode|custom] [--cwd <dir>]
//   node workbench/bin/dispatch.mjs --prompt "把 xxx 改了" --tool codex
//   node workbench/bin/dispatch.mjs --task T-001.md --tool custom --cmd 'my-agent --file {task}'
// 选项：--new 强制新会话（默认复用同一工作流的会话）  --dry-run 只打印将要执行的命令
//
// 设计要点（都是踩过的坑）：
//   1) 子进程输出写文件再读，不用管道（受限沙箱下 stdio:'pipe' 会 EPERM）
//   2) 会话键 = tool@cwd#workstream，避免不同工作流互相串上下文
//   3) 会话注册表原子写（临时文件 + 改名）
//   4) 只从输出里抽取首个完整 JSON 对象（CLI 可能混入警告/钩子报错文本）
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, rmSync, createWriteStream } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname, resolve, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));           // workbench/bin
const WB = dirname(HERE);                                        // workbench
const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) { const k = a.slice(2); const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; opt[k] = v; }
}
const tool = String(opt.tool || 'claude').toLowerCase();
const workDir = resolve(opt.cwd || process.cwd());
const stamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);

// ---- 取任务包 ----
let prompt = '';
let taskName = 'inline';
if (opt.task && opt.task !== true) {
  // 任务包按"调用者当前目录"解析；找不到再退回 --cwd
  let p = resolve(process.cwd(), String(opt.task));
  if (!existsSync(p)) p = resolve(workDir, String(opt.task));
  if (!existsSync(p)) { console.error('任务包不存在: ' + p); process.exit(2); }
  prompt = readFileSync(p, 'utf8');
  taskName = basename(p).replace(/\.md$/i, '');
} else if (opt.prompt && opt.prompt !== true) {
  prompt = String(opt.prompt);
} else {
  console.error('需要 --task <文件> 或 --prompt "<文本>"');
  process.exit(2);
}
const workstream = taskName.match(/^([A-Za-z]+-[A-Za-z0-9]+)/) ? taskName.match(/^([A-Za-z]+-[A-Za-z0-9]+)/)[1] : 'default';

// ---- 会话注册表 ----
const REG = join(WB, '50-exec', 'sessions.json');
function loadReg() { try { return JSON.parse(readFileSync(REG, 'utf8')); } catch { return { version: 1, workstreams: {} }; } }
function saveReg(reg) { mkdirSync(dirname(REG), { recursive: true }); const t = REG + '.tmp'; writeFileSync(t, JSON.stringify(reg, null, 2) + '\n', 'utf8'); renameSync(t, REG); }
const wsKey = tool + '@' + workDir + '#' + workstream;
const reg = loadReg();
const prev = opt.new ? null : (reg.workstreams[wsKey] || null);

// ---- 各 agent 的命令行 ----
const ZCODE = 'D:\\software\\ZCode\\resources\\glm\\zcode.cjs';
function build(t, p, prevId) {
  const args = [], env = {};
  if (t === 'claude') {
    args.push('-p', p, '--output-format', 'json', '--permission-mode', 'bypassPermissions');
    if (prevId) args.push('--resume', prevId);
    return { cmd: 'claude', args, env };
  }
  if (t === 'codex') { const a = ['exec', p]; if (prevId) a.push('--resume', prevId); return { cmd: 'codex', args: a, env }; }
  if (t === 'opencode') { return { cmd: 'opencode', args: ['run', p], env }; }   // 未在本机验证，可能需调整
  if (t === 'zcode') {
    env.ZCODE_BUILTIN_PROVIDER_CONFIG_FILE = env.ZCODE_BUILTIN_PROVIDER_CONFIG_FILE || 'D:\\software\\ZCode\\resources\\config\\provider\\zcode-builtin.json';
    const a = [ZCODE, '-p', p, '--cwd', workDir, '--mode', 'yolo'];
    if (prevId) a.push('--resume', prevId);
    return { cmd: process.execPath, args: a, env };
  }
  if (t === 'custom') {
    if (!opt.cmd || opt.cmd === true) { console.error('--tool custom 需要同时给 --cmd "<命令模板>"（用 {task} 占位任务包路径）'); process.exit(2); }
    const tpl = String(opt.cmd).replace('{task}', opt.task ? resolve(workDir, String(opt.task)) : '');
    return { cmd: 'cmd', args: ['/c', tpl], env };   // 自己承担 shell 语法
  }
  console.error('未知 --tool: ' + t + '（可选 claude | codex | opencode | zcode | custom）');
  process.exit(2);
}
const { cmd, args, env } = build(tool, prompt, prev ? prev.sessionId : null);

// ---- 输出目录与日志 ----
const outDir = join(WB, '50-exec', 'artifacts', 'dispatch');
mkdirSync(outDir, { recursive: true });
const base = join(outDir, stamp + '-' + taskName + '.' + tool);
if (opt['dry-run']) {
  console.log('工具: ' + tool + '   工作流: ' + workstream + '   会话: ' + (prev ? '复用 ' + prev.sessionId : '新建'));
  console.log('命令: ' + cmd + ' ' + args.map(a => (a.length > 60 ? a.slice(0, 60) + '…' : a)).join(' '));
  console.log('将写入: ' + relative(process.cwd(), base) + '.log|.json');
  process.exit(0);
}

// ---- 执行（stdout/stderr 直接落文件，避免管道）----
const logPath = base + '.log';
const fd = (await import('node:fs')).openSync(logPath, 'w');
let r;
try {
  r = spawnSync(cmd, args, { cwd: workDir, stdio: ['ignore', fd, fd], env: { ...process.env, ...env }, shell: false });
} finally { (await import('node:fs')).closeSync(fd); }
const raw = readFileSync(logPath, 'utf8');

// ---- 抽取首个完整 JSON（带字符串/转义感知）----
function firstJson(text) {
  const s = text.indexOf('{');
  if (s < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = s; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return text.slice(s, i + 1); }
  }
  return null;
}
let summary = { tool, task: taskName, workstream, cwd: workDir, exit: r.status, log: relative(WB, logPath).split('\\').join('/') };
const j = firstJson(raw);
if (j) {
  try {
    const o = JSON.parse(j);
    summary.session_id = o.session_id || null;
    summary.is_error = o.is_error !== undefined ? o.is_error : null;
    summary.num_turns = o.num_turns || null;
    summary.cost_usd = o.total_cost_usd || null;
    summary.result = ('' + (o.result || '')).slice(0, 1200);
  } catch { summary.parse_error = true; }
}
if (!summary.session_id) summary.result = raw.slice(-1200);

writeFileSync(base + '.json', JSON.stringify(summary, null, 2) + '\n', 'utf8');
if (summary.session_id) {
  reg.workstreams[wsKey] = { sessionId: summary.session_id, cwd: workDir, tool, workstream, lastTask: taskName, updatedAt: new Date().toISOString(), lastLog: relative(WB, logPath).split('\\').join('/') };
  saveReg(reg);
}
console.log('工具: ' + tool + '   会话: ' + (summary.session_id || '(未取到)') + '   退出码: ' + r.status + (summary.cost_usd ? '   成本: $' + Number(summary.cost_usd).toFixed(3) : ''));
console.log('日志: ' + summary.log);
if (summary.result) console.log('--- 结果摘要 ---\n' + summary.result);
process.exit(r.status === 0 ? 0 : 1);
