# AdonisJS Agent Guidelines

<!--
  Drop-in foundation rules for an AdonisJS project.
  Copy this file to your project root as AGENTS.md (or CLAUDE.md), and copy
  the `skills/` directory to `.claude/skills/` or `.agents/skills/`.
  Adjust the project-specific sections at the bottom.
-->

## Foundational Context

This is an AdonisJS application: TypeScript-first, ESM-only, running on Node.js. You are an expert in the AdonisJS ecosystem.

**This is an AdonisJS v7 project. Never write v5 or v6 APIs.** Targets: `@adonisjs/core` 7.x · `@adonisjs/lucid` 22.x · `@vinejs/vine` 4.x · `@adonisjs/bouncer` 4.x · `@adonisjs/auth` 10.x.

Your training data skews heavily toward v5 and v6, so the reflex APIs are usually the wrong ones. Never write:

- `@ioc:` imports, `HttpContextContract`, `app/Controllers/Http/`, `Route.get('/x', 'Controller.method')` — that is v5, a different framework generation.
- `vine.compile()`, `router.makeUrl()`, `.middleware()` on routes, hand-declared `@column()` model fields, `getDirname()` — that is v6.

See `rules/version-traps.md` for the full mapping. Check `package.json` only when a *minor* version matters — `@adonisjs/queue` is experimental and still shifts.

AdonisJS borrows vocabulary from Laravel — controllers, middleware, providers, policies, migrations, factories — but the implementations differ. **Do not translate Laravel APIs by analogy.** The names match far more often than the signatures do.

## Skills Activation

This project has domain-specific skills in `**/skills/**`. You MUST activate the relevant skill whenever you work in that domain — don't wait until you're stuck.

Start with `adonisjs-best-practices`. Its `rules/version-traps.md` covers the v6→v7 API changes most likely to break code you generate from memory; read it before writing your first line of AdonisJS code.

## Searching Documentation

Before making changes involving an API you have not verified in this session, consult the official docs. They are published in agent-readable Markdown:

- Any page as raw Markdown: append `.md` to its URL — `https://docs.adonisjs.com/guides/basics/validation.md`
- Index: `https://docs.adonisjs.com/llms.txt`
- Everything in one file: `https://docs.adonisjs.com/llms-full.txt`
- Lucid ORM (separate, deeper): `https://lucid.adonisjs.com`
- VineJS: `https://vinejs.dev` · Japa: `https://japa.dev`

Prefer fetching the page over recalling the API. This ecosystem moved fast recently and recall is unreliable.

## Ace CLI

- Use `node ace make:*` generators rather than hand-writing files, so scaffolding matches the installed version's conventions.
- `node ace list` shows available commands; `node ace <command> --help` shows parameters.
- Inspect routes with `node ace list:routes` instead of inferring them from `start/routes.ts`.
- Use the REPL for exploration: `node ace repl`.
- Common: `make:controller`, `make:model`, `make:migration`, `make:validator`, `make:middleware`, `make:policy`, `make:service`, `make:transformer`, `make:job`, `make:test`, `make:exception`.

## Conventions

- Follow existing code conventions. Before creating or editing a file, check sibling files for structure, approach, and naming.
- **snake_case filenames, PascalCase classes**: `app/controllers/posts_controller.ts` exports `PostsController`. Controllers plural, models singular.
- **Use subpath imports** (`#models/user`, `#validators/post`, `#generated/controllers`), never long relative paths.
- **ESM only.** Relative imports need the `.js` extension. No `require()`. Use `import.meta.dirname`, not `__dirname`.
- **`import type` breaks dependency injection.** Anything the IoC container resolves must be a value import.
- Use descriptive names: `isRegisteredForDiscounts`, not `discount()`.
- Check for an existing service or helper before writing a new one.

## Non-Negotiables

- **Validate at the controller boundary** with a VineJS validator, then trust the payload. Never mass-assign `request.all()`.
- **Authorize object access with Bouncer**, before validating and before writing. An inline `if (post.userId !== user.id)` is not authorization.
- **Preload relationships.** Never query inside a loop, a transformer, or a template.
- **Always `orderBy` when paginating**, and always paginate unbounded lists.
- **Thread `trx` through every query inside a transaction.** A query without it runs outside the transaction.
- **Let exceptions bubble** to the global handler. Don't wrap `validateUsing` or `findOrFail` in try/catch.
- **Never edit generated files**: `database/schema.ts` and anything under `.adonisjs/`. Change the source and regenerate. Commit `.adonisjs/` — builds fail without it.
- **Never import backend code into frontend code.** The generated types in `.adonisjs/client` are the contract.

## Application Structure

- Stick to the existing directory structure; don't create new top-level folders without approval.
- Do not change dependencies without approval.
- Controllers → services → models. Never the reverse; never inject `HttpContext` into a long-lived service.

## Testing

- Most tests should be functional tests that exercise the real HTTP stack via Japa's API client.
- Use factories for test data, and set only the fields the assertion depends on.
- Reset database state between tests — `testUtils.db().withGlobalTransaction()` in a `group.each.setup()`.
- Cover the happy path, validation failure, unauthenticated, and unauthorized-but-authenticated cases.
- Use built-in fakes for mail, hash, drive, and the emitter. Never send real mail or hit real APIs.
- Run the narrowest relevant test first: `node ace test --files=<name>`, then the suite.
- Do not delete tests without approval.

## Before Finishing

Run the checks the change warrants:

```bash
npm run typecheck      # tsc --noEmit — verify the script exists in package.json
npm run lint
node ace test
```

Report results faithfully. If tests fail, say so and include the output.

## Frontend Bundling

If a frontend change isn't reflected in the UI, the user may need to run `npm run dev` or `npm run build`. Ask them.

## Documentation Files

Only create documentation files when explicitly requested.

## Replies

Be concise. Focus on what matters rather than explaining the obvious.

---

## Project-Specific Notes

<!-- Replace with facts about this application: domain vocabulary, deviations
     from the defaults above, deployment specifics, and standing constraints. -->

- Stack:
- Database:
- Frontend:
- Deviations from the conventions above:
