# Queues & Background Jobs

> **`@adonisjs/queue` is experimental.** Its API may change between minor releases. Pin the exact version in `package.json` and re-read the [official guide](https://docs.adonisjs.com/guides/digging_deeper/queues.md) before relying on details here.

```bash
node ace add @adonisjs/queue
node ace make:job process_payment
```

## Move Slow and Failure-Prone Work Off the Request

Anything the user does not need to wait for — email, webhooks, image processing, report generation, third-party API calls — belongs in a job. It keeps responses fast and gives the work a retry policy instead of a 500.

## Job Anatomy

```ts title="app/jobs/process_payment.ts"
import { Job } from '@adonisjs/queue'
import type { JobOptions } from '@adonisjs/queue/types'

interface ProcessPaymentPayload {
  orderId: number
  amount: number
  currency: string
}

export default class ProcessPayment extends Job<ProcessPaymentPayload> {
  static options: JobOptions = {
    queue: 'payments',
    maxRetries: 3,
    timeout: '30s',
  }

  async execute() {
    // this.payload is typed as ProcessPaymentPayload
  }
}
```

Dispatch from anywhere; the payload is type-checked against the generic:

```ts
await ProcessPayment.dispatch({ orderId: order.id, amount: 5000, currency: 'eur' })
```

Fluent modifiers:

```ts
await ProcessPayment.dispatch(payload).toQueue('payments')
await ProcessPayment.dispatch(payload).priority(1)      // 1–10, lower runs first
await SendReminder.dispatch(payload).in('24h')
await GenerateReport.dispatch(payload).group('monthly-reports-2025')
await ProcessPayment.dispatch(payload).with('redis')
```

## Pass IDs, Not Objects

Payloads are serialized to JSON. A model instance loses its class, and by the time the worker runs, the row may have changed.

Incorrect:
```ts
await SendInvoice.dispatch({ order })     // stale snapshot, bloated payload
```

Correct:
```ts
await SendInvoice.dispatch({ orderId: order.id })
```

Reload inside `execute()`. Keep payloads small and free of secrets — they are stored in Redis or a database table and often appear in dashboards.

## Dispatch After the Transaction Commits

A worker can pick up a job the instant it is enqueued — including before the surrounding transaction commits, at which point the row it needs does not exist.

Incorrect:
```ts
await db.transaction(async (trx) => {
  const order = new Order()
  order.useTransaction(trx)
  await order.save()

  await ProcessPayment.dispatch({ orderId: order.id })   // may run too early
})
```

Correct:
```ts
const order = await db.transaction(async (trx) => {
  const order = new Order()
  order.useTransaction(trx)
  await order.save()
  return order
})

await ProcessPayment.dispatch({ orderId: order.id })
```

See [`transactions.md`](transactions.md).

## Make Jobs Idempotent

A retried job runs a second time. If `execute()` charges a card or sends mail without a guard, retries duplicate the side effect.

```ts
async execute() {
  const order = await Order.findOrFail(this.payload.orderId)
  if (order.status === 'paid') {
    return                              // already done — safe to re-run
  }
  // ...
}
```

Use an idempotency key with external APIs, and `dedup` to stop duplicate enqueues from HTTP retries or double-clicks:

```ts
await ProcessPayment.dispatch(payload).dedup(`order-${order.id}`)
```

## Configure Retries Deliberately

`maxRetries` defaults to `0` — a job that fails once is simply gone unless you set it. Use exponential backoff for anything network-bound so retries don't hammer a struggling dependency.

Distinguish the two failure kinds: a network timeout should retry, a malformed payload should not. Retrying a permanent failure just burns the retry budget.

## Handle Timeouts Cooperatively

`timeout` does not forcibly kill your code. For long loops, check the abort signal so the job can stop between units of work:

```ts
async execute() {
  for (const rowId of this.payload.rows) {
    if (this.signal?.aborted) {
      throw new Error('Job timed out during report generation')
    }
    await this.processRow(rowId)
  }
}
```

`failOnTimeout: false` sends timed-out jobs back through the retry policy instead of failing permanently.

## Use Dependency Injection

Jobs are built by the IoC container:

```ts
@inject()
export default class ProcessPayment extends Job<ProcessPaymentPayload> {
  constructor(protected payments: PaymentService) {
    super()
  }
}
```

Keep the job thin — parse the payload, call a service, record the outcome. That keeps the logic testable without a queue.

## Job Context

```ts
this.context.jobId
this.context.attempt      // useful for logging and last-attempt behavior
this.context.queue
```

## Separate Queues by Latency, Not by Feature

A `default` queue holding both password-reset emails and nightly report generation means users wait behind reports. Split by how quickly work must start — `emails`, `reports`, `payments` — and size worker concurrency per queue.

```bash
node ace queue:work --queues=emails --concurrency=10
```

## Workers Are Separate Processes

The web process does not run jobs. Deployment needs a worker process, a restart on deploy so it picks up new code, and monitoring — a silently dead worker looks exactly like an idle one.

The `sync` adapter runs jobs inline; use it in development and tests, never in production.

## Scheduling

Recurring work is declared in `start/scheduler.ts` with cron expressions or intervals. Keep scheduled entries thin — dispatch a job rather than doing the work in the schedule definition, so it gets the same retry and observability treatment.

## Testing

`QueueManager.fake()` swaps every adapter for an in-memory recorder, so you assert on dispatching without processing anything:

```ts title="tests/functional/orders.spec.ts"
import { QueueManager } from '@adonisjs/queue'
import ProcessPayment from '#jobs/process_payment'

test.group('Orders', (group) => {
  group.each.teardown(() => QueueManager.restore())

  test('dispatches a payment job when creating an order', async ({ client }) => {
    const fake = QueueManager.fake()

    await client.visit('orders.store').json({ productId: 1, quantity: 2 })

    fake.assertPushed(ProcessPayment)
    fake.assertPushed(ProcessPayment, {
      payload: { orderId: 1, amount: 100, currency: 'USD' },
    })
  })
})
```

`assertNotPushed` covers the negative case — proving free orders skip payment is as valuable as proving paid ones don't. Always `QueueManager.restore()` in teardown.

Test the job's `execute()` separately as a plain class — construct it through the container and call it directly, with no queue involved. See [`testing.md`](testing.md).
