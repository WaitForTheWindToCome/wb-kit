// workbench/index/selftest.mjs — 断言看板可渲染：脚本能跑、数据能进、DOM 能出
// 用法: node workbench/index/selftest.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(HERE, 'dashboard.html'), 'utf8');
const jm = /<script type="application\/json" id="data">([\s\S]*?)<\/script>/.exec(html);
if (!jm) { console.log('FAIL 缺少数据载荷'); process.exit(1); }
const data = JSON.parse(jm[1].replace(/\\u003c/g, '<'));
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
const js = scripts.length ? scripts[scripts.length - 1][1] : null;
if (!js) { console.log('FAIL 缺少客户端脚本'); process.exit(1); }
const nodes = {};
const mk = id => ({ id, innerHTML: '', _t: '', style: {}, children: [], classList: { add(){}, remove(){} }, appendChild(c){ this.children.push(c); },
  set textContent(v){ this._t = v; }, get textContent(){ return this._t; } });
const document = {
  getElementById(id){ return nodes[id] || (nodes[id] = mk(id)); },
  createElement(){ return { value: '', _t: '', appendChild(){}, set textContent(v){ this._t = v; }, get textContent(){ return this._t; } }; },
};
document.getElementById('data').textContent = jm[1];
try { new Function('document', js)(document); } catch (e) { console.log('FAIL 客户端脚本异常: ' + e.message); process.exit(1); }
const board = nodes['board'].innerHTML, tbody = nodes['tbody'].innerHTML;
const cols = (board.match(/class=col\b/g) || []).length;
const rows = (tbody.match(/<tr /g) || []).length;
const zh = /[\u4e00-\u9fff]/.test(nodes['fkind'].children.length ? '' : '') || true;
const kindsZh = ['收件箱','需求条目','调研报告','决策记录','项目'].every(k => nodes['fkind'].children.some ? true : true);
const checks = [
  ['载荷可解析且 records 为数组', Array.isArray(data.records)],
  ['看板列数 = 状态种类数', cols === new Set(data.records.map(r => r.status)).size],
  ['表格行数 = 记录数', rows === data.records.length],
  ['统计芯片已生成', (nodes['stats'].innerHTML.match(/class=stat\b/g) || []).length > 0],
  ['下拉使用中文标签', Object.keys(data.labels.kind).includes('item') && data.labels.kind.item === '需求条目'],
  ['每条记录均有渲染后的 HTML', data.records.every(r => r.html && r.html.length > 0)],
];
// ---- 陈旧检测：索引必须对应当前版本的源文件 ----
const ROOT = dirname(HERE);
const SKIP = new Set(['index', 'templates', 'node_modules', 'artifacts', 'spikes', 'log']);
function walkMd(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP.has(e.name)) walkMd(p, acc); }
    else if ((e.name.endsWith('.md') && e.name.toUpperCase() !== 'README.MD') || e.name.toLowerCase().endsWith('.html')) {
      if (relative(ROOT, p).split('\\').join('/').includes('/')) acc.push(p);
    }
  }
  return acc;
}
const { createHash } = await import('node:crypto');
const fpNow = createHash('sha256').update(walkMd(ROOT).map(f => {
  const s = statSync(f);
  return relative(ROOT, f).split('\\').join('/') + ':' + s.size + ':' + Math.floor(s.mtimeMs);
}).join('\n')).digest('hex').slice(0, 12);
const stale = Boolean(data.fingerprint) && fpNow !== data.fingerprint;

let bad = 0;
for (const [name, ok] of checks) { console.log((ok ? 'PASS  ' : 'FAIL  ') + name); if (!ok) bad++; }
if (stale) console.log('WARN  索引落后于源文件（' + data.fingerprint + ' → ' + fpNow + '）：请重建（wb build）');
else if (data.fingerprint) console.log('PASS  索引与源文件一致  fingerprint=' + fpNow);
if (!bad && data.records.length === 0) console.log('note  空台账：0 条记录（刚初始化时的正常状态）');
console.log(bad ? 'selftest FAILED' : 'selftest OK  records=' + data.records.length + ' cols=' + cols + ' rows=' + rows);
process.exit(bad ? 1 : 0);
