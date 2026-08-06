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

## Declare Non-Default Tables, Keys, and Connections as Statics

The generator infers `users` from `User`, `id` as the primary key, and the default connection. When one of those is wrong, say so on the model — never by editing the schema class.

```ts title="app/models/user.ts"
export default class User extends UsersSchema {
  static table = 'app_users'
  static primaryKey = 'user_id'
  static connection = 'analytics'
}
```

`static connection` is sticky: every query, relationship, and transaction started from the model uses it. For per-request routing (multi-tenancy), bind a single instance with `user.useConnection(tenant)` instead — it does not change later `User.query()` calls.

UUID and ULID keys need `selfAssignPrimaryKey`. Without it Lucid waits for a database-generated id that never arrives:

```ts title="app/models/post.ts"
import { beforeCreate } from '@adonisjs/lucid/orm'
import { randomUUID } from 'node:crypto'

export default class Post extends PostsSchema {
  static selfAssignPrimaryKey = true

  @beforeCreate()
  static assignId(post: Post) {
    post.id = post.id ?? randomUUID()
  }
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

Keys are inferred from the model names — `Post.userId` points at `users.id`. When a column doesn't follow the convention, name it on the decorator rather than reshaping the schema around the default:

```ts
@belongsTo(() => User, { foreignKey: 'authorId' })
declare author: BelongsTo<typeof User>
```

Many-to-many with pivot data:

```ts
@manyToMany(() => Team, {
  pivotColumns: ['role', 'joined_at'],
  pivotTimestamps: true,
})
declare teams: ManyToMany<typeof Team>
```

Declared pivot columns land on the **related instance** under an `$extras.pivot_` prefix. They are not properties of `Team`, and TypeScript won't catch a typo there:

```ts
await user.load('teams')
user.teams.forEach((team) => console.log(team.name, team.$extras.pivot_role))
```

```ts
await user.related('teams').attach({ 1: { role: 'admin' } })
await user.related('teams').sync([1, 2, 3])                       // detaches everything else
await user.related('teams').sync({ 1: { role: 'admin' } }, false) // attach/update only
```

`attach` does not deduplicate — passing an id that is already linked is a database error, not a no-op. Reach for `sync` when you know the target state, `attach` only when you know the row is absent.

## Put Row-Level Behavior on the Model

Lucid is Active Record: a model owns its data *and* that data's immediate behavior. Derived values are plain TypeScript getters — no decorator, no column:

```ts title="app/models/subscription.ts"
import { DateTime } from 'luxon'

export default class Subscription extends SubscriptionsSchema {
  get isActive() {
    return this.status === 'active' && this.expiresAt > DateTime.now()
  }

  async cancel(reason: string) {
    this.status = 'cancelled'
    this.cancellationReason = reason
    await this.save()
  }
}
```

Lucid still ships a `@computed()` decorator, but its only job is injecting a getter into `serialize()` output. Response shape belongs in a transformer, so prefer the undecorated getter.

The dividing line is orchestration. A method that touches one row and its relationships belongs on the model; one that charges a card, sends mail, or coordinates several aggregates belongs in a service — see [`architecture.md`](architecture.md).

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

To skip hooks *deliberately* on a single row — seeding, back-filling, a one-off fixup — use the quiet variants rather than dropping to the query builder: `createQuietly`, `createManyQuietly`, `saveQuietly`, `deleteQuietly`. Timestamps and dirty-tracking still apply; only the hooks are suppressed.

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

A static method can't be reused inside a preload callback, though — that callback receives a query builder, not the model. When the same filter is needed in both places, define it once with the `scope()` helper:

```ts title="app/models/post.ts"
import { scope } from '@adonisjs/lucid/orm'

export default class Post extends PostsSchema {
  static published = scope((query) => {
    query.where('status', 'published')
  })
}
```

```ts
await Post.query().withScopes((scopes) => scopes.published())

await User.query().preload('posts', (posts) => {
  posts.withScopes((scopes) => scopes.published())   // same filter, one definition
})
```

Scopes accept arguments (`scope((query, user: User) => …)`), and `apply()` is an alias for `withScopes()`. Either way the caller opts in — that is the property worth protecting.

## Use the Right CRUD Method

```ts
await Post.create(payload)
await Post.createMany([...])                       // batched insert
await Post.findOrFail(id)                          // throws → 404 automatically
await Post.findByOrFail('slug', slug)
await Post.firstOrCreate({ email }, { name })      // idempotent
await Post.updateOrCreate({ externalId }, payload) // upsert — use for imports/webhooks
await Post.updateOrCreateMany('externalId', rows)  // batched upsert, one transaction
await post.merge(payload).save()
await post.refresh()                               // re-read database defaults/triggers
await post.delete()
```

`findOrFail` over `find` + manual null check: the exception already maps to a 404.

Three sharp edges:

- **`findMany` doesn't preserve the order of the ids you pass.** Rows come back ordered by primary key. Re-order in JS when order carries meaning.
- **`merge` and `fill` throw on keys that aren't columns.** That's a feature — it catches a renamed column at the boundary. Don't pass `allowExtraProperties: true` to quiet it; hand it a payload that only contains columns.
- **`fill` replaces every attribute**, resetting anything you don't pass. `merge` only touches the keys you supply. Reach for `merge` unless you genuinely want the reset.

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
