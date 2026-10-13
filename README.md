# wb-kit

**An auditable decision ledger for AI-assisted engineering teams.**

[![CI](https://github.com/WaitForTheWindToCome/wb-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/WaitForTheWindToCome/wb-kit/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22.5-brightgreen.svg)](https://nodejs.org)

[中文说明](README.zh-CN.md)

---

Coding agents (Claude Code, Codex, DSH, …) are good at *writing code* and bad at *deciding what is worth building*. wb-kit puts a lightweight, auditable ledger **in front of** them:

> **collect → clarify → triage → research → decide → plan → accept → execute → verify → learn**

One command scaffolds a plain-Markdown workbench plus an agent skill into any project. Your agent does the writing; you only approve and read. Nothing here is a platform, a service, or a database — it is a convention plus a read-only view.

```bash
npx wb-kit init ./my-project          # scaffold the ledger + agent skill
```

## Why

Most "AI project management" fails for the same three reasons. wb-kit encodes the countermeasures as four hard rules:

1. **Markdown is the single source of truth.** SQLite and the dashboard are derived artifacts — delete them and they rebuild. Nothing may exist only in a view.
2. **Raw input is never rewritten.** `00-inbox/` is append-only; every item keeps the original text verbatim plus a hash. This is how you detect that AI "clarification" drifted from what you actually asked for.
3. **No evidence, no completion.** Any claim of "done" must ship a command, an exit code, a raw output file, an artifact hash and line references. **An agent's self-report is not evidence**, and the verifier must not be the executor.
4. **Acceptance criteria before implementation.** Entering execution requires both a plan and an acceptance plan; writing the acceptance criteria afterwards invalidates the acceptance.

## What you get

```
my-project/
├─ workbench/
│  ├─ SPEC.md            the constitution: folders, fields, state machine, gates, evidence rules
│  ├─ PORTABLE.md        how to move it, share it, and run it with a team
│  ├─ 00-inbox/          raw ideas — append-only, never rewritten
│  ├─ 10-items/          structured items (one decision per file, YAML frontmatter)
│  ├─ 20-research/       research reports: sources + facts / inferences / open questions
│  ├─ 30-decisions/      ADRs, including rejected options and re-evaluation triggers
│  ├─ 40-plans/          PLAN + ACC (acceptance plan)
│  ├─ 50-exec/           dispatch & run records (command, exit code, raw output, cost)
│  ├─ 60-verify/         independent verification (verifier ≠ executor)
│  ├─ 70-knowledge/      reusable conclusions and retrospectives
│  ├─ 80-archive/        terminal states
│  ├─ projects/          project registry — software, life goals and exam prep are all "projects"
│  ├─ templates/         10 templates
│  └─ index/             zero-dependency scripts: build / watch / selftest
├─ .dsh/skills/workbench/SKILL.md      DeepSeek Harness skill
└─ .claude/skills/workbench/SKILL.md   Claude Code skill
```

## Commands

| Command | What it does |
|---|---|
| `wb init [dir]` | Scaffold ledger, spec, templates and agent skill (`--agent=dsh\|claude\|both\|none`) |
| `wb build [dir]` | Scan Markdown → rebuild `index/workbench.sqlite` (FTS5) and `index/dashboard.html` |
| `wb watch [dir]` | Rebuild automatically when Markdown changes |
| `wb check [dir]` | Self-test: dashboard renders, index exists, templates present |
| `wb upgrade [dir]` | Update spec/templates/scripts — **never touches your records** (`--dry-run` supported) |

## The dashboard

`index/dashboard.html` is a single self-contained page (~50 KB, no CDN, no server): a board grouped by `status`, a filterable table, and click-through to the full text of any item. **It is read-only by design** — writes belong to the agent.

## Using it with an agent

Point your agent at the spec and let it work:

> "Read `workbench/SPEC.md` and follow it. Declare your write scope before writing. Give evidence for anything you claim is done."

The scaffolded skill maps common requests ("clean the inbox", "is this worth doing?", "write the plan", "verify it") onto the right folders and gates.

## Requirements

- Node ≥ 22.5 (`node:sqlite`; on older Node the dashboard still builds, only the index is skipped)
- Optional: git (history and team work), Python (LAN sharing of the dashboard), Obsidian (desktop views)

## Design constraints (please keep them)

- Zero runtime dependencies — Node built-ins only.
- The tool never edits content; agents edit Markdown.
- `assets/` may only contain specs, templates, scripts and skills — never user data. `tools/smoke-test.mjs` enforces this in CI.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Run `node tools/smoke-test.mjs` before opening a PR — CI runs it on Node 22 and 24.

## License

MIT — see [LICENSE](LICENSE).
