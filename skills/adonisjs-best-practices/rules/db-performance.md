# Database Performance Best Practices

## Preload Relationships — Never Query in a Loop

The N+1 problem: one query for the list, then one more per row. It passes tests with 3 records and collapses at 3,000.

Incorrect:
```ts
const posts = await Post.all()
for (const post of posts) {
  const user = await User.find(post.userId)    // one query per post
  console.log(user.email)
}
```

Correct:
```ts
const posts = await Post.query().preload('user')   // two queries, total
posts.forEach((post) => console.log(post.user.email))
```

Preloads nest and accept constraints:

```ts
const posts = await Post.query()
  .preload('user', (query) => query.preload('profile'))
  .preload('comments', (query) => {
    query.where('approved', true).orderBy('created_at', 'desc').limit(5)
  })
```

N+1 also hides in places that don't look like loops:

- **Transformers and serializers** touching a relationship that wasn't preloaded
- **Edge templates** iterating a collection and reading `post.author.name`
- **Jobs** processing a batch fetched without preloads
- **Policies** loading a related record per authorization check

Watch the query log while exercising a page — Lucid pretty-prints SQL in development (`prettyPrintDebugQueries` in `config/database.ts`, or `.debug(true)` per query). A count that scales with row count is the signal.

## Select Only What You Need

`select('*')` drags every column across the wire, including large text and JSON blobs you never read.

```ts
const posts = await Post.query()
  .select('id', 'title', 'published_at')
  .preload('user', (query) => query.select('id', 'full_name'))
```

Be careful: a column you omit is `undefined` at runtime, so make sure nothing downstream — transformer, template, hook — needs it.

## Always Paginate Unbounded Lists

Any endpoint returning "all" of something is a latent outage.

Incorrect:
```ts
return Post.all()
```

Correct:
```ts
const page = request.input('page', 1)
const posts = await Post.query()
  .where('status', 'published')
  .orderBy('created_at', 'desc')      // required for stable pages
  .paginate(page, 20)
```

**Always `orderBy` when paginating.** Without a deterministic order, databases may return rows in any order, so records duplicate across pages or vanish entirely. Order by something unique, or add a tiebreaker (`.orderBy('created_at', 'desc').orderBy('id', 'desc')`).

Cap client-supplied page sizes:

```ts
const limit = Math.min(Number(request.input('limit', 20)), 100)
```

For deep pagination over large tables, offset gets slower the further you go — use cursor pagination instead.

## Aggregate in the Database

Counting or summing in JavaScript means transferring every row to count it.

Incorrect:
```ts
const posts = await user.related('posts').query()
const count = posts.length
```

Correct:
```ts
const user = await User.query()
  .where('id', id)
  .withCount('posts')
  .firstOrFail()

user.$extras.posts_count
```

Use `withAggregate` for sums and averages, and `has` / `whereHas` to filter by relationship existence rather than loading rows to check:

```ts
const activeAuthors = await User.query().has('posts', '>', 5)
```

## Index What You Filter, Join, and Sort On

Every foreign key, and every column in a frequent `where` or `orderBy`, wants an index. Composite indexes are order-sensitive: `['status', 'created_at']` serves `where status = ? order by created_at`, but not a lone `created_at` filter.

```ts
table.index(['status', 'created_at'])
table.unique(['team_id', 'slug'])
```

Indexes cost write throughput and storage — add them for real access patterns, not speculatively. See [`migrations.md`](migrations.md) for adding them safely on large tables.

## Use Bulk Operations for Bulk Work

Incorrect:
```ts
for (const row of rows) {
  await Post.create(row)      // one round trip each
}
```

Correct:
```ts
await Post.createMany(rows)
```

When hooks and timestamps genuinely don't apply, a single query builder statement beats N model saves:

```ts
await Post.query().whereIn('id', ids).update({ status: 'archived' })
```

Remember this skips hooks — see [`lucid-models.md`](lucid-models.md).

## Stream Large Result Sets

Loading a million rows to iterate them will exhaust memory. Page through in chunks or use Knex's streaming interface, and keep transactions off the hot path while doing it.

## Don't Hold a Transaction Open Across Slow Work

HTTP calls, file uploads, and mail delivery inside a transaction hold row locks for the duration. Commit first, then do the slow part — ideally in a job. See [`transactions.md`](transactions.md).
