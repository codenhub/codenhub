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

Every key the provider passes to the store for a code, a token or an interaction is a SHA-256 digest of the value, encoded as base64url. The provider computes the digest before it calls the store, so the store never holds a value that could be used. A leaked store therefore holds no code, token or interaction a client or user can present. Client records are different: a `client_secret_jwt` client's record holds its HMAC secrets, which can forge that client's assertions, so client authentication keys need the protection any credential store gets.

The one key that is not a digest is the client identifier, which `findClient` receives as the client sent it. Match it byte for byte: a lookup that ignores case, trims spaces or normalizes Unicode, such as a SQL column with a case-insensitive collation, would let `APP` reach the record of `app`. The provider treats a record whose `clientId` differs from the one it asked for as no client, so such a store fails closed, but the conformance cases flag it.

Records are plain JSON, with two exceptions. Times are whole seconds since the Unix epoch, under the names `expiresAt`, `createdAt` and `authTime`. A client record for `client_secret_jwt` holds a list of `SecretKey` objects and a record for `private_key_jwt` holds a `KeySet`, both from `@codenhub/jwt`; see [Client records](#client-records).

An optional field the provider did not set is left out of the record it saves. When the store reads the record back, the provider takes a missing field, `undefined` and `null` as the same absence, in every optional field of the interaction, code, access token and refresh token records, so a SQL column that returns `NULL` for a value never set needs no mapping. Any other value is a value: an empty string, an empty list, `0` or `false` would be used as given, such as an empty `nonce` echoed into an ID token, so a store must not fill in a missing field with one. A required field, such as `expiresAt`, is never `null`, and a `null` there is not read as absent: a `null` `expiresAt` makes the token expired. Client records are the exception: a `null` in one is malformed, and the provider throws `TypeError` for it, as for any other malformed client record. A field added in a later release, such as a refresh token's `issuedAt` or an access token's `grantType`, is optional for the same reason, so rows saved before it existed still read.

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

Five rules hold across the table.

- **Saves never overwrite.** A `save*` method for a key that already exists must reject, and it must never reset a used entry, which would make a spent code or refresh token consumable again. The provider's keys are random digests, so this happens only through an adapter bug.
- **Expiry is checked by the provider, and purging is the adapter's job.** No method purges. The provider checks `expiresAt` itself, so an adapter deletes expired rows itself, such as with a scheduled job. It keeps a used code or refresh token until at least its `expiresAt`, so a replay is still recognized. It keeps a revoked-grant marker until the grant's last token expires. That is at most a refresh token lifetime plus an access token lifetime after the code exchange. Clients can set their own lifetimes in their record's `ttl`, so keep the marker for the longest refresh token lifetime of any client plus the longest access token lifetime of any client, with the provider's `ttl` counting for a client that sets none: with the defaults and no client `ttl`, 30 days and 10 minutes. A lifetime since lowered still counts until the tokens issued under it have expired, since a refresh token family keeps the expiry it got at the code exchange and an access token keeps its own.
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
import type { AsymmetricAlgorithm } from "@codenhub/jwt";
import type { ClientAuthentication, ClientTtl, GrantType } from "@codenhub/oidc/provider";

interface ClientRecord {
  clientId: string;
  redirectUris: readonly string[]; // each an absolute URL, compared byte for byte; may be empty without authorization_code
  scopes: readonly string[]; // must include "openid" with authorization_code; the provider's scopes option need not define them
  grantTypes?: readonly GrantType[]; // "authorization_code" (the default) or "client_credentials"
  postLogoutRedirectUris?: readonly string[]; // each compared byte for byte at logout
  ttl?: ClientTtl; // this client's own code, access token, ID token and refresh token lifetimes
  idTokenSigningAlg?: AsymmetricAlgorithm; // the algorithm of the signing key for this client's ID tokens
  requirePkce?: boolean; // true (the default) requires a PKCE challenge; false only for a confidential client
  backchannelLogout?: { uri: string; sessionRequired?: boolean }; // where the app sends this client's logout token
  idTokenClaims?: boolean; // true puts the claims the granted scopes release in this client's ID tokens; false is the default
  resources?: readonly string[]; // the resource servers this client may ask for tokens to (RFC 8707)
  auth: ClientAuthentication;
}
```

`auth` is one of these:

- `{ method: "none" }`, for a public client that relies on PKCE alone.
- `{ method: "client_secret_basic", secretHashes }` and `{ method: "client_secret_post", secretHashes }`, where `secretHashes` is a non-empty list of digests from `hashClientSecret`. A presented secret authenticates when it matches any entry, so a client has two secrets while one is being [rotated](provider.md#rotating-a-secret).
- `{ method: "client_secret_jwt", keys }`, where `keys` is a non-empty list of the client's HS256 `SecretKey` objects, from `generateSecretKey({ alg: "HS256" })` or `importSecretKey`. An assertion any of them verifies authenticates the client, so a client has two keys while one is being [rotated](provider.md#rotating-a-secret).
- `{ method: "private_key_jwt", keys }`, where `keys` is the client's public `KeySet`, from `createKeySet`, `importKeySet` or `createRemoteKeySet`. A remote key set must be created once per client and reused, as described below.

A record that breaks these rules is a bug in the store, and the provider throws `TypeError` for it.

`grantTypes` lists the grants the client may use. `authorization_code` signs users in and brings the refresh grant with it under `offline_access`. `client_credentials` issues an access token to the client itself. It defaults to `["authorization_code"]`, and when given it must be non-empty, without repeats, and hold only those two values. A client with `client_credentials` must authenticate, so its `auth.method` may not be `none`. A client without `authorization_code` may have no `redirectUris`, and its `scopes` need not include `openid`.

`postLogoutRedirectUris` lists where [logout](provider.md#ending-sessions) may send the browser. Each entry is held to the redirect URI rules: an absolute URL of visible ASCII, without fragment or credentials, and not `javascript:`, `data:`, `vbscript:` or `file:`. Absent or empty, no logout of that client redirects.

`ttl` sets this client's token lifetimes, in seconds. It may hold `code`, `accessToken`, `idToken` and `refreshToken`, each held to the range of the [provider option](provider.md#lifetimes) of the same name, and a lifetime it leaves out is the provider's. `interaction` is not one of them, since an interaction exists before the app completes it and stays provider-wide. The provider checks the values when it reads the record, and throws `TypeError` for a value out of range, a value that is not an integer, or a `ttl` that is not an object. A lifetime applies to every token issued to that client from then on, including `expires_in`, the `exp` of a JWT access token and of an ID token, and the `client_credentials` grant, and a record read at the next request is the one that counts. The code's lifetime is read when the app completes the interaction, so `completeAuthorization` reads the client's record, and answers `interaction_not_found` when the client was removed in the meantime. A refresh token family keeps the expiry it got at the code exchange, whatever the record says later.

`requirePkce` defaults to `true`: the authorization request must carry an S256 challenge. A confidential client may set it to `false` to leave the challenge out, as long as it sends a `nonce` and checks it in the ID token; a record that sets it to `false` for `auth.method` `none` is a bug in the store, and the provider throws `TypeError` for it. A challenge that is sent is always enforced. [Clients that send no PKCE](provider.md#clients-that-send-no-pkce) has the rules, and what it means for the interaction and code records, whose `codeChallenge` is then absent. A store must keep a record without `codeChallenge` as one without it: missing or `null`, never an empty string, which the conformance cases check.

`idTokenSigningAlg` picks which of the provider's signing keys signs this client's ID tokens: the first one with that algorithm. Without it, the provider uses the first `RS256` key when it has one, and otherwise its first key; [Signing keys](provider.md#signing-keys) gives the reason. A record that names an algorithm no signing key has is a bug, and the provider throws `TypeError` for it.

`backchannelLogout` registers the client for [back-channel logout](provider.md#back-channel-logout). Its `uri` is the client's `backchannel_logout_uri`, and the app's server calls it, so it must be an absolute `https` URL of visible ASCII, without a fragment or credentials: unlike a redirect URI, a custom scheme or plain `http` is refused. `sessionRequired` is the client's `backchannel_logout_session_required` and defaults to `false`; when it is `true`, the app must give a `sessionId` when it asks for a logout request for the client. A record whose `backchannelLogout` is not an object of that shape, or whose `sessionRequired` is not a boolean, is a bug in the store, and the provider throws `TypeError` for it. Absent, the client has no back-channel logout and the provider has nothing to send it.

`idTokenClaims` defaults to `false`: an ID token carries only protocol claims, and the scope claims are released at userinfo. With `true`, every ID token issued to this client also carries the claims its granted scopes release, from the same `claims` callback, for a relying party that reads only the ID token. A value that is not a boolean is a bug in the store, and the provider throws `TypeError`. [Scope claims in the ID token](provider.md#scope-claims-in-the-id-token) has the rules and the warning about where those claims travel.

`resources` lists the resource servers the client may ask for tokens to, with the `resource` parameter of [RFC 8707](https://www.rfc-editor.org/rfc/rfc8707). Each entry is an absolute URI of visible ASCII without a fragment or a backslash, such as `https://api.example.com` or `urn:example:data`, and a special scheme such as `https` is followed by `//` and the host, so `https:api.example` and `https:///api.example` are refused. A request's `resource` must match one byte for byte. A list that is not an array of such strings is a bug in the store, and the provider throws `TypeError` for it. Absent or empty, the client may name no resource. [Resource indicators](provider.md#resource-indicators) has the rules. A request that names resources puts them on the interaction, code and refresh token records as `resources`, and on the access token record as `audience`; a request that names none leaves those fields absent, except that a JWT access token's record holds the `accessToken.audience` option. A store must keep a record without them as one without them: missing or `null`, never an empty list, which the conformance cases check.

The `keys` values are `@codenhub/jwt` objects, not JSON. A plain object is not one of them, and `@codenhub/jwt` refuses it with `TypeError` when the provider uses it. A store that persists these records therefore keeps each key as a JWK and rebuilds the object on each read, keeping a `client_secret_jwt` client's keys in their order: `exportSecretJwk` or `exportPublicJwk` writes the key, and `importSecretKey` or `importKeySet` reads it back. A secret can be exported only when it was created or imported as extractable. A store may also keep the key objects in memory, as the in-memory store does.

A remote key set is the exception: never rebuild it on each read. Its cached keys and its limit on fetches live in the object, so a new one for every `findClient` call starts empty, and each token request that presents a client assertion for that client, whoever signed it, makes the provider fetch the client's JWKS. Create one per client and keep it, such as in a map keyed by the client identifier and the JWKS URL, and replace it only when the URL changes.

### Removing or disabling a client

The contract has no flag that disables a client: to disable one, make `findClient` return `undefined` for it, and to enable it again, return the record. The provider reads the record on every request that involves the client, so the change takes effect at once:

- Its token requests, authorization requests and logout requests fail as for an unknown client.
- An interaction it started cannot be completed: `completeAuthorization` returns `interaction_not_found`.
- Userinfo and `authenticate` refuse its access tokens with `invalid_token`; `authenticate` names the reason `access_token_client_unknown`.
- Its refresh tokens cannot be redeemed, since the token endpoint authenticates the client first.

What it cannot reach is a JWT access token a resource server verifies offline, which stays valid until it expires. The tokens' rows stay in the store until they expire; revoke each grant with `revokeGrant` when the rows must go sooner, or when the client could come back before they expire and must not find its old tokens working.

### Revoking a user's, session's or client's grants

`revokeGrant` ends one grant. Signing a user out everywhere, ending one of the app's sessions, or cutting off a client ends every grant of that user, session or client, and the contract has no method that finds them: the adapter finds the grant ids itself and calls `revokeGrant` once for each. Every code, access token and refresh token record carries `grantId`, `subject` and `clientId`, and `sessionId` when `completeAuthorization` was given one, so index those four columns in the code, access token and refresh token tables, and take the distinct `grantId` values of the rows that match across all three.

Include the codes not yet exchanged. A grant whose code the client has not redeemed yet has no token row, so a sweep of the token tables alone misses it, and the client then exchanges the code for working tokens after the sweep. `revokeGrant` on its grant hides the tokens that exchange saves, as it hides any token saved after the call. The exchange still answers with an ID token, though, and a JWT access token verifies offline until it expires, as [JWT access tokens](provider.md#jwt-access-tokens) says.

A request already running can still slip past. A refresh in flight during the sweep is covered, since its new tokens keep the grant the sweep revokes and the store hides them. A sign-in the app completes during the sweep is not: it creates a code, and so a grant, that the sweep did not see. Close that window one of two ways:

- Make the provider refuse on its own, from the app's state rather than the store's rows. Have `findClient` return `undefined` for a client that is cut off. For a user or a session, stop completing authorizations for it, answer `false` from [`onRefresh`](provider.md#re-checking-a-refresh), and refuse in [`claims`](provider.md#claims): its `ClaimsRequest` carries `grantId` and `sessionId`, so userinfo stops releasing claims for that session at once, rather than when the access token expires.
- Repeat the sweep after the longest code lifetime, the provider's `ttl.code` or a client's own if longer. A code issued during the first sweep is then either exchanged, and its grant found in the token tables, or expired.

The first takes effect at once; the second needs no callback, but leaves the window open until it runs.

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

`storeConformanceCases` in `@codenhub/oidc/testing` checks an adapter against this contract. It is a list of named cases, and each case takes a factory that returns the adapter under test. A case rejects with an `Error` that names the broken rule, and the message never contains a key or a token.

The factory receives a `StoreSeed`, `{ clients }`: the client records the case needs `findClient` to return. The contract has no method that saves a client, so the factory registers them itself, the way the app's admin side would, and returns a store whose `findClient` finds them. Most cases seed no clients. `createMemoryStore` takes the same shape, so `c.run((seed) => createMemoryStore(seed))` works. `StoreSeed` is exported as a type from `@codenhub/oidc/testing`.

The cases cover:

- Each interaction and code is single-use, and a consumed code is `replayed` on its next use.
- Unknown keys give `undefined`.
- Twenty concurrent `consumeCode` or `consumeRefreshToken` calls give exactly one `consumed` result and 19 `replayed`; twenty concurrent `consumeInteraction` calls give exactly one record and 19 `undefined`.
- A `save*` call for an existing key rejects, and a spent code or refresh token cannot be made consumable again.
- `findAccessToken` is not single-use.
- `revokeGrant` hides the grant's access and refresh tokens, including tokens saved after the call, and leaves other grants alone. A refresh token consumed before the revocation then gives `undefined`, not `replayed`.
- `findClient` gives `undefined` for unknown identifiers, including `__proto__`, `constructor` and `toString`.
- `findClient` matches the identifier byte for byte: a different letter case or a surrounding space finds nothing.
- `findClient` returns a registered client with the values it was registered with, including every optional field, such as `ttl`, `idTokenSigningAlg`, `requirePkce`, `backchannelLogout` and `idTokenClaims`.
- `findClient` returns a `client_secret_jwt` client with as many keys as it was registered with, in their order, each of which still verifies what the registered key signed. The seeded keys are extractable, so an adapter that persists them can export them with `exportSecretJwk`. No case seeds a `private_key_jwt` client, since a `KeySet` cannot be exported; test that your adapter rebuilds one with `importKeySet` yourself.
- A record saved without its optional fields comes back with each one absent: missing, `undefined` or `null`. An empty string, an empty list, `0` or `false` fails, naming the field. This covers every optional field of the interaction, code, access token and refresh token records.
- The records a store returns do not change when the caller changes what it saved.

Passing the concurrent cases does not prove an adapter atomic. Twenty calls from one process can still be served one after another, such as by a database client that sends one query at a time over a single connection, and then a read followed by a separate write passes them while two servers running the same code would not. Make atomicity a property of each statement, as the SQL above does, rather than relying on these cases to find a race.

Records use an `expiresAt` one hour ahead, so an adapter that purges expired rows still passes. Keys are random per case, so the factory may return stores on one shared database. The factory is called once for each case.

With vitest, register each case with `it`:

```ts
import { describe, it } from "vitest";
import { storeConformanceCases } from "@codenhub/oidc/testing";
import type { ClientRecord, OidcStore } from "@codenhub/oidc/provider";

declare const env: { DB: unknown }; // the database binding the adapter uses
declare function createD1Store(db: unknown): OidcStore; // your adapter
declare function registerClient(db: unknown, client: ClientRecord): Promise<void>; // your admin write

describe("OidcStore", () => {
  for (const c of storeConformanceCases) {
    it(c.name, () =>
      c.run(async ({ clients }) => {
        for (const client of clients) {
          await registerClient(env.DB, client);
        }
        return createD1Store(env.DB);
      }),
    );
  }
});
```

`node:test` works the same way, with `test` in place of `it`.
