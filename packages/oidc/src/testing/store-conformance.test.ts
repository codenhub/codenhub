import { describe, expect, it } from "vitest";

import type {
  AccessTokenRecord,
  ClientRecord,
  CodeRecord,
  InteractionRecord,
  OidcStore,
  RefreshTokenRecord,
} from "../provider/types";
import { createMemoryStore } from "./memory-store";
import { type StoreSeed, storeConformanceCases } from "./store-conformance";

it.each(storeConformanceCases)("$name", async (c) => {
  await expect(c.run((seed) => createMemoryStore(seed))).resolves.toBeUndefined();
});

/** Runs the named case against `createStore` and returns the Error it rejects with. */
async function failureOf(name: string, createStore: (seed: StoreSeed) => OidcStore): Promise<Error> {
  const testCase = storeConformanceCases.find((candidate) => candidate.name === name);
  if (testCase === undefined) {
    throw new Error(`no conformance case named "${name}"`);
  }
  try {
    await testCase.run(createStore);
  } catch (error) {
    return error as Error;
  }
  throw new Error(`expected "${name}" to reject for this broken store`);
}

/** Wraps a store so every string argument it is called with is recorded, to check error messages for keys. */
function recordArguments(store: OidcStore, seen: string[]): OidcStore {
  return new Proxy(store, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property);
      if (typeof value !== "function") {
        return value;
      }
      return (...args: unknown[]) => {
        for (const arg of args) {
          if (typeof arg === "string") {
            seen.push(arg);
          }
        }
        return Reflect.apply(value, target, args);
      };
    },
  });
}

/** Asserts that no failure message contains any value the case passed to the store. */
function expectNoKeyInMessage(error: Error, seen: readonly string[]): void {
  expect(seen.length).toBeGreaterThan(0);
  expect(error.message).toMatch(/^OidcStore contract: /);
  for (const value of seen) {
    expect(error.message).not.toContain(value);
  }
}

