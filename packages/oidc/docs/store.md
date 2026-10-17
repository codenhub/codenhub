---
title: Store
description: The OidcStore contract method by method, the guarantees each one gives, the atomicity the single-use values need and which databases provide it, SQL sketches of atomic redemption and revocation, the in-memory reference store for tests, and how to check an adapter against the contract.
order: 3
---

# Store

The provider keeps clients, interactions, authorization codes, tokens and grants in a store the application implements. The package does not ship a production store: it defines the contract as `OidcStore`, and it ships `createMemoryStore` in `@codenhub/oidc/testing` for tests and examples.

The contract is the part of the package that cannot be checked by types alone. Its single-use guarantees rest on the store, so this page states each method's guarantee, and what a store must provide to keep the provider's promises.

```ts
import type { OidcStore } from "@codenhub/oidc/provider";
```

## Keys and records

Every key the provider passes to the store for a code, a token or an interaction is a SHA-256 digest of the value, encoded as base64url. The provider computes the digest before it calls the store, so the store never holds a value that could be used. A leaked store therefore holds no code, token or interaction a client or user can present. Client records are different: a `client_secret_jwt` client's record holds its HMAC secret, which can forge that client's assertions, so client authentication keys need the protection any credential store gets.

The one key that is not a digest is the client identifier, which `findClient` receives as the client sent it.

