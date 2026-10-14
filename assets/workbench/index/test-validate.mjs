// workbench/index/test-validate.mjs — 结构校验器 validate.mjs 的回归测试（自包含、零依赖）
//
// 用法: node workbench/index/test-validate.mjs
// 退出码: 0 = 断言全部 PASS；1 = 存在 FAIL（任一 fail 都会让验收方看见）
//
// 为什么要这么写（设计说明）：
// 1) 隔离真实台账：validate.mjs 的 ROOT = dirname(dirname(脚本))，即脚本所在的 workbench 目录。
//    所以每个用例都把「真实 validate.mjs 的字节」原样写进一个临时 workbench/index/ 再运行，
//    被测规则永远是当前真实文件，而断言只作用在临时 fixture 台账上。
//    本文件对真实 validate.mjs 只读，绝不改写（写域仅限本文件）。
// 2) 子进程输出写文件再读，而不是 stdio:'pipe' —— 受限沙箱不允许开命名管道（EPERM）。
//    写法照抄已验证可行的 pkg/workbench-cli/tools/smoke-test.mjs。
// 3) 断言全部针对子进程 stdout 原始文本（validate.mjs 真实输出），不做任何二次加工；
//    并且「摘要行声明了几个错误」与「实际打印了几行 ERROR」分开断言，防止摘要自说自话。
// 4) 变异验证（ACC-2026-0001 的 AC-7）：把某条规则削弱后重跑对应用例，要求该用例的断言必须失败。
//    不会失败的测试等于没有测试。变异只写入临时副本。
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, openSync, closeSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const VALIDATOR = join(HERE, 'validate.mjs');

const OUT_ERROR = /^\s*ERROR\s/;   // validate.mjs 打印错误行的前缀
const OUT_WARN = /^\s*(?:WARN|NOTE)\s/;

let passCount = 0, failCount = 0;
function check(name, ok, detail = '') {
  if (ok) { passCount++; console.log('PASS  ' + name); }
  else { failCount++; console.log('FAIL  ' + name + (detail ? '  ← ' + detail : '')); }
}

/* ---------------- fixture 工具 ---------------- */

function writeFiles(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const p = join(root, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content, 'utf8');
  }
}

// 造一个临时 workbench 台账：<tmp>/<caseId>/workbench/{index/validate.mjs, ...fixture}
function prepareFixture(tmpRoot, caseId, validatorSource) {
  const wbDir = join(tmpRoot, caseId, 'workbench');
  const validator = join(wbDir, 'index', 'validate.mjs');
  mkdirSync(dirname(validator), { recursive: true });
  writeFileSync(validator, validatorSource, 'utf8');
  return { wbDir, validator, logPath: join(tmpRoot, caseId, 'validate.out.log') };
}

// 子进程输出走文件描述符；沙箱下 stdio:'pipe' 会 EPERM，文件重定向在沙箱与 CI 都可用
function runValidator(fx, args = []) {
  const fd = openSync(fx.logPath, 'w');
  let r;
  try {
    r = spawnSync(process.execPath, [fx.validator, ...args], { cwd: fx.wbDir, stdio: ['ignore', fd, fd] });
  } finally {
    closeSync(fd);
  }
  const out = readFileSync(fx.logPath, 'utf8');
  if (r.error) return { code: -1, out: out + '\n[spawn 失败] ' + r.error.message };
  return { code: r.status === null ? -1 : r.status, out };
}

const linesMatching = (out, re) => out.split(/\r?\n/).filter(l => re.test(l));
const countIn = (lines, re) => lines.filter(l => re.test(l)).length;
const firstLine = out => (out.split(/\r?\n/).find(l => l.trim()) || '(无输出)');

function dumpOutput(out) {
  console.log('      --- validate.mjs 实际输出 ---');
  for (const l of out.split(/\r?\n/).slice(0, 25)) console.log('      ' + l);
}

/* ---------------- 通用断言 ---------------- */

