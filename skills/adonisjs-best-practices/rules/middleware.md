# Middleware Best Practices

Middleware live in `app/middleware`, named `<name>_middleware.ts`. Generate them:

```bash
node ace make:middleware log_requests
```

## Pick the Right Stack

Choosing wrongly is the most common middleware mistake — it either runs far more often than intended or not at all. All three are wired in `start/kernel.ts`.

| Stack | Registered with | Runs | Use for |
| --- | --- | --- | --- |
| **Server** | `server.use([...])` | Every request, **even when no route matches** | CORS, security headers, request logging |
| **Router** | `router.use([...])` | Only when a route matches, before named middleware | Body parsing, shared context data |
| **Named** | `router.named({...})` | Only where explicitly applied | Auth, authorization, rate limits, feature flags |

```ts title="start/kernel.ts"
import router from '@adonisjs/core/services/router'
import server from '@adonisjs/core/services/server'

server.use([
  () => import('#middleware/log_requests_middleware'),
  () => import('#middleware/container_bindings_middleware'),
])

router.use([
  () => import('@adonisjs/core/bodyparser_middleware'),
])

export const middleware = router.named({
  auth: () => import('#middleware/auth_middleware'),
  authorize: () => import('#middleware/authorize_request_middleware'),
})
```

Export the named collection — that export is what gives routes type-safe autocomplete for middleware names and their options.

Registration order is execution order. Middleware that must measure or wrap everything else goes first.

## Default to Named

Anything that can reject a request should be opt-in. A global auth middleware that exempts paths by string matching is fragile — one new public route and you have either a leak or a lockout.

Incorrect:
```ts
async handle(ctx: HttpContext, next: NextFn) {
  const publicPaths = ['/login', '/register', '/health']
  if (!publicPaths.includes(ctx.request.url())) {
    await ctx.auth.authenticate()
  }
  await next()
}
```

Correct — protect explicitly, with a group so it is applied once:
```ts
router.group(() => {
  router.resource('posts', controllers.Posts)
}).use(middleware.auth())
```

## Always `await next()`

Forgetting to await breaks the upstream half of the pipeline: response mutations get lost and errors surface as unhandled rejections rather than proper responses.

```ts
export default class LogRequestsMiddleware {
  async handle({ request, response, logger }: HttpContext, next: NextFn) {
    const startTime = process.hrtime()

    await next()          // everything downstream completes here

    const endTime = process.hrtime(startTime)
    logger.info(
      `${request.method()} ${request.url()}: ${response.getStatus()} (${string.prettyHrTime(endTime)})`
    )
  }
}
```

Code before `await next()` runs downstream (request inbound); code after runs upstream (response outbound). To short-circuit, return without calling `next()`.

## Type the Options Parameter

Named middleware take options as a third argument. A union type makes invalid combinations unrepresentable and drives autocomplete at the call site.

```ts title="app/middleware/authorize_request_middleware.ts"
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

type AuthorizationOptions =
  | { permissions: string[] }
  | { role: string }

export default class AuthorizeRequestMiddleware {
  async handle(
    { auth, response }: HttpContext,
    next: NextFn,
    options: AuthorizationOptions
  ) {
    const user = auth.getUserOrFail()

    if ('role' in options && user.role !== options.role) {
      return response.unauthorized('Not authorized to access this route')
    }

    await next()
  }
}
```

```ts
router.get('/admin/reports', handler).use(middleware.authorize({ role: 'admin' }))
```

## Keep Middleware Focused

Middleware is a cross-cutting concern layer, not a place for business logic. If it queries several tables, applies domain rules, or writes records, that belongs in a service the controller calls.

A reasonable middleware: authenticates, sets a header, starts a trace span, enforces a rate limit, resolves a tenant, short-circuits a redirect.

## Prefer Official Packages Over Hand-Rolled Middleware

Reimplementing these gets security details wrong:

| Need | Use |
| --- | --- |
| CORS | `@adonisjs/cors` |
| CSRF, CSP, HSTS | `@adonisjs/shield` |
| Rate limiting | `@adonisjs/limiter` |
| Static files | `@adonisjs/static` |

## Middleware Support Constructor Injection Only

```ts
@inject()
export default class TenantMiddleware {
  constructor(protected tenants: TenantService) {}
}
```

Method injection is **not** available on middleware — the `handle` signature is fixed. See [`services-di.md`](services-di.md).

## Augmenting HttpContext

When middleware attaches a property to the context, declare it so downstream code is typed:

```ts
declare module '@adonisjs/core/http' {
  export interface HttpContext {
    tenant: Tenant
  }
}
```

Use this sparingly. Every added property is global surface area that every future reader must learn.
