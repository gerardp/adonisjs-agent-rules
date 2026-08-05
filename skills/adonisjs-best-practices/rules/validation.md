# Validation Best Practices

AdonisJS validates with [VineJS](https://vinejs.dev) at the controller boundary — not in models. Validators live in `app/validators`, **one file per resource** holding all validators for that resource's actions.

```bash
node ace make:validator post
```

## Use `vine.create()`

VineJS v4 removed `vine.compile()`. Writing it is the single most common AdonisJS mistake — see [`version-traps.md`](version-traps.md).

```ts title="app/validators/post.ts"
import vine from '@vinejs/vine'

export const createPostValidator = vine.create({
  title: vine.string().trim().minLength(3).maxLength(255),
  body: vine.string().trim(),
  publishedAt: vine.date().optional(),
})

export const updatePostValidator = vine.create({
  title: vine.string().trim().minLength(3).maxLength(255).optional(),
  body: vine.string().trim().optional(),
})
```

Name exports `<action><Resource>Validator`. Validators are compiled once at module load, so keep them at module scope — never build one inside a request handler.

## Validate at the Controller, Then Trust

`request.validateUsing()` returns a fully typed payload. Once it returns, the data is trustworthy — passing it to services, models, or jobs requires no further checking. That is the entire point of a trust boundary.

```ts title="app/controllers/posts_controller.ts"
import { createPostValidator } from '#validators/post'
import type { HttpContext } from '@adonisjs/core/http'

export default class PostsController {
  async store({ request }: HttpContext) {
    const payload = await request.validateUsing(createPostValidator)
    return Post.create(payload)
  }
}
```

You do not pass the body — `validateUsing` reads it from the request.

## Never Wrap `validateUsing` in try/catch

The global exception handler already converts `E_VALIDATION_ERROR` into the right response through content negotiation:

| App type | Result |
| --- | --- |
| Server-rendered | Redirect back with errors flashed to session |
| Inertia | Redirect back with errors in shared state |
| JSON API | `422` with an `errors` array |

Incorrect:
```ts
try {
  const payload = await request.validateUsing(createPostValidator)
} catch (error) {
  return response.badRequest(error.messages)   // breaks redirects and flash messages
}
```

Correct — let it throw:
```ts
const payload = await request.validateUsing(createPostValidator)
```

Only catch when a specific action genuinely needs behavior different from the global default.

## Never Mass-Assign Unvalidated Input

The payload is the allowlist. `request.all()` is not — and in v7 it also merges uploaded files into the object.

Incorrect:
```ts
await Post.create(request.all())        // trivially lets a client set `userId` or `isAdmin`
```

Correct:
```ts
const payload = await request.validateUsing(createPostValidator)
await Post.create({ ...payload, userId: auth.getUserOrFail().id })
```

Server-controlled fields — ownership, status, timestamps — come from the server, never from the schema.

## Validate Params, Query, Headers, and Cookies in the Same Schema

Reserved top-level keys map to their request sources. Everything else comes from the body and query string.

```ts title="app/validators/user.ts"
export const showUserValidator = vine.create({
  filters: vine.object({
    page: vine.number().optional(),
    limit: vine.number().optional(),
  }),

  params: vine.object({
    id: vine.number(),
  }),

  cookies: vine.object({
    sessionId: vine.string(),
  }),

  headers: vine.object({
    'x-api-key': vine.string(),
  }),
})
```

```ts
const payload = await request.validateUsing(showUserValidator)
payload.params.id       // typed number
payload.filters.page
```

## Pass Request Context as Metadata

When a rule depends on the current request — most often "unique except my own row" — declare metadata rather than reaching for globals.

```ts title="app/validators/user.ts"
export const updateUserValidator = vine
  .withMetaData<{ userId: number }>()
  .create({
    email: vine.string().email().unique({
      table: 'users',
      filter: (db, value, field) => {
        db.whereNot('id', field.meta.userId)
      },
    }),
  })
```

```ts
const payload = await request.validateUsing(updateUserValidator, {
  meta: { userId: auth.getUserOrFail().id },
})
```

## Use Database Rules Instead of Hand-Written Lookups

Lucid contributes `unique` and `exists` rules. They read better and keep the check inside the trust boundary.

Incorrect:
```ts
const existing = await User.findBy('email', payload.email)
if (existing) {
  return response.badRequest('Email taken')     // wrong shape, wrong status, no field attribution
}
```

Correct:
```ts
export const registerValidator = vine.create({
  email: vine.string().email().unique({ table: 'users', column: 'email' }),
  categoryId: vine.number().exists({ table: 'categories', column: 'id' }),
})
```

These add a query per rule. On hot paths, prefer a database unique constraint as the real guarantee and treat the rule as the friendly message.

## Reuse Validators Outside HTTP

Jobs, commands, and services call `.validate()` directly. There is no automatic error response there, so handle failures yourself.

```ts
import { createPostValidator } from '#validators/post'

const validPost = await createPostValidator.validate(item)
```

## Customize Messages Globally

Set a messages provider once in `start/validator.ts` (`node ace make:preload validator`) rather than repeating messages per field.

```ts title="start/validator.ts"
import vine, { SimpleMessagesProvider } from '@vinejs/vine'

vine.messagesProvider = new SimpleMessagesProvider({
  'required': 'The {{ field }} field is required',
  'email': 'The value is not a valid email address',
  'username.required': 'Please choose a username for your account',
})
```

Field-specific keys override global ones. For multi-language apps use `@adonisjs/i18n` with `resources/lang/<locale>/validator.json` instead.