// 每个用例都跑同一套断言：摘要行 / ERROR 行数（独立复核）/ WARN 行数 / 退出码 / 结语
// 外加用例自定义的「应出现」与「不应出现」列表（均逐行匹配真实输出文本）。
function assertRun(spec, label, res, exp) {
  const out = res.out;
  const summary = '校验 ' + exp.docs + ' 份文档：' + exp.errors + ' 个错误，' + exp.warns + ' 个警告';
  check(label + '：摘要行「' + summary + '」', new RegExp('^' + summary + '$', 'm').test(out), '实际首行: ' + firstLine(out));

  const errLines = linesMatching(out, OUT_ERROR);
  const warnLines = linesMatching(out, OUT_WARN);
  check(label + '：实际 ERROR 行数 = ' + exp.errors + '（独立复核，不信任摘要）', errLines.length === exp.errors, '实际 ' + errLines.length + ' 行');
  check(label + '：实际 WARN/NOTE 行数 = ' + exp.warns, warnLines.length === exp.warns, '实际 ' + warnLines.length + ' 行');
  check(label + '：退出码 = ' + exp.code, res.code === exp.code, '实际 ' + res.code);
  check(label + '：结语 validate ' + exp.verdict, new RegExp('^validate ' + exp.verdict + '$', 'm').test(out), '实际尾行: ' + (out.trim().split(/\r?\n/).pop() || '(空)'));

  for (const w of spec.wantErrors || []) {
    const n = countIn(errLines, w.re);
    check(label + '：' + w.label, n === (w.count === undefined ? 1 : w.count), '匹配 ' + n + ' 行，期望 ' + (w.count === undefined ? 1 : w.count));
  }
  for (const w of spec.rejectErrors || []) {
    const n = countIn(errLines, w.re);
    check(label + '：' + w.label, n === 0, '却被匹配 ' + n + ' 行');
  }
  for (const w of spec.wantWarns || []) {
    const n = countIn(warnLines, w.re);
    check(label + '：' + w.label, n === (w.count === undefined ? 1 : w.count), '匹配 ' + n + ' 行，期望 ' + (w.count === undefined ? 1 : w.count));
  }
  for (const w of spec.rejectWarns || []) {
    const n = countIn(warnLines, w.re);
    check(label + '：' + w.label, n === 0, '却被匹配 ' + n + ' 行');
  }
  for (const w of spec.wantText || []) {
    check(label + '：' + w.label, w.re.test(out), '实际首行: ' + firstLine(out));
  }
}

function runFixtureCase(spec, validatorSource, tmpRoot) {
  console.log('\n── ' + spec.title + ' ──');
  const before = failCount;
  const fx = prepareFixture(tmpRoot, spec.id, validatorSource);
  writeFiles(fx.wbDir, spec.files);

  let res;
  try {
    res = runValidator(fx);
  } catch (e) {
    check(spec.id + '：校验器进程可启动（异常须报 FAIL 而非崩溃）', false, e.message);
    return;
  }
  assertRun(spec, spec.id, res, spec.expect);

  if (spec.strict) {
    let sres;
    try {
      sres = runValidator(fx, ['--strict']);
    } catch (e) {
      check(spec.id + '：--strict 运行可启动', false, e.message);
      return;
    }
    assertRun(spec, spec.id + ' --strict', sres, spec.strict);
  }
  if (failCount > before) dumpOutput(res.out);
}

/* ---------------- 用例定义 ---------------- */

