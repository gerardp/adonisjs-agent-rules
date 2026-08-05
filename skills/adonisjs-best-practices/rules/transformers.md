# Transformer Best Practices

Transformers convert backend data into JSON responses. They live in `app/transformers`, one per entity.

```bash
node ace make:transformer post
```

Their real payoff is type generation: the dev server writes TypeScript types for every transformer to `.adonisjs/client/data.d.ts`, so the frontend consumes the exact response shape with no duplicated interfaces to drift.

## Use a Transformer for Anything a Client Consumes

Returning a model directly serializes whatever columns happen to exist — so a later migration silently adds fields to your public API, and a mistake exposes a sensitive one.

Incorrect:
```ts
async index({ response }: HttpContext) {
  return response.json(await Post.all())     // shape defined by the database
}
```

Correct:
```ts
async index({ serialize }: HttpContext) {
  const posts = await Post.query().preload('author')
  return serialize(PostTransformer.transform(posts))
}
```

```ts title="app/transformers/post_transformer.ts"
import { BaseTransformer } from '@adonisjs/core/transformers'
import type Post from '#models/post'

export default class PostTransformer extends BaseTransformer<Post> {
  toObject() {
    return this.pick(this.resource, [
      'id',
      'title',
      'content',
      'createdAt',
      'updatedAt',
    ])
  }
}
```

`this.resource` is the instance being transformed. The same transformer handles a single item and a collection — `transform()` returns a `ResourceItem` or `ResourceCollection` accordingly.

## Pick Fields Explicitly

`this.pick()` is an allowlist. Prefer it over spreading the model and deleting keys, which fails open — a new sensitive column is exposed until someone remembers to exclude it.

## Wrap with `serialize()`, Except in Inertia

For JSON responses, wrap in the context's `serialize()` helper. Inertia's adapter handles resources natively, so pass them straight to `render()`:

```ts
return inertia.render('posts/index', {
  posts: PostTransformer.transform(posts),
})
```

## Transformers Never Query — Preload First

Transformers only read data already in memory. A relationship you forgot to preload is `undefined`, and touching it is a runtime error rather than a lazy load.

```ts
const posts = await Post.query().preload('author')   // required
return serialize(PostTransformer.transform(posts))
```

## Compose Transformers for Relationships

Each entity owns its transformer; relationships nest by calling the other transformer.

```ts title="app/transformers/post_transformer.ts"
import UserTransformer from '#transformers/user_transformer'

export default class PostTransformer extends BaseTransformer<Post> {
  toObject() {
    return {
      ...this.pick(this.resource, ['id', 'title', 'content', 'createdAt']),
      author: UserTransformer.transform(this.resource.author),
    }
  }
}
```

Relationships may only appear as top-level properties of the output.

When a relationship is conditionally loaded, guard it — `whenLoaded()` omits the key instead of throwing:

```ts
author: UserTransformer.transform(this.whenLoaded(this.resource.author))
```

## Understand Depth

Relationships serialize one level deep by default, which stops an accidental object graph from being shipped to the client. Opt in explicitly:

```ts
posts: PostTransformer.transform(this.resource.posts).depth(2)
```

Depth is decided at the top of the tree and cascades — a nested transformer's own `.depth()` does not override the parent's. Raise it only alongside the matching `preload`, or you will serialize `undefined`.

## Use Variants Instead of Multiple Transformers

One entity, one transformer, several shapes. Variants are extra methods; name them `for<Purpose>`.

```ts
export default class PostTransformer extends BaseTransformer<Post> {
  toObject() {
    return {
      ...this.pick(this.resource, ['id', 'title', 'createdAt']),
      author: UserTransformer.transform(this.resource.author),
    }
  }

  async forDetailedView() {
    return {
      ...this.toObject(),
      content: await markdownToHtml(this.resource.content),
    }
  }
}
```

```ts
return serialize(PostTransformer.transform(post).useVariant('forDetailedView'))
```

Build variants on top of `this.toObject()` so shared fields stay in one place. Variant methods may be async.

## Paginate Through the Transformer

```ts
const posts = await Post.query().preload('author').paginate(page, 20)

return serialize(
  PostTransformer.paginate(posts.all(), posts.getMeta())
)
```

This yields `{ data: [...], metadata: { total, perPage, currentPage, lastPage, ... } }`.

## Consume the Generated Types on the Frontend

```ts
import { Data } from '~/generated/data'

type Post = Data.Post
```

Never import models, services, or other backend code into frontend code — the generated types are the contract. Commit `.adonisjs/` so CI and production builds can resolve it.

## Injection Support

Transformers support **method injection only** — not constructor injection. Resolve dependencies in a variant method's parameters, or compute the value in the controller and pass it in.
