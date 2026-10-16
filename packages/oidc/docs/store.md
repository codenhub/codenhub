---
title: Store
description: The OidcStore contract method by method, the guarantees each one gives, the atomicity the single-use values need and which databases provide it, a SQL sketch of atomic code redemption, and the in-memory reference store for tests.
order: 3
---

# Store

The provider keeps clients, interactions, authorization codes, tokens and grants in a store the application implements. The package does not ship a production store: it defines the contract as `OidcStore`, and it ships `createMemoryStore` in `@codenhub/oidc/testing` for tests and examples.

The contract is the part of the package that cannot be checked by types alone. Its single-use guarantees rest on the store, so this page states each method's guarantee, and what a store must provide to keep the provider's promises.

```ts
import type { OidcStore } from "@codenhub/oidc/provider";
```

## Keys and records

Every key the provider passes to the store for a code, a token or an interaction is a SHA-256 digest of the value, encoded as base64url. The provider computes the digest before it calls the store, so the store never holds a value that could be used. A leaked store therefore holds nothing a client or user can present.

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

Three rules hold across the table.

- **Codes and refresh tokens stay after use.** A used code or refresh token is kept until at least its `expiresAt`, so a replay inside that window is recognized, and the grant it belongs to can be revoked. Deleting it on use would turn every replay into `undefined`.
- **Interactions are deleted on use.** An interaction is completed once, and nothing ever asks for it again, so there is no replay to recognize.
- **Revocation outlives the call.** A replay can arrive while the first exchange is still saving its tokens. The store must therefore hide any token saved for a revoked grant afterwards, not only the ones present when `revokeGrant` ran.

## Atomicity

Two concurrent calls to `consumeCode` or `consumeRefreshToken` for one key must never both return `consumed`, and two calls to `consumeInteraction` must never both return the record. A store that allows it lets one code be redeemed twice, which issues two grants from one code and defeats the replay check. The provider depends on this guarantee and cannot detect a store that lacks it.

Stores that provide it:

- **Cloudflare D1, or any SQL database with conditional updates or transactions.** A single `UPDATE` with the condition in its `WHERE` clause is atomic, as the sketch below shows.
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

`consumeCode` runs the first statement. If it returns a row, the code was unused, and that row is the `consumed` result. If it returns no row, the second statement tells a replay from an unknown code:

```sql
-- 1. Mark the code used, and return its record only if this call did it.
UPDATE codes SET used = 1 WHERE key = ? AND used = 0 RETURNING record;

-- 2. No row came back: either the code is used (a replay) or it does not exist.
SELECT record FROM codes WHERE key = ?;
```

A row from the second statement means `replayed`, with the `grantId` read from its record. No row means `undefined`. Run both statements in one transaction, so that a purge cannot delete the row between them. Purge only rows whose `expires_at` has passed, which keeps replays recognizable for the whole window the contract requires.

`revokeGrant` can be a table of revoked grant identifiers, checked by `findAccessToken` and `consumeRefreshToken` before they return a record, so that a token saved after the revocation is still hidden.

## Errors

A store method may throw or reject, for example when the database is down. The provider does not catch the error, so the call that reached the store rejects: `handle`, `beginAuthorization` and `completeAuthorization` all reject, and so does the userinfo request when the store fails.

A store failure is never turned into an OAuth answer. Answering `invalid_grant` for a database outage would look like a refused code, and it would log users out with no sign of the cause. The app decides what the user sees, typically a `500`. It must not retry a `consume` call: if the first call did take the value before it failed, the retry reports a replay, and the provider then revokes the grant.

## Client records

`findClient` returns a `ClientRecord`:

```ts
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

| Option    | Meaning                                                                         | Default    |
| --------- | ------------------------------------------------------------------------------- | ---------- |
| `clients` | Client records to register at creation.                                         | None       |
| `now`     | The current time in milliseconds, used only to purge expired entries on writes. | `Date.now` |

The returned store has an extra method, `addClient(client)`, which registers or replaces a client. It purges expired entries when records are saved, not when they are read, and reads return an expired record as stored, so the provider decides expiry from `expiresAt`. Revoked grants are remembered for the life of the process. Everything is lost on restart, and it does not coordinate across processes, so it must not be used in production. It is the reference the other stores are judged against.