const CASES = [
  {
    id: '01-duplicate-id',
    title: '用例 1：重复 ID（AC-2）',
    files: {
      '10-items/WB-2026-0001-alpha.md': `---
id: WB-2026-0001
title: 重复 ID 条目 A
status: captured
type: requirement
---

# 重复 ID 条目 A
`,
      '10-items/WB-2026-0001-beta.md': `---
id: WB-2026-0001
title: 重复 ID 条目 B
status: backlog
type: bug
---

# 重复 ID 条目 B
`,
    },
    expect: { docs: 2, errors: 1, warns: 0, code: 1, verdict: 'FAILED' },
    wantErrors: [{ label: '报「ID 冲突」并列出冲突文件', re: /ID 冲突：.*的同类型文件多于一个.*alpha\.md.*beta\.md/ }],
    rejectErrors: [
      { label: '不得误报「非法 status」', re: /非法 status/ },
      { label: '不得误报「非法 type」', re: /非法 type/ },
    ],
    mutation: { needle: 'ID 冲突', protects: 'ID 冲突' },
  },
  {
    id: '02-bad-status',
    title: '用例 2：非法 status（AC-3）',
    files: {
      '10-items/WB-2026-0011.md': `---
id: WB-2026-0011
title: 非法状态条目
status: nonsense
type: improvement
---

# 非法状态条目
`,
      '10-items/WB-2026-0012.md': `---
id: WB-2026-0012
title: 合法状态对照条目
status: backlog
type: improvement
---

# 合法状态对照条目
`,
    },
    expect: { docs: 2, errors: 1, warns: 0, code: 1, verdict: 'FAILED' },
    wantErrors: [{ label: '报「非法 status "nonsense"」', re: /: 非法 status "nonsense"$/ }],
    rejectErrors: [
      { label: '合法状态 backlog 不得被判非法', re: /非法 status "backlog"/ },
      { label: '不得误报「ID 冲突」', re: /ID 冲突/ },
    ],
    mutation: { needle: '非法 status', protects: '非法 status' },
  },
  {
    id: '03-dangling-link',
    title: '用例 3：悬空 links（AC-4）',
    files: {
      '10-items/WB-2026-0021.md': `---
id: WB-2026-0021
title: 悬空 related
status: captured
related: [WB-9999-9999,  WB-7777-7777 , ]
---

# 悬空 related
`,
      '10-items/WB-2026-0022.md': `---
id: WB-2026-0022
title: 悬空 duplicates
status: captured
duplicates: [WB-8888-8888]
---

# 悬空 duplicates
`,
      '10-items/WB-2026-0023.md': `---
id: WB-2026-0023
title: 合法指向对照
status: captured
related: [WB-2026-0021]
---

# 合法指向对照
`,
    },
    // related 是多值数组：两个悬空 ID 都要报；元素两侧空白要裁掉；尾随逗号不得造出空 ID
    expect: { docs: 3, errors: 3, warns: 0, code: 1, verdict: 'FAILED' },
    wantErrors: [
      { label: '报 related 指向不存在的 ID（数组第 1 项）', re: /: links\.related 指向不存在的 ID "WB-9999-9999"$/ },
      { label: '报 related 指向不存在的 ID（数组第 2 项，已验证裁空白）', re: /: links\.related 指向不存在的 ID "WB-7777-7777"$/ },
      { label: '报 duplicates 指向不存在的 ID（LINK_KEYS 不止 related）', re: /: links\.duplicates 指向不存在的 ID "WB-8888-8888"$/ },
    ],
    rejectErrors: [
      { label: '指向已存在 ID 的 related 不得被误报', re: /指向不存在的 ID "WB-2026-0021"/ },
      { label: '尾随逗号不得产生空 ID 报错（filter(Boolean)）', re: /指向不存在的 ID ""$/ },
    ],
    mutation: { needle: '指向不存在的 ID', protects: '悬空 links' },
  },
  {
    id: '04-no-frontmatter',
    title: '用例 4：缺少 frontmatter（AC-5）',
    files: {
      '10-items/bare-note.md': `# 裸 markdown 文件

这个文件完全没有 frontmatter，应当被校验器拦下。
`,
      '10-items/WB-2026-0031.md': `---
id: WB-2026-0031
title: 正常条目对照
status: captured
---

# 正常条目对照
`,
    },
    // 无 frontmatter 时 fm 退化为 {}，故条目类文件会连报三条：缺 frontmatter / 缺 id / 缺 status
    expect: { docs: 2, errors: 3, warns: 0, code: 1, verdict: 'FAILED' },
    wantErrors: [
      { label: '报「缺少 frontmatter」', re: /ERROR\s+10-items\/bare-note\.md: 缺少 frontmatter$/ },
      { label: '裸文件同时报「缺少 id」', re: /: 缺少 id$/ },
      { label: '裸文件同时报「条目缺少 status」', re: /: 条目缺少 status$/ },
    ],
    rejectErrors: [{ label: '有 frontmatter 的文件不得被误报', re: /ERROR\s+10-items\/WB-2026-0031\.md/ }],
    mutation: { needle: '缺少 frontmatter', protects: '缺少 frontmatter' },
  },
  {
    id: '05-self-verify',
    title: '用例 5：自验收（AC-6）',
    files: {
      '60-verify/VR-2026-0001-self.md': `---
id: VR-2026-0001
item: WB-2026-0041
title: 自验收记录（应当被拦下）
executor: alice
verifier: alice
verdict: pass
---

# 自验收记录
`,
      '60-verify/VR-2026-0002-independent.md': `---
id: VR-2026-0002
item: WB-2026-0041
title: 独立验收对照
executor: alice
verifier: bob
verdict: pass
---

# 独立验收对照
`,
    },
    expect: { docs: 2, errors: 1, warns: 0, code: 1, verdict: 'FAILED' },
    wantErrors: [{ label: '报「验收者 = 执行者」', re: /: 验收者 = 执行者（SPEC 禁止自验收）$/ }],
    rejectErrors: [{ label: '验收者≠执行者不得被误报', re: /ERROR\s+60-verify\/VR-2026-0002-independent\.md/ }],
    mutation: { needle: '验收者 = 执行者', protects: '自验收' },
  },
  {
    id: '06-clean',
    title: '用例 6：干净台账（AC-1 的正向对照）',
    files: {
      '10-items/WB-2026-0100.md': `---
id: WB-2026-0100
type: requirement
title: 干净条目 A
project: PROJ-0001
status: backlog
related: [WB-2026-0101]
---

# 干净条目 A
`,
      '10-items/WB-2026-0101.md': `---
id: WB-2026-0101
type: bug
title: 干净条目 B
status: captured
---

# 干净条目 B
`,
      'projects/PROJ-0001/PROJECT.md': `---
id: PROJ-0001
title: 回归测试项目
status: active
---

# 回归测试项目
`,
      '60-verify/VR-2026-0102.md': `---
id: VR-2026-0102
item: WB-2026-0100
title: 独立验收记录
executor: alice
verifier: bob
verdict: pass
---

# 独立验收记录
`,
      '50-exec/EX-2026-0103.md': `---
id: EX-2026-0103
item: WB-2026-0100
title: 执行记录
status: running
artifacts_dir: 50-exec/artifacts/EX-2026-0103/
---

# 执行记录
`,
      '30-decisions/ADR-2026-0104.md': `---
id: ADR-2026-0104
title: 决策记录
status: proposed
---

# 决策记录
`,
      '20-research/RS-2026-0105.md': `---
id: RS-2026-0105
title: 调研记录
status: complete
---

# 调研记录
`,
      '70-knowledge/KB-2026-0106.md': `---
id: KB-2026-0106
title: 知识记录
---

# 知识记录
`,
    },
    expect: { docs: 8, errors: 0, warns: 0, code: 0, verdict: 'OK' },
    wantText: [{ label: '干净台账判定为通过（validate OK）', re: /^validate OK$/m }],
    rejectErrors: [{ label: '干净台账不得有任何 ERROR 行', re: /./ }],
    rejectWarns: [{ label: '干净台账不得有任何 WARN/NOTE 行', re: /./ }],
    strict: { docs: 8, errors: 0, warns: 0, code: 0, verdict: 'OK' },
  },
  {
    id: '07-warn-rules',
    title: '用例 7：警告类规则 + --strict（补充覆盖）',
    files: {
      '10-items/WB-2026-0071.md': `---
id: WB-2026-0071
title: 缺 PLAN/ACC 的进阶条目
status: planned
type: improvement
artifacts: { research: [], decision: null, plan: null, acceptance: null }
---

# 缺 PLAN/ACC 的进阶条目
`,
      '10-items/WB-2026-0072.md': `---
id: WB-2026-0072
title: 显式门禁豁免条目
status: captured
gate_exempt: 试点期豁免：本条目未单独建档 PLAN/ACC
---

# 显式门禁豁免条目
`,
      '10-items/WB-2026-0073.md': `---
id: WB-2026-0073
title: 未注册项目条目
status: captured
project: ghost-project
---

# 未注册项目条目
`,
      '10-items/WB-2026-0076.md': `---
id: WB-2026-0076
status: captured
---

正文里也没有 H1 标题。
`,
      '10-items/WB-2026-0077.md': `---
id: WB-2026-0077
title: 已注册项目对照条目
status: captured
project: PROJ-0001
---

# 已注册项目对照条目
`,
      '10-items/WB-2026-0078.md': `---
id: WB-2026-0078
status: captured
---

# 用正文 H1 顶替 frontmatter title
`,
      '30-decisions/ADR-2026-0074.md': `---
id: ADR-2026-0074
title: 已接受但无审批留痕
status: accepted
---

# 已接受但无审批留痕
`,
      '50-exec/EX-2026-0075.md': `---
id: EX-2026-0075
item: WB-2026-0071
title: 执行成功但无证据锚点
status: succeeded
---

# 执行成功但无证据锚点
`,
      'projects/PROJ-0001/PROJECT.md': `---
id: PROJ-0001
title: 已注册项目
status: active
---

# 已注册项目
`,
    },
    expect: { docs: 9, errors: 0, warns: 6, code: 0, verdict: 'OK' },
    wantWarns: [
      { label: '警告：advance 状态缺 PLAN/ACC（门禁一致性）', re: /: status=planned 但缺 PLAN\/ACC（SPEC 铁律 4）/ },
      { label: 'NOTE：gate_exempt 显式豁免被标注', re: /NOTE\s+10-items\/WB-2026-0072\.md: 门禁豁免——/ },
      { label: '警告：project 未在 projects/ 注册', re: /: project "ghost-project" 未在 projects\/ 注册$/ },
      { label: '警告：decision accepted 无 approved_by', re: /: status=accepted 但没有 approved_by（审批未留痕）$/ },
      { label: '警告：exec succeeded 无 artifacts_dir', re: /: 执行成功但没有 artifacts_dir（证据未锚定）$/ },
      { label: '警告：frontmatter 与 H1 都无 title', re: /: 缺少 title（frontmatter 与正文 H1 都没有）$/ },
    ],
    rejectWarns: [
      { label: '已注册 project 不得被误判未注册', re: /WB-2026-0077.*未在 projects\/ 注册/ },
      { label: '无 frontmatter title 但有正文 H1 的条目不报「缺少 title」', re: /WB-2026-0078.*缺少 title/ },
    ],
    rejectErrors: [{ label: '纯警告场景不得升级为 ERROR', re: /./ }],
    wantText: [{ label: '注明 1 条显式豁免说明', re: /^（其中 1 条为显式豁免说明）$/m }],
    // 警告默认不影响退出码；--strict 时警告也计入失败
    strict: { docs: 9, errors: 0, warns: 6, code: 1, verdict: 'FAILED' },
  },
  {
    id: '08-error-rules',
    title: '用例 8：其余错误类规则（补充覆盖）',
    files: {
      '10-items/WB-2026-0081.md': `---
id: WB-2026-0081
title: 非法 type 条目
status: captured
type: bogus
---

# 非法 type 条目
`,
      '10-items/WB-2026-0082.md': `---
id: WB-2026-0082
title: 缺少 status 的条目
---

# 缺少 status 的条目
`,
      '10-items/WB-2026-0083.md': `---
title: 缺少 id 的条目
status: captured
---

# 缺少 id 的条目
`,
    },
    expect: { docs: 3, errors: 3, warns: 0, code: 1, verdict: 'FAILED' },
    wantErrors: [
      { label: '报「非法 type "bogus"」', re: /: 非法 type "bogus"$/ },
      { label: '报「条目缺少 status」', re: /: 条目缺少 status$/ },
      { label: '报「缺少 id」', re: /: 缺少 id$/ },
    ],
  },
  {
    id: '09-inbox',
    title: '用例 9：00-inbox 免 id（补充覆盖）',
    files: {
      '00-inbox/2026-10-13-bare.md': `# 收件箱裸想法

没有 frontmatter。收件箱允许没有 id，但仍要求有 frontmatter。
`,
      '00-inbox/2026-10-13-idea.md': `---
title: 收件箱想法（无 id）
captured_at: 2026-10-13T23:30:00+08:00
---

# 收件箱想法（无 id）
`,
    },
    expect: { docs: 2, errors: 1, warns: 0, code: 1, verdict: 'FAILED' },
    wantErrors: [{ label: '收件箱裸文件仍报「缺少 frontmatter」', re: /ERROR\s+00-inbox\/2026-10-13-bare\.md: 缺少 frontmatter$/ }],
    rejectErrors: [{ label: '00-inbox 不要求 id（不得报「缺少 id」）', re: /: 缺少 id$/ }],
    rejectWarns: [{ label: '收件箱记录不得产生警告', re: /./ }],
  },
  {
    id: '10-scan-scope',
    title: '用例 10：扫描范围过滤（补充覆盖）',
    // 被校验的文件集合本身就是规则：README / 隐藏目录 / SKIP_DIRS / workbench 根目录文件都不参与校验。
    // 这里塞进 6 个「坏文件」，正确行为是它们一个都不出现，最终只校验到 1 份文档。
    files: {
      '10-items/good.md': `---
id: WB-2026-0200
title: 唯一被校验到的条目
status: captured
type: improvement
---

# 唯一被校验到的条目
`,
      '10-items/README.md': `# 目录说明

README 不参与校验，即使它没有 frontmatter。
`,
      '10-items/.hidden/bad.md': `# 隐藏目录里的坏文件
`,
      '10-items/log/bad.md': `# SKIP_DIRS(log) 里的坏文件
`,
      '10-items/artifacts/bad.md': `# SKIP_DIRS(artifacts) 里的坏文件
`,
      'templates/TEMPLATE.md': `# 模板目录里的裸文件
`,
      'root-level-note.md': `# workbench 根目录下的文件（不含路径分隔符，不参与校验）
`,
    },
    expect: { docs: 1, errors: 0, warns: 0, code: 0, verdict: 'OK' },
    wantText: [{ label: '只校验到 1 份文档（README/隐藏目录/跳过目录/根目录文件均被过滤）', re: /^校验 1 份文档：0 个错误，0 个警告$/m }],
    rejectErrors: [{ label: '被过滤位置的文件不得产生 ERROR', re: /./ }],
    rejectWarns: [{ label: '被过滤位置的文件不得产生 WARN', re: /./ }],
  },
];

