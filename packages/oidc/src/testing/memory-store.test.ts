import { describe, expect, it } from "vitest";

import type {
  AccessTokenRecord,
  ClientRecord,
  CodeRecord,
  InteractionRecord,
  RefreshTokenRecord,
} from "../provider/types";
import { createMemoryStore } from "./memory-store";

const LATER_EXPIRY_SECONDS = 2_000;
const CLOCK_START_MS = 1_000_000;

function makeClient(overrides: Partial<ClientRecord> = {}): ClientRecord {
  return {
    clientId: "client-a",
    redirectUris: ["https://app.example/callback"],
    scopes: ["openid"],
    auth: { method: "none" },
    ...overrides,
  };
}

function makeInteraction(overrides: Partial<InteractionRecord> = {}): InteractionRecord {
  return {
    clientId: "client-a",
    redirectUri: "https://app.example/callback",
    scopes: ["openid"],
    codeChallenge: "challenge",
    prompt: [],
    createdAt: 1_000,
    expiresAt: LATER_EXPIRY_SECONDS,
    ...overrides,
  };
}

function makeCode(overrides: Partial<CodeRecord> = {}): CodeRecord {
  return {
    grantId: "grant-1",
    clientId: "client-a",
    redirectUri: "https://app.example/callback",
    codeChallenge: "challenge",
    scopes: ["openid"],
    subject: "user-1",
    authTime: 1_000,
    maxAgeRequested: false,
    expiresAt: LATER_EXPIRY_SECONDS,
    ...overrides,
  };
}

function makeAccessToken(overrides: Partial<AccessTokenRecord> = {}): AccessTokenRecord {
  return {
    grantId: "grant-1",
    clientId: "client-a",
    subject: "user-1",
    scopes: ["openid"],
    expiresAt: LATER_EXPIRY_SECONDS,
    ...overrides,
  };
}

function makeRefreshToken(overrides: Partial<RefreshTokenRecord> = {}): RefreshTokenRecord {
  return {
    grantId: "grant-1",
    clientId: "client-a",
    subject: "user-1",
    scopes: ["openid"],
    authTime: 1_000,
    expiresAt: LATER_EXPIRY_SECONDS,
    ...overrides,
  };
}

/** A store whose clock the test moves by hand, so expiry is deterministic. */
function makeClockedStore(clientsToRegister: readonly ClientRecord[] = []) {
  const clock = { nowMs: CLOCK_START_MS };
  const store = createMemoryStore({ clients: clientsToRegister, now: () => clock.nowMs });
  return { clock, store };
}

describe("findClient", () => {
  it("should return the client registered at creation", async () => {
    const store = createMemoryStore({ clients: [makeClient()] });

    expect(await store.findClient("client-a")).toEqual(makeClient());
  });

  it("should return undefined for an unknown client", async () => {
    const store = createMemoryStore({ clients: [makeClient()] });

    expect(await store.findClient("client-unknown")).toBeUndefined();
  });

  it("should return the same record object that was registered", async () => {
    const client = makeClient();
    const store = createMemoryStore({ clients: [client] });

    expect(await store.findClient("client-a")).toBe(client);
  });

  it("should replace a client when addClient is called with the same id", async () => {
    const store = createMemoryStore({ clients: [makeClient()] });

    store.addClient(makeClient({ scopes: ["openid", "email"] }));

    expect((await store.findClient("client-a"))?.scopes).toEqual(["openid", "email"]);
  });

  it("should register a client added after creation", async () => {
    const store = createMemoryStore();

    store.addClient(makeClient({ clientId: "client-b" }));

    expect(await store.findClient("client-b")).toEqual(makeClient({ clientId: "client-b" }));
  });

  it("should return undefined for a key that is a prototype property name", async () => {
    const store = createMemoryStore();

    expect(await store.findClient("__proto__")).toBeUndefined();
  });
});

describe("interactions", () => {
  it("should return the saved record from consumeInteraction", async () => {
    const store = createMemoryStore();
    const interaction = makeInteraction();

    await store.saveInteraction("key-1", interaction);

    expect(await store.consumeInteraction("key-1")).toBe(interaction);
  });

  it("should return undefined from a second consumeInteraction for the same key", async () => {
    const store = createMemoryStore();
    await store.saveInteraction("key-1", makeInteraction());

    await store.consumeInteraction("key-1");

    expect(await store.consumeInteraction("key-1")).toBeUndefined();
  });

  it("should return undefined from consumeInteraction for a key never saved", async () => {
    const store = createMemoryStore();

    expect(await store.consumeInteraction("key-missing")).toBeUndefined();
  });

  it("should keep interactions under different keys independent", async () => {
    const store = createMemoryStore();
    const first = makeInteraction({ state: "one" });
    const second = makeInteraction({ state: "two" });
    await store.saveInteraction("key-1", first);
    await store.saveInteraction("key-2", second);

    await store.consumeInteraction("key-1");

    expect(await store.consumeInteraction("key-2")).toBe(second);
  });
});

