# Style & Conventions

## File and Class Naming

AdonisJS uses **snake_case filenames** and **PascalCase class names**. This trips up developers coming from other TypeScript ecosystems.

| Kind | File | Class / export |
| --- | --- | --- |
| Controller | `app/controllers/posts_controller.ts` | `PostsController` (plural) |
| Model | `app/models/post.ts` | `Post` (singular) |
| Middleware | `app/middleware/log_requests_middleware.ts` | `LogRequestsMiddleware` |
| Validator | `app/validators/post.ts` | `createPostValidator` (named exports) |
| Policy | `app/policies/post_policy.ts` | `PostPolicy` |
| Service | `app/services/avatar_service.ts` | `AvatarService` |
| Transformer | `app/transformers/post_transformer.ts` | `PostTransformer` |
| Job | `app/jobs/process_payment.ts` | `ProcessPayment` |
| Migration | `database/migrations/<timestamp>_create_posts_table.ts` | anonymous default export |

Controllers are plural, models singular. Database tables are plural snake_case; columns are snake_case and surface as camelCase on models.

Use the generators — they get all of this right:

```bash
node ace make:controller posts
node ace make:model Post
node ace make:validator post
node ace list                     # discover the rest
```

## Use Subpath Imports

`package.json` maps `#`-prefixed specifiers to directories. Use them instead of relative paths — they survive file moves and read the same from anywhere in the tree.

```ts
import User from '#models/user'
import { createPostValidator } from '#validators/post'
import PostPolicy from '#policies/post_policy'
import { controllers } from '#generated/controllers'
import env from '#start/env'
```

The standard map:

```
#controllers/*  #models/*      #services/*    #validators/*   #middleware/*
#policies/*     #abilities/*   #transformers/*  #exceptions/*  #mails/*
#events/*       #listeners/*   #providers/*   #database/*     #generated/*
#tests/*        #start/*       #config/*
```

Incorrect:
```ts
import User from '../../models/user.js'
```

## ESM Only — Mind the Extensions

AdonisJS is ESM. In relative imports, TypeScript requires the `.js` extension even though the source is `.ts`. Subpath imports avoid the issue entirely, which is another reason to prefer them.

`require()` is unavailable. Use dynamic `import()` for lazy loading, and `import.meta.dirname` / `import.meta.filename` instead of `__dirname` / `__filename` (the `getDirname()` helper was removed in v7).

## `import type` vs. Value Imports

Getting this wrong breaks dependency injection silently — see [`services-di.md`](services-di.md).

```ts
import type { HttpContext } from '@adonisjs/core/http'      // type only
import type { NextFn } from '@adonisjs/core/types/http'
import type { HasMany } from '@adonisjs/lucid/types/relations'

import { AvatarService } from '#services/avatar_service'    // injected → value
import User from '#models/user'                            // used at runtime → value
```

Anything the container resolves, or that appears in a decorator, must be a value import.

## `declare` on Model Properties

Model columns and relationships use `declare`. It tells TypeScript the property exists without emitting a field initializer that would clobber Lucid's accessors.

```ts
@column({ isPrimary: true })
declare id: number

@hasMany(() => Post)
declare posts: HasMany<typeof Post>
```

## Prefer Explicit Types at Boundaries

Let TypeScript infer locals; annotate what crosses a boundary — public method returns, service signatures, exported functions. Avoid `any`; use `unknown` plus narrowing when a type is genuinely open.

Avoid non-null assertions (`!`) where an API offers a safe alternative — `auth.getUserOrFail()` over `auth.user!`, `findOrFail()` over `find()!`.

## Naming

Descriptive over clever. `isRegisteredForDiscounts`, not `discount()`. Booleans read as predicates (`is`, `has`, `can`, `should`). Async functions that fetch say so (`findActiveSubscribers`, not `subscribers`).

Private class members use `#name` (native) or `protected`/`private`. Framework hook methods on models are `static`.

## Commit Generated Files

`.adonisjs/` holds generated barrel files and client types. Commit it — production builds and CI resolve `#generated/*` through it and will fail without it.

Never edit generated files by hand: `.adonisjs/**` and `database/schema.ts` are overwritten. Change the source (a route, a transformer, a migration) and regenerate.

## Keep the Default Structure

`app/`, `config/`, `database/`, `start/`, `resources/`, `tests/`. Don't invent top-level directories without a reason — generators, barrel files, and subpath imports all assume the defaults.

Never import backend code into frontend code. The generated types in `.adonisjs/client` are the contract. See [`transformers.md`](transformers.md).

## Comments Explain Why

The code already says what. Comment the non-obvious constraint, the workaround and its ticket, the reason for an unusual order of operations. Delete commented-out code — that is what version control is for.

Match the surrounding file's comment density and idiom rather than importing a different house style.

## Formatting

Projects ship ESLint and Prettier configs (`@adonisjs/eslint-config`, `@adonisjs/prettier-config`). Run them before finishing:

```bash
npm run lint
npm run format
npm run typecheck      # tsc --noEmit; check package.json for the exact scripts
```

Never hand-adjust formatting the tool owns.
