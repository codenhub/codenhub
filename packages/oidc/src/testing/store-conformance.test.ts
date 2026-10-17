import { describe, expect, it } from "vitest";

import type {
  AccessTokenRecord,
  CodeRecord,
  InteractionRecord,
  OidcStore,
  RefreshTokenRecord,
} from "../provider/types";
import { createMemoryStore } from "./memory-store";
import { storeConformanceCases } from "./store-conformance";

it.each(storeConformanceCases)("$name", async (c) => {
  await expect(c.run(() => createMemoryStore())).resolves.toBeUndefined();
});

/** Runs the named case against `createStore` and returns the Error it rejects with. */
async function failureOf(name: string, createStore: () => OidcStore): Promise<Error> {
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

describe("storeConformanceCases shape", () => {
  it("freezes the array and every case", () => {
    expect(Object.isFrozen(storeConformanceCases)).toBe(true);
    for (const c of storeConformanceCases) {
      expect(Object.isFrozen(c)).toBe(true);
    }
  });
});