describe("storeConformanceCases rejects broken stores", () => {
  const ABSENT_CASE = "a record saved without its optional fields comes back with each one absent";

  /** A store whose reads hand every absent optional field back as `value`, as a SQL column mapping might. */
  function fillingAbsent(value: unknown): OidcStore {
    const memory = createMemoryStore();
    const fill = <T extends object>(record: T, names: readonly string[]): T => ({
      ...Object.fromEntries(names.map((name) => [name, value])),
      ...record,
    });
    const interactionFields = ["state", "nonce", "codeChallenge", "maxAge", "loginHint", "uiLocales"];
    const codeFields = ["codeChallenge", "nonce", "amr", "acr", "sessionId", "resources"];
    const accessFields = ["grantType", "authTime", "amr", "acr", "sessionId", "audience"];
    const refreshFields = ["amr", "acr", "sessionId", "resources", "issuedAt"];
    return {
      ...memory,
      consumeInteraction: async (key) => {
        const record = await memory.consumeInteraction(key);
        return record === undefined ? undefined : fill(record, interactionFields);
      },
      consumeCode: async (key) => {
        const consumption = await memory.consumeCode(key);
        return consumption?.status === "consumed"
          ? { status: "consumed", record: fill(consumption.record, codeFields) }
          : consumption;
      },
      findAccessToken: async (key) => {
        const record = await memory.findAccessToken(key);
        return record === undefined ? undefined : fill(record, accessFields);
      },
      consumeRefreshToken: async (key) => {
        const consumption = await memory.consumeRefreshToken(key);
        return consumption?.status === "consumed"
          ? { status: "consumed", record: fill(consumption.record, refreshFields) }
          : consumption;
      },
    };
  }

  it("passes the absent-fields case when a store hands every absent optional field back as null", async () => {
    const testCase = storeConformanceCases.find((candidate) => candidate.name === ABSENT_CASE);

    expect(testCase).toBeDefined();
    await expect(testCase?.run(() => fillingAbsent(null))).resolves.toBeUndefined();
  });

  it.each([
    ["an empty string", ""],
    ["an empty list", []],
    ["zero", 0],
    ["false", false],
  ])("fails the absent-fields case, naming the field, when a store hands one back as %s", async (_name, value) => {
    const error = await failureOf(ABSENT_CASE, () => fillingAbsent(value));

    expect(error.message).toBe(
      "OidcStore contract: consumeInteraction must return a record saved without state with no state: missing, undefined or null, never another value",
    );
  });

  it("names the access token field a store fills in, such as an empty audience", async () => {
    const memory = createMemoryStore();
    const error = await failureOf(ABSENT_CASE, () => ({
      ...memory,
      findAccessToken: async (key) => {
        const record = await memory.findAccessToken(key);
        return record === undefined ? undefined : { ...record, audience: [] };
      },
    }));

    expect(error.message).toContain("findAccessToken must return a record saved without audience with no audience");
  });

  it("fails the concurrent consumeInteraction case when the read and the delete straddle an await", async () => {
    const interactions = new Map<string, InteractionRecord>();
    const createBroken = (): OidcStore => ({
      ...createMemoryStore(),
      saveInteraction: async (key, record) => {
        interactions.set(key, structuredClone(record));
      },
      consumeInteraction: async (key) => {
        const record = interactions.get(key);
        await Promise.resolve();
        interactions.delete(key);
        return record;
      },
    });

    const seen: string[] = [];
    const error = await failureOf(
      "20 concurrent consumeInteraction calls on one key yield exactly one record and 19 undefined",
      () => recordArguments(createBroken(), seen),
    );
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain("consumeInteraction must be atomic");
    expectNoKeyInMessage(error, seen);
  });

  it("fails the revoked-after-consumed case when used is checked before the revocation set", async () => {
    const refreshTokens = new Map<string, { record: RefreshTokenRecord; used: boolean }>();
    const revoked = new Set<string>();
    const createBroken = (): OidcStore => ({
      ...createMemoryStore(),
      saveRefreshToken: async (key, record) => {
        refreshTokens.set(key, { record: structuredClone(record), used: false });
      },
      consumeRefreshToken: async (key) => {
        const entry = refreshTokens.get(key);
        if (entry === undefined) {
          return undefined;
        }
        if (entry.used) {
          return { status: "replayed", grantId: entry.record.grantId };
        }
        if (revoked.has(entry.record.grantId)) {
          return undefined;
        }
        entry.used = true;
        return { status: "consumed", record: structuredClone(entry.record) };
      },
      revokeGrant: async (grantId) => {
        revoked.add(grantId);
      },
    });

    const seen: string[] = [];
    const error = await failureOf(
      "revokeGrant makes a refresh token that was already consumed return undefined, not replayed",
      () => recordArguments(createBroken(), seen),
    );
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain("undefined, not replayed");
    expectNoKeyInMessage(error, seen);
  });

  it("fails consumeCode and the concurrent consume case when no call reports replayed", async () => {
    const codes = new Map<string, CodeRecord>();
    const createBroken = (): OidcStore => ({
      ...createMemoryStore(),
      saveCode: async (key, record) => {
        codes.set(key, structuredClone(record));
      },
      consumeCode: async (key) => {
        const record = codes.get(key);
        return record === undefined ? undefined : { status: "consumed", record: structuredClone(record) };
      },
    });

    const seen: string[] = [];
    const replay = await failureOf(
      "consumeCode reports consumed with the saved record once, then replayed with its grant",
      () => recordArguments(createBroken(), seen),
    );
    expect(replay).toBeInstanceOf(Error);
    expectNoKeyInMessage(replay, seen);

    const concurrent = await failureOf(
      "20 concurrent consumeCode calls on one key yield exactly one consumed and 19 replayed",
      () => recordArguments(createBroken(), seen),
    );
    expect(concurrent).toBeInstanceOf(Error);
    expectNoKeyInMessage(concurrent, seen);
  });

  it("fails the revocation cases when revokeGrant does nothing", async () => {
    const createBroken = (): OidcStore => ({
      ...createMemoryStore(),
      revokeGrant: () => Promise.resolve(),
    });

    const seen: string[] = [];
    const existing = await failureOf("revokeGrant hides that grant's access token and refresh token", () =>
      recordArguments(createBroken(), seen),
    );
    expect(existing).toBeInstanceOf(Error);
    expectNoKeyInMessage(existing, seen);

    const later = await failureOf(
      "revokeGrant also hides access and refresh tokens of that grant saved after the revocation",
      () => recordArguments(createBroken(), seen),
    );
    expect(later).toBeInstanceOf(Error);
    expectNoKeyInMessage(later, seen);
  });

  it("fails the spent-code case when saveCode overwrites an existing key", async () => {
    const codes = new Map<string, { record: CodeRecord; used: boolean }>();
    const createBroken = (): OidcStore => ({
      ...createMemoryStore(),
      saveCode: async (key, record) => {
        codes.set(key, { record: structuredClone(record), used: false });
      },
      consumeCode: async (key) => {
        const entry = codes.get(key);
        if (entry === undefined) {
          return undefined;
        }
        if (entry.used) {
          return { status: "replayed", grantId: entry.record.grantId };
        }
        entry.used = true;
        return { status: "consumed", record: structuredClone(entry.record) };
      },
    });

    const seen: string[] = [];
    const error = await failureOf("saveCode rejects an existing key, and a consumed code stays spent", () =>
      recordArguments(createBroken(), seen),
    );
    expect(error).toBeInstanceOf(Error);
    expectNoKeyInMessage(error, seen);
  });

  it("fails the post-revocation case when revocation hides existing tokens but not later ones", async () => {
    const grantOf = new Map<string, string>();
    const hidden = new Set<string>();
    const createBroken = (): OidcStore => {
      const base = createMemoryStore();
      return {
        ...base,
        saveAccessToken: (key, record: AccessTokenRecord) => {
          grantOf.set(key, record.grantId);
          return base.saveAccessToken(key, record);
        },
        saveRefreshToken: (key, record: RefreshTokenRecord) => {
          grantOf.set(key, record.grantId);
          return base.saveRefreshToken(key, record);
        },
        findAccessToken: (key) => (hidden.has(key) ? Promise.resolve(undefined) : base.findAccessToken(key)),
        consumeRefreshToken: (key) => (hidden.has(key) ? Promise.resolve(undefined) : base.consumeRefreshToken(key)),
        revokeGrant: (grantId) => {
          for (const [key, owner] of grantOf) {
            if (owner === grantId) {
              hidden.add(key);
            }
          }
          return Promise.resolve();
        },
      };
    };

    const seen: string[] = [];
    const error = await failureOf(
      "revokeGrant also hides access and refresh tokens of that grant saved after the revocation",
      () => recordArguments(createBroken(), seen),
    );
    expect(error).toBeInstanceOf(Error);
    expectNoKeyInMessage(error, seen);
  });
});

