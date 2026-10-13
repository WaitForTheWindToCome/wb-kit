#!/usr/bin/env node
// workbench/index/build.mjs — 从 Markdown 派生 SQLite 索引 + 只读 web 看板
// 零依赖（Node >= 22.5 的 node:sqlite）。用法：node workbench/index/build.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const BT = String.fromCharCode(96);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const SKIP_DIRS = new Set(['index', 'templates', 'node_modules', 'artifacts']);
const KIND = { '00-inbox':'inbox','10-items':'item','20-research':'research','30-decisions':'decision','40-plans':'plan','50-exec':'exec','60-verify':'verify','70-knowledge':'knowledge','80-archive':'archive','projects':'project' };
const KIND_LABEL = { inbox:'收件箱', item:'需求条目', research:'调研报告', decision:'决策记录', plan:'开发计划', exec:'执行记录', verify:'验收记录', knowledge:'知识沉淀', archive:'已归档', project:'项目', other:'其他' };
const STATUS_LABEL = { captured:'已捕获', triaged:'已初筛', clarify:'待澄清', spike:'低成本验证', researching:'调研中', backlog:'待办', watch:'观察中', decided:'已决策', planned:'已计划', ready:'可派发', executing:'执行中', verifying:'验收中', accepted:'已通过', rework:'返工中', rejected:'已否决', archived:'已归档', draft:'草稿', complete:'已完成', proposed:'待审批', active:'进行中', paused:'已暂停' };
const VERDICT_LABEL = { research:'进入研究', clarify:'补充信息', spike:'低成本验证', backlog:'纳入待办', watch:'观察', archive:'归档放弃' };
const STATUS_ORDER = ['captured','triaged','clarify','spike','researching','backlog','watch','decided','planned','ready','executing','verifying','accepted','rework','rejected','archived','draft','complete','proposed','active','paused'];

/* ---------------- YAML 子集解析 ---------------- */
function unquote(v){
  v = v.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}
function inlineVal(raw){
  const v = String(raw).trim();
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    const parts = []; let cur = '', depth = 0, q = null;
    for (const ch of inner) {
      if (q) { cur += ch; if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
      if (ch === '[' || ch === '{') depth++;
      if (ch === ']' || ch === '}') depth--;
      if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
    }
    parts.push(cur);
    return parts.map(scalar);
  }
  if (v.startsWith('{') && v.endsWith('}')) {
    const inner = v.slice(1, -1).trim();
    const o = {};
    if (!inner) return o;
    const parts = []; let cur = '', depth = 0, q = null;
    for (const ch of inner) {
      if (q) { cur += ch; if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
      if (ch === '[' || ch === '{') depth++;
      if (ch === ']' || ch === '}') depth--;
      if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
    }
    parts.push(cur);
    for (const p of parts) { const i = p.indexOf(':'); if (i > 0) o[p.slice(0, i).trim()] = inlineVal(p.slice(i + 1)); }
    return o;
  }
  return scalar(v);
}
function scalar(v){
  v = unquote(v);
  if (v === '') return null;
  if (/^(null|~)$/i.test(v)) return null;
  if (/^(true|yes|on)$/i.test(v)) return true;
  if (/^(false|no|off)$/i.test(v)) return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}
function stripComment(line){
  let q = null, out = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { out += c; if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; out += c; continue; }
    if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) break;
    out += c;
  }
  return out;
}
function parseYaml(src){
  const lines = src.split(/\r?\n/).map(stripComment);
  const blank = s => !s.trim();
  let i = 0;
  function nextContent(from){
    for (let j = from; j < lines.length; j++) {
      if (blank(lines[j])) continue;
      return { ind: lines[j].match(/^\s*/)[0].length, text: lines[j].trim() };
    }
    return null;
  }
  function parseMap(indent){
    const obj = {};
    while (i < lines.length) {
      const raw = lines[i];
      if (blank(raw)) { i++; continue; }
      const ind = raw.match(/^\s*/)[0].length;
      if (ind < indent) return obj;
      const line = raw.trim();
      if (ind > indent) { i++; continue; }
      if (line.startsWith('- ')) { i++; continue; }
      const ci = line.indexOf(':');
      if (ci < 0) { i++; continue; }
      const key = line.slice(0, ci).trim();
      const rest = line.slice(ci + 1).trim();
      i++;
      if (rest !== '') { obj[key] = inlineVal(rest); continue; }
      const nxt = nextContent(i);
      if (nxt && nxt.ind > indent && nxt.text.startsWith('- ')) {
        const arr = []; const base = nxt.ind;
        while (i < lines.length) {
          const r2 = lines[i];
          if (blank(r2)) { i++; continue; }
          if (r2.match(/^\s*/)[0].length < base) break;
          const t2 = r2.trim();
          if (t2.startsWith('- ')) arr.push(inlineVal(t2.slice(2)));
          i++;
        }
        obj[key] = arr;
        continue;
      }
      if (nxt && nxt.ind > indent) { obj[key] = parseMap(nxt.ind); continue; }
      obj[key] = null;
    }
    return obj;
  }
  return parseMap(0);
}
function parseDoc(text){
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { data: {}, body: text };
  let data = {};
  try { data = parseYaml(m[1]) || {}; } catch (e) { data = { _parse_error: String(e && e.message) }; }
  return { data, body: text.slice(m[0].length) };
}
const pick = (o, path, d = null) => path.split('.').reduce((a, k) => (a && typeof a === 'object' ? a[k] : undefined), o) ?? d;

