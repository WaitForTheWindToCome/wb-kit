// workbench/index/watch.mjs — 监听 workbench 下 Markdown 变化，自动重建看板与索引
import { watch } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
function build(tag){
  const r = spawnSync(process.execPath, [join(HERE, 'build.mjs')], { stdio: 'inherit' });
  console.log('[watch] rebuild ' + (tag || 'init') + ' exit=' + r.status);
}
build('init');
let t = null;
watch(ROOT, { recursive: true }, (ev, f) => {
  if (!f) return;
  const p = String(f).split('\\').join('/');
  if (p.startsWith('index/') || p.startsWith('.') || !p.toLowerCase().endsWith('.md')) return;
  clearTimeout(t);
  t = setTimeout(() => { console.log('[watch] changed: ' + p); build(p); }, 400);
});
console.log('[watch] 监听中: ' + ROOT);
