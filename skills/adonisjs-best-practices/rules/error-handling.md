# Error Handling Best Practices

AdonisJS routes every unhandled error through the global handler at `app/exceptions/handler.ts`. It has two jobs, and they must not be confused:

- `handle()` converts an error into an HTTP response.
- `report()` logs it or ships it to a monitoring service. **Never send a response from `report()`.**

```ts title="app/exceptions/handler.ts"
import app from '@adonisjs/core/services/app'
import { HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import type { StatusPageRange, StatusPageRenderer } from '@adonisjs/core/types/http'

export default class HttpExceptionHandler extends ExceptionHandler {
  protected debug = !app.inProduction
  protected renderStatusPages = app.inProduction

  protected statusPages: Record<StatusPageRange, StatusPageRenderer> = {
    '404': (error, { view }) => view.render('pages/errors/not_found', { error }),
    '500..599': (error, { view }) => view.render('pages/errors/server_error', { error }),
  }

  async handle(error: unknown, ctx: HttpContext) {
    return super.handle(error, ctx)
  }

  async report(error: unknown, ctx: HttpContext) {
    return super.report(error, ctx)
  }
}
```

## Let Errors Bubble

The framework's exceptions already carry the right status codes and respect content negotiation. Catching them locally almost always produces a worse response.

Incorrect:
```ts
try {
  const post = await Post.findOrFail(params.id)
  return post
} catch {
  return response.notFound('Post not found')   // also swallows connection errors as 404
}
```

Correct:
```ts
return Post.findOrFail(params.id)
```

Catch only when you have genuinely different behavior for a *specific* error type — and rethrow anything you did not mean to handle.

## Never Swallow an Error

An empty catch turns a failure into a silent wrong answer.

Incorrect:
```ts
try {
  await sendWelcomeEmail(user)
} catch {}                         // nobody will ever know
```

Correct — degrade deliberately and leave a trace:
```ts
try {
  await sendWelcomeEmail(user)
} catch (error) {
  logger.error({ err: error, userId: user.id }, 'welcome email failed')
}
```

If the operation may fail independently of the request, move it to a job with a retry policy. See [`queues-jobs.md`](queues-jobs.md).

## Branch on Error Type with `instanceof`

```ts
import { errors as vineJSErrors } from '@vinejs/vine'

async handle(error: unknown, ctx: HttpContext) {
  if (error instanceof vineJSErrors.E_VALIDATION_ERROR) {
    ctx.response.status(422).send(error.messages)
    return
  }

  return super.handle(error, ctx)
}
```

Always end with `super.handle(error, ctx)` so unrecognized errors keep their default treatment. Never match on `error.message` strings — they change.

## Create Custom Exceptions for Domain Failures

An exception that carries its own status and code beats returning `null` and reconstructing meaning at every call site.

```ts title="app/exceptions/insufficient_funds_exception.ts"
import { Exception } from '@adonisjs/core/exceptions'

export default class InsufficientFundsException extends Exception {
  static status = 422
  static code = 'E_INSUFFICIENT_FUNDS'
}
```

```ts
throw new InsufficientFundsException('Balance too low for this transfer')
```

Generate one with `node ace make:exception insufficient_funds`. Exceptions can also define their own `handle()` and `report()` methods, keeping presentation next to the failure instead of accumulating branches in the global handler.

## Keep `debug` Off in Production

`protected debug = !app.inProduction` is the correct default — leave it alone. In development it renders Youch's interactive stack traces; in production those pages would expose source, environment values, and internal structure.

Enable `renderStatusPages` in production so users see a branded page rather than raw text. JSON clients bypass status pages entirely in v7 and always receive JSON.

## Log With Structure and Context

```ts
logger.error({ err: error, orderId: order.id, userId: user.id }, 'order capture failed')
```

Structured fields are searchable; interpolated strings are not. Never log passwords, tokens, API keys, or full request bodies — see [`security.md`](security.md).

## Report Selectively

Not every exception deserves a page. 404s and validation failures are normal traffic; alerting on them trains people to ignore alerts. Filter them in `report()` and let genuine faults through.

## Never Leak Internals in Messages

Incorrect:
```ts
return response.internalServerError(error.message)   // may contain SQL, paths, config
```

Correct — a generic message to the client, the detail to the logs:
```ts
logger.error({ err: error }, 'checkout failed')
return response.internalServerError('Something went wrong')
```

## Handle Unhandled Rejections at the Edges

Fire-and-forget promises bypass the handler entirely. Either `await` them or attach a `.catch()` that logs. A background task started without either can crash the process.
