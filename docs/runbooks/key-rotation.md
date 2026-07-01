# Runbook: Rotating `PRAXIS_MASTER_KEY`

`PRAXIS_MASTER_KEY` is the 32-byte symmetric key that `@praxis/crypto` uses to
encrypt OAuth tokens at rest (`oauth_tokens.access_token_encrypted`,
`refresh_token_encrypted`). It is **not** stored in the repo — it lives only in:

- each developer's local `.env` (gitignored), and
- the VPS systemd environment file `/etc/praxis/praxis.env` (see
  `docs/conventions/deploy.md`).

Losing the key makes every stored token undecryptable; leaking it makes every
stored token forgeable. Treat it like a database master credential.

## Format

A base64-encoded 32-byte key. Generate one with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
# e.g. OExT3vluFLnpkrz5SMIWhgUYKa3KPXukZ9WyCqps/kA=
```

`@praxis/crypto` validates on first use: the value must be valid base64 and
decode to exactly 32 bytes, otherwise `encrypt`/`decrypt` throw at call time
(not at import — the key is resolved lazily so Next.js builds don't need it).

> **praxis.env quirk:** the env file is ASCII-only with no inline comments and
> no quoting. Write `PRAXIS_MASTER_KEY=OExT3v...` on its own line. A trailing
> space or a `# comment` on the same line becomes part of the value and fails
> the length check.

## When to rotate

- Routine: not required at POC scale, but rotate if more than one operator has
  ever seen the value, or annually.
- **Immediately** if the key appears in a chat transcript, screenshot, shared
  terminal, paste service, or any log — assume compromise (tier-1 secrets rule).

## Rotation procedure

Because tokens are encrypted with a single active key, rotating the key means
**re-encrypting every stored token**. There is no key-id column at POC scale, so
rotation is a one-shot migration, not a dual-key window.

1. **Generate the new key** (command above). Keep both old and new to hand.

2. **Stop the writers** so no token is encrypted mid-rotation:

   ```bash
   sudo systemctl stop praxis-web praxis-orchestrator
   ```

3. **Re-encrypt in place.** Run the rotation script with both keys in the
   environment. It reads every row with the old key and rewrites it with the new
   one inside a single transaction:

   ```bash
   PRAXIS_MASTER_KEY_OLD=<old> PRAXIS_MASTER_KEY=<new> \
     node scripts/rotate-master-key.mjs
   ```

   > This script does not exist yet — at POC scale there are zero production
   > tokens to migrate. Write it as part of the first real rotation (it is a
   > ~30-line loop: `select`, `decrypt(old)`, `encrypt(new)`, `update`). Until
   > then, the safe path with no live tokens is: have every connected user
   > re-connect Anthropic after the key swap (step 4–6), which writes fresh
   > rows under the new key. The script becomes mandatory once losing a user's
   > connection on rotation is no longer acceptable.

4. **Swap the key** in `/etc/praxis/praxis.env` (VPS) and every developer `.env`.

5. **Restart**:

   ```bash
   sudo systemctl start praxis-web praxis-orchestrator
   ```

6. **Verify externally** (tier-1 deploy rule): sign in, open `/settings`, confirm
   a previously-connected account still shows "Connected to Anthropic ✓" and that
   a fresh agent spawn obtains a valid token (the refresh path in
   `getValidAnthropicToken` decrypts the refresh token — if the key is wrong it
   throws loudly rather than silently failing).

## Related

- `packages/crypto/src/index.ts` — the encrypt/decrypt implementation.
- `docs/runbooks/anthropic-oauth.md` — what produces the tokens being protected.
- `docs/conventions/deploy.md` — `praxis.env` format and systemd environment.
