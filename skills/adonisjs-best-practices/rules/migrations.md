# Migration Best Practices

Migrations live in `database/migrations` with timestamp-prefixed filenames that determine run order.

```bash
node ace make:migration posts
node ace migration:run
```

In Lucid 22, `migration:run` also **regenerates `database/schema.ts`** — migrations are the source of truth for your model types, so the schema file follows automatically. Never hand-edit it.

## Commands

| Command | Effect |
| --- | --- |
| `migration:run` | Apply pending migrations; regenerate schema classes |
| `migration:status` | List every migration and its state |
| `migration:rollback` | Revert the last batch (`--step=N`, `--batch=N`) |
| `migration:reset` | Roll back everything (`rollback --batch=0`) |
| `migration:refresh` | Roll back all, then re-run (`--seed`) |
| `migration:fresh` | Drop all tables, then re-run (`--seed`) |

Useful flags: `--dry-run` prints SQL without executing, `--connection=name` targets a specific connection.

Preview before applying anything you are unsure about:

```bash
node ace migration:run --dry-run
```

## Always Write a Working `down`

`down` must reverse `up` exactly. A migration you cannot roll back is one you cannot safely deploy.

```ts title="database/migrations/1705234567890_create_posts_table.ts"
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'posts'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('title').notNullable()
      table.text('content').notNullable()
      table.string('status').notNullable().defaultTo('draft')
      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
```

For `alterTable`, reverse each operation:

```ts
async up() {
  this.schema.alterTable('users', (table) => {
    table.string('first_name')
    table.dropColumn('name')
  })
}

async down() {
  this.schema.alterTable('users', (table) => {
    table.string('name')
    table.dropColumn('first_name')
  })
}
```

Rolling back a dropped column cannot restore its data. When a migration is destructive, say so in a comment and make sure a backup or backfill exists.

## Omit Redundant Nullability Modifiers Carefully

New columns are normally nullable by default. Omit `.nullable()` and use
`.notNullable()` only when `NULL` is invalid:

```ts
table.timestamp('created_at')
table.timestamp('updated_at')
table.boolean('active').notNullable().defaultTo(true)
```

`defaultTo()` does not imply `NOT NULL`; a caller can still insert `NULL`
explicitly. When changing an existing column's constraint, use `setNullable`
or `dropNullable` so the alteration is explicit.

MySQL has a legacy exception for `TIMESTAMP`. When
`explicit_defaults_for_timestamp` is `OFF`, a `TIMESTAMP` without an explicit
`NULL` attribute becomes `NOT NULL`; the first one may also receive implicit
`DEFAULT CURRENT_TIMESTAMP` and `ON UPDATE CURRENT_TIMESTAMP` attributes. The
variable defaults to `ON` in MySQL 8, but can still be disabled. Before removing
`.nullable()` from optional timestamps, verify every target server; otherwise,
keep the modifier for those columns.

## Treat Applied Migrations as Immutable

Once a migration has run anywhere but your own machine, editing it is a broken deploy waiting to happen — your database has the old shape recorded as "done" and will never re-run it. Write a new migration instead.

## Never Import Models Into Migrations

Migrations are frozen historical snapshots; models change. A migration referencing a model that is later renamed, given a new hook, or deleted will break when replayed on a fresh database.

Incorrect:
```ts
import User from '#models/user'

async up() {
  const users = await User.all()          // today's model against an old schema
  for (const user of users) { /* ... */ }
}
```

Correct — use the query builder with literal table names:
```ts
async up() {
  this.schema.alterTable('users', (table) => {
    table.string('slug')
  })

  this.defer(async (db) => {
    await db.from('users').update({ slug: db.raw("lower(replace(full_name, ' ', '-'))") })
  })
}
```

`this.defer()` receives the query client and runs only when migrations actually execute, so deferred work is correctly skipped by `--dry-run`.

## Separate Schema Changes From Data Backfills

A schema change is fast and locks briefly; a backfill over millions of rows does not. Combining them holds locks for the length of the backfill.

Do it in three deploys for large tables:

1. Add the column as nullable.
2. Backfill in batches (a command or job, not a migration).
3. Add the `NOT NULL` constraint once the data is complete.

## Declare Foreign Keys and Their Delete Behavior

For single-column foreign keys, prefer the qualified shorthand
`.references('table.column')`. It is equivalent to
`.references('column').inTable('table')`:

```ts
table
  .integer('user_id')
  .unsigned()
  .references('users.id')
  .onDelete('CASCADE')
```

The foreign-key column must match the referenced key's database type and
signedness. Pair `increments('id')` with `integer(...).unsigned()` and
`bigIncrements('id')` with `bigInteger(...).unsigned()`:

```ts
// users.id uses table.increments('id')
table.integer('user_id').unsigned().references('users.id')

// accounts.id uses table.bigIncrements('id')
table.bigInteger('account_id').unsigned().references('accounts.id')
```

Choose `onDelete` deliberately: `CASCADE` removes children, `SET NULL` orphans them, `RESTRICT` blocks the parent delete. The default varies by database — be explicit.

Do not add a duplicate index blindly. MySQL/InnoDB automatically creates a
suitable index on the referencing columns when none exists. PostgreSQL does
not, so add one there when the relationship's joins, parent updates, or parent
deletes warrant it.

## Index Alongside the Columns You Add

```ts
table.index(['status', 'created_at'])
table.unique(['team_id', 'slug'])
```

Composite index column order matters — it serves queries that filter on a prefix of the columns. On large production tables, build indexes concurrently (PostgreSQL: `CREATE INDEX CONCURRENTLY`, which requires `static disableTransactions = true`).

## Understand Transaction Limits

Lucid wraps each migration file in a transaction by default. That only provides
an atomic rollback for statements the database can transact. MySQL implicitly
commits many DDL statements, including `CREATE TABLE`, `ALTER TABLE`, and
`CREATE INDEX`, so a failed schema migration can leave earlier changes applied.

Opt out when a statement cannot run inside a transaction, such as PostgreSQL's
`CREATE INDEX CONCURRENTLY`:

```ts
export default class extends BaseSchema {
  static disableTransactions = true
}
```

With transactions disabled, a mid-migration failure can also leave partial
changes. Keep these migrations focused. After any MySQL DDL failure, inspect the
actual schema before retrying or repairing the migration.

## Choose Column Types Deliberately

- Money: integer minor units or `decimal`, never `float`.
- Timestamps: `timestamp` with timezone; let `autoCreate` / `autoUpdate` manage `created_at` / `updated_at`.
- Enums: a `string` plus a check constraint, or a `tsType` union in `database/schema_rules.ts`, is easier to evolve than a native enum.
- JSON: `table.json()` / `table.jsonb()` define storage only; driver-specific model transforms belong in a model override. See [`lucid-models.md`](lucid-models.md).
- Text: prefer `text` over guessing a `varchar` length you will regret.

## Seeders Are for Reference Data

`node ace make:seeder`, run with `node ace db:seed`. Seeders should be idempotent — use `updateOrCreate` so re-running is safe. Use factories for test data, not seeders. See [`testing.md`](testing.md).
