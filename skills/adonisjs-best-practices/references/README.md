# Official AdonisJS Documentation (vendored snapshot)

Verbatim copies of the AdonisJS documentation as published for LLMs. **Not written by this project** — do not edit them.

| File | Source | Size |
| --- | --- | --- |
| `llms.txt` | https://docs.adonisjs.com/llms.txt | 146 lines — indexed table of contents |
| `llms-full.txt` | https://docs.adonisjs.com/llms-full.txt | 47,876 lines (~1.5 MB) — the entire documentation |

Snapshot taken **2026-08-05**, against `@adonisjs/core` 7.3.5 · `@adonisjs/lucid` 22.4.2 · `@vinejs/vine` 4.4.0 · `@adonisjs/bouncer` 4.0.0 · `@adonisjs/auth` 10.1.0.

Upstream source: [`adonisjs/v7-docs`](https://github.com/adonisjs/v7-docs).

## Snapshot vs. live docs

These files are a point-in-time copy and **will go stale**. Prefer the live URLs when you can reach the network — AdonisJS moved fast through the v7 cycle, and a stale local copy that looks authoritative is worse than no copy at all.

Use the vendored files when working offline, when you want a stable reference that doesn't shift mid-task, or when you need to search the whole corpus at once:

```bash
rg -n "withAuthFinder" .claude/skills/adonisjs-best-practices/references/llms-full.txt
```

Refresh them from the repository root with:

```bash
cd skills/adonisjs-best-practices/references
curl -sSL https://docs.adonisjs.com/llms.txt      -o llms.txt
curl -sSL https://docs.adonisjs.com/llms-full.txt -o llms-full.txt
```

Update the snapshot date above when you do, and re-check the rules pack against anything that changed.

## Relationship to the rest of the skill

These are **reference** material: what the APIs are. The rules in [`../rules/`](../rules/) are the **opinionated** layer: which option to pick by default and what to avoid. They cite these docs but do not duplicate them. [`../SKILL.md`](../SKILL.md) is the entry point.

Note that the repository's top-level `llms.txt` is a different file — it is the llms.txt-format index of *this* guidelines pack, not the official AdonisJS one.

## Granularity

Any single docs page is also available as raw Markdown by appending `.md` to its URL, which is usually a cheaper fetch than the 1.5 MB full file:

```
https://docs.adonisjs.com/guides/basics/validation.md
https://docs.adonisjs.com/v6-to-v7.md
```