/* ---------------- Markdown -> HTML（够用即可） ---------------- */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function inline(s){
  let t = esc(s);
  t = t.replace(/\u0060([^\u0060]+)\u0060/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return t;
}
function mdToHtml(md){
  const out = []; let inCode = false, list = null, table = false;
  const closeList = () => { if (list) { out.push('</' + list + '>'); list = null; } };
  const closeTable = () => { if (table) { out.push('</tbody></table>'); table = false; } };
  for (const l of md.split(/\r?\n/)) {
    if (/^\s*\u0060{3,}/.test(l)) {
      if (inCode) { out.push('</code></pre>'); inCode = false; }
      else { closeList(); closeTable(); out.push('<pre><code>'); inCode = true; }
      continue;
    }
    if (inCode) { out.push(esc(l)); continue; }
    if (!l.trim()) { closeList(); closeTable(); continue; }
    let m;
    if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) {
      closeList(); closeTable();
      out.push('<h' + m[1].length + '>' + inline(m[2]) + '</h' + m[1].length + '>');
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(l)) {
      const cells = l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      if (!table) { closeList(); out.push('<table><thead><tr>' + cells.map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>'); table = true; continue; }
      if (cells.every(c => c === '' || /^:?-{2,}:?$/.test(c))) continue;
      out.push('<tr>' + cells.map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>');
      continue;
    }
    if ((m = /^\s*[-*]\s+(.*)$/.exec(l))) { closeTable(); if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; } out.push('<li>' + inline(m[1]) + '</li>'); continue; }
    if ((m = /^\s*\d+\.\s+(.*)$/.exec(l))) { closeTable(); if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; } out.push('<li>' + inline(m[1]) + '</li>'); continue; }
    if ((m = /^>\s?(.*)$/.exec(l))) { closeList(); closeTable(); out.push('<blockquote>' + inline(m[1]) + '</blockquote>'); continue; }
    closeList(); closeTable(); out.push('<p>' + inline(l) + '</p>');
  }
  closeList(); closeTable(); if (inCode) out.push('</code></pre>');
  return out.join('\n');
}

/* ---------------- 收集 ---------------- */
function walk(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p, acc); }
    else if (e.name.endsWith('.md') && e.name.toUpperCase() !== 'README.MD') acc.push(p);
  }
  return acc;
}
const records = [];
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file).split('\\').join('/');
  if (!rel.includes('/')) continue; // 根目录的 SPEC.md / README.md 不进索引
  const top = rel.split('/')[0];
  const text = readFileSync(file, 'utf8');
  const { data, body } = parseDoc(text);
  const base = rel.split('/').pop().replace(/\.md$/, '');
  const h1 = (/^#\s+(.+)$/m.exec(body) || [])[1];
  const kind = KIND[top] || 'other';
  records.push({
    id: data.id || base,
    kind,
    title: data.title || h1 || pick(data, 'name') || base,
    status: data.status || null,
    priority: data.priority || null,
    project: data.project || (kind === 'project' ? (data.id || base) : null),
    owner: data.owner || pick(data, 'deciders.0') || null,
    tags: Array.isArray(data.tags) ? data.tags : (data.tags ? [String(data.tags)] : []),
    verdict: pick(data, 'triage.verdict'),
    updated: data.updated || data.created || null,
    file: rel,
    body,
    html: mdToHtml(body),
  });
}
records.sort((a, b) => String(a.id).localeCompare(String(b.id)));

