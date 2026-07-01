# Conventions — auth & mail

Better Auth + transactional mail patterns from STORY-04. Cookbook
split out of `AGENTS.md` tier-3.

## Better Auth — schema hybrid

We own the `users` table (UUID PK, snake_case columns, our app
metadata). Better Auth owns its `session` and `verification` tables
verbatim — we ship its schema in our migration set rather than
fighting the adapter. See ADR-0005 for the trade-off.

Notable consequences:

- The Drizzle adapter's schema map already routes BA's keys
  (`user`/`session`/`verification`) to our tables. **Do not** set
  `modelName` overrides on the adapter — that misdirects lookups and
  surfaces as "model 'users' not found" at runtime.
- Our existing `sessions` (plural — STORY-03's app session, the
  collaborative editing kind) is renamed at the TS export level to
  `authSession` to avoid a name collision with BA's `session`. The
  SQL tables are different rows in different tables; the JS export
  alias keeps imports unambiguous.
- BA's `verification` table holds magic-link tokens. Don't try to
  read it from app code — go through BA's API.

## Better Auth + Node 20 — kysely override

Better Auth 1.6.x depends on Kysely 0.29 which declares
`engines.node >= 22`. Our prod images run Node 20 (Alpine, current
LTS for our base). The fix is in the root `package.json`:

```json
{
  "pnpm": {
    "overrides": {
      "kysely": "^0.28.0"
    }
  }
}
```

Kysely 0.28 has the API surface BA uses, just without the Node-22
engines declaration. Don't drop the override until we move the base
images to Node 22.

## Lazy auth singleton

`apps/web/src/lib/auth.ts` exposes a function-shaped accessor, not
a module-load `betterAuth(…)` call:

```ts
let _auth: ReturnType<typeof betterAuth> | null = null;
export function getAuth() {
  if (_auth) return _auth;
  _auth = betterAuth({ /* config */ });
  return _auth;
}
```

Reason: Next.js page-data collection at build time imports every
module reachable from a route. `betterAuth(…)` reads
`BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` synchronously and throws
if absent. CI builds don't have those set. Defer the constructor
call to first use and the build succeeds while runtime still
fail-loud.

Same pattern as `db` in `@praxis/db/client` and the mailer (below).
Rule: **env-dependent module init is always lazy.**

## Middleware matcher precision

The Next.js middleware that gates `/dashboard/*` must use a precise
matcher:

```ts
export const config = { matcher: ['/dashboard/:path*'] };
```

A loose matcher (e.g. `/((?!api|_next).*)`) sends `/signin` itself
through the middleware, the middleware redirects unauthenticated
requests to `/signin`, and you get an infinite redirect on the sign-in
page. Be specific about what's gated.

## Magic-link e2e in Playwright

The smoke test uses `next dev` (not `next start` with a prebuilt
image — cold compile timing differs). The first request after
`next dev` boots can take 10–30s to compile the route. Pre-warm in
`beforeAll`:

```ts
beforeAll(async ({ request }) => {
  await request.get('/');           // warms the root
  await request.get('/signin');     // warms the auth route
  await request.get('/dashboard');  // warms the protected route
}, 60_000);
```

Without this, the first real test step times out on compile and the
e2e flakes intermittently.

Two more Playwright-against-the-real-app gotchas that bit the team flow:

- **Await the request before reloading.** A pattern of *optimistic UI assert →
  `page.reload()`* races an in-flight write while `next dev` cold-compiles the
  route, **aborting the request** so the change never persists (looked like a
  product bug; was a test bug). Wrap the action in
  `Promise.all([page.waitForResponse(r => …method==='PATCH'), btn.click()])` and
  reload only after the response lands.
- **`DATABASE_URL` for the auto-started server.** The Playwright `webServer`
  inherits the shell's `DATABASE_URL`; in this repo that's often
  `…@db:5432` (a docker-internal host unreachable from the host) or the prod
  `:5432` role (rejects `praxis:praxis` over TCP). Run e2e against the **dev DB**
  explicitly: `DATABASE_URL=postgres://praxis:praxis@127.0.0.1:5433/praxis pnpm exec playwright test …`.
  `reuseExistingServer` will also silently reuse a stale wrong-env server — kill
  the `:3100` process between env changes.

## Member display names — `displayName` is `''`, not `null`

Better Auth seeds a new user's name/`display_name` to an **empty string**, not
`null`. So `displayName ?? email` (or `m.name ?? m.email`) renders a **blank**
name, never the email fallback — `??` only catches null/undefined. Always
`displayName?.trim() || email`. This bit the settings team card and the admin
project-detail member list; assume any "name with email fallback" render needs
the `|| email` form, and cover the empty-string case in tests.

## Mailer interface — Dev vs Resend

`apps/web/src/lib/mail.ts` exposes a `sendMail(opts)` function backed
by one of two implementations:

| Impl | Activates when | Behaviour |
|---|---|---|
| `DevMailer` | `RESEND_API_KEY` unset **and** `NODE_ENV !== 'production'` | Writes the rendered email as a file under `.mail/<timestamp>-<to>.eml`. Surfaces in `pnpm dev` console. |
| `ResendMailer` | `RESEND_API_KEY` set | Calls Resend's REST API. |
| **loud fail** | `NODE_ENV === 'production'` **and** `RESEND_API_KEY` unset | Throws on first send. Better to crash than silently drop sign-in emails. |

Add `.mail/` to `.gitignore` (already done in STORY-04).

The interface is intentionally small (`to`, `subject`, `html`,
`from`). Don't add transport-specific options to the interface; pass
them via a backend-construction option if needed.

## Resend domain verification

Two distinct setup steps, both required, and easy to confuse:

1. **DNS at the registrar** — TXT/MX records for SPF + DKIM, A/AAAA
   for the apex if you want apex mail (`praxis.blacksail.dev` works
   on a sub by default). Resend's onboarding lists exact records.
2. **"Verify" button in the Resend dashboard** — once DNS propagates,
   click verify. Until you click, sends fail silently with "not
   permitted to send from this domain" *even if* DNS is correct.

Both halves complete before sign-in emails will deliver.

## Resend API key rotation

The key lives in `/etc/praxis/praxis.env` as `RESEND_API_KEY=…`.
Rotation procedure (use this whenever a key has been seen by anyone
other than the operator):

1. Generate a new key in the Resend dashboard. Don't reveal it on
   shared terminals — just have it ready locally.
2. SSH to the VPS. Edit `/etc/praxis/praxis.env` and replace the
   `RESEND_API_KEY` line.
3. `sudo systemctl restart praxis-web.service` so the running
   container picks up the new env.
4. Smoke-test by triggering a sign-in email to a known address.
5. Revoke the old key in the Resend dashboard.
6. Confirm one final sign-in works on the new key.

**Never echo the key value back into chat or commit it.** If a key
hits a transcript by accident, rotate immediately (even if "only
you" see the transcript — assume compromise).
