# Architecture Best Practices

## Know Where Logic Belongs

AdonisJS gives every kind of logic a home. Most "where should this go?" questions have a conventional answer:

| Concern | Home |
| --- | --- |
| HTTP shape: parse, authorize, delegate, respond | Controller |
| Input rules and coercion | VineJS validator |
| Persistence, relationships, row-level behavior | Lucid model |
| Permission rules | Bouncer policy / ability |
| Cross-cutting request concerns | Middleware |
| Response shape and frontend types | Transformer |
| Multi-step domain operations, external systems | Service |
| Deferred or slow work | Job |
| Operational tasks | Ace command |
| Boot-time wiring | Provider |

When something feels awkward, it is usually in the wrong layer — an ownership check inlined in a controller, a mailer called from a model hook, config read inside a service.

## Fat Models, Thin Controllers — Within Reason

Controllers coordinate; they don't compute. But "fat model" has a limit: a model that sends email, calls payment APIs, and renders PDFs has become the application. Models own **data and its immediate behavior** — relationships, casts, computed properties, query scopes.

Multi-step operations spanning several models and external systems belong in a service:

```ts title="app/services/order_service.ts"
export class OrderService {
  async place(user: User, items: CartItem[]) {
    const order = await db.transaction(async (trx) => {
      // create order, decrement stock, record payment intent
    })

    await SendOrderConfirmation.dispatch({ orderId: order.id })
    return order
  }
}
```

## Don't Abstract Speculatively

Extract when it earns its place:

- Real duplication across two or more call sites — not two lines that happen to look alike
- A genuine domain boundary ("place order")
- Something that becomes independently testable
- An external system worth isolating behind a seam

Do not create a service that only forwards to a model:

```ts
export class PostService {
  async create(data: CreatePostData) {
    return Post.create(data)      // a file, an import, and no benefit
  }
}
```

Call `Post.create()` from the controller. Lucid models are already the data layer; wrapping them adds indirection without a boundary. Add the service when the operation grows a second step.

## Keep Layers Pointing One Way

Controllers → services → models. Never the reverse.

A model that imports a controller, or a service that takes `HttpContext`, has coupled your domain to HTTP — and the first time you need that logic in a job or command, you rewrite it. Pass the data the logic needs:

```ts
// Incorrect
export class ReportService {
  constructor(protected ctx: HttpContext) {}
}

// Correct
export class ReportService {
  async generate(user: User, filters: ReportFilters) {}
}
```

## One Entry Point, Many Callers

The same operation is often reachable from HTTP, a queue worker, a command, and a test. Put it in a service so all four share a path. A rule implemented in a controller is a rule the job doesn't have.

## Prefer Framework Features Over New Dependencies

Before adding a package, check whether AdonisJS ships it: cache, drive, mail, events, locks, health checks, i18n, rate limiting, logging, OpenTelemetry. First-party packages integrate with the container, config, and test fakes. Don't change dependencies without approval.

## Choose Events Deliberately

The emitter decouples a trigger from its reactions — good for genuinely optional side effects (analytics, audit trails, cache warming).

It is a poor fit when the reaction is part of the operation's contract. Control flow scattered across listeners is hard to follow and easy to break, and a listener that must succeed should be an awaited call, not a fire-and-forget event.

Rule of thumb: if failure should fail the operation, call it directly. If it can be dropped or retried independently, emit an event or dispatch a job.

## Design Around Failure

Every network call fails eventually. Decide per operation what happens then: retry with backoff (jobs), degrade gracefully (cache miss), or fail loudly (payment capture). What must not happen is silence — see [`error-handling.md`](error-handling.md).

Keep external calls out of transactions and dispatch jobs after commit. See [`transactions.md`](transactions.md).

## Let the Database Enforce Invariants

Application checks race; constraints don't. A uniqueness validator is the friendly message, but the unique index is the guarantee — two simultaneous requests can both pass validation and only the constraint stops the duplicate. Use foreign keys, `NOT NULL`, and check constraints as the backstop. See [`migrations.md`](migrations.md).

## Consistency Beats Theoretical Purity

Match what the codebase already does. If controllers call models directly throughout, don't introduce a service layer in one corner. If validators live one-file-per-resource, don't start a new convention. A second pattern for the same job costs more than the first pattern's imperfection.

Refactor toward a better pattern deliberately and completely, not incidentally while doing something else.