/* ---------------- 变异验证（AC-7）：规则被削弱后，用例必须报红 ---------------- */

function weaken(source, needle) {
  const lines = source.split('\n');
  const i = lines.findIndex(l => l.includes(needle) && l.includes('errors.push'));
  if (i < 0) return { ok: false, reason: '未找到可削弱的规则行（锚点 "' + needle + '"）—— validate.mjs 可能已重构，请同步更新测试' };
  // 只把 errors.push 换成 void，保留 if/else 结构，避免造出语法错误而假红
  lines[i] = lines[i].replace('errors.push', 'void');
  return { ok: true, source: lines.join('\n') };
}

function runMutationPhase(tmpRoot, validatorSource) {
  console.log('\n── 变异验证（AC-7）：削弱规则后用例必须失败 ──');
  for (const spec of CASES.filter(c => c.mutation)) {
    const m = weaken(validatorSource, spec.mutation.needle);
    if (!m.ok) {
      check('变异【' + spec.mutation.protects + '】：变异锚点存在', false, m.reason);
      continue;
    }
    const fx = prepareFixture(tmpRoot, 'mut-' + spec.id, m.source);
    writeFiles(fx.wbDir, spec.files);
    let res;
    try {
      res = runValidator(fx);
    } catch (e) {
      check('变异【' + spec.mutation.protects + '】：变异副本可启动', false, e.message);
      continue;
    }
    const ran = /^校验 \d+ 份文档：/m.test(res.out);
    check('变异【' + spec.mutation.protects + '】：变异副本仍是可运行的校验器（排除语法错误假红）', ran, '实际首行: ' + firstLine(res.out));

    const primary = spec.wantErrors[0].re; // 用例的首要正断言
    const stillReported = primary.test(res.out);
    check('变异【' + spec.mutation.protects + '】：规则被削弱后 ' + spec.id + ' 的首要断言必须失败（证明它能拦住退化）',
      !stillReported, stillReported ? '规则已削弱却仍报出期望错误，该断言拦不住退化' : '');
  }
}

