import type {
  AccessTokenRecord,
  CodeRecord,
  InteractionRecord,
  OidcStore,
  RefreshTokenRecord,
} from "../provider/types";

/** One check of the OidcStore contract. `run` resolves when the store conforms and rejects with an Error naming the broken rule otherwise. */
export interface StoreConformanceCase {
  readonly name: string;
  readonly run: (createStore: () => OidcStore | Promise<OidcStore>) => Promise<void>;
}

/** Every failure message starts with this, so a runner's output names the contract. */
const PREFIX = "OidcStore contract: ";
/** Lifetime of every fixture, in seconds, so an adapter that purges expired rows keeps them. */
const LIFETIME_SECONDS = 3600;
const CONCURRENT_CALLS = 20;
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
    prompt: [],
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
    maxAgeRequested: false,
    expiresAt: now + LIFETIME_SECONDS,
  };
}

function accessTokenFixture(grantId: string): AccessTokenRecord {
  return {
    grantId,
    clientId: "conformance-client",
    subject: "conformance-user",
    scopes: ["openid", "profile"],
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
    expiresAt: now + LIFETIME_SECONDS,
  };
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
    const store = await createStore();
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
      const store = await createStore();
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
      const store = await createStore();
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

  defineCase(
    "consumeCode reports consumed with the saved record once, then replayed with its grant",
    async (createStore) => {
      const store = await createStore();
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
      const store = await createStore();
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
      const store = await createStore();
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
      const store = await createStore();
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
    const store = await createStore();
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

  defineCase("saveInteraction rejects a key that already exists", async (createStore) => {
    const store = await createStore();
    const key = newKey();
    await store.saveInteraction(key, interactionFixture());
    await assertRejects(
      () => store.saveInteraction(key, interactionFixture()),
      "saveInteraction must reject a key that already exists",
    );
  }),

  defineCase("saveAccessToken rejects a key that already exists", async (createStore) => {
    const store = await createStore();
    const key = newKey();
    const grantId = newKey();
    await store.saveAccessToken(key, accessTokenFixture(grantId));
    await assertRejects(
      () => store.saveAccessToken(key, accessTokenFixture(grantId)),
      "saveAccessToken must reject a key that already exists",
    );
  }),

  defineCase("saveRefreshToken rejects a key that already exists", async (createStore) => {
    const store = await createStore();
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
      const store = await createStore();
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
      const store = await createStore();
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
    const store = await createStore();
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
      const store = await createStore();
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
    const store = await createStore();
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

  defineCase(
    "findClient returns undefined for an unknown id, including prototype property names",
    async (createStore) => {
      const store = await createStore();
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
      const store = await createStore();
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
 * Every check of the OidcStore contract, for any test runner: `for (const c of storeConformanceCases) it(c.name, () => c.run(createStore))`.
 *
 * @remarks
 * Each case calls `createStore()` once and runs against the empty store it returns; no clients are needed.
 * Keys and grant identifiers are random per case, so cases never collide even when they share one database.
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
 *     test(c.name, () => c.run(() => createD1Store(env.DB)));
 *   }
 * });
 * ```
 *
 * Vitest and Jest work the same way, with their `describe` and `it`.
 */
export const storeConformanceCases: readonly StoreConformanceCase[] = Object.freeze(cases);
