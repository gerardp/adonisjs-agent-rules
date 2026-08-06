# Lucid Model Best Practices

Lucid is an Active Record ORM built on Knex. Models live in `app/models`, singular and snake_case (`app/models/post.ts` exporting `Post`).

```bash
node ace make:model Post
```

## Extend the Generated Schema Class

Lucid 22 is migrations-first. After `node ace migration:run`, Lucid inspects the database and regenerates `database/schema.ts` with a typed schema class per table — snake_case columns become camelCase properties, timestamps become Luxon `DateTime`.

```ts title="app/models/post.ts"
import { PostsSchema } from '#database/schema'

export default class Post extends PostsSchema {
  // Columns are inherited. Relationships, hooks, and methods go here.
}
```

**Never edit `database/schema.ts`** — every migration run overwrites it. To change a column, write a migration. To change how a column is *typed*, use `database/schema_rules.ts`:

```ts title="database/schema_rules.ts"
import { type SchemaRules } from '@adonisjs/lucid/types/schema_generator'

export default {
  tables: {
    users: {
      columns: {
        user_role: {
          decorators: [{ name: '@column' }],
          tsType: `'admin' | 'editor'`,   // union instead of bare string
        },
      },
    },
  },
} satisfies SchemaRules
```

Some official guides (the auth pages, the transformers page) still show columns declared by hand on `BaseModel`. That is legacy sample code carried over from Lucid 21 — extend the generated schema class instead, and don't rewrite a model back to `BaseModel` after reading one of those pages.

## Override Columns in the Model, Not the Schema

To change serialization or casting for one column, redeclare it in your model — your class wins over the inherited schema class and survives regeneration.

```ts title="app/models/user.ts"
import { UsersSchema } from '#database/schema'
import { column } from '@adonisjs/lucid/orm'

export default class User extends UsersSchema {
  @column({ serializeAs: null })         // never appears in JSON
  declare password: string
}
```

## Treat JSON Conversion as Driver-Specific

`table.json()` and `table.jsonb()` define database storage; they do not promise
that every driver will bind JavaScript objects or return the same runtime shape.
Generated JSON columns are typed as `any`, so narrow the type in the model and
add `prepare` or `consume` only when the configured driver needs them:

```ts title="app/models/user.ts"
import { UsersSchema } from '#database/schema'
import { column } from '@adonisjs/lucid/orm'

type Settings = {
  theme: 'light' | 'dark'
  notifications: boolean
}

export default class User extends UsersSchema {
  @column({
    prepare: (value: Settings | string | null) =>
      value === null || typeof value === 'string' ? value : JSON.stringify(value),
    consume: (value: Settings | string | null) =>
      typeof value === 'string' ? (JSON.parse(value) as Settings) : value,
  })
  declare settings: Settings | null
}
```

Do not add these transforms reflexively. For example, `mysql2` returns JSON as
JavaScript values unless `jsonStrings` is enabled. Verify the application's
driver and connection options first.

`prepare` runs when Lucid saves a model instance. Bulk writes through
`Model.query().update()` and direct writes through `db.from(...).update()` do
not run model column transforms; pass the driver-ready value yourself, or load
the model and use `merge(...).save()` when the transform must apply.

## Declare Relationships With Their Types

The `declare` keyword and the relation type are both required for type inference.

```ts title="app/models/user.ts"
import { UsersSchema } from '#database/schema'
import { hasMany } from '@adonisjs/lucid/orm'
import Post from '#models/post'
import type { HasMany } from '@adonisjs/lucid/types/relations'

export default class User extends UsersSchema {
  @hasMany(() => Post)
  declare posts: HasMany<typeof Post>
}
```

```ts title="app/models/post.ts"
import { belongsTo } from '@adonisjs/lucid/orm'
import User from '#models/user'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class Post extends PostsSchema {
  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
```

Model classes are imported as **values** (the lazy `() => Post` avoids circular-import problems); relation *types* are imported with `import type`.

Many-to-many with pivot data:

