import { createKeySet, createVerifier, generateSecretKey, sign } from "@codenhub/jwt";

import { OPTIONAL_FIELDS } from "../provider/records";
import type {
  AccessTokenRecord,
  ClientRecord,
  CodeRecord,
  InteractionRecord,
  OidcStore,
  RefreshTokenRecord,
} from "../provider/types";

/**
 * What a case asks the store under test to hold before it runs. The `OidcStore` interface has no method that
 * saves a client, so the factory registers these clients itself, the way the app's admin side would.
 */
export interface StoreSeed {
  /** Clients `findClient` must return. Their identifiers are random per case. */
  readonly clients: readonly ClientRecord[];
}

/** One check of the OidcStore contract. `run` resolves when the store conforms and rejects with an Error naming the broken rule otherwise. */
export interface StoreConformanceCase {
  readonly name: string;
  readonly run: (createStore: (seed: StoreSeed) => OidcStore | Promise<OidcStore>) => Promise<void>;
}

/** Every failure message starts with this, so a runner's output names the contract. */
const PREFIX = "OidcStore contract: ";
/** Lifetime of every fixture, in seconds, so an adapter that purges expired rows keeps them. */
const LIFETIME_SECONDS = 3600;
const CONCURRENT_CALLS = 20;
const NO_CLIENTS: StoreSeed = Object.freeze({ clients: Object.freeze([]) });
const KEY_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Throws an Error naming the broken rule when `condition` is false. */
function assert(condition: boolean, rule: string): asserts condition {
  if (!condition) {
    throw new Error(PREFIX + rule);
  }
}

/**
 * Returns a random key shaped like the provider's keys: 32 random bytes as 43 base64url characters.
 * Keys are random, so cases never collide even when an adapter shares one database.
 */
function newKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let value = 0;
  let bits = 0;
  let out = "";
  for (const byte of bytes) {
    value = ((value << 8) | byte) & 0xffffff;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      out += KEY_ALPHABET[(value >> bits) & 63];
    }
  }
  if (bits > 0) {
    out += KEY_ALPHABET[(value << (6 - bits)) & 63];
  }
  return out;
}

/** Current time in seconds since the Unix epoch. */
function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Whether two plain-data records hold the same values. Key order does not matter, and a key whose value is
 * `undefined` counts as absent, as it does in JSON.
 */
function sameRecord(actual: unknown, expected: unknown): boolean {
  if (actual === expected) {
    return true;
  }
  if (typeof actual !== "object" || typeof expected !== "object" || actual === null || expected === null) {
    return false;
  }
  if (Array.isArray(actual) || Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      Array.isArray(expected) &&
      actual.length === expected.length &&
      actual.every((item, index) => sameRecord(item, expected[index]))
    );
  }
  const actualEntries = definedEntries(actual);
  const expectedEntries = new Map(definedEntries(expected));
  return (
    actualEntries.length === expectedEntries.size &&
    actualEntries.every(([key, value]) => expectedEntries.has(key) && sameRecord(value, expectedEntries.get(key)))
  );
}

function definedEntries(value: object): [string, unknown][] {
  return Object.entries(value).filter(([, entry]) => entry !== undefined);
}

function interactionFixture(): InteractionRecord {
  const now = nowSeconds();
  return {
    clientId: "conformance-client",
    redirectUri: "https://app.example/callback",
    scopes: ["openid", "profile"],
    state: "conformance-state",
    nonce: "conformance-nonce",
    codeChallenge: "conformance-challenge",
    prompt: ["login", "consent"],
    maxAge: 0,
    loginHint: "ada@example.test",
    uiLocales: ["en", "pt-BR"],
    acrValues: ["conformance-acr"],
    claimsLocales: ["en"],
    display: "popup",
    resources: ["https://api.example/", "urn:example:data"],
    responseMode: "form_post",
    extensions: { screen_hint: "signup" },
    createdAt: now,
    expiresAt: now + LIFETIME_SECONDS,
  };
}

