# Authorization Best Practices

Authorization uses [Bouncer](https://docs.adonisjs.com/guides/auth/authorization.md). Install with `node ace add @adonisjs/bouncer`, which creates `app/abilities/main.ts` and registers the initializer middleware.

Authentication asks *who are you*; authorization asks *what may you do*. Keep the answers out of your controllers.

## Abilities for Simple Checks, Policies for Resources

**Abilities** are standalone functions in `app/abilities/main.ts` — good when there are a handful of simple checks.

```ts title="app/abilities/main.ts"
import User from '#models/user'
import Post from '#models/post'
import { Bouncer } from '@adonisjs/bouncer'

export const editPost = Bouncer.ability((user: User, post: Post) => {
  return user.id === post.userId
})

export const sendEmail = Bouncer.ability((user: User) => {
  return user.role === 'admin'
})
```

**Policies** are classes grouping every check for one resource. Prefer them once a resource has more than one or two rules.

```bash
node ace make:policy post
```

```ts title="app/policies/post_policy.ts"
import User from '#models/user'
import Post from '#models/post'
import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthorizerResponse } from '@adonisjs/bouncer/types'

export default class PostPolicy extends BasePolicy {
  create(user: User): AuthorizerResponse {
    return true
  }

  edit(user: User, post: Post): AuthorizerResponse {
    return user.id === post.userId
  }

  delete(user: User, post: Post): AuthorizerResponse {
    return user.id === post.userId
  }
}
```

Give each action its own method even when the bodies are identical today. `edit` and `delete` diverge sooner than you expect, and merging them makes that change touch call sites.

## Never Inline Ownership Checks in Controllers

An inline comparison is invisible to every other call site and impossible to test on its own.

Incorrect:
```ts
const post = await Post.findOrFail(params.id)
if (post.userId !== auth.user!.id) {
  return response.forbidden('Nope')
}
```

Correct:
```ts
const post = await Post.findOrFail(params.id)
await bouncer.with(PostPolicy).authorize('edit', post)
```

## Choose the Right Method

The bouncer is already bound to the logged-in user, so you never pass the user — only the resource.

| Method | Returns | Use when |
| --- | --- | --- |
| `authorize()` | throws `AuthorizationException` | The action must stop — the common case in controllers |
| `denies()` | `boolean` | You want a custom response |
| `allows()` | `boolean` | Branching, or conditional UI state |
| `execute()` | `AuthorizationResponse` | You need the message and status |

```ts
await bouncer.authorize(editPost, post)                     // ability
await bouncer.with(PostPolicy).authorize('edit', post)      // policy
await bouncer.with('PostPolicy').denies('delete', post)     // string via barrel file
```

`authorize()` throws, and the global handler turns that into a 403 for HTML and JSON alike — so prefer it over hand-written `forbidden()` responses.

## Authorize Before Validating, and Before Loading Anything Expensive

```ts
async update({ bouncer, params, request }: HttpContext) {
  const post = await Post.findOrFail(params.id)
  await bouncer.with(PostPolicy).authorize('edit', post)

  const payload = await request.validateUsing(updatePostValidator)
  // ...
}
```

For `create`, authorize before you even read the body — there is no resource to load:

```ts
await bouncer.with(PostPolicy).authorize('create')
```

## Hide Existence When It Is Itself Sensitive

Returning 403 confirms the record exists. When that leaks information, return a 404 instead by way of a custom response:

```ts
import { Bouncer, AuthorizationResponse } from '@adonisjs/bouncer'

export const editPost = Bouncer.ability((user: User, post: Post) => {
  if (user.id === post.userId) {
    return AuthorizationResponse.allow()
  }
  return AuthorizationResponse.deny('Post not found', 404)
})
```

## Use `before` for Superuser Rules — Carefully

```ts
export default class PostPolicy extends BasePolicy {
  before(user: User | null, action: string, ...params: any[]) {
    if (user && user.role === 'admin') {
      return true
    }
    // returning undefined falls through to the action method
  }
}
```

| Return | Effect |
| --- | --- |
| `true` | Authorized immediately; action method never runs |
| `false` | Denied immediately; action method never runs |
| `undefined` | Continue to the action method |

Returning a bare `true`/`false` from `before` short-circuits *every* action in the policy, including destructive ones. Return `undefined` for the paths you want evaluated normally, and note the `user` parameter is nullable — guests reach this hook too.

## Handle Guests Explicitly

Policy action methods receive a non-null user by default; unauthenticated requests are denied before reaching them. When an ability should permit guests, opt in with `allowGuest` and type the parameter as nullable:

```ts title="app/abilities/main.ts"
export const viewPost = Bouncer.ability(
  { allowGuest: true },
  (user: User | null, post: Post) => {
    return post.isPublished || user?.id === post.userId
  }
)
```

On policies, the equivalent is the `@allowGuest()` decorator on the individual method:

```ts title="app/policies/post_policy.ts"
import { BasePolicy, allowGuest } from '@adonisjs/bouncer'

export default class PostPolicy extends BasePolicy {
  @allowGuest()
  view(user: User | null, post: Post): AuthorizerResponse {
    return post.isPublished || user?.id === post.userId
  }
}
```

Both forms require the user parameter to be typed `User | null`. Apply them per check, not wholesale — a policy where every method admits guests is a policy that has stopped protecting anything.

## Don't Query Inside Authorization Checks

A policy that loads a relationship runs once per resource — an N+1 in disguise when checking a list. Preload what the check needs, then read it:

```ts
const posts = await Post.query().preload('team')     // controller
```
```ts
edit(user: User, post: Post) {
  return post.team.ownerId === user.id              // policy, no query
}
```

Policies do support constructor injection when a check genuinely needs a service:

```ts
@inject()
export default class PostPolicy extends BasePolicy {
  constructor(protected subscriptions: SubscriptionService) {
    super()
  }
}
```

## Authorize in Templates and Props Too

Hiding a button is not authorization — always keep the server-side check — but the UI should match what the server will allow.

Edge provides `@can` and `@cannot`, which work with both abilities and policies:

```edge
@can('PostPolicy.edit', post)
  <a href="{{ urlFor('posts.edit', { id: post.id }) }}">Edit</a>
@end
```

For Inertia and APIs, pass the results as data:

```ts
return inertia.render('posts/show', {
  post: PostTransformer.transform(post),
  can: {
    edit: await bouncer.with(PostPolicy).allows('edit', post),
    delete: await bouncer.with(PostPolicy).allows('delete', post),
  },
})
```

## Test Policies Directly

They are plain classes — unit test them without HTTP. Cover the owner, the non-owner, the admin, and the guest for every action.
