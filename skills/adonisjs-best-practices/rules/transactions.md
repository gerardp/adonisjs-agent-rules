# Transaction Best Practices

Any operation that writes to more than one table — or writes and then depends on that write — needs a transaction. Without one, a mid-sequence failure leaves the database in a state no code path expects.

## Prefer Managed Transactions

`db.transaction()` with a callback commits on success and rolls back on any thrown error. There is no way to leak a connection by forgetting a branch.

```ts
import db from '@adonisjs/lucid/services/db'

const post = await db.transaction(async (trx) => {
  const post = new Post()
  post.title = payload.title
  post.content = payload.content
  post.useTransaction(trx)
  await post.save()

  user.useTransaction(trx)
  user.postCount = user.postCount + 1
  await user.save()

  return post
})
```

The callback's return value becomes the transaction's resolved value.

## Every Query Inside Must Use the Transaction

This is the failure that looks like it works. A query that doesn't receive `trx` runs on a different connection — outside the transaction — so it neither sees uncommitted rows nor rolls back with them.

Incorrect:
```ts
await db.transaction(async (trx) => {
  const post = new Post()
  post.useTransaction(trx)
  await post.save()

  await AuditLog.create({ postId: post.id })   // not in the transaction
})
```

Correct — thread `trx` through every write:
```ts
await db.transaction(async (trx) => {
  const post = new Post()
  post.useTransaction(trx)
  await post.save()

  const log = new AuditLog()
  log.postId = post.id
  log.useTransaction(trx)
  await log.save()
})
```

The mechanisms:

```ts
model.useTransaction(trx)                         // model instances
await trx.table('users').insert({ ... })          // query builder on trx
await db.query({ client: trx }).from('users')     // explicit client
await user.related('posts').query().useTransaction(trx)
```

When a service method may be called inside a transaction, accept an optional `trx` parameter and pass it down rather than opening a second one.

## Use Manual Transactions Only When Control Flow Demands It

If you do, `commit()` and `rollback()` must cover every path — an unresolved transaction holds its connection until the pool times out.

```ts
const trx = await db.transaction()

try {
  await trx.table('users').insert({ email })
  await trx.commit()
} catch (error) {
  await trx.rollback()
  throw error
}
```

Rethrow after rolling back. Swallowing the error there reports success for work that was undone.

## Keep Slow Work Out of Transactions

Open transactions hold locks. HTTP calls, mail delivery, and file uploads inside one stretch that window to the length of a third party's response — and if the request fails after committing, you have sent mail for a record that no longer exists.

Incorrect:
```ts
await db.transaction(async (trx) => {
  const order = await createOrder(trx)
  await paymentGateway.charge(order.total)    // network call holding locks
  await mail.send(new OrderConfirmation(order))
})
```

Correct — commit, then do the rest, ideally in a job:
```ts
const order = await db.transaction(async (trx) => {
  return createOrder(trx)
})

await SendOrderConfirmation.dispatch({ orderId: order.id })
```

For payment-style flows, record intent inside the transaction and reconcile the external call afterwards, so a failure is recoverable rather than invisible.

Note that dispatching a job *inside* a transaction has the mirror-image bug: a worker can pick the job up before the transaction commits and find no row. Dispatch after commit.

## Set Isolation Levels When Correctness Depends on Them

The default is the database's, usually `read committed`. Read-then-write sequences that must not interleave need something stronger:

```ts
await db.transaction(
  async (trx) => { /* ... */ },
  { isolationLevel: 'serializable' }
)
```

Available: `read uncommitted`, `read committed`, `snapshot`, `repeatable read`, `serializable`. Stricter levels mean more serialization failures — code that uses them needs a retry path.

For a single contended row, a lock is simpler than an isolation level:

```ts
const account = await Account.query({ client: trx })
  .where('id', id)
  .forUpdate()
  .firstOrFail()
```

Always acquire multiple locks in a consistent order — inconsistent ordering is how deadlocks happen.

## Savepoints for Partial Rollback

Calling `.transaction()` on a transaction creates a savepoint, letting an inner step fail without discarding the outer work:

```ts
const trx = await db.transaction()
const savepoint = await trx.transaction()

try {
  await savepoint.table('audit_logs').insert({ action: 'login' })
  await savepoint.commit()
} catch {
  await savepoint.rollback()   // outer trx survives
}

await trx.commit()
```

## Keep Transactions Short and Non-Interactive

Never wait on user input, a queue, or a lock you don't control inside a transaction. Do the reads and computation first, then open the transaction for the writes alone.

## Testing

Wrap each test in a global transaction so changes roll back automatically:

```ts
group.each.setup(() => testUtils.db().withGlobalTransaction())
```

This does not compose with code under test that manages its own transactions — use `testUtils.db().truncate()` for those. See [`testing.md`](testing.md).