/* ---------------- 主流程 ---------------- */

let tmpRoot = null;
try {
  if (!existsSync(VALIDATOR)) {
    check('被测对象存在: ' + VALIDATOR, false, '文件不存在');
  } else {
    const validatorSource = readFileSync(VALIDATOR, 'utf8');
    console.log('被测: ' + VALIDATOR);
    console.log('临时台账根目录: ' + (tmpRoot = mkdtempSync(join(tmpdir(), 'wb-validate-test-'))));
    for (const spec of CASES) runFixtureCase(spec, validatorSource, tmpRoot);
    runMutationPhase(tmpRoot, validatorSource);
  }
} catch (e) {
  check('测试自身执行不崩溃', false, e.stack.split('\n').slice(0, 3).join(' | '));
} finally {
  if (tmpRoot) {
    try {
      rmSync(tmpRoot, { recursive: true, force: true });
    } catch (e) {
      check('临时目录已清理', false, e.message);
    }
    check('临时目录已清理（' + tmpRoot + '）', !existsSync(tmpRoot));
  }
}

const total = passCount + failCount;
console.log('\n' + (failCount ? 'test-validate FAILED（' + failCount + '/' + total + ' 条断言失败）' : 'test-validate OK（' + passCount + ' 条断言全部 PASS）'));
process.exitCode = failCount ? 1 : 0;
