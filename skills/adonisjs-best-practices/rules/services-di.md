# Services, Dependency Injection & Application Structure

AdonisJS has a real IoC container. Use it — manually constructing dependencies inside a class is what makes code untestable.

## Extract Services When There Is a Reason

Not every controller needs a service. Extract when the logic:

- Is used by more than one entry point (controller, job, command)
- Represents a domain operation with its own rules ("place order", not "insert row")
- Wraps an external system (payment gateway, S3, search index)
- Needs independent testing without HTTP

Do **not** create a `PostService` that only forwards to `Post.create()`. That indirection costs a file and buys nothing — Lucid models are already the data layer.

Services live in `app/services`, named `<thing>_service.ts`.

```ts title="app/services/avatar_service.ts"
import User from '#models/user'
import { createHash } from 'node:crypto'

export class AvatarService {
  getAvatarFor(user: User) {
    const emailHash = createHash('md5').update(user.email).digest('hex')
    const url = new URL(emailHash, 'https://gravatar.com/avatar/')
    url.searchParams.set('size', '200')
    return url.toString()
  }
}
```

## Inject, Don't Instantiate

Incorrect:
```ts
export default class UsersController {
  async store({ request }: HttpContext) {
    const avatarService = new AvatarService()   // untestable, unswappable
  }
}
```

Correct:
```ts
import { inject } from '@adonisjs/core'
import { AvatarService } from '#services/avatar_service'

@inject()
export default class UsersController {
  constructor(protected avatarService: AvatarService) {}

  async store({ request }: HttpContext) {
    const url = this.avatarService.getAvatarFor(user)
  }
}
```

The `@inject()` decorator is mandatory — without it the container never inspects the constructor.

## The `import type` Pitfall

This is the highest-frequency DI bug, and editors cause it: auto-import often writes `import type` for a class used only in a type position.

`import type` is erased at compile time. The container has nothing to resolve, and the dependency is silently `undefined` — no error until you call a method on it.

Incorrect:
```ts
import type { AvatarService } from '#services/avatar_service'
```

Correct:
```ts
import { AvatarService } from '#services/avatar_service'
```

Rule of thumb: anything injected is a **value** import. Only genuine types (`HttpContext`, `NextFn`, relation types) use `import type`.

## Only Classes Are Injectable

Interfaces and type aliases vanish at runtime, so the container cannot resolve them. For a swappable contract, use an abstract class — it exists at runtime and still gives you a type:

```ts
export abstract class PaymentGateway {
  abstract charge(amount: number): Promise<Receipt>
}
```

Then bind an implementation in a provider:

```ts title="providers/app_provider.ts"
export default class AppProvider {
  register() {
    this.app.container.bind(PaymentGateway, () => new StripeGateway(/* ... */))
  }
}
```

Use `singleton()` instead of `bind()` when one shared instance is correct — connection pools, clients holding sockets. Use `bind()` when per-resolution state matters.

## Know What Supports Which Injection

| Class | Constructor | Method |
| --- | --- | --- |
| Controllers | ✅ | ✅ |
| Middleware | ✅ | ❌ |
| Event listeners | ✅ | ✅ (`handle` only) |
| Bouncer policies | ✅ | ❌ |
| Transformers | ❌ | ✅ |
| Ace commands | ❌ | ✅ (lifecycle methods only) |

Method injection puts the dependency after `HttpContext`:

```ts
export default class UsersController {
  @inject()
  async store({ request }: HttpContext, avatarService: AvatarService) {}
}
```

Prefer it when a single action needs a dependency the rest of the class does not.

## Constructing Your Own Classes

For classes the framework does not build — a job handler, a one-off orchestrator — use the container so their own `@inject()` dependencies resolve:

```ts
import app from '@adonisjs/core/services/app'

const service = await app.container.make(UserService)
```

Never `new` a class that has injected dependencies.

## Don't Inject `HttpContext` Into Long-Lived Services

A service holding a request-scoped context leaks state if it is ever cached or reused, and it becomes unusable from jobs and commands — which is usually where you want that logic next.

Incorrect:
```ts
@inject()
export class ReportService {
  constructor(protected ctx: HttpContext) {}
}
```

Correct — pass what it needs:
```ts
export class ReportService {
  async generate(user: User, filters: ReportFilters) {}
}
```

## Providers Are for Wiring, Not Logic

`providers/` files register bindings and run lifecycle hooks (`register`, `boot`, `start`, `ready`, `shutdown`). Keep business logic out. Note that in v7 shutdown hooks run in **reverse** registration order.

## Container Services vs. Direct Imports

Framework singletons are exposed as importable services:

```ts
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import mail from '@adonisjs/mail/services/main'
```

These are fine to import directly — they resolve through the container under the hood and can be faked in tests. Your *own* dependencies should still be injected.

## Swap Dependencies in Tests

```ts
app.container.swap(PaymentGateway, () => new FakeGateway())
```

Restore with `app.container.restore(PaymentGateway)`. If a class is hard to swap, it usually signals a dependency that was constructed rather than injected.
