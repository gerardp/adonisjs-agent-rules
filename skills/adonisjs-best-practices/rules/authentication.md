# Authentication Best Practices

`@adonisjs/auth` is guard-based. Pick the guard that matches the client, and never hand-roll credential verification.

## Choose the Guard by Client Type

| Guard | Use for | Notes |
| --- | --- | --- |
| **Session** | Server-rendered apps, Inertia | Cookie-based; needs `@adonisjs/session` and CSRF protection |
| **Access tokens** | APIs, mobile clients, third parties | Opaque tokens, hashed at rest, revocable |
| **Basic auth** | Internal tools, scrapers | Only over HTTPS |

Don't reach for JWTs by reflex. AdonisJS ships opaque access tokens because they can be revoked server-side; a stateless JWT cannot be, which is usually the wrong trade for a first-party API.

## Always Use `verifyCredentials`

Apply the AuthFinder mixin to the User model and use its static method. Hand-written lookup-then-compare is vulnerable to timing attacks: when the email doesn't exist no hash is computed, so the response returns measurably faster and an attacker can enumerate valid accounts.

Incorrect:
```ts
const user = await User.findBy('email', email)
if (!user) {
  return response.abort('Invalid credentials')     // returns fast — leaks existence
}
if (!(await hash.verify(user.password, password))) {
  return response.abort('Invalid credentials')
}
```

Correct:
```ts title="app/models/user.ts"
import { UsersSchema } from '#database/schema'
import { compose } from '@adonisjs/core/helpers'
import hash from '@adonisjs/core/services/hash'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'

const AuthFinder = withAuthFinder(() => hash.use('scrypt'), {
  uids: ['email'],
  passwordColumnName: 'password',
})

export default class User extends compose(UsersSchema, AuthFinder) {}
```

```ts title="app/controllers/session_controller.ts"
async store({ request, auth, response }: HttpContext) {
  const { email, password } = await request.validateUsing(loginValidator)

  const user = await User.verifyCredentials(email, password)
  await auth.use('web').login(user)

  return response.redirect().toRoute('dashboard')
}
```

`verifyCredentials` always performs a hash comparison, so timing is constant whether or not the email exists. Add every valid login identifier to `uids` (`['email', 'username']`).

Some official auth examples still show `compose(BaseModel, AuthFinder)` with
hand-declared columns. On Lucid 22, compose from the generated schema class.

## The Mixin Hashes Passwords — Don't Hash Twice

`withAuthFinder` installs a hook that hashes the password column on save. Adding your own `@beforeSave` hasher double-hashes and every login fails.

Check for an existing hook before adding one. Hash manually only on models that do *not* use the mixin, and guard on `$dirty`:

```ts
@beforeSave()
static async hashPassword(user: User) {
  if (user.$dirty.password) {
    user.password = await hash.make(user.password)
  }
}
```

Use `argon2` or `scrypt`. Never `md5`, `sha*`, or anything unsalted.

## Never Return the Password Column

```ts
@column({ serializeAs: null })
declare password: string
```

Better still, shape responses with a transformer so fields are allowlisted rather than excluded. See [`transformers.md`](transformers.md).

## Protect Routes with Middleware, Not Controller Checks

```ts
router.group(() => {
  router.resource('posts', controllers.Posts)
}).use(middleware.auth())
```

A per-action `if (!auth.user)` is a rule that only applies where someone remembered it. See [`middleware.md`](middleware.md).

## Read the User with `getUserOrFail()`

Inside routes already behind auth middleware, `auth.user` is typed as possibly undefined, which invites `!`.

Incorrect:
```ts
const userId = auth.user!.id      // silently wrong the day the middleware is removed
```

Correct:
```ts
const user = auth.getUserOrFail()
```

This throws a proper authentication exception rather than a `TypeError` if the assumption ever breaks.

To authenticate manually outside middleware:

```ts
await auth.authenticate()                  // throws when unauthenticated
if (await auth.check()) { /* optional */ } // boolean, for mixed public/private pages
```

## Session Guard Specifics

Regenerate the session on login to prevent session fixation — `auth.use('web').login(user)` handles this. Use the remember-me flag rather than extending session lifetime globally:

```ts
await auth.use('web').login(user, /* remember */ true)
```

On logout, clear server-side state:

```ts
await auth.use('web').logout()
```

Session apps also need `@adonisjs/shield` for CSRF. See [`security.md`](security.md).

## Access Token Specifics

Register the provider on the model:

```ts title="app/models/user.ts"
import { UsersSchema } from '#database/schema'
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'

export default class User extends UsersSchema {
  static accessTokens = DbAccessTokensProvider.forModel(User, {
    expiresIn: '30 days',
    prefix: 'oat_',
  })
}
```

Keep the `prefix` — secret scanners use it to spot leaked tokens in public repositories. Changing it invalidates every existing token.

Tokens are shown **once**, at creation. Only a hash is stored, so a lost token is regenerated, never recovered.

```ts
const token = await User.accessTokens.create(user, ['posts:read'], {
  expiresIn: '7 days',
  name: 'CLI Tool Token',
})

return {
  type: 'bearer',
  value: token.value!.release(),   // the only moment the plaintext exists
}
```

`token.value` is a `Secret` wrapper — `.release()` unwraps it. The wrapper exists so the raw value is not accidentally printed by logs or stack traces; don't unwrap it earlier than the response.

Give tokens the narrowest ability list that works. `['*']` grants everything, so reserve it for first-party clients:

```ts
const token = await User.accessTokens.create(user, ['projects:read', 'projects:list'])
```

Always ship a revocation path — `User.accessTokens.delete(user, tokenId)`, with `User.accessTokens.all(user)` backing a management screen. Never log token values.

## Rate-Limit Authentication Endpoints

Login, registration, password reset, and token creation are brute-force targets. For credential verification, use the direct `@adonisjs/limiter` API with `penalize()` so successful logins do not consume attempts. Layer keys deliberately rather than relying on one IP-plus-identifier bucket; see [`security.md`](security.md).

## Keep Responses Uniform on Failure

Return the same message and status whether the email is unknown or the password is wrong. Distinguishing them turns your login form into an account-enumeration oracle.

## Testing

Use the auth client plugins rather than driving the login form:

```ts
const response = await client.visit('posts.index').loginAs(user)
```

Cover the unauthenticated case explicitly — asserting a 401/redirect is what proves the middleware is actually attached. See [`testing.md`](testing.md).