function codeFixture(grantId: string): CodeRecord {
  const now = nowSeconds();
  return {
    grantId,
    clientId: "conformance-client",
    redirectUri: "https://app.example/callback",
    codeChallenge: "conformance-challenge",
    nonce: "conformance-nonce",
    scopes: ["openid", "profile"],
    subject: "conformance-user",
    authTime: now,
    amr: ["pwd", "otp"],
    acr: "urn:example:loa2",
    sessionId: "conformance-session",
    resources: ["https://api.example/", "urn:example:data"],
    expiresAt: now + LIFETIME_SECONDS,
  };
}

function accessTokenFixture(grantId: string): AccessTokenRecord {
  return {
    grantId,
    clientId: "conformance-client",
    subject: "conformance-user",
    scopes: ["openid", "profile"],
    grantType: "authorization_code",
    authTime: nowSeconds(),
    amr: ["pwd", "otp"],
    acr: "urn:example:loa2",
    sessionId: "conformance-session",
    audience: ["https://api.example/", "urn:example:data"],
    expiresAt: nowSeconds() + LIFETIME_SECONDS,
  };
}

function refreshTokenFixture(grantId: string): RefreshTokenRecord {
  const now = nowSeconds();
  return {
    grantId,
    clientId: "conformance-client",
    subject: "conformance-user",
    scopes: ["openid", "profile"],
    authTime: now,
    amr: ["pwd", "otp"],
    acr: "urn:example:loa2",
    sessionId: "conformance-session",
    resources: ["https://api.example/", "urn:example:data"],
    issuedAt: now,
    expiresAt: now + LIFETIME_SECONDS,
  };
}

/** A copy of `record` without the fields named in `names`, as the provider saves a record that has none of them. */
function withoutFields<T extends object>(record: T, names: readonly string[]): T {
  return Object.fromEntries(Object.entries(record).filter(([name]) => !names.includes(name))) as T;
}

/**
 * Checks a record saved without any optional field: each must come back absent, as a missing member, `undefined`
 * or `null`, and every other field as it was saved. `""`, `[]`, `0` or `false` is a value, and fails naming the field.
 */
function assertOptionalFieldsAbsent(
  method: string,
  actual: unknown,
  expected: object,
  optional: readonly string[],
): void {
  assert(typeof actual === "object" && actual !== null, `${method} must return the record that was saved`);
  const returned = actual as Record<string, unknown>;
  for (const name of optional) {
    const value = returned[name];
    assert(
      value === undefined || value === null,
      `${method} must return a record saved without ${name} with no ${name}: missing, undefined or null, never another value`,
    );
  }
  assert(
    sameRecord(withoutFields(returned, optional), expected),
    `${method} must return the other fields of a record saved without optional fields as they were saved`,
  );
}

/** Passes when `operation` rejects. `rule` is the failure message when it resolves. */
async function assertRejects(operation: () => Promise<unknown>, rule: string): Promise<void> {
  let rejected = false;
  try {
    await operation();
  } catch {
    rejected = true;
  }
  assert(rejected, rule);
}

/** Freezes a case, so a runner cannot change it. */
function defineCase(name: string, run: StoreConformanceCase["run"]): StoreConformanceCase {
  return Object.freeze({ name, run });
}

