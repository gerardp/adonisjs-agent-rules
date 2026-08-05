# AdonisJS Agent Guidelines

Curated best-practice rules for building AdonisJS v7 applications with AI coding agents.

## Why this exists

AdonisJS already publishes very good **reference** documentation for LLMs:

| Resource | What it is |
| --- | --- |
| `https://docs.adonisjs.com/llms.txt` | Indexed table of contents |
| `https://docs.adonisjs.com/llms-full.txt` | The entire documentation in one file (~48k lines) |
| any docs URL + `.md` | Raw Markdown for a single page |

So the gap is not reference material — an agent can already look up any API. The gap is the **opinionated layer**: the docs describe what is possible, and often present several valid options without saying which to reach for. This pack supplies that judgment:

- **Defaults and anti-patterns**, not API listings — what to do when the docs show three valid options.
- **Version traps.** Training data skews heavily toward AdonisJS 5 and 6, both of which changed substantially by v7 (`vine.compile`, `router.makeUrl`, manual Lucid columns, `@ioc:` imports). An agent writing from memory produces code that no longer runs.
- **The reasoning**, so an agent can generalize instead of pattern-matching.

## Contents

```
├── README.md              ← you are here
├── CONTRIBUTING.md        ← what belongs in a rule, and how to verify one
├── CHANGELOG.md
├── llms.txt               ← llms.txt-format index of this pack + official docs
├── .claude-plugin/        ← manifests that make this repo installable via /plugin
├── scripts/lint.mjs       ← validates manifests, frontmatter, and links
├── templates/
│   └── AGENTS.md          ← drop-in foundation rules for a project root
└── skills/
    └── adonisjs-best-practices/
        ├── SKILL.md       ← index, application procedure, decision rules
        ├── rules/         ← 20 topic files
        └── references/    ← vendored snapshot of the official AdonisJS docs
            ├── llms.txt      ·   146 lines — upstream table of contents
            └── llms-full.txt ·   47,876 lines (~1.5 MB) — the whole documentation
```

Everything the skill needs at runtime lives inside `skills/adonisjs-best-practices/`, so installing is a single directory copy.

`references/` is verbatim upstream material, snapshotted 2026-08-05 — reference (*what the APIs are*). Everything else is this project's opinionated layer (*which option to pick*). See [`references/README.md`](skills/adonisjs-best-practices/references/README.md) for refresh instructions and the staleness caveat.

| Rule file | Covers |
| --- | --- |
| `version-traps.md` | **Read first.** v5/v6 APIs never to write, and their v7 equivalents |
| `architecture.md` | Which layer owns which logic; when to extract a service |
| `routing.md` | Resource routes, param matchers, named routes, `urlFor` |
| `controllers.md` | Thin actions, RESTful naming, authorize→validate→write |
| `middleware.md` | The three stacks, named middleware, typed options |
| `validation.md` | VineJS schemas, `validateUsing`, metadata, messages |
| `lucid-models.md` | Generated schema classes, relationships, hooks, factories |
| `db-performance.md` | N+1 and preloading, pagination, aggregates, indexes |
| `migrations.md` | Reversibility, no model imports, backfills, foreign keys |
| `transactions.md` | Managed transactions, threading `trx`, isolation levels |
| `transformers.md` | Response shaping, variants, depth, generated frontend types |
| `authentication.md` | Guards, `verifyCredentials`, sessions, access tokens |
| `authorization.md` | Bouncer abilities and policies, ownership, guests |
| `error-handling.md` | Global handler, `handle` vs `report`, custom exceptions |
| `services-di.md` | IoC container, `@inject()`, the `import type` pitfall |
| `config.md` | config vs env vs adonisrc, validation, `APP_KEY` |
| `queues-jobs.md` | Job anatomy, dispatch after commit, idempotency, retries |
| `testing.md` | Japa suites, state reset, factories, API client, fakes |
| `security.md` | Mass assignment, IDOR, uploads, CSRF, secrets, logging |
| `style.md` | Naming, subpath imports, ESM rules, `declare`, generated files |

## Installation

### As a Claude Code plugin (recommended)

```
/plugin marketplace add gerardp/adonisjs-agent-rules
/plugin install adonisjs-best-practices@adonisjs-agent-rules
```

This installs the skill and keeps it updatable. It does **not** install `AGENTS.md` — that file belongs in your project root, so copy it manually (see below).

### Manual copy

```bash
git clone https://github.com/gerardp/adonisjs-agent-rules.git

# The skill
mkdir -p /path/to/your-app/.claude/skills
cp -r adonisjs-agent-rules/skills/adonisjs-best-practices /path/to/your-app/.claude/skills/

# Foundation rules — the file your agent reads every session
cp adonisjs-agent-rules/templates/AGENTS.md /path/to/your-app/AGENTS.md   # or CLAUDE.md
```

For agents that read `.agents/skills/` (Codex, Copilot), copy there instead — or symlink so both resolve to one source.

Either way, fill in the **Project-Specific Notes** section at the bottom of `AGENTS.md`. That is where your app's actual domain vocabulary, deviations, and constraints go; the generic rules can't know them.

## How an agent should use this

1. Read `AGENTS.md` — loaded every session.
2. Activate the `adonisjs-best-practices` skill when touching AdonisJS code.
3. Read `rules/version-traps.md` before writing the first line.
4. Map the task to rule files via the index in `SKILL.md`; read only what applies.
5. Verify version-sensitive APIs against the official docs (append `.md` to any docs URL).

The rules repeatedly say **consistency beats correctness-in-the-abstract**: match what the codebase already does. They are defaults for when no pattern exists yet, not license to refactor someone's project mid-task.

## Accuracy and scope

Every code sample was checked against the official v7 documentation — `docs.adonisjs.com/llms-full.txt` and the [`adonisjs/v7-docs`](https://github.com/adonisjs/v7-docs) source repository — plus the Lucid, VineJS, and Japa docs, and the v7 starter kits, as of **August 2026**.

**The pack targets AdonisJS v7 only** — `@adonisjs/core` 7.x · `@adonisjs/lucid` 22.x · `@vinejs/vine` 4.x · `@adonisjs/bouncer` 4.x · `@adonisjs/auth` 10.x. v5 and v6 appear solely as *recognition tables* in `version-traps.md`, so an agent can spot the outdated APIs it is about to write. There is no "check which version you're on" branching to get wrong.

Two known caveats:

- **`@adonisjs/queue` is experimental.** Its API can change between minor releases; `queues-jobs.md` says so and points at the live guide.
- **Some official pages show pre-Lucid-22 model syntax.** The auth and transformers guides still declare `@column()` fields by hand on `BaseModel`. The rules flag this explicitly so the agent doesn't "correct" a model away from the generated schema classes after reading one.

## What this deliberately isn't

**This is documentation only — there is no tooling.** An agent reading these rules still cannot introspect your live application: it can't query the database, read the real schema, or check runtime state. It reasons from your code and these rules, nothing more.

What it does have is the Ace CLI, via shell:

```bash
node ace list:routes          # actual registered routes, names, middleware
node ace migration:status     # what has and hasn't run
node ace repl                 # application-aware REPL
```

`AGENTS.md` points at these so the agent inspects rather than infers. An MCP server exposing schema introspection and doc search as first-class tools would be the natural next step, and would close a real gap.

## Contributing

Corrections and new rules are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). The short version: a rule should say *which option to pick and why*, not restate the API, and every code sample must be verified against the official v7 docs. Run `node scripts/lint.mjs` before opening a pull request.

Version history is in [CHANGELOG.md](CHANGELOG.md).

## License

MIT.
