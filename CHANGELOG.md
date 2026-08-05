# Changelog

All notable changes to this pack are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) as applied to rule content:

- **Major** — a rule reverses, or the targeted AdonisJS major version changes.
- **Minor** — a rule file is added, or existing guidance is meaningfully extended.
- **Patch** — corrections, clarifications, and vendored-snapshot refreshes.

## [Unreleased]

### Added

- `rules/edge.md` — opinionated guidance for view state, layouts, components, escaping,
  server-rendered forms, helpers, and rendered-page testing.

## [1.0.0] - 2026-08-05

First public release. Targets AdonisJS v7: `@adonisjs/core` 7.x · `@adonisjs/lucid` 22.x ·
`@vinejs/vine` 4.x · `@adonisjs/bouncer` 4.x · `@adonisjs/auth` 10.x.

### Added

- `adonisjs-best-practices` skill with 20 rule files covering routing, controllers, middleware,
  validation, Lucid models, database performance, migrations, transactions, transformers,
  authentication, authorization, error handling, services and DI, config, queues and jobs,
  testing, security, style, architecture, and version traps.
- `templates/AGENTS.md` — drop-in foundation rules for an AdonisJS project root.
- Vendored snapshot of the official AdonisJS documentation, taken 2026-08-05, in
  `skills/adonisjs-best-practices/references/`.
- Claude Code plugin manifests, making the repository installable with
  `/plugin marketplace add gerardp/adonisjs-agent-rules`.
- `scripts/lint.mjs` — validates plugin manifests, skill frontmatter, and relative
  Markdown links. Runs in CI on every push and pull request.

### Fixed

- Skill references to the vendored docs pointed at `docs/official/`, a path that existed
  neither in the repository nor after installation. The snapshot now lives inside the skill
  at `references/`, so a copied skill directory is self-contained.
- `rules/architecture.md` was missing from the Rule Index in `SKILL.md`, leaving it
  unreachable for an agent following the documented procedure.
- Installation instructions in `README.md` referenced a `docs/` directory that did not exist.