const cases: StoreConformanceCase[] = [
  defineCase("consumeInteraction returns the saved record once, then undefined", async (createStore) => {
    const store = await createStore(NO_CLIENTS);
    const key = newKey();
    const record = interactionFixture();
    const expected = structuredClone(record);
    await store.saveInteraction(key, record);
    assert(
      sameRecord(await store.consumeInteraction(key), expected),
      "consumeInteraction must return the record that saveInteraction saved",
    );
    assert(
      (await store.consumeInteraction(key)) === undefined,
      "consumeInteraction must return undefined on a second call",
    );
  }),

  defineCase(
    "20 concurrent consumeInteraction calls on one key yield exactly one record and 19 undefined",
    async (createStore) => {
      const store = await createStore(NO_CLIENTS);
      const key = newKey();
      await store.saveInteraction(key, interactionFixture());
      const results = await Promise.all(Array.from({ length: CONCURRENT_CALLS }, () => store.consumeInteraction(key)));
      const records = results.filter((result) => result !== undefined).length;
      const empty = results.filter((result) => result === undefined).length;
      assert(
        records === 1 && empty === CONCURRENT_CALLS - 1,
        "consumeInteraction must be atomic: of concurrent calls on one key, exactly one may get the record",
      );
    },
  ),

  defineCase(
    "consumeInteraction, consumeCode, consumeRefreshToken and findAccessToken return undefined for an unknown key",
    async (createStore) => {
      const store = await createStore(NO_CLIENTS);
      const key = newKey();
      assert(
        (await store.consumeInteraction(key)) === undefined,
        "consumeInteraction must return undefined for a key never saved",
      );
      assert((await store.consumeCode(key)) === undefined, "consumeCode must return undefined for a key never saved");
      assert(
        (await store.consumeRefreshToken(key)) === undefined,
        "consumeRefreshToken must return undefined for a key never saved",
      );
      assert(
        (await store.findAccessToken(key)) === undefined,
        "findAccessToken must return undefined for a key never saved",
      );
    },
  ),

  defineCase("a record saved without its optional fields comes back with each one absent", async (createStore) => {
    const store = await createStore(NO_CLIENTS);
    const keys = { interaction: newKey(), code: newKey(), accessToken: newKey(), refreshToken: newKey() };
    // A request without state, nonce, PKCE or resources, a grant without amr, acr or session, and a row written
    // before a field existed all leave fields out. The provider reads null as absent, so a SQL column that returns
    // NULL passes; an empty string, an empty list, 0 or false is a value, and the provider would use it.
    const interaction = withoutFields(interactionFixture(), OPTIONAL_FIELDS.interaction);
    const code = withoutFields(codeFixture(newKey()), OPTIONAL_FIELDS.code);
    const accessToken = withoutFields(accessTokenFixture(newKey()), OPTIONAL_FIELDS.accessToken);
    const refreshToken = withoutFields(refreshTokenFixture(newKey()), OPTIONAL_FIELDS.refreshToken);
    await store.saveInteraction(keys.interaction, interaction);
    await store.saveCode(keys.code, code);
    await store.saveAccessToken(keys.accessToken, accessToken);
    await store.saveRefreshToken(keys.refreshToken, refreshToken);
    assertOptionalFieldsAbsent(
      "consumeInteraction",
      await store.consumeInteraction(keys.interaction),
      interaction,
      OPTIONAL_FIELDS.interaction,
    );
    const consumedCode = await store.consumeCode(keys.code);
    assert(consumedCode?.status === "consumed", "consumeCode must return consumed on the first call");
    assertOptionalFieldsAbsent("consumeCode", consumedCode.record, code, OPTIONAL_FIELDS.code);
    assertOptionalFieldsAbsent(
      "findAccessToken",
      await store.findAccessToken(keys.accessToken),
      accessToken,
      OPTIONAL_FIELDS.accessToken,
    );
    const consumedRefresh = await store.consumeRefreshToken(keys.refreshToken);
    assert(consumedRefresh?.status === "consumed", "consumeRefreshToken must return consumed on the first call");
    assertOptionalFieldsAbsent(
      "consumeRefreshToken",
      consumedRefresh.record,
      refreshToken,
      OPTIONAL_FIELDS.refreshToken,
    );
  }),

  defineCase(
    "consumeCode reports consumed with the saved record once, then replayed with its grant",
    async (createStore) => {
      const store = await createStore(NO_CLIENTS);
      const key = newKey();
      const grantId = newKey();
      const record = codeFixture(grantId);
      const expected = structuredClone(record);
      await store.saveCode(key, record);
      const first = await store.consumeCode(key);
      assert(
        first !== undefined && first.status === "consumed" && sameRecord(first.record, expected),
        "consumeCode must return consumed with the record that saveCode saved on the first call",
      );
      const second = await store.consumeCode(key);
      assert(
        second !== undefined && second.status === "replayed" && second.grantId === grantId,
        "consumeCode must return replayed with the record's grantId on a second call",
      );
    },
  ),

  defineCase(
    "consumeRefreshToken reports consumed with the saved record once, then replayed with its grant",
    async (createStore) => {
      const store = await createStore(NO_CLIENTS);
      const key = newKey();
      const grantId = newKey();
      const record = refreshTokenFixture(grantId);
      const expected = structuredClone(record);
      await store.saveRefreshToken(key, record);
      const first = await store.consumeRefreshToken(key);
      assert(
        first !== undefined && first.status === "consumed" && sameRecord(first.record, expected),
        "consumeRefreshToken must return consumed with the record that saveRefreshToken saved on the first call",
      );
      const second = await store.consumeRefreshToken(key);
      assert(
        second !== undefined && second.status === "replayed" && second.grantId === grantId,
        "consumeRefreshToken must return replayed with the record's grantId on a second call",
      );
    },
  ),

  defineCase(
    "20 concurrent consumeCode calls on one key yield exactly one consumed and 19 replayed",
    async (createStore) => {
      const store = await createStore(NO_CLIENTS);
      const key = newKey();
      await store.saveCode(key, codeFixture(newKey()));
      const results = await Promise.all(Array.from({ length: CONCURRENT_CALLS }, () => store.consumeCode(key)));
      const consumed = results.filter((result) => result?.status === "consumed").length;
      const replayed = results.filter((result) => result?.status === "replayed").length;
      assert(
        consumed === 1 && replayed === CONCURRENT_CALLS - 1,
        "consumeCode must be atomic: of concurrent calls on one key, exactly one may get consumed",
      );
    },
  ),

  defineCase(
    "20 concurrent consumeRefreshToken calls on one key yield exactly one consumed and 19 replayed",
    async (createStore) => {
      const store = await createStore(NO_CLIENTS);
      const key = newKey();
      await store.saveRefreshToken(key, refreshTokenFixture(newKey()));
      const results = await Promise.all(Array.from({ length: CONCURRENT_CALLS }, () => store.consumeRefreshToken(key)));
      const consumed = results.filter((result) => result?.status === "consumed").length;
      const replayed = results.filter((result) => result?.status === "replayed").length;
      assert(
        consumed === 1 && replayed === CONCURRENT_CALLS - 1,
        "consumeRefreshToken must be atomic: of concurrent calls on one key, exactly one may get consumed",
      );
    },
  ),

  defineCase("saveCode rejects an existing key, and a consumed code stays spent", async (createStore) => {
    const store = await createStore(NO_CLIENTS);
    const key = newKey();
    const grantId = newKey();
    await store.saveCode(key, codeFixture(grantId));
    await store.consumeCode(key);
    await assertRejects(
      () => store.saveCode(key, codeFixture(grantId)),
      "saveCode must reject a key that already exists",
    );
    const after = await store.consumeCode(key);
    assert(
      after !== undefined && after.status === "replayed",
      "a rejected saveCode must not make a consumed code consumable again",
    );
  }),

  defineCase(
    "saveRefreshToken rejects an existing key, and a consumed refresh token stays spent",
    async (createStore) => {
      const store = await createStore(NO_CLIENTS);
      const key = newKey();
      const grantId = newKey();
      await store.saveRefreshToken(key, refreshTokenFixture(grantId));
      await store.consumeRefreshToken(key);
      await assertRejects(
        () => store.saveRefreshToken(key, refreshTokenFixture(grantId)),
        "saveRefreshToken must reject a key that already exists",
      );
      const after = await store.consumeRefreshToken(key);
      assert(
        after !== undefined && after.status === "replayed",
        "a rejected saveRefreshToken must not make a consumed refresh token consumable again",
      );
    },
  ),

  defineCase("saveInteraction rejects a key that already exists", async (createStore) => {
    const store = await createStore(NO_CLIENTS);
    const key = newKey();
    await store.saveInteraction(key, interactionFixture());
    await assertRejects(
      () => store.saveInteraction(key, interactionFixture()),
      "saveInteraction must reject a key that already exists",
    );
  }),

  defineCase("saveAccessToken rejects a key that already exists", async (createStore) => {
    const store = await createStore(NO_CLIENTS);
    const key = newKey();
    const grantId = newKey();
    await store.saveAccessToken(key, accessTokenFixture(grantId));
    await assertRejects(
      () => store.saveAccessToken(key, accessTokenFixture(grantId)),
      "saveAccessToken must reject a key that already exists",
    );
  }),

  defineCase("saveRefreshToken rejects a key that already exists", async (createStore) => {
    const store = await createStore(NO_CLIENTS);
    const key = newKey();
    const grantId = newKey();
    await store.saveRefreshToken(key, refreshTokenFixture(grantId));
    await assertRejects(
      () => store.saveRefreshToken(key, refreshTokenFixture(grantId)),
      "saveRefreshToken must reject a key that already exists",
    );
  }),

  defineCase(
    "revokeGrant makes a refresh token that was already consumed return undefined, not replayed",
    async (createStore) => {
      const store = await createStore(NO_CLIENTS);
      const key = newKey();
      const grantId = newKey();
      await store.saveRefreshToken(key, refreshTokenFixture(grantId));
      const first = await store.consumeRefreshToken(key);
      assert(
        first !== undefined && first.status === "consumed",
        "consumeRefreshToken must return consumed on the first call",
      );
      await store.revokeGrant(grantId);
      assert(
        (await store.consumeRefreshToken(key)) === undefined,
        "consumeRefreshToken must return undefined, not replayed, for a refresh token whose grant was revoked after it was consumed",
      );
    },
  ),

  defineCase(
    "findAccessToken returns the saved record on every call, since it is not single-use",
    async (createStore) => {
      const store = await createStore(NO_CLIENTS);
      const key = newKey();
      const record = accessTokenFixture(newKey());
      const expected = structuredClone(record);
      await store.saveAccessToken(key, record);
      assert(
        sameRecord(await store.findAccessToken(key), expected),
        "findAccessToken must return the record that saveAccessToken saved",
      );
      assert(
        sameRecord(await store.findAccessToken(key), expected),
        "findAccessToken must return the record again on a second call",
      );
    },
  ),

  defineCase("revokeGrant hides that grant's access token and refresh token", async (createStore) => {
    const store = await createStore(NO_CLIENTS);
    const grantId = newKey();
    const accessKey = newKey();
    const refreshKey = newKey();
    await store.saveAccessToken(accessKey, accessTokenFixture(grantId));
    await store.saveRefreshToken(refreshKey, refreshTokenFixture(grantId));
    await store.revokeGrant(grantId);
    assert(
      (await store.findAccessToken(accessKey)) === undefined,
      "findAccessToken must return undefined for an access token whose grant was revoked",
    );
    assert(
      (await store.consumeRefreshToken(refreshKey)) === undefined,
      "consumeRefreshToken must return undefined for a refresh token whose grant was revoked",
    );
  }),

  defineCase(
    "revokeGrant also hides access and refresh tokens of that grant saved after the revocation",
    async (createStore) => {
      const store = await createStore(NO_CLIENTS);
      const grantId = newKey();
      const accessKey = newKey();
      const refreshKey = newKey();
      await store.revokeGrant(grantId);
      await store.saveAccessToken(accessKey, accessTokenFixture(grantId));
      await store.saveRefreshToken(refreshKey, refreshTokenFixture(grantId));
      assert(
        (await store.findAccessToken(accessKey)) === undefined,
        "findAccessToken must return undefined for a token saved after its grant was revoked",
      );
      assert(
        (await store.consumeRefreshToken(refreshKey)) === undefined,
        "consumeRefreshToken must return undefined for a token saved after its grant was revoked",
      );
    },
  ),

  defineCase("revokeGrant does not affect another grant's tokens", async (createStore) => {
    const store = await createStore(NO_CLIENTS);
    const revokedGrant = newKey();
    const otherGrant = newKey();
    const otherAccessKey = newKey();
    const otherRefreshKey = newKey();
    const otherAccess = accessTokenFixture(otherGrant);
    const otherAccessExpected = structuredClone(otherAccess);
    await store.saveAccessToken(otherAccessKey, otherAccess);
    await store.saveRefreshToken(otherRefreshKey, refreshTokenFixture(otherGrant));
    await store.revokeGrant(revokedGrant);
    assert(
      sameRecord(await store.findAccessToken(otherAccessKey), otherAccessExpected),
      "revokeGrant must leave an access token of another grant findable",
    );
    const refresh = await store.consumeRefreshToken(otherRefreshKey);
    assert(
      refresh !== undefined && refresh.status === "consumed",
      "revokeGrant must leave a refresh token of another grant consumable",
    );
  }),

  defineCase("findClient returns a registered client with the values it was registered with", async (createStore) => {
    const client: ClientRecord = {
      clientId: `conformance-${newKey()}`,
      redirectUris: ["https://app.example/callback", "https://app.example/callback?tenant=a"],
      scopes: ["openid", "profile", "offline_access"],
      auth: { method: "client_secret_basic", secretHashes: [newKey()] },
      grantTypes: ["authorization_code"],
      postLogoutRedirectUris: ["https://app.example/signed-out"],
      resources: ["https://api.example/", "urn:example:data"],
    };
    const store = await createStore({ clients: [structuredClone(client)] });
    assert(
      sameRecord(await store.findClient(client.clientId), client),
      "findClient must return a registered client with the values it was registered with",
    );
  }),

  defineCase("findClient matches the identifier byte for byte", async (createStore) => {
    const clientId = `conformance-${newKey().toLowerCase()}`;
    const store = await createStore({
      clients: [
        {
          clientId,
          redirectUris: ["https://app.example/callback"],
          scopes: ["openid"],
          auth: { method: "none" },
        },
      ],
    });
    const lookalikes = [clientId.toUpperCase(), `${clientId} `, ` ${clientId}`];
    const found = await Promise.all(lookalikes.map((lookalike) => store.findClient(lookalike)));
    assert(
      found.every((record) => record === undefined),
      "findClient must match the identifier byte for byte, without ignoring case or trimming spaces",
    );
  }),

  defineCase("findClient returns every optional field a client was registered with", async (createStore) => {
    const client: ClientRecord = {
      clientId: `conformance-${newKey()}`,
      redirectUris: ["https://app.example/callback"],
      scopes: ["openid", "email"],
      auth: { method: "client_secret_post", secretHashes: [newKey(), newKey()] },
      grantTypes: ["authorization_code", "client_credentials"],
      postLogoutRedirectUris: ["https://app.example/signed-out"],
      ttl: { code: 120, accessToken: 300, idToken: 900, refreshToken: 86400 },
      idTokenSigningAlg: "ES256",
      requirePkce: false,
      backchannelLogout: { uri: "https://app.example/backchannel-logout", sessionRequired: true },
      idTokenClaims: true,
      resources: ["https://api.example/"],
    };
    const store = await createStore({ clients: [structuredClone(client)] });
    assert(
      sameRecord(await store.findClient(client.clientId), client),
      "findClient must return every optional field a client was registered with, such as ttl, idTokenSigningAlg, requirePkce, backchannelLogout and idTokenClaims",
    );
  }),

  defineCase("findClient returns a client_secret_jwt client whose keys still verify", async (createStore) => {
    // Extractable, so an adapter that persists the keys can export them as JWKs, as `docs/store.md` describes. Two
    // keys, as a client has while its secret is rotated, in the order they were registered.
    const keys = await Promise.all([
      generateSecretKey({ alg: "HS256", extractable: true }),
      generateSecretKey({ alg: "HS256", extractable: true }),
    ]);
    const clientId = `conformance-${newKey()}`;
    const expected = { clientId, redirectUris: ["https://app.example/callback"], scopes: ["openid"] };
    const client: ClientRecord = { ...expected, auth: { method: "client_secret_jwt", keys } };
    const store = await createStore({ clients: [client] });
    const found = await store.findClient(clientId);
    const { auth, ...rest } = found ?? client;
    assert(
      found !== undefined &&
        auth.method === "client_secret_jwt" &&
        Array.isArray(auth.keys) &&
        auth.keys.length === keys.length &&
        sameRecord(rest, expected),
      "findClient must return a client_secret_jwt client with the values and the number of keys it was registered with",
    );
    const now = nowSeconds();
    const verifiedEach = await Promise.all(
      keys.map(async (key, index) => {
        const assertion = await sign({ payload: { iss: clientId, sub: clientId, iat: now, exp: now + 60 }, key });
        try {
          const returned = auth.keys[index];
          return (
            returned !== undefined &&
            (await createVerifier({ keys: createKeySet([returned]), issuer: clientId })(assertion)).ok
          );
        } catch {
          // A key that is not a `SecretKey`, such as one rebuilt as a plain object, is refused with a TypeError.
          return false;
        }
      }),
    );
    assert(
      verifiedEach.every(Boolean),
      "findClient must return each client_secret_jwt key, in its order, so that it verifies what the registered key signed",
    );
  }),

  defineCase(
    "findClient returns undefined for an unknown id, including prototype property names",
    async (createStore) => {
      const store = await createStore(NO_CLIENTS);
      const clientIds = [`unknown-${newKey()}`, "__proto__", "constructor", "toString"];
      const found = await Promise.all(clientIds.map((clientId) => store.findClient(clientId)));
      for (const client of found) {
        assert(
          client === undefined,
          "findClient must return undefined for an id that no client has, including __proto__, constructor and toString",
        );
      }
    },
  ),

  defineCase(
    "a record the store returns does not change when the caller mutates the object it saved",
    async (createStore) => {
      const store = await createStore(NO_CLIENTS);
      const interaction = interactionFixture();
      const interactionExpected = structuredClone(interaction);
      const code = codeFixture(newKey());
      const codeExpected = structuredClone(code);
      const accessToken = accessTokenFixture(newKey());
      const accessTokenExpected = structuredClone(accessToken);
      const refreshToken = refreshTokenFixture(newKey());
      const refreshTokenExpected = structuredClone(refreshToken);
      const interactionKey = newKey();
      const codeKey = newKey();
      const accessKey = newKey();
      const refreshKey = newKey();
      await store.saveInteraction(interactionKey, interaction);
      await store.saveCode(codeKey, code);
      await store.saveAccessToken(accessKey, accessToken);
      await store.saveRefreshToken(refreshKey, refreshToken);
      // Changes the caller's own objects after saving. The store must have copied them.
      for (const record of [interaction, code, accessToken, refreshToken]) {
        (record.scopes as string[]).push("mutated-by-caller");
      }
      assert(
        sameRecord(await store.consumeInteraction(interactionKey), interactionExpected),
        "consumeInteraction must return the saved values, unaffected by later changes to the saved object",
      );
      const consumedCode = await store.consumeCode(codeKey);
      assert(
        consumedCode !== undefined &&
          consumedCode.status === "consumed" &&
          sameRecord(consumedCode.record, codeExpected),
        "consumeCode must return the saved values, unaffected by later changes to the saved object",
      );
      assert(
        sameRecord(await store.findAccessToken(accessKey), accessTokenExpected),
        "findAccessToken must return the saved values, unaffected by later changes to the saved object",
      );
      const consumedRefresh = await store.consumeRefreshToken(refreshKey);
      assert(
        consumedRefresh !== undefined &&
          consumedRefresh.status === "consumed" &&
          sameRecord(consumedRefresh.record, refreshTokenExpected),
        "consumeRefreshToken must return the saved values, unaffected by later changes to the saved object",
      );
    },
  ),
];