describe("authorization codes", () => {
  it("should return consumed with the record on the first consumeCode", async () => {
    const store = createMemoryStore();
    const code = makeCode();
    await store.saveCode("code-1", code);

    expect(await store.consumeCode("code-1")).toEqual({ status: "consumed", record: code });
  });

  it("should return replayed with the grant id on a second consumeCode", async () => {
    const store = createMemoryStore();
    await store.saveCode("code-1", makeCode({ grantId: "grant-9" }));
    await store.consumeCode("code-1");

    expect(await store.consumeCode("code-1")).toEqual({ status: "replayed", grantId: "grant-9" });
  });

  it("should keep returning replayed on later consumeCode calls", async () => {
    const store = createMemoryStore();
    await store.saveCode("code-1", makeCode());
    await store.consumeCode("code-1");
    await store.consumeCode("code-1");

    expect((await store.consumeCode("code-1"))?.status).toBe("replayed");
  });

  it("should return undefined from consumeCode for a code never saved", async () => {
    const store = createMemoryStore();

    expect(await store.consumeCode("code-missing")).toBeUndefined();
  });

  it("should give exactly one consumed when two consumeCode calls run concurrently", async () => {
    const store = createMemoryStore();
    await store.saveCode("code-1", makeCode());

    const results = await Promise.all([store.consumeCode("code-1"), store.consumeCode("code-1")]);

    expect(results.map((result) => result?.status).sort()).toEqual(["consumed", "replayed"]);
  });

  it("should give exactly one consumed when ten consumeCode calls run concurrently", async () => {
    const store = createMemoryStore();
    await store.saveCode("code-1", makeCode());

    const results = await Promise.all(Array.from({ length: 10 }, () => store.consumeCode("code-1")));

    expect(results.filter((result) => result?.status === "consumed")).toHaveLength(1);
  });
});

describe("access tokens", () => {
  it("should return the saved record from findAccessToken", async () => {
    const store = createMemoryStore();
    const token = makeAccessToken();
    await store.saveAccessToken("at-1", token);

    expect(await store.findAccessToken("at-1")).toBe(token);
  });

  it("should return undefined from findAccessToken for a key never saved", async () => {
    const store = createMemoryStore();

    expect(await store.findAccessToken("at-missing")).toBeUndefined();
  });

  it("should not consume an access token on find", async () => {
    const store = createMemoryStore();
    const token = makeAccessToken();
    await store.saveAccessToken("at-1", token);

    await store.findAccessToken("at-1");

    expect(await store.findAccessToken("at-1")).toBe(token);
  });
});

describe("refresh tokens", () => {
  it("should return consumed with the record on the first consumeRefreshToken", async () => {
    const store = createMemoryStore();
    const token = makeRefreshToken();
    await store.saveRefreshToken("rt-1", token);

    expect(await store.consumeRefreshToken("rt-1")).toEqual({ status: "consumed", record: token });
  });

  it("should return replayed with the grant id on a second consumeRefreshToken", async () => {
    const store = createMemoryStore();
    await store.saveRefreshToken("rt-1", makeRefreshToken({ grantId: "grant-7" }));
    await store.consumeRefreshToken("rt-1");

    expect(await store.consumeRefreshToken("rt-1")).toEqual({ status: "replayed", grantId: "grant-7" });
  });

  it("should return undefined from consumeRefreshToken for a key never saved", async () => {
    const store = createMemoryStore();

    expect(await store.consumeRefreshToken("rt-missing")).toBeUndefined();
  });

  it("should give exactly one consumed when two consumeRefreshToken calls run concurrently", async () => {
    const store = createMemoryStore();
    await store.saveRefreshToken("rt-1", makeRefreshToken());

    const results = await Promise.all([store.consumeRefreshToken("rt-1"), store.consumeRefreshToken("rt-1")]);

    expect(results.map((result) => result?.status).sort()).toEqual(["consumed", "replayed"]);
  });

  it("should give exactly one consumed when ten consumeRefreshToken calls run concurrently", async () => {
    const store = createMemoryStore();
    await store.saveRefreshToken("rt-1", makeRefreshToken());

    const results = await Promise.all(Array.from({ length: 10 }, () => store.consumeRefreshToken("rt-1")));

    expect(results.filter((result) => result?.status === "consumed")).toHaveLength(1);
  });
});