/* ---------------- SQLite 索引（派生物，可删可重建） ---------------- */
let sqliteInfo = 'skipped';
try {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(join(HERE, 'workbench.sqlite'));
  db.exec('DROP TABLE IF EXISTS records');
  db.exec('DROP TABLE IF EXISTS search');
  db.exec('CREATE TABLE records (id TEXT, kind TEXT, title TEXT, status TEXT, priority TEXT, project TEXT, owner TEXT, tags TEXT, verdict TEXT, updated TEXT, file TEXT, body TEXT)');
  const ins = db.prepare('INSERT INTO records VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  for (const r of records) ins.run(r.id, r.kind, r.title, r.status, r.priority, r.project, r.owner, r.tags.join(','), r.verdict, r.updated, r.file, r.body);
  let tok = 'unicode61';
  try { db.exec("CREATE VIRTUAL TABLE search USING fts5(id UNINDEXED, title, body, tokenize='trigram')"); tok = 'trigram'; }
  catch (e) { db.exec('CREATE VIRTUAL TABLE search USING fts5(id UNINDEXED, title, body)'); }
  const insF = db.prepare('INSERT INTO search VALUES (?,?,?)');
  for (const r of records) insF.run(r.id, r.title, r.body);
  db.close();
  sqliteInfo = records.length + ' rows, fts5=' + tok;
} catch (e) { sqliteInfo = 'failed: ' + (e && e.message); }

/* ---------------- HTML 看板 ---------------- */
const payload = JSON.stringify({ generated: new Date().toISOString(), records, statusOrder: STATUS_ORDER, labels: { kind: KIND_LABEL, status: STATUS_LABEL, verdict: VERDICT_LABEL }, projects: Object.fromEntries(records.filter(r => r.kind === 'project').map(r => [r.id, r.title])) }).replace(/</g, '\\u003c');
const css = [
':root{--bg:#0e1116;--panel:#161a22;--panel2:#1d2230;--line:#272e3b;--txt:#e6e9ef;--dim:#8b95a7;--accent:#4c8dff}',
'*{box-sizing:border-box}',
'body{margin:0;background:var(--bg);color:var(--txt);font:14px/1.65 -apple-system,"Segoe UI","Microsoft YaHei",system-ui,sans-serif}',
'header{position:sticky;top:0;z-index:5;background:#12161d;border-bottom:1px solid var(--line);padding:14px 20px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}',
'h1{font-size:16px;margin:0;font-weight:600}',
'.badge{font-size:12px;padding:2px 8px;border-radius:999px;border:1px solid var(--line);color:var(--dim)}',
'.badge.ro{border-color:#3a5a3a;color:#8fd18f}.spacer{flex:1}',
'button,select,input{background:var(--panel2);color:var(--txt);border:1px solid var(--line);border-radius:8px;padding:6px 10px;font:inherit;outline:none}',
'input{min-width:200px}button{cursor:pointer}button.on{background:var(--accent);border-color:var(--accent);color:#fff}',
'main{padding:18px 20px 60px}.stats{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}',
'.stat{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 12px;min-width:92px}',
'.stat b{display:block;font-size:20px}.stat span{color:var(--dim);font-size:12px}',
'.board{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px}',
'.col{background:var(--panel);border:1px solid var(--line);border-radius:12px;min-width:240px;flex:0 0 240px;display:flex;flex-direction:column}',
'.col>h3{margin:0;padding:10px 12px;font-size:13px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;color:var(--dim);font-weight:600}',
'.cards{padding:10px;display:flex;flex-direction:column;gap:8px;min-height:60px}',
'.card{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:10px;cursor:pointer;transition:.12s}',
'.card:hover{border-color:var(--accent);transform:translateY(-1px)}',
'.card .id{font-size:11px;color:var(--dim);font-family:ui-monospace,Consolas,monospace}',
'.card .t{margin:3px 0 6px;font-weight:600;font-size:13px}',
'.card .m{display:flex;gap:6px;flex-wrap:wrap;font-size:11px;color:var(--dim)}',
'.tag{border:1px solid var(--line);border-radius:6px;padding:0 5px}',
'table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden}',
'th,td{padding:9px 12px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}',
'th{color:var(--dim);font-size:12px;background:#131822}',
'tr:hover td{background:#1a1f2b;cursor:pointer}a{color:var(--accent)}',
'aside{position:fixed;top:0;right:0;height:100%;width:min(760px,54vw);background:#12161d;border-left:1px solid var(--line);transform:translateX(102%);transition:.2s;overflow:auto;padding:20px 26px 60px;z-index:9}',
'aside.open{transform:none}aside h2{margin:.2em 0 .6em;font-size:18px}',
'aside pre{background:#0b0e13;border:1px solid var(--line);border-radius:8px;padding:10px;overflow:auto}',
'aside code{background:#0b0e13;border-radius:4px;padding:1px 4px;font-family:ui-monospace,Consolas,monospace;font-size:12.5px}',
'aside blockquote{margin:.6em 0;padding:.2em .9em;border-left:3px solid var(--accent);color:var(--dim)}',
'.bar{display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap}',
'.hint{color:var(--dim);font-size:12px}',
].join('\n');

const js = [
'const D=JSON.parse(document.getElementById("data").textContent);',
'const R=D.records;',
'const KL=D.labels.kind,SL=D.labels.status,VL=D.labels.verdict;',
'document.getElementById("gen").textContent="生成于 "+new Date(D.generated).toLocaleString("zh-CN");',
'const uniq=k=>[...new Set(R.map(r=>r[k]).filter(Boolean))];',
'for(const p of uniq("project")){const o=document.createElement("option");o.value=p;o.textContent=(D.projects&&D.projects[p])||p;document.getElementById("fproj").appendChild(o)}',
'for(const k of uniq("kind")){const o=document.createElement("option");o.value=k;o.textContent=KL[k]||k;document.getElementById("fkind").appendChild(o)}',
'for(const s of uniq("status")){const o=document.createElement("option");o.value=s;o.textContent=SL[s]||s;document.getElementById("fstat").appendChild(o)}',
'const st={proj:"",kind:"",stat:"",q:""};',
'const F=()=>R.filter(r=>(!st.proj||r.project===st.proj)&&(!st.kind||r.kind===st.kind)&&(!st.stat||r.status===st.stat)&&(!st.q||((r.title+" "+r.id+" "+r.body).toLowerCase().includes(st.q.toLowerCase()))));',
'function stats(){const rows=F();const by={};for(const r of rows)by[r.kind]=(by[r.kind]||0)+1;',
'document.getElementById("stats").innerHTML="<div class=stat><b>"+rows.length+"</b><span>当前条目</span></div>"+Object.entries(by).map(e=>"<div class=stat><b>"+e[1]+"</b><span>"+(KL[e[0]]||e[0])+"</span></div>").join("")}',
'const cardHtml=r=>"<div class=card onclick=\\"show(\'"+r.id+"\')\\"><div class=id>"+r.id+"</div><div class=t>"+r.title+"</div><div class=m>"+["kind","priority","project","verdict"].filter(k=>r[k]).map(k=>"<span class=tag>"+(k==="kind"?(KL[r[k]]||r[k]):k==="verdict"?(VL[r[k]]||r[k]):k==="project"?((D.projects&&D.projects[r[k]])||r[k]):r[k])+"</span>").join("")+"</div></div>";',
'function board(){const rows=F();const cols=[...new Set([...D.statusOrder.filter(s=>rows.some(r=>r.status===s)),...rows.filter(r=>!D.statusOrder.includes(r.status)).map(r=>r.status)])];',
'document.getElementById("board").innerHTML=cols.map(c=>"<div class=col><h3><span>"+(c?(SL[c]||c):"无状态")+"</span><span>"+rows.filter(r=>r.status===c).length+"</span></h3><div class=cards>"+rows.filter(r=>r.status===c).map(cardHtml).join("")+"</div></div>").join("")}',
'function table(){document.getElementById("tbody").innerHTML=F().map(r=>"<tr onclick=\\"show(\'"+r.id+"\')\\"><td>"+r.id+"</td><td>"+r.title+"</td><td>"+(KL[r.kind]||r.kind)+"</td><td>"+(r.status?(SL[r.status]||r.status):"")+"</td><td>"+(r.priority||"")+"</td><td>"+(r.project||"")+"</td><td>"+String(r.updated||"").slice(0,10)+"</td></tr>").join("")}',
'function show(id){const r=R.find(x=>x.id===id);if(!r)return;',
'const meta=["priority","project","owner","verdict","tags","updated"].filter(k=>r[k]&&(!Array.isArray(r[k])||r[k].length)).map(k=>"<span class=tag>"+k+" "+((Array.isArray(r[k])?r[k].join(", "):r[k]))+"</span>").join(" ");',
'document.getElementById("panel").innerHTML="<div class=bar><button id=cls>关闭</button><span class=badge>"+(KL[r.kind]||r.kind)+"</span><span class=badge>"+(r.status?(SL[r.status]||r.status):"-")+"</span><span class=badge>"+r.file+"</span></div><h2>"+r.id+" · "+r.title+"</h2><div style=margin-bottom:10px>"+meta+"</div>"+r.html;',
'document.getElementById("cls").onclick=()=>document.getElementById("panel").classList.remove("open");',
'document.getElementById("panel").classList.add("open")}',
'function render(){stats();board();table()}',
'document.getElementById("q").oninput=e=>{st.q=e.target.value;render()};',
'document.getElementById("fproj").onchange=e=>{st.proj=e.target.value;render()};',
'document.getElementById("fkind").onchange=e=>{st.kind=e.target.value;render()};',
'document.getElementById("fstat").onchange=e=>{st.stat=e.target.value;render()};',
'document.getElementById("vBoard").onclick=()=>{document.getElementById("vBoard").classList.add("on");document.getElementById("vTable").classList.remove("on");document.getElementById("board").style.display="flex";document.getElementById("tablewrap").style.display="none"};',
'document.getElementById("vTable").onclick=()=>{document.getElementById("vTable").classList.add("on");document.getElementById("vBoard").classList.remove("on");document.getElementById("board").style.display="none";document.getElementById("tablewrap").style.display="block"};',
'render();',
].join('\n');

const html = [
'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">',
'<meta name="viewport" content="width=device-width,initial-scale=1">',
'<title>Workbench 看板</title><style>' + css + '</style></head><body>',
'<header><h1>Workbench 看板</h1><span class="badge ro">只读视图 · 由 Markdown 生成</span><span class="badge" id="gen"></span><span class="spacer"></span>',
'<input id="q" placeholder="搜索标题 / 正文 / 编号">',
'<select id="fproj"><option value="">全部项目</option></select>',
'<select id="fkind"><option value="">全部类型</option></select>',
'<select id="fstat"><option value="">全部状态</option></select>',
'<button id="vBoard" class="on">看板</button><button id="vTable">表格</button></header>',
'<main><div class="stats" id="stats"></div>',
'<div class="hint" style="margin-bottom:10px">点卡片或表格行，在右侧看条目全文。写回永远由 agent 完成，这里只读。</div>',
'<div class="board" id="board"></div>',
'<div id="tablewrap" style="display:none"><table><thead><tr><th>编号</th><th>标题</th><th>类型</th><th>状态</th><th>优先级</th><th>项目</th><th>更新</th></tr></thead><tbody id="tbody"></tbody></table></div></main>',
'<aside id="panel"></aside>',
'<script type="application/json" id="data">' + payload + '</scr' + 'ipt>',
'<script>' + js + '</scr' + 'ipt></body></html>',
].join('\n');

writeFileSync(join(HERE, 'dashboard.html'), html, 'utf8');
console.log('records=' + records.length + '  sqlite=' + sqliteInfo);
console.log(records.map(r => r.kind + ':' + r.id + ':' + (r.status || '-')).join('\n'));
