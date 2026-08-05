# Version Traps — Read Before Writing Code

**This project is AdonisJS v7. Never write v5 or v6 APIs.**

That is not a version-detection exercise — it is a hard rule. Your training data contains far more v5 and v6 AdonisJS than v7, so the APIs you reach for by reflex are frequently the outdated ones. Everything below is a reflex to unlearn.

Target versions:

| `@adonisjs/core` | `@adonisjs/lucid` | `@vinejs/vine` | `@adonisjs/bouncer` | `@adonisjs/auth` |
| --- | --- | --- | --- | --- |
| 7.x | 22.x | 4.x | 4.x | 10.x |

The tables in this file are **recognition aids**: the left column is what you might write from memory, the right column is what this project uses. If you catch yourself typing anything on the left, stop.

## AdonisJS 5 Signals

v5 was end-of-life long before v7, and v6 was a total rewrite rather than an upgrade — so nothing from v5 carries over. It ran for years and dominates older blog posts and Stack Overflow answers, so it surfaces easily.

| v5 (never write) | v7 |
| --- | --- |
| `import Route from '@ioc:Adonis/Core/Route'` | `import router from '@adonisjs/core/services/router'` |
| **any `@ioc:` import prefix** | subpath imports (`#models/user`) or package paths |
| `HttpContextContract` | `HttpContext` |
| `app/Controllers/Http/PostsController.ts` | `app/controllers/posts_controller.ts` |
| PascalCase directories (`app/Models/`, `app/Services/`) | snake_case (`app/models/`, `app/services/`) |
| `Route.get('/posts', 'PostsController.index')` | `router.get('/posts', [controllers.Posts, 'index'])` |
| `Route` / `Env` / `Database` (capitalized singletons) | `router` / `env` / `db` (lowercase services) |
| `contracts/` directory | module augmentation in place |
| `schema.create({})` + `request.validate({ schema })` | `vine.create({})` + `request.validateUsing(validator)` |
| `public async index()` | `async index()` |

The `@ioc:` prefix is the unmistakable tell — it does not exist in v6 or v7 at all. A single `@ioc:` import means you are writing for the wrong framework generation entirely.

## AdonisJS 6 Signals

v6 is the harder trap, because it looks almost right. Same ESM structure, same snake_case files, same subpath imports — but several core APIs changed in v7. The rest of this file covers each one in detail.

| v6 (never write) | v7 |
| --- | --- |
| `vine.compile(vine.object({…}))` | `vine.create({…})` |
| `const C = () => import('#controllers/…')` | `import { controllers } from '#generated/controllers'` |
| `router.makeUrl()` / `makeSignedUrl()` | `urlFor()` / `signedUrlFor()` |
| `route()` helper in Edge | `urlFor()` in Edge |
| `.middleware(…)` on a route | `.use(…)` |
| `@column()` columns written by hand | extend the generated `#database/schema` class |
| `Request` / `Response` classes | `HttpRequest` / `HttpResponse` |
| `getDirname()` / `getFilename()` | `import.meta.dirname` / `import.meta.filename` |
| `*.spec(.ts\|.js)` test globs | `*.spec.{ts,js}` |
| `errors` key in flash messages | `inputErrorsBag` |

## VineJS: `vine.create()` replaced `vine.compile()`

The single most common mistake. VineJS v4 removed the `vine.compile(vine.object({...}))` wrapper.

Incorrect (VineJS v2/v3 — will not work on v4):
```ts
import vine from '@vinejs/vine'

export const createPostValidator = vine.compile(
  vine.object({
    title: vine.string(),
    body: vine.string(),
  })
)
```

Correct (VineJS v4):
```ts
import vine from '@vinejs/vine'

export const createPostValidator = vine.create({
  title: vine.string(),
  body: vine.string(),
})
```

The same applies to validators carrying metadata — `withMetaData()` now chains into `.create()`, not `.compile()`:

```ts
export const updateUserValidator = vine
  .withMetaData<{ userId: number }>()
  .create({
    email: vine.string().email(),
  })
```

## Lucid: models extend generated schema classes

Lucid 22 is **migrations-first**. After `node ace migration:run`, Lucid inspects the database and regenerates `database/schema.ts` with a fully typed schema class per table. Models extend those classes instead of declaring every column by hand.

