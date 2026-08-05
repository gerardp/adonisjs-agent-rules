# Security Best Practices

## Never Mass-Assign Request Input

The validated payload is your allowlist. `request.all()` is not — and in v7 it merges uploaded files into the object as well.

Incorrect:
```ts
await User.create(request.all())        // client can set `role`, `isAdmin`, `teamId`
await user.merge(request.all()).save()
```

Correct — server-controlled fields come from the server:
```ts
const payload = await request.validateUsing(updateProfileValidator)
await user.merge({ ...payload, role: user.role }).save()
```

Keep privilege fields out of validator schemas entirely. If `role` is not in the schema, it cannot arrive through the schema. See [`validation.md`](validation.md).

## Authorize Every Object Access

Validation proves the input is well-formed; it says nothing about whether *this* user may touch *that* row. Loading by ID without an ownership check is IDOR — the most common web vulnerability in CRUD apps.

Incorrect:
```ts
const post = await Post.findOrFail(params.id)
await post.merge(payload).save()          // any authenticated user edits any post
```

Correct:
```ts
const post = await Post.findOrFail(params.id)
await bouncer.with(PostPolicy).authorize('edit', post)
```

Scoping the query to the user is also valid, and often better for lists:

```ts
const post = await auth.getUserOrFail()
  .related('posts').query()
  .where('id', params.id)
  .firstOrFail()
```

See [`authorization.md`](authorization.md).

## Parameterize Every Query

Lucid and Knex parameterize by default. Raw SQL built by string concatenation does not.

Incorrect:
```ts
await db.rawQuery(`SELECT * FROM users WHERE email = '${email}'`)
```

Correct:
```ts
await db.rawQuery('SELECT * FROM users WHERE email = ?', [email])
```

Column and table *identifiers* cannot be parameterized. When sorting by a user-supplied column, validate against an allowlist:

```ts
const sortable = ['created_at', 'title', 'status'] as const
const sort = sortable.includes(input) ? input : 'created_at'
```

## Hash Passwords with a Password Hash

Use `argon2` (preferred) or `scrypt` via the hash service. Never `md5`, `sha1`, `sha256`, or anything unsalted — general-purpose digests are built to be fast, which is exactly wrong here.

Let the AuthFinder mixin handle hashing and verification, and use `User.verifyCredentials()` so credential checks are constant-time. See [`authentication.md`](authentication.md).

## Protect Server-Rendered Apps with Shield

`@adonisjs/shield` provides CSRF tokens, CSP, HSTS, and frame protection. Any session-cookie app that accepts POSTs needs CSRF protection — a token-authenticated API does not, because the browser won't attach the credential automatically.

Include the token in every form:

```edge
<form method="POST" action="{{ urlFor('posts.store') }}">
  {{ csrfField() }}
</form>
```

## Rate-Limit Authentication and Expensive Endpoints

Use the official `@adonisjs/limiter` package on login, registration, password reset, token creation, search, export, and other expensive endpoints. If the package is missing and adding it is approved, configure it with `node ace add @adonisjs/limiter`; do not hand-roll a counter middleware.

Apply reusable HTTP throttles to routes or groups with `.use()`. Key authenticated traffic by user ID only after `auth`, `silent_auth`, or a manual auth check has populated `ctx.auth.user`; the initialize-auth middleware creates `ctx.auth` but does not authenticate. Fall back to IP for guests, and preserve middleware order so authentication runs before a user-keyed limiter.

For credential checks, prefer a direct limiter created with `limiter.use()` and wrap `User.verifyCredentials()` with `penalize()`. This consumes quota only when verification fails; a route throttle consumes successful logins too. Normalize the identifier before building the key.

An IP-plus-identifier key prevents one source from globally locking an account, but alone does not stop password spraying across many identifiers or distributed guessing across many IPs. Add a broader per-IP limit or a carefully tuned per-identifier limit when the threat model warrants it, while keeping failure responses uniform.

Use the memory store for tests or a single process only. Use the database store when moderate traffic and an existing shared SQL database make it sufficient; prefer Redis when limiter throughput or latency justifies dedicated infrastructure. Both database and Redis stores can share limits across application instances.

## Validate Uploads by Content, Not Filename

An extension is a claim by the client. Constrain size and type at the validator, and never trust the original name for storage.

```ts
export const uploadAvatarValidator = vine.create({
  avatar: vine.file({
    size: '2mb',
    extnames: ['jpg', 'jpeg', 'png', 'webp'],
  }),
})
```

Store uploads outside the public directory (use Drive), generate your own filename, and never interpolate a user-supplied path — `../` in a filename is directory traversal. Serve user content from a separate domain or with `Content-Disposition: attachment` so an uploaded HTML file cannot run as your origin.

## Keep Secrets Out of Code and Logs

Secrets belong in `.env`, validated in `start/env.ts`, and read through config. Never commit `.env`; keep `.env.example` with placeholders. See [`config.md`](config.md).

Never log passwords, tokens, API keys, session IDs, or full request bodies:

```ts
logger.info({ userId: user.id }, 'user logged in')          // fine
logger.info({ body: request.all() }, 'login attempt')       // logs the password
```

Rotate `APP_KEY` immediately if it leaks — it signs sessions and signed URLs.

## Don't Leak Existence or Internals

Return identical responses for "unknown email" and "wrong password". Use `AuthorizationResponse.deny('Not found', 404)` where a 403 would confirm a record exists.

In production keep `debug = false` so stack traces, source, and config never reach a client. Send generic messages outward and detail to the logs. See [`error-handling.md`](error-handling.md).

## Escape Output; Be Deliberate About Raw HTML

Edge escapes `{{ }}` by default. `{{{ }}}` does not — use it only on content you generated or have sanitized. The same applies to `dangerouslySetInnerHTML` in Inertia views.

## Timing-Safe Comparison for Secrets

Comparing tokens, signatures, or webhook secrets with `===` leaks length and prefix information through timing. Use a constant-time comparison, and verify webhook signatures before parsing the body.

## Lock Down CORS

`@adonisjs/cors` with `origin: true` reflects any origin. Name the origins you actually serve, and never combine a wildcard origin with `credentials: true`.

## Keep Dependencies Current

Run `npm audit` in CI. Pin experimental packages (`@adonisjs/queue`) to exact versions. Confirm installed versions before using version-sensitive APIs — see [`version-traps.md`](version-traps.md).