describe("revokeGrant", () => {
  it("should hide an access token of the revoked grant", async () => {
    const store = createMemoryStore();
    await store.saveAccessToken("at-1", makeAccessToken({ grantId: "grant-1" }));

    await store.revokeGrant("grant-1");

    expect(await store.findAccessToken("at-1")).toBeUndefined();
  });

  it("should hide a refresh token of the revoked grant", async () => {
    const store = createMemoryStore();
    await store.saveRefreshToken("rt-1", makeRefreshToken({ grantId: "grant-1" }));

    await store.revokeGrant("grant-1");

    expect(await store.consumeRefreshToken("rt-1")).toBeUndefined();
  });

  it("should report undefined, not replayed, for an already consumed refresh token of the revoked grant", async () => {
    const store = createMemoryStore();
    await store.saveRefreshToken("rt-1", makeRefreshToken({ grantId: "grant-1" }));
    await store.consumeRefreshToken("rt-1");

    await store.revokeGrant("grant-1");

    expect(await store.consumeRefreshToken("rt-1")).toBeUndefined();
  });

  it("should leave an access token of another grant findable", async () => {
    const store = createMemoryStore();
    const other = makeAccessToken({ grantId: "grant-2" });
    await store.saveAccessToken("at-2", other);

    await store.revokeGrant("grant-1");

    expect(await store.findAccessToken("at-2")).toBe(other);
  });

  it("should leave a refresh token of another grant consumable", async () => {
    const store = createMemoryStore();
    const other = makeRefreshToken({ grantId: "grant-2" });
    await store.saveRefreshToken("rt-2", other);

    await store.revokeGrant("grant-1");

    expect(await store.consumeRefreshToken("rt-2")).toEqual({ status: "consumed", record: other });
  });

  it("should hide an access token saved after its grant was revoked", async () => {
    const store = createMemoryStore();
    await store.revokeGrant("grant-1");

    await store.saveAccessToken("at-late", makeAccessToken({ grantId: "grant-1" }));

    expect(await store.findAccessToken("at-late")).toBeUndefined();
  });

  it("should hide a refresh token saved after its grant was revoked", async () => {
    const store = createMemoryStore();
    await store.revokeGrant("grant-1");

    await store.saveRefreshToken("rt-late", makeRefreshToken({ grantId: "grant-1" }));

    expect(await store.consumeRefreshToken("rt-late")).toBeUndefined();
  });

  it("should leave existing tokens alone when revoking a grant that has none", async () => {
    const store = createMemoryStore();
    const token = makeAccessToken({ grantId: "grant-1" });
    await store.saveAccessToken("at-1", token);

    await store.revokeGrant("grant-unknown");

    expect(await store.findAccessToken("at-1")).toBe(token);
  });
});

describe("purging expired entries", () => {
  it("should not return an expired access token once a save of any kind has run after its expiry", async () => {
    const { clock, store } = makeClockedStore();
    await store.saveAccessToken("at-old", makeAccessToken({ expiresAt: 1_100 }));

    clock.nowMs = 1_100_000;
    await store.saveRefreshToken("rt-new", makeRefreshToken());

    expect(await store.findAccessToken("at-old")).toBeUndefined();
  });

  it("should purge an entry whose expiry equals the current time", async () => {
    const { clock, store } = makeClockedStore();
    await store.saveAccessToken("at-edge", makeAccessToken({ expiresAt: 1_100 }));

    clock.nowMs = 1_100_000;
    await store.saveAccessToken("at-other", makeAccessToken());

    expect(await store.findAccessToken("at-edge")).toBeUndefined();
  });

  it("should keep an entry whose expiry is one millisecond later than the current time", async () => {
    const { clock, store } = makeClockedStore();
    await store.saveAccessToken("at-almost", makeAccessToken({ expiresAt: 1_100 }));

    clock.nowMs = 1_099_999;
    await store.saveAccessToken("at-other", makeAccessToken());

    expect(await store.findAccessToken("at-almost")).toBeDefined();
  });

  it("should purge an expired interaction once a save of any kind has run", async () => {
    const { clock, store } = makeClockedStore();
    await store.saveInteraction("key-old", makeInteraction({ expiresAt: 1_100 }));

    clock.nowMs = 1_100_000;
    await store.saveCode("code-new", makeCode());

    expect(await store.consumeInteraction("key-old")).toBeUndefined();
  });

  it("should purge an expired code once a save of any kind has run", async () => {
    const { clock, store } = makeClockedStore();
    await store.saveCode("code-old", makeCode({ expiresAt: 1_100 }));

    clock.nowMs = 1_100_000;
    await store.saveAccessToken("at-new", makeAccessToken());

    expect(await store.consumeCode("code-old")).toBeUndefined();
  });

  it("should keep a used code reporting replayed until its expiry", async () => {
    const { clock, store } = makeClockedStore();
    await store.saveCode("code-used", makeCode({ grantId: "grant-5", expiresAt: 1_500 }));
    await store.consumeCode("code-used");

    clock.nowMs = 1_200_000;
    await store.saveAccessToken("at-new", makeAccessToken());

    expect(await store.consumeCode("code-used")).toEqual({ status: "replayed", grantId: "grant-5" });
  });

  it("should keep a used refresh token reporting replayed until its expiry", async () => {
    const { clock, store } = makeClockedStore();
    await store.saveRefreshToken("rt-used", makeRefreshToken({ grantId: "grant-6", expiresAt: 1_500 }));
    await store.consumeRefreshToken("rt-used");

    clock.nowMs = 1_200_000;
    await store.saveCode("code-new", makeCode());

    expect(await store.consumeRefreshToken("rt-used")).toEqual({ status: "replayed", grantId: "grant-6" });
  });

  it("should still return an expired access token from find before any save runs", async () => {
    const { clock, store } = makeClockedStore();
    const token = makeAccessToken({ expiresAt: 1_100 });
    await store.saveAccessToken("at-expired", token);

    clock.nowMs = 1_200_000;

    expect(await store.findAccessToken("at-expired")).toBe(token);
  });
});