Outdated by default (writing every column manually):
```ts
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Post extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare title: string
  // ...restating what the migration already said
}
```

Current default:
```ts
import { PostsSchema } from '#database/schema'

export default class Post extends PostsSchema {
  // Columns are inherited. Add relationships, hooks, and methods here.
}
```

Never edit `database/schema.ts` — it is overwritten on every migration run. To change a column, write a migration. To change how a column is *typed*, use `database/schema_rules.ts`.

**Heads-up when reading the official docs:** several pages — notably the auth guides and the transformers guide — still show hand-declared `BaseModel` columns. That is legacy sample code, not a recommendation. Extending the generated schema class is the Lucid 22 default; don't "correct" a model back to `BaseModel` after reading one of those pages.

## Routing: `urlFor()` replaced `router.makeUrl()`

`router.makeUrl()` and `router.makeSignedUrl()` are deprecated, as is the `route()` helper in Edge templates.

Incorrect:
```ts
const url = router.makeUrl('posts.show', { id: 1 })
```
```edge
<a href="{{ route('posts.show', [post.id]) }}">View</a>
```

Correct:
```ts
import { urlFor, signedUrlFor } from '@adonisjs/core/services/url_builder'

urlFor('posts.show', { id: 1 })
urlFor('posts.index', [], { qs: { page: 2 } })
```
```edge
<a href="{{ urlFor('posts.show', { id: post.id }) }}">View</a>
```

`urlFor` is type-safe against your registered routes, which is the reason for the change.

## Controllers: import via the generated barrel file

v7 generates `.adonisjs/server/controllers.ts` and exposes it as `#generated/controllers`.

Outdated:
```ts
const PostsController = () => import('#controllers/posts_controller')
router.get('/posts', [PostsController, 'index'])
```

Current:
```ts
import { controllers } from '#generated/controllers'

router.get('/posts', [controllers.Posts, 'index'])
router.resource('posts', controllers.Posts)
```

Controllers are still lazy-loaded; the barrel file just removes the import boilerplate. The same exists for policies (`bouncer.with('PostPolicy')`).

## Routing: `.use()` replaced `.middleware()`

Incorrect:
```ts
router.get('/admin', handler).middleware(middleware.auth())
```

Correct:
```ts
import { middleware } from '#start/kernel'

router.get('/admin', handler).use(middleware.auth())
```

And at the kernel level, the three stacks are `server.use([...])`, `router.use([...])`, and `router.named({...})`.

## HTTP classes were renamed

`Request` → `HttpRequest` and `Response` → `HttpResponse`. This only matters when you extend these classes, augment their types, or register macros — the `ctx.request` / `ctx.response` objects you use in controllers are unchanged.

## Removed helpers from `@adonisjs/core/helpers`

| Removed | Use instead |
| --- | --- |
| `getDirname()` | `import.meta.dirname` |
| `getFilename()` | `import.meta.filename` |
| `slash()` | `stringHelpers.toUnixSlash()` |
| `joinToURL()` | the native `URL` constructor |
| `cuid()` / `isCuid()` | UUIDs |
| `parseImports()` | the `parse-imports` package directly |

## Runtime Behavior That Surprises People

These are not API renames — they are semantics that differ from what older examples imply.

- **`request.all()` includes multipart files**, merged with the body fields. Read fields explicitly when you want fields only. `file()`, `files()`, and `allFiles()` are unaffected.
- **Encryption is configured in `config/encryption.ts`.** The `appKey` export from `config/app.ts` is not used for it.
- **Controller-bound routes get auto-generated names.** Assigning a name that collides with a generated one is an error, so don't add `.as()` reflexively.
- **JSON requests never receive HTML status pages.** API clients always get JSON error responses.
- **Shutdown hooks run in reverse registration order** (last registered, first executed).
- **Flash messages use `inputErrorsBag`.** There is no `errors` key.
- **Node.js 24+ is required.** The JIT compiler is `@poppinss/ts-exec`, not `ts-node`.
- **Inertia shares props through middleware**, via a `share()` method on an Inertia middleware — there is no `sharedData` config key. The entrypoint is `inertia/app.tsx`.

## When You Are Unsure

Fetch the authoritative page rather than guessing — every docs URL serves Markdown when you append `.md`:

```
https://docs.adonisjs.com/guides/basics/validation.md
https://docs.adonisjs.com/v6-to-v7.md
```