describe("storeConformanceCases checks findClient", () => {
  it("rejects a store that never finds a registered client", async () => {
    const error = await failureOf(
      "findClient returns a registered client with the values it was registered with",
      () => ({ ...createMemoryStore(), findClient: async () => undefined }),
    );
    expect(error.message).toBe(
      "OidcStore contract: findClient must return a registered client with the values it was registered with",
    );
  });

  it.each(["ttl", "idTokenSigningAlg", "requirePkce", "backchannelLogout", "idTokenClaims"])(
    "rejects a store that drops %s",
    async (field) => {
      const createBroken = (seed: StoreSeed): OidcStore => {
        const memory = createMemoryStore(seed);
        return {
          ...memory,
          findClient: async (id) => {
            const found = await memory.findClient(id);
            return found === undefined ? undefined : { ...found, [field]: undefined };
          },
        };
      };
      const error = await failureOf(
        "findClient returns every optional field a client was registered with",
        createBroken,
      );
      expect(error.message).toMatch(/^OidcStore contract: findClient must return every optional field/);
    },
  );

  it("rejects a store that returns client_secret_jwt keys rebuilt from JSON", async () => {
    const error = await failureOf("findClient returns a client_secret_jwt client whose keys still verify", (seed) => {
      const memory = createMemoryStore(seed);
      return {
        ...memory,
        findClient: async (id) => JSON.parse(JSON.stringify(await memory.findClient(id))) as ClientRecord,
      };
    });
    expect(error.message).toBe(
      "OidcStore contract: findClient must return each client_secret_jwt key, in its order, so that it verifies what the registered key signed",
    );
  });

  it("rejects a store that keeps only the first client_secret_jwt key", async () => {
    const error = await failureOf("findClient returns a client_secret_jwt client whose keys still verify", (seed) => {
      const memory = createMemoryStore(seed);
      return {
        ...memory,
        findClient: async (id) => {
          const client = await memory.findClient(id);
          return client?.auth.method === "client_secret_jwt"
            ? { ...client, auth: { ...client.auth, keys: client.auth.keys.slice(0, 1) } }
            : client;
        },
      };
    });
    expect(error.message).toMatch(/number of keys it was registered with$/);
  });
});

describe("storeConformanceCases shape", () => {
  it("freezes the array and every case", () => {
    expect(Object.isFrozen(storeConformanceCases)).toBe(true);
    for (const c of storeConformanceCases) {
      expect(Object.isFrozen(c)).toBe(true);
    }
  });
});