```ts
@manyToMany(() => Team, {
  pivotColumns: ['role', 'joined_at'],
})
declare teams: ManyToMany<typeof Team>
```

```ts
await user.related('teams').attach({ 1: { role: 'admin' } })
await user.related('teams').sync([1, 2, 3])   // detaches everything else
```

## Keep Hooks Idempotent and Cheap

Hooks are static methods with decorators. Guard on `$dirty` so re-saving doesn't redo work — hashing an already-hashed password is the classic bug.

```ts title="app/models/user.ts"
import { beforeSave } from '@adonisjs/lucid/orm'
import hash from '@adonisjs/core/services/hash'

export default class User extends UsersSchema {
  @beforeSave()
  static async hashPassword(user: User) {
    if (user.$dirty.password) {
      user.password = await hash.make(user.password)
    }
  }
}
```

Available: `@beforeSave`, `@beforeCreate`, `@beforeUpdate`, `@beforeDelete` and their `after` counterparts, plus `@beforeFind`, `@afterFind`, `@beforeFetch`, `@afterFetch`.

**Query builder writes bypass hooks entirely.** This is deliberate — bulk updates shouldn't pay per-row costs — but it surprises people:

```ts
await Post.query().where('id', 1).update({ title: 'New' })
// No hooks. No automatic updatedAt.
```

When hooks must run, fetch the instance, mutate, and `save()`.

Keep side effects out of hooks. Sending mail from `@afterCreate` means every test and seeder sends mail; dispatch from the service that owns the use case instead.

## Prefer Explicit Query Scopes Over Global Filtering

A `@beforeFind` that filters rows silently changes every query in the app — including admin screens, exports, and background jobs — and is invisible at the call site.

Prefer a static method you opt into:

```ts title="app/models/post.ts"
export default class Post extends PostsSchema {
  static published() {
    return this.query().where('status', 'published')
  }
}
```

```ts
await Post.published().orderBy('published_at', 'desc')
await Post.query()                      // admin sees everything, explicitly
```

Lucid also ships a `scope()` helper for composable named scopes — see the [Lucid model scopes docs](https://lucid.adonisjs.com/docs/model-query-scopes).

## Use the Right CRUD Method

```ts
await Post.create(payload)
await Post.createMany([...])                       // batched insert
await Post.findOrFail(id)                          // throws → 404 automatically
await Post.findByOrFail('slug', slug)
await Post.firstOrCreate({ email }, { name })      // idempotent
await Post.updateOrCreate({ externalId }, payload) // upsert — use for imports/webhooks
await post.merge(payload).save()
await post.delete()
```

`findOrFail` over `find` + manual null check: the exception already maps to a 404.

## Don't Hardcode Table Names

Prefer models and relationships over `db.from('posts')`. When you must drop to the query builder, reach for the model's table so renames stay traceable:

```ts
db.from(Post.table)
```

**Exception — migrations.** Migrations are frozen snapshots of history; a model they reference may be renamed or deleted later. Hardcode table names there.

## Serialization

Model output is driven by column options:

```ts
@column({ serializeAs: null })       // omit entirely
@column({ serializeAs: 'firstName' })// rename in JSON
```

For anything a client consumes, prefer a transformer over ad-hoc `serialize()` calls — it makes the response shape explicit and generates matching frontend types. See [`transformers.md`](transformers.md).

## Factories Need `.build()`

```ts title="database/factories/post_factory.ts"
import Post from '#models/post'
import Factory from '@adonisjs/lucid/factories'

export const PostFactory = Factory.define(Post, ({ faker }) => {
  return {
    title: faker.lorem.sentence(),
    content: faker.lorem.paragraphs(3),
    status: 'draft',
  }
})
  .state('published', (post) => {
    post.status = 'published'
    post.publishedAt = new Date()
  })
  .build()
```

Forgetting the trailing `.build()` is a common error. Usage:

```ts
await PostFactory.create()
await PostFactory.createMany(10)
await PostFactory.merge({ status: 'published' }).create()
await PostFactory.apply('published').createMany(5)
```

Define a state for every meaningful variation instead of repeating `.merge()` at call sites.
