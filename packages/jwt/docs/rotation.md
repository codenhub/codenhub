---
title: Key rotation
description: Rotating an issuer's signing keys with a key ring, publishing each key before it signs and after it stops, serving the JWKS with a matching Cache-Control, and replacing a leaked key.
order: 5
---

# Key rotation

An issuer that rotates its signing key has to get the order right. A verifier caches your JWKS, so a key must be published before the first token it signs reaches one, or that token fails with `unknown_kid` until the cache expires. And a key must stay published after it stops signing, until every token it signed has expired. `createKeyRing` keeps that schedule for you: you give it your keys and when each one starts signing, and it tells you which key signs now and which keys to publish.

## A key ring

```ts
import { createKeyRing, createVerifier, sign, type PrivateKey } from "@codenhub/jwt";

declare const currentKey: PrivateKey; // kid "2026-11"
declare const nextKey: PrivateKey; // kid "2026-12"

const ring = createKeyRing({
  keys: [
    { key: currentKey, activeFrom: 1_793_491_200 }, // 2026-11-01T00:00:00Z
    { key: nextKey, activeFrom: 1_796_083_200 }, // 2026-12-01T00:00:00Z
  ],
  publishAhead: 86_400, // one day
  publishAfter: 7_200, // two hours: the longest token lifetime plus clock tolerance
});

const token = await sign({
  payload: { iss: "https://issuer.example", sub: "user-1" },
  key: ring.signingKey(),
  issuedAt: true,
  expiresIn: 3600,
});

const verify = createVerifier({ keys: ring, issuer: "https://issuer.example" });

// At your jwks_uri:
const body = JSON.stringify(await ring.jwks());
```

- **`activeFrom`** is when a key starts signing, in seconds since the Unix epoch, like `exp`. A key signs until the next key's `activeFrom`. **`retiredAt`**, optional, stops it earlier, when it must leave service with no successor yet.
- **`signingKey()`** returns the key whose `activeFrom` came last, unless it is retired. It never falls back to a key a later one replaced. Call it for each token, just before `sign`, rather than keeping the key: one kept past its signing window signs tokens that can outlive its place in the JWKS. When no key signs, because every `activeFrom` is still to come or the newest active key is retired, it throws a `TypeError`: signing with no key is a configuration mistake, not something a request can recover from.
- **`jwks()`** resolves to the frozen JWKS of every key published now: from `publishAhead` seconds before its `activeFrom` until `publishAfter` seconds after it stops signing. It holds public keys only, also for keys that are not extractable.
- **The ring is a key set.** Its `select` chooses from the same keys `jwks()` publishes, so your own services accept exactly the keys other verifiers can see. Pass `issuer` to bind them, as [key sets](key-sets.md#keys-of-several-issuers) explains.

Every key needs a `kid`, unique in the ring, since tokens must name the key that signed them once two are published; `generateKeyPair({ kid: "thumbprint" })` gives one. Two keys may not share an `activeFrom`, and a ring holds at most 100 keys, the most a JWKS may list for this package's key sets. Keys may use different algorithms, but verifiers that accept only some algorithms must accept the new one before its `activeFrom`. A ring checks every option when it is created and throws a `TypeError` for an invalid one, as for a name that is not an option.

The ring stores nothing and reads the clock, `now`, at every call. Keep your keys and their times in your own storage, and build the ring from them at startup, or per request on a serverless platform. Every instance built from the same records signs with the same key at the same second, give or take their clocks; around a switch both keys are published, so an instance whose clock runs ahead is harmless.

## Choosing the durations

**`publishAhead`** must cover every copy of your JWKS a verifier may hold: the `max-age` you serve it with, plus any shared cache in between, plus how long a verifier keeps using a JWKS it cannot refresh. For this package's remote key sets that last part is `maxStale`, one hour by default. A day is a comfortable value for scheduled rotation.

**`publishAfter`** must outlast every token the key signed: your longest token lifetime plus the clock tolerance of your verifiers and how far their clocks may lag yours, plus the longest delay you allow between `signingKey()` and `sign` reading the clock, a few seconds when you call one right before the other. A key that leaves the JWKS sooner makes its last tokens fail with `unknown_kid` before they expire.

Serve the JWKS with a `max-age` well below `publishAhead`:

```ts
return new Response(JSON.stringify(await ring.jwks()), {
  headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" },
});
```

A remote key set never caches longer than the `max-age` it is sent, or its `cooldown` when that is longer, so this also bounds how long a key you removed stays trusted elsewhere: `max-age` plus the verifier's `maxStale`. A set started from a [`seed`](key-sets.md#persisting-the-cache) is the exception: a snapshot does not record `max-age`, so the seeded keys are kept for the verifier's `cacheTtl`, and a removed key stays trusted for up to `cacheTtl` plus `maxStale` there. Count on the longer bound when verifiers you do not run may seed their sets.

## Rotating

1. **Add the next key** with an `activeFrom` at least `publishAhead` seconds from now. Generate it, store it with its `activeFrom`, and rebuild the ring. It appears in the JWKS at once, or when its publication starts.
2. **Wait.** At its `activeFrom`, `signingKey()` returns the new key; nothing else changes. The old key stays in the JWKS for `publishAfter` seconds more.
3. **Delete the old key** from your storage once it is out of the JWKS, at the new key's `activeFrom` plus `publishAfter`. A ring ignores keys past their publication, so deleting late is harmless; deleting early ends their tokens early.

An `activeFrom` already in the past is accepted, since the ring cannot know when you first published the key. A key added that way signs at once, and verifiers that cached your JWKS before it was added do not have it: this package's remote key sets fetch again for an unknown `kid`, at most once per `cooldown`, but others may fail until their cache expires.

## Replacing a leaked key

A leaked key must stop signing and stop verifying now, not after `publishAfter`. Delete it from your storage, add a new key with `activeFrom` of the current time, and rebuild the ring on every instance that signs, verifies or serves the JWKS: a ring keeps the keys it was created with. Tokens the leaked key signed stop verifying with your ring at once, and with other verifiers when their copy of your JWKS expires. The new key is not in those copies, so expect `unknown_kid` failures for up to your `max-age` from verifiers that do not refetch for an unknown `kid`; that is the price of the emergency path.
