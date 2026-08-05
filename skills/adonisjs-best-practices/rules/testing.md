# Testing Best Practices

AdonisJS tests run on [Japa](https://japa.dev). Suites are declared in `adonisrc.ts`; plugins and lifecycle hooks live in `tests/bootstrap.ts`.

```bash
node ace make:test posts/index --suite=functional
node ace test                    # everything
node ace test unit               # one suite
node ace test --files=posts      # by filename
node ace test --tests="can list all posts"
```

Useful flags: `--watch`, `--failed` (re-run last failures), `--bail` (stop on first failure).

## Favor Functional Tests Over Unit Tests

A test that goes through the real HTTP stack exercises routes, middleware, validation, authorization, controller, and serialization at once — the layers where bugs actually live. Reserve unit tests for logic with real branching: pricing rules, state machines, parsers, policies.

```ts title="tests/functional/posts/store.spec.ts"
import { test } from '@japa/runner'
import User from '#models/user'

test.group('Posts store', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('creates a post for an authenticated user', async ({ client, assert }) => {
    const user = await UserFactory.create()

    const response = await client
      .visit('posts.store')
      .loginAs(user)
      .json({ title: 'Hello', body: 'World' })

    response.assertStatus(201)
    assert.equal(await Post.query().count('* as total').firstOrFail(), 1)
  })
})
```

`client.visit()` takes a **route name** and derives the method and URL from the route definition — so renaming a path doesn't break every test.

## Reset State Between Tests

Migrate once globally; clean per test.

```ts title="tests/bootstrap.ts"
export const runnerHooks: Required<Pick<Config, 'setup' | 'teardown'>> = {
  setup: [() => testUtils.db().migrate()],
  teardown: [],
}
```

Then, in each group:

```ts
group.each.setup(() => testUtils.db().withGlobalTransaction())   // fast — rolls back
```

`withGlobalTransaction()` wraps the test and rolls back, so nothing persists. It is usually faster than truncation. Use `testUtils.db().truncate()` instead when the code under test manages its own transactions, since nested global transactions interfere with them.

Tests that leave state behind produce failures that depend on execution order — the worst kind to debug.

## Point Tests at a Separate Database

```dotenv title=".env.test"
DB_DATABASE=my_app_test
SESSION_DRIVER=memory
LIMITER_STORE=memory
REDIS_DB=1
```

Non-negotiable: a suite that truncates tables will eventually be run against the wrong database. Flush Redis between tests too:

```ts
group.each.teardown(async () => redis.flushdb())
```

Clear the limiter's memory store between rate-limit tests with `limiter.clear(['memory'])`; otherwise counters leak between cases. Never call an unrestricted `limiter.clear()` against a Redis database shared with application data, because it flushes the entire database. Give the limiter a dedicated Redis database if tests exercise that store.

## Use Factories, Not Hand-Built Fixtures

```ts
const user = await UserFactory.create()
const posts = await PostFactory.apply('published').createMany(5)
const post = await PostFactory.merge({ title: 'Specific' }).create()
```

Set only the fields the assertion depends on; let the factory randomize the rest. A test that specifies every column hides which value actually matters. Define a state for each meaningful variation — see [`lucid-models.md`](lucid-models.md).

## Assert on Behavior, Not Implementation

```ts
response.assertStatus(422)
response.assertBodyContains({
  errors: [{ field: 'title', rule: 'required' }],
})
```

`assertBodyContains` does a partial match, so tests survive additive response changes. Asserting deep equality on a whole payload makes every new field a test failure.

Assert the observable outcome — status, response shape, database row, dispatched job — rather than that a particular method was called.

## Test Failure Paths

Every endpoint deserves at least: the happy path, a validation failure, an unauthenticated request, and an unauthorized-but-authenticated request. The last two are what prove your middleware and policies are actually attached.

```ts
test('rejects anonymous requests', async ({ client }) => {
  const response = await client.visit('posts.store').json({ title: 'x' })
  response.assertStatus(401)
})

test('rejects users who do not own the post', async ({ client }) => {
  const [owner, other] = await UserFactory.createMany(2)
  const post = await PostFactory.merge({ userId: owner.id }).create()

  const response = await client.visit('posts.update', { id: post.id }).loginAs(other).json({})
  response.assertStatus(403)
})
```

## Use Built-in Fakes for External Effects

Never send real mail or hit real APIs in tests. The `using` keyword restores the real implementation automatically when the test ends:

```ts
import mail from '@adonisjs/mail/services/main'
import VerifyEmailNotification from '#mails/verify_email'

test('sends verification email on registration', async ({ client }) => {
  using fake = mail.fake()

  await client.visit('register.store').json({ email: 'user@example.com' })

  fake.mails.assertSent(VerifyEmailNotification, ({ message }) => {
    return message.hasTo('user@example.com')
  })
})
```

Assertions live on `fake.mails`: `assertSent(Mail, finder?)`, `assertNotSent(Mail, finder?)`, `assertSentCount(count)`. `mail.restore()` exists if you need to control the timing manually.

Fakes exist for Mail, Hash, Emitter, and Drive. For your own dependencies, swap the container binding:

```ts
app.container.swap(PaymentGateway, () => new FakeGateway())
cleanup(() => app.container.restore(PaymentGateway))
```

Hash faking matters for speed — real Argon2 in a factory makes suites crawl.

## Control Time Instead of Sleeping

`await sleep(1000)` makes suites slow and flaky. `freezeTime` and `timeTravel` mock `new Date()` and `Date.now()`, and restore themselves after each test:

```ts
import { timeTravel } from '@japa/runner'

test('expires the token after 30 days', async ({ assert }) => {
  const token = await createToken()
  timeTravel('31 days')
  assert.isTrue(token.isExpired)
})
```

## Keep Tests Independent

No shared mutable module state, no ordering assumptions, no test that depends on another having run. Each test creates what it needs.

## Suites and Timeouts

```ts title="adonisrc.ts"
tests: {
  suites: [
    { name: 'unit', files: ['tests/unit/**/*.spec.{ts,js}'], timeout: 2000 },
    { name: 'functional', files: ['tests/functional/**/*.spec.{ts,js}'], timeout: 30000 },
    { name: 'browser', files: ['tests/browser/**/*.spec.{ts,js}'], timeout: 300000 },
  ],
}
```

Suites needing an HTTP server start one via `configureSuite` in `tests/bootstrap.ts`. The glob syntax is `*.spec.{ts,js}` — the older `*.spec(.ts|.js)` form does not match.

## After Changing Code, Run the Narrowest Relevant Test

Run the specific file or test first, then the suite, then `npm run typecheck` and `npm run lint`. Report failures with their output — never describe a suite as passing without having run it.