describe("store contract under unusual keys", () => {
  it("should resolve undefined rather than reject for an empty string key", async () => {
    const store = createMemoryStore();

    await expect(store.findAccessToken("")).resolves.toBeUndefined();
  });

  it("should resolve undefined rather than reject for a prototype property name key", async () => {
    const store = createMemoryStore();

    await expect(store.consumeCode("constructor")).resolves.toBeUndefined();
  });
});

describe("saving a key that already exists", () => {
  it("should reject saveInteraction with an Error when the key exists", async () => {
    const { store } = makeClockedStore();
    await store.saveInteraction("key-1", makeInteraction());

    await expect(store.saveInteraction("key-1", makeInteraction())).rejects.toThrow(Error);
  });

  it("should reject saveCode with an Error when the key exists", async () => {
    const { store } = makeClockedStore();
    await store.saveCode("code-1", makeCode());

    await expect(store.saveCode("code-1", makeCode())).rejects.toThrow(Error);
  });

  it("should reject saveAccessToken with an Error when the key exists", async () => {
    const { store } = makeClockedStore();
    await store.saveAccessToken("at-1", makeAccessToken());

    await expect(store.saveAccessToken("at-1", makeAccessToken())).rejects.toThrow(Error);
  });

  it("should reject saveRefreshToken with an Error when the key exists", async () => {
    const { store } = makeClockedStore();
    await store.saveRefreshToken("rt-1", makeRefreshToken());

    await expect(store.saveRefreshToken("rt-1", makeRefreshToken())).rejects.toThrow(Error);
  });

  it("should keep a spent code replayed when a save under its key is rejected", async () => {
    const { store } = makeClockedStore();
    await store.saveCode("code-1", makeCode());
    await store.consumeCode("code-1");

    await expect(store.saveCode("code-1", makeCode())).rejects.toThrow(Error);

    expect((await store.consumeCode("code-1"))?.status).toBe("replayed");
  });

  it("should keep a spent refresh token replayed when a save under its key is rejected", async () => {
    const { store } = makeClockedStore();
    await store.saveRefreshToken("rt-1", makeRefreshToken());
    await store.consumeRefreshToken("rt-1");

    await expect(store.saveRefreshToken("rt-1", makeRefreshToken())).rejects.toThrow(Error);

    expect((await store.consumeRefreshToken("rt-1"))?.status).toBe("replayed");
  });

  it("should allow a save under a key whose code expired and was purged", async () => {
    const clock = { nowMs: CLOCK_START_MS };
    const store = createMemoryStore({ now: () => clock.nowMs });
    await store.saveCode("code-1", makeCode({ expiresAt: 1_001 }));
    clock.nowMs = 1_001_000;

    const replacement = makeCode();
    await expect(store.saveCode("code-1", replacement)).resolves.toBeUndefined();
    await expect(store.consumeCode("code-1")).resolves.toEqual({ status: "consumed", record: replacement });
  });
});
