# Routing Best Practices

Routes live in `start/routes.ts`. Keep them declarative: a route file should read as a table of contents for the application, not as a place where logic happens.

## Bind Controllers Through the Generated Barrel

```ts title="start/routes.ts"
import router from '@adonisjs/core/services/router'
import { controllers } from '#generated/controllers'

router.get('/posts', [controllers.Posts, 'index'])
router.get('/posts/:id', [controllers.Posts, 'show'])
```

Controllers referenced this way are lazy-loaded, so boot time stays flat as the application grows. See [`version-traps.md`](version-traps.md) if you were about to write `const PostsController = () => import(...)`.

## Move Non-Trivial Handlers Into Controllers

Inline closures are fine for a health check or a redirect. Anything that touches the database, validates input, or spans more than a few lines belongs in a controller — closures cannot be dependency-injected, are awkward to test, and bloat the route file.

Incorrect:
```ts
router.post('/posts', async ({ request, auth }) => {
  const payload = await request.validateUsing(createPostValidator)
  const post = await Post.create({ ...payload, userId: auth.user!.id })
  await notifyFollowers(post)
  return post
})
```

Correct:
```ts
router.post('/posts', [controllers.Posts, 'store'])
```

## Use `router.resource()` for CRUD

One line replaces seven routes and gives you conventional names for free.

```ts
router.resource('posts', controllers.Posts)
```

Generated route names follow `<resource>.<action>` — `posts.index`, `posts.show`, `posts.store`, `posts.update`, `posts.destroy`, plus `posts.create` and `posts.edit` for form pages.

Narrow the set rather than deleting unused controller actions:

```ts
// APIs don't render forms — drops `create` and `edit`
router.resource('posts', controllers.Posts).apiOnly()

// Or be explicit
router.resource('posts', controllers.Posts).only(['index', 'store', 'destroy'])
```

Nested resources use dot notation, which produces nested URLs and nested param names:

```ts
router.resource('posts.comments', controllers.Comments)
```

## Validate and Cast Route Params at the Router

Params arrive as strings. `.where()` both rejects bad values and casts good ones, so your handler never re-parses. When a param fails its matcher the router *skips that route* and keeps searching, which also lets two routes share a pattern with different matchers.

Incorrect — hand-rolled in every handler:
```ts
router.get('/posts/:id', ({ params, response }) => {
  if (!/^[0-9]+$/.test(params.id)) {
    return response.badRequest('Invalid ID format')
  }
  const id = Number(params.id)
})
```

Correct:
```ts
router
  .get('/posts/:id', [controllers.Posts, 'show'])
  .where('id', router.matchers.number())   // params.id is already a number
```

Built-in matchers: `router.matchers.number()`, `.uuid()`, `.slug()`. For anything else, supply your own:

```ts
router
  .get('/posts/:id', [controllers.Posts, 'show'])
  .where('id', {
    match: /^[0-9]+$/,
    cast: (value) => Number(value),
  })
```

## Group Shared Concerns

Prefixes, middleware, and name prefixes applied to a group beat repeating them per route.

```ts
router
  .group(() => {
    router.resource('posts', controllers.Posts).apiOnly()
    router.resource('comments', controllers.Comments).apiOnly()
  })
  .prefix('/api/v1')
  .use(middleware.auth())
```

## Apply Middleware with `.use()`

```ts
import { middleware } from '#start/kernel'

router.get('/admin/reports', [controllers.Reports, 'index'])
  .use(middleware.authorize({ role: 'admin' }))
```

Import `middleware` from `#start/kernel` — that named collection is what gives you autocomplete and type-checking on the options object. See [`middleware.md`](middleware.md) for which stack to register in.

## Name Routes, Then Generate URLs From Names

Never hardcode paths in redirects, templates, emails, or jobs. A named route is a single point of change.

```ts
import { urlFor, signedUrlFor } from '@adonisjs/core/services/url_builder'

urlFor('posts.show', { id: post.id })
urlFor('posts.show', [post.id])                       // positional also works
urlFor('posts.index', [], { qs: { page: 2, sort: 'title' } })

// Expiring, tamper-evident links — password resets, unsubscribes, downloads
signedUrlFor('unsubscribe', { id: user.id }, { expiresIn: '24h' })
```

In Edge templates the `urlFor` helper is global. In controllers, prefer `response.redirect().toRoute('posts.show', { id })` over building a string.

Note that in v7 controller-bound routes receive auto-generated names. Assigning a `.as()` name that collides with a generated one raises a duplicate-route error.

## Inspect Routes Instead of Guessing

```bash
node ace list:routes
```

Use this to confirm names, methods, and the middleware attached to a route before you change any of them.
