# Controller Best Practices

Controllers live in `app/controllers`, one file per resource, named `<resource>_controller.ts` with a default-exported class. Generate them so the naming and scaffolding match:

```bash
node ace make:controller posts
```

A controller is instantiated **per request** by the IoC container. Instance state is therefore safe — it cannot leak between requests — but it also means constructor work runs on every request, so keep constructors to dependency assignment.

## Keep Actions Thin

A controller action coordinates; it should not *be* the business logic. The healthy shape is: authorize, validate, delegate, respond.

```ts title="app/controllers/posts_controller.ts"
import Post from '#models/post'
import PostPolicy from '#policies/post_policy'
import { createPostValidator } from '#validators/post'
import type { HttpContext } from '@adonisjs/core/http'

export default class PostsController {
  async store({ request, auth, bouncer, response }: HttpContext) {
    await bouncer.with(PostPolicy).authorize('create')

    const payload = await request.validateUsing(createPostValidator)

    const post = await Post.create({
      ...payload,
      userId: auth.getUserOrFail().id,
    })

    return response.created(post)
  }
}
```

When an action grows past roughly 20 lines, or when the same sequence appears in a second action, extract a service (see [`services-di.md`](services-di.md)).

## Destructure Only What You Use

The first parameter is always the `HttpContext`. Destructuring documents an action's dependencies at a glance.

```ts
async index({ request, response, auth }: HttpContext) {}
```

Import the type with `import type { HttpContext } from '@adonisjs/core/http'`. Commonly available: `request`, `response`, `params`, `session`, `auth`, `bouncer`, `view`, `inertia`, `logger`, `serialize`.

## Stick to RESTful Action Names

`index`, `create`, `store`, `show`, `edit`, `update`, `destroy`. These are what `router.resource()` expects, and they let any reader predict a controller's surface without opening it.

When an operation doesn't fit the seven, don't invent `updateStatusAndNotify` — create a dedicated controller for that concept:

```ts
// app/controllers/post_publications_controller.ts
router.post('/posts/:id/publish', [controllers.PostPublications, 'store'])
```

This keeps every controller RESTful and gives the new behavior somewhere to grow.

## Authorize Before Validating

Both before writing. A user who may not perform an action should not be able to probe your validation rules with it.

Incorrect:
```ts
const payload = await request.validateUsing(updatePostValidator)
const post = await Post.findOrFail(params.id)
await bouncer.with(PostPolicy).authorize('edit', post)  // too late
```

Correct:
```ts
const post = await Post.findOrFail(params.id)
await bouncer.with(PostPolicy).authorize('edit', post)
const payload = await request.validateUsing(updatePostValidator)
```

## Let Exceptions Bubble

The global exception handler converts framework exceptions into correct responses using content negotiation. Wrapping actions in `try/catch` usually degrades that behavior.

Incorrect:
```ts
async show({ params, response }: HttpContext) {
  try {
    const post = await Post.findOrFail(params.id)
    return post
  } catch {
    return response.notFound('Post not found')   // swallows real errors too
  }
}
```

Correct — `findOrFail` already produces a 404, and a database outage still surfaces as a 500:
```ts
async show({ params }: HttpContext) {
  return Post.findOrFail(params.id)
}
```

Catch only when you have genuinely different handling for a *specific* error type. See [`error-handling.md`](error-handling.md).

## Use Explicit Response Semantics

Returning a value works and is idiomatic for simple reads. Reach for `response` when the status code carries meaning.

```ts
return response.created(post)      // 201
return response.noContent()        // 204
return response.forbidden(msg)     // 403
```

## Shape Output Deliberately

Returning a Lucid model directly serializes whatever columns exist — including ones added by a later migration. For anything a client consumes, use a transformer, which makes the response shape explicit and generates matching frontend types.

```ts
async index({ serialize }: HttpContext) {
  const posts = await Post.query().preload('author')
  return serialize(PostTransformer.transform(posts))
}
```

See [`transformers.md`](transformers.md).

## Inject Dependencies, Don't Construct Them

```ts
import { inject } from '@adonisjs/core'
import { AvatarService } from '#services/avatar_service'

@inject()
export default class UsersController {
  constructor(protected avatarService: AvatarService) {}
}
```

The `@inject()` decorator is required, and the dependency must be a **value import** — `import type` erases the class at runtime and silently yields `undefined`. Controllers support both constructor and method injection; see [`services-di.md`](services-di.md).

## Never Query the Database in a Loop

This is the most common source of N+1 in controllers. Preload instead — see [`db-performance.md`](db-performance.md).