Records are plain JSON, with two exceptions. Times are whole seconds since the Unix epoch, under the names `expiresAt`, `createdAt` and `authTime`. A client record for `client_secret_jwt` holds a `SecretKey` and a record for `private_key_jwt` holds a `KeySet`, both objects from `@codenhub/jwt`; see [Client records](#client-records).

## The contract

Each method below is required. A store that lacks one is refused by `createProvider` with a `TypeError`.

| Method                | Stores or reads                                               | Returns                                                                              | Guarantee                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `findClient`          | Looks up a client by identifier.                              | `ClientRecord`, or `undefined` when none has it.                                     | Read only. A malformed record is a bug in the store, and the provider throws `TypeError` for it.                                                                                    |
| `saveInteraction`     | Saves a validated authorization request, by digest of its id. | Nothing.                                                                             | Kept until it is consumed or expires.                                                                                                                                               |
| `consumeInteraction`  | Returns and deletes an interaction.                           | `InteractionRecord`, or `undefined`.                                                 | Atomic. The first caller gets the record, and no later caller does. `undefined` when it never existed or was already consumed.                                                      |
| `saveCode`            | Saves a new authorization code, by digest.                    | Nothing.                                                                             | Stored unused.                                                                                                                                                                      |
| `consumeCode`         | Marks a code used.                                            | `{ status: "consumed", record }`, `{ status: "replayed", grantId }`, or `undefined`. | Atomic. The first call gets `consumed`, and every later call gets `replayed` until at least the record's `expiresAt`. `undefined` when the code was never saved or has been purged. |
| `saveAccessToken`     | Saves a new access token, by digest.                          | Nothing.                                                                             | Stored until its `expiresAt` or until its grant is revoked.                                                                                                                         |
| `findAccessToken`     | Returns an access token's record.                             | `AccessTokenRecord`, or `undefined`.                                                 | `undefined` when it does not exist, or when its grant was revoked, including by a save that happened after the revocation. The provider checks `expiresAt` itself.                  |
| `saveRefreshToken`    | Saves a new refresh token, by digest.                         | Nothing.                                                                             | Stored until its `expiresAt`, which rotation keeps.                                                                                                                                 |
| `consumeRefreshToken` | Marks a refresh token used.                                   | As for `consumeCode`.                                                                | Atomic, as for `consumeCode`. `undefined` when it does not exist, or when its grant was revoked. A revoked token is reported as absent, not `replayed`.                             |
| `revokeGrant`         | Revokes a grant.                                              | Nothing.                                                                             | From now on no access or refresh token of the grant is found or consumed, including tokens saved after this call by a request that was already running.                             |

Four rules hold across the table.

- **Saves never overwrite.** A `save*` method for a key that already exists must reject, and it must never reset a used entry, which would make a spent code or refresh token consumable again. The provider's keys are random digests, so this happens only through an adapter bug.
- **Expiry is checked by the provider, and purging is the adapter's job.** No method purges. The provider checks `expiresAt` itself, so an adapter deletes expired rows itself, such as with a scheduled job. It keeps a used code or refresh token until at least its `expiresAt`, so a replay is still recognized. It keeps a revoked-grant marker until the grant's last token expires. That is at most `ttl.refreshToken + ttl.accessToken` after the code exchange: with the defaults, 30 days and 10 minutes.
- **Codes and refresh tokens stay after use.** A used code or refresh token is kept until at least its `expiresAt`, so a replay inside that window is recognized, and the grant it belongs to can be revoked. Deleting it on use would turn every replay into `undefined`.
- **Interactions are deleted on use.** An interaction is completed once, and nothing ever asks for it again, so there is no replay to recognize.
- **Revocation outlives the call.** A replay can arrive while the first exchange is still saving its tokens. The store must therefore hide any token saved for a revoked grant afterwards, not only the ones present when `revokeGrant` ran.

## Atomicity

Two concurrent calls to `consumeCode` or `consumeRefreshToken` for one key must never both return `consumed`, and two calls to `consumeInteraction` must never both return the record. A store that allows it lets one code be redeemed twice, which issues two grants from one code and defeats the replay check. The provider depends on this guarantee and cannot detect a store that lacks it.

Stores that provide it:

- **Cloudflare D1, or any SQL database with conditional updates or transactions.** A single `UPDATE` with the condition in its `WHERE` clause is atomic, as the sketch below shows. D1 has no interactive transactions, so send related statements in one `batch()`, which runs them in one implicit transaction, or use single statements.
- **Cloudflare Durable Objects,** when the check and the write for a value are made in one transaction on the object's storage, so no other request for the same object can run between them.

Stores that do not:

- **Plain Cloudflare KV.** It has no compare-and-set, so two reads can both see an unused code and both write it as used, and it is eventually consistent across locations. A `consumeCode` built on it can return `consumed` twice.

### A SQL sketch of consumeCode

This sketch assumes a `codes` table with a digest key, the record as JSON text, a `used` flag and the expiry:

```sql
CREATE TABLE codes (
  key TEXT PRIMARY KEY,
  record TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);
```

`consumeCode` sends both statements below in one D1 `batch()`, which runs them in one implicit transaction. The first returns a row only when this call marked the code used, and that row is the `consumed` result. Otherwise the second statement tells a replay from an unknown code:

```sql
-- 1. Mark the code used, and return its record only if this call did it.
UPDATE codes SET used = 1 WHERE key = ? AND used = 0 RETURNING record;

-- 2. Read the row, used or not.
SELECT record, used FROM codes WHERE key = ?;
```

If statement 1 returned a row, the result is `consumed`. Otherwise, if statement 2 returned a row, the code was used before, and the result is `replayed`, with the `grantId` read from its record. No row means `undefined`. A code has no revocation check: its grant only exists after the exchange, and a replay revokes it through `revokeGrant`. Purge only rows whose `expires_at` has passed, which keeps replays recognizable for the whole window the contract requires.

The refresh-token equivalent must also refuse a token whose grant is revoked, in the same statement that spends it. Otherwise a request that was already running could spend a token after `revokeGrant` returned. Revoked grants go in their own table:

```sql
CREATE TABLE refresh_tokens (
  key TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL,
  record TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);
CREATE TABLE revoked_grants (grant_id TEXT PRIMARY KEY);
```

```sql
-- 1. Spend the token, unless its grant is revoked. The check is in the same statement as the update.
UPDATE refresh_tokens SET used = 1
WHERE key = ? AND used = 0
  AND NOT EXISTS (SELECT 1 FROM revoked_grants r WHERE r.grant_id = refresh_tokens.grant_id)
RETURNING record;

-- 2. Read the row, with whether its grant is revoked.
SELECT record, used,
  EXISTS (SELECT 1 FROM revoked_grants r WHERE r.grant_id = refresh_tokens.grant_id) AS revoked
FROM refresh_tokens WHERE key = ?;
```

If statement 1 returned a row, the result is `consumed`. Otherwise, a row from statement 2 with `revoked` 0 means a spent token, so `replayed`. A row with `revoked` 1, or no row, means `undefined`. A revoked token is reported as absent, not `replayed`, as the table above requires. `findAccessToken` applies the same `NOT EXISTS` condition to its `SELECT`, and `revokeGrant` runs `INSERT OR IGNORE INTO revoked_grants (grant_id) VALUES (?)`.

## Errors

A store method may throw or reject, for example when the database is down. The provider does not catch the error, so the call that reached the store rejects: `handle`, `beginAuthorization` and `completeAuthorization` all reject, and so does the userinfo request when the store fails.

A store failure is never turned into an OAuth answer. Answering `invalid_grant` for a database outage would look like a refused code, and it would log users out with no sign of the cause. The app decides what the user sees, typically a `500`. It must not retry a `consume` call: if the first call did take the value before it failed, the retry reports a replay, and the provider then revokes the grant.

## Client records

`findClient` returns a `ClientRecord`:

```ts
import type { ClientAuthentication } from "@codenhub/oidc/provider";

interface ClientRecord {
  clientId: string;
  redirectUris: readonly string[]; // each an absolute URL, compared byte for byte
  scopes: readonly string[]; // must include "openid"
  auth: ClientAuthentication;
}
```

`auth` is one of these:

- `{ method: "none" }`, for a public client that relies on PKCE alone.
- `{ method: "client_secret_basic", secretHash }` and `{ method: "client_secret_post", secretHash }`, where `secretHash` comes from `hashClientSecret`.
- `{ method: "client_secret_jwt", key }`, where `key` is the client's HS256 `SecretKey`, from `generateSecretKey({ alg: "HS256" })` or `importSecretKey`.
- `{ method: "private_key_jwt", keys }`, where `keys` is the client's public `KeySet`, from `createKeySet`, `importKeySet` or `createRemoteKeySet`.

A record that breaks these rules is a bug in the store, and the provider throws `TypeError` for it.

The `key` and `keys` values are `@codenhub/jwt` objects, not JSON. A plain object is not one of them, and `@codenhub/jwt` refuses it with `TypeError` when the provider uses it. A store that persists these records therefore keeps the key as a JWK and rebuilds the object on each read: `exportSecretJwk` or `exportPublicJwk` writes the key, and `importSecretKey` or `importKeySet` reads it back. A secret can be exported only when it was created or imported as extractable. A store may also keep the key objects in memory, as the in-memory store does.

## createMemoryStore

`createMemoryStore` in `@codenhub/oidc/testing` is the reference implementation of this contract. It keeps everything in the memory of one process, and it is for tests and examples:

```ts
import { createMemoryStore } from "@codenhub/oidc/testing";

const store = createMemoryStore({
  clients: [
    {
      clientId: "my-app",
      redirectUris: ["https://app.example.com/callback"],
      scopes: ["openid", "profile"],
      auth: { method: "none" },
    },
  ],
});
```

| Option    | Meaning                                 | Default |
| --------- | --------------------------------------- | ------- |
| `clients` | Client records to register at creation. | None    |

The returned store has an extra method, `addClient(client)`, which registers or replaces a client. It never purges: it keeps every record for its lifetime, and the provider checks `expiresAt` itself, so memory grows with use. Saved and returned records are copies, so changing an object you passed in, or one you read back, does not change the store. A `save*` call for a key that already exists rejects. Revoked grants are remembered for the life of the process. Everything is lost on restart, and it does not coordinate across processes, so it must not be used in production. It is the reference the other stores are judged against.

## Checking an adapter

`storeConformanceCases` in `@codenhub/oidc/testing` checks an adapter against this contract. It is a list of named cases, and each case takes a factory that returns the adapter under test. A case rejects with an `Error` that names the broken rule, and the message never contains a key or a token. The cases cover:

- Each interaction and code is single-use, and a consumed code is `replayed` on its next use.
- Unknown keys give `undefined`.
- Twenty concurrent `consumeCode` calls give exactly one `consumed`.
- A `save*` call for an existing key rejects, and a spent code cannot be made consumable again.
- `findAccessToken` is not single-use.
- `revokeGrant` hides the grant's access and refresh tokens, including tokens saved after the call, and leaves other grants alone.
- `findClient` gives `undefined` for unknown identifiers, including `__proto__`, `constructor` and `toString`.
- The records a store returns do not change when the caller changes what it saved.

Records use an `expiresAt` one hour ahead, so an adapter that purges expired rows still passes. Keys are random per case, so the factory may return stores on one shared database. The factory is called once for each case.

With vitest, register each case with `it`:

```ts
import { describe, it } from "vitest";
import { storeConformanceCases } from "@codenhub/oidc/testing";
import type { OidcStore } from "@codenhub/oidc/provider";

declare const env: { DB: unknown }; // the database binding the adapter uses
declare function createD1Store(db: unknown): OidcStore; // your adapter

describe("OidcStore", () => {
  for (const c of storeConformanceCases) {
    it(c.name, () => c.run(() => createD1Store(env.DB)));
  }
});
```

`node:test` works the same way, with `test` in place of `it`.
