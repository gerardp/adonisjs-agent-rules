# Configuration & Environment Best Practices

Three distinct systems, and mixing them is the usual mistake:

- **`config/*.ts`** — application settings, committed.
- **`.env`** — secrets and per-environment values, never committed.
- **`adonisrc.ts`** — framework/workspace wiring: providers, commands, preloads, test suites.

## Read `.env` Only Through `env.get()`, Only in Config Files

`process.env` bypasses validation and typing entirely.

Incorrect:
```ts
const key = process.env.RESEND_API_KEY        // untyped, unvalidated, may be undefined
```

Correct:
```ts title="config/mail.ts"
import env from '#start/env'
import { defineConfig, transports } from '@adonisjs/mail'

const mailConfig = defineConfig({
  default: env.get('MAIL_MAILER'),
  from: {
    address: env.get('MAIL_FROM_ADDRESS'),
    name: env.get('MAIL_FROM_NAME'),
  },
  mailers: {
    resend: transports.resend({ key: env.get('RESEND_API_KEY') }),
  },
})

export default mailConfig
```

**Don't call `env.get()` in controllers, services, or models either.** Environment variables belong in config files; application code reads config. That keeps one source of truth and one place to change when a value moves.

Incorrect:
```ts
export class BillingService {
  async charge() {
    const key = env.get('STRIPE_KEY')     // config leaking into the domain
  }
}
```

Correct:
```ts
import config from '@adonisjs/core/services/config'

const key = config.get<string>('billing.stripeKey')
```

Better still, inject the value through the constructor so the service has no config dependency at all.

## Validate Every Environment Variable

`start/env.ts` is a schema. A missing or malformed variable should crash at boot with a clear message, not surface as `undefined` in production three hours later.

```ts title="start/env.ts"
import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  APP_KEY: Env.schema.string(),
  DB_HOST: Env.schema.string({ format: 'host' }),
  DB_PORT: Env.schema.number(),
  SESSION_DRIVER: Env.schema.string(),
  RESEND_API_KEY: Env.schema.string(),
})
```

Add the variable to this schema in the same commit that introduces it. Use `.optional()` only when the app genuinely runs without it.

## Never Import Application Code Into Config Files

Config is loaded during boot, before models, services, or controllers are ready. Importing them creates a circular dependency and the app fails to start.

Config files may import framework utilities, `defineConfig` helpers, and `#start/env`. Nothing else.

## Keep `.env.example` in Step

Commit `.env.example` with every key and a safe placeholder value. It is the checklist for onboarding and deployment; a key that exists in `.env` but not the example will be missing in production.

Never commit `.env`. Starter kits gitignore it — keep it that way.

Loading order, later overriding earlier: `.env` → `.env.local` (not in test) → `.env.<environment>`.

## Protect `APP_KEY`

`APP_KEY` encrypts cookies, signs sessions, and backs signed URLs.

```bash
node ace generate:key
```

Use a **different** key per environment. Anyone holding it can forge sessions and decrypt data. If it leaks, rotate immediately — this invalidates existing sessions and encrypted payloads, which is the point.

Encryption is configured in `config/encryption.ts`. The `appKey` export from `config/app.ts` is not used for it — that was the v6 arrangement, and older examples still show it.

## Use `.env.test` for the Test Environment

```dotenv title=".env.test"
DB_DATABASE=my_app_test
SESSION_DRIVER=memory
REDIS_DB=1
```

Point tests at a separate database and Redis database. A test suite that truncates tables against a development database will eventually be pointed at something worse. See [`testing.md`](testing.md).

## Never Hardcode Environment-Dependent Values

Incorrect:
```ts
const url = 'https://api.staging.example.com'
if (process.env.NODE_ENV === 'production') { /* ... */ }
```

Correct — put the value in config, and branch on the framework's flags:

```ts
import app from '@adonisjs/core/services/app'

app.inProduction
app.inDev
app.inTest
```

Prefer config over branching. `app.inProduction` is right for a debug flag; three environment branches inside a service means the value belongs in a config file.

## Config Access Outside Application Code

Edge templates get a `config()` global:

```edge
<title>{{ config('app.appName') }}</title>
<p>{{ config('app.timezone', 'UTC') }}</p>
```

Dot notation maps to file and property: `config('database.connection')` reads `connection` from `config/database.ts`.

## `adonisrc.ts` Is Framework Wiring

Providers, commands, preloads, test suites, and the v7 `indexEntities()` hook live here. When `node ace add <package>` edits it, let it — hand-editing usually means a missed registration elsewhere.
