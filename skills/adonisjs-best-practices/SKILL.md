---
name: adonisjs-best-practices
description: "Apply this skill whenever writing, reviewing, or refactoring AdonisJS v7 TypeScript code. This includes creating or modifying controllers, Lucid models, migrations, VineJS validators, policies and abilities, middleware, transformers, jobs, Ace commands, and service classes. Triggers for N+1 and query performance issues, eager loading, transactions, authentication and authorization patterns, rate limiting and throttling, validation, exception handling, queue and job configuration, route definitions, dependency injection, security, and architectural decisions. Also use for AdonisJS code reviews and for refactoring existing AdonisJS code to follow best practices."
license: MIT
---

# AdonisJS Best Practices

Best practices for AdonisJS, organized as an index of rule files. Each rule file teaches what to do and why.

AdonisJS is a TypeScript-first, ESM-only Node.js framework. It borrows a great deal of vocabulary from Laravel (controllers, middleware, providers, policies, migrations, factories), but the implementations differ. **Do not translate Laravel APIs into AdonisJS by analogy** — the names match far more often than the signatures do.

## Read This First

**This project is AdonisJS v7. Never write v5 or v6 APIs.**

Your training data contains far more v5 and v6 AdonisJS than v7, so the APIs you reach for by reflex — `vine.compile()`, `router.makeUrl()`, `.middleware()` on routes, hand-declared model columns, anything with an `@ioc:` prefix — are frequently the outdated ones. Read [`rules/version-traps.md`](rules/version-traps.md) **before** writing your first line of AdonisJS code in a session. Of every file here, it is the one most likely to prevent a broken change.

## Consistency First

Before applying any rule, check what the application already does. AdonisJS offers multiple valid approaches, and the best choice is usually the one the codebase already uses, even when another pattern is theoretically better. Inconsistency is worse than a suboptimal pattern.

Check sibling files — nearby controllers, models, validators, or tests — for established patterns. If one exists, follow it. Don't introduce a second way to do the same job. These rules are defaults for when no pattern exists yet, not overrides for decisions the project has already made.

## How to Apply

1. Assume v7 (`@adonisjs/core` 7.x, `@adonisjs/lucid` 22.x, `@vinejs/vine` 4.x). Read `package.json` when a *minor* version matters — experimental packages like `@adonisjs/queue` still shift between releases.
2. Check the changed files, nearby code, config files, and relevant tests for established patterns. Deviate only for a correctness or security defect, and call the deviation out.
3. Map every affected concern to the rule index below. Read each mapped rule file before editing. Skip unrelated rule files.
4. Prefer `node ace make:*` generators over hand-writing files, so scaffolding matches the installed version's conventions. `node ace list` shows what is available.
5. Make the smallest coherent change. Keep the application's architecture and naming instead of introducing a second pattern for the same job.
6. Run the narrowest relevant tests first, then type-checking (`npm run typecheck`, usually `tsc --noEmit`) and the project's lint/format commands when the change warrants them.
7. Re-read the diff against every mapped rule before finishing.

## Rule Index

Cross-cutting changes often need more than one rule file.

| Concern | Read |
| --- | --- |
| **Any AdonisJS work — version-specific API traps** | [`rules/version-traps.md`](rules/version-traps.md) |
| Layer boundaries, when to extract a service, when not to abstract | [`rules/architecture.md`](rules/architecture.md) |
| Routes, params, matchers, resource routes, URL generation | [`rules/routing.md`](rules/routing.md) |
| Controllers, actions, HttpContext, response shaping | [`rules/controllers.md`](rules/controllers.md) |
| Middleware stacks, named middleware, request pipeline | [`rules/middleware.md`](rules/middleware.md) |
| VineJS schemas, request validation, custom messages | [`rules/validation.md`](rules/validation.md) |
| Lucid models, schema classes, relationships, hooks, serialization | [`rules/lucid-models.md`](rules/lucid-models.md) |
| Query count, eager loading, indexes, pagination, large datasets | [`rules/db-performance.md`](rules/db-performance.md) |
| Schema changes, columns, foreign keys, indexes, rollbacks | [`rules/migrations.md`](rules/migrations.md) |
| Transactions, atomicity, locks, multi-step writes | [`rules/transactions.md`](rules/transactions.md) |
| API response shaping, serialization, generated frontend types | [`rules/transformers.md`](rules/transformers.md) |
| Guards, credential verification, sessions, access tokens | [`rules/authentication.md`](rules/authentication.md) |
| Bouncer abilities, policies, ownership checks | [`rules/authorization.md`](rules/authorization.md) |
| Exceptions, the global handler, reporting, status pages | [`rules/error-handling.md`](rules/error-handling.md) |
| Services, IoC container, `@inject`, providers, application structure | [`rules/services-di.md`](rules/services-di.md) |
| Config files, environment variables, `APP_KEY`, secrets | [`rules/config.md`](rules/config.md) |
| Background jobs, queues, retries, scheduling | [`rules/queues-jobs.md`](rules/queues-jobs.md) |
| Japa tests, suites, factories, database state, API client | [`rules/testing.md`](rules/testing.md) |
| Input safety, hashing, CSRF, uploads, rate limiting, secrets | [`rules/security.md`](rules/security.md) |
| Naming, file layout, subpath imports, TypeScript style | [`rules/style.md`](rules/style.md) |

## Decision Rules

- Prefer framework features and existing application abstractions over new helpers or dependencies.
- Validate at the edge, then trust. Once `request.validateUsing()` returns, the payload is trustworthy — don't re-check it in services or models.
- Authorize before you validate, and both before you write. A user who cannot perform an action should not learn about your validation rules.
- Avoid speculative abstractions. Extract code when it creates a clear domain boundary, removes meaningful duplication, or makes behavior independently testable.
- Keep database access out of Edge templates and Inertia props, and prevent hidden N+1 queries across controllers, transformers, jobs, and serialization.
- Never edit generated files (`database/schema.ts`, anything under `.adonisjs/`). Change the source of truth — a migration, a transformer, a route — and regenerate.

## Verifying Against Official Docs

These rules capture judgment and defaults; they are not an API reference. When you need exact signatures, options, or rules that changed between versions, consult the official documentation, which is published in agent-readable Markdown:

- Any docs page, as raw Markdown: append `.md` to its URL — e.g. `https://docs.adonisjs.com/guides/basics/validation.md`
- Indexed table of contents: `https://docs.adonisjs.com/llms.txt`
- Entire documentation in one file: `https://docs.adonisjs.com/llms-full.txt`

A snapshot of the last two is vendored inside this skill, which is faster than a network fetch when you want to search the whole corpus at once:

Shell commands run from the project root, not from this directory, so grep the installed path:

```bash
grep -n "withAuthFinder" .claude/skills/adonisjs-best-practices/references/llms-full.txt
```

It is a point-in-time copy, so prefer the live URLs for anything version-sensitive. See [`references/README.md`](references/README.md).
- Lucid ORM (separate site, deeper than the core guide): `https://lucid.adonisjs.com`
- VineJS validation rules: `https://vinejs.dev`
- Japa test runner: `https://japa.dev`