/**
 * Every check of the OidcStore contract, for any test runner: `for (const c of storeConformanceCases) it(c.name, () => c.run((seed) => createStore(seed)))`.
 *
 * @remarks
 * Each case calls `createStore(seed)` once and runs against the store it returns, which must hold the clients in
 * `seed.clients` and nothing else the case relies on. Most cases pass no clients. Keys, grant identifiers and
 * client identifiers are random per case, so cases never collide even when they share one database.
 * Failures are plain `Error`s whose message names the broken rule and never a key or token value.
 *
 * Wire the suite into a runner by calling each case with a factory for the adapter under test. With Node.js's
 * built-in runner:
 *
 * @example
 * ```ts
 * import { describe, test } from "node:test";
 * import { storeConformanceCases } from "@codenhub/oidc/testing";
 *
 * describe("OidcStore", () => {
 *   for (const c of storeConformanceCases) {
 *     test(c.name, () =>
 *       c.run(async ({ clients }) => {
 *         for (const client of clients) {
 *           await registerClient(env.DB, client); // the app's own admin write
 *         }
 *         return createD1Store(env.DB);
 *       }),
 *     );
 *   }
 * });
 * ```
 *
 * Vitest and Jest work the same way, with their `describe` and `it`.
 */
export const storeConformanceCases: readonly StoreConformanceCase[] = Object.freeze(cases);
