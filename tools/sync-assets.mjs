// tools/sync-assets.mjs — 从正在使用的 workbench 实例抽取"泛用资产"到 assets/
// 白名单复制：只取规范/模板/脚本/技能/目录说明，绝不带走任何记录文件。
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync, statSync, copyFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = dirname(HERE);
const WS = dirname(dirname(PKG));
const SRC_WB = join(WS, 'workbench');
const SRC_SKILL = join(WS, '.dsh', 'skills', 'workbench', 'SKILL.md');
const ASSETS = join(PKG, 'assets');
const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));

// 目录说明（每个目录的 README.md 是脚手架的一部分）
const FOLDER_STUBS = ['00-inbox','10-items','20-research','30-decisions','40-plans','50-exec','60-verify','70-knowledge','80-archive','projects','templates','index','log'];
const TOP_FILES = [['SPEC.md','SPEC.md'],['README.md','README.md'],['PORTABLE.md','PORTABLE.md'],['.gitignore','gitignore.txt']];
const SCRIPT_FILES = ['build.mjs','watch.mjs','selftest.mjs','validate.mjs','test-validate.mjs'];

rmSync(ASSETS, { recursive: true, force: true });
const files = [];
function put(rel, content) {
  const dest = join(ASSETS, rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, content, 'utf8');
  files.push(rel);
}
function copy(rel, src) {
  if (!existsSync(src)) { console.log('skip (missing): ' + src); return; }
  put(rel, readFileSync(src, 'utf8'));
}

for (const [src, dest] of TOP_FILES) copy('workbench/' + dest, join(SRC_WB, src));
for (const f of readdirSync(join(SRC_WB, 'templates'))) if (f.endsWith('.md')) copy('workbench/templates/' + f, join(SRC_WB, 'templates', f));
for (const f of SCRIPT_FILES) copy('workbench/index/' + f, join(SRC_WB, 'index', f));
for (const d of FOLDER_STUBS) copy('workbench/' + d + '/README.md', join(SRC_WB, d, 'README.md'));
for (const h of ['post-merge', 'post-checkout']) copy('workbench/githooks/' + h, join(SRC_WB, '.githooks', h));
for (const c of ['start-dashboard.cmd', 'start-server.cmd']) copy('workbench/' + c, join(SRC_WB, c));
copy('workbench/LEAD-MODE.md', join(SRC_WB, 'LEAD-MODE.md'));
copy('workbench/bin/dispatch.mjs', join(SRC_WB, 'bin', 'dispatch.mjs'));
copy('skill/workbench/SKILL.md', SRC_SKILL);

// 版本文件：写进资产（新实例 init 时落 .wb-version），同时标注当前实例
put('workbench/wb-version.txt', pkg.version + '\n');
writeFileSync(join(SRC_WB, '.wb-version'), pkg.version + '\n', 'utf8');

writeFileSync(join(ASSETS, 'manifest.json'), JSON.stringify({
  name: pkg.name, version: pkg.version, generatedAt: new Date().toISOString(), source: SRC_WB, count: files.length, files
}, null, 2) + '\n', 'utf8');

console.log('assets written: ' + files.length + ' files -> ' + ASSETS);
for (const f of files) console.log('  ' + f);
