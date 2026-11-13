import { type KeyPair, createKeySet, createVerifier, generateKeyPair } from "@codenhub/jwt";
import { describe, expect, it } from "vitest";

import { createMemoryStore } from "../testing/memory-store";
import { createProvider } from "./create-provider";
import type { ClientRecord, Provider } from "./types";

const ISSUER = "https://op.example";
const LOGOUT_URI = "https://rp.example/backchannel-logout";
const EVENT = "http://schemas.openid.net/event/backchannel-logout";
const NOW_MS = 1_800_000_000_000;
const NOW_SECONDS = NOW_MS / 1000;

const client = (clientId: string, overrides: Partial<ClientRecord> = {}): ClientRecord => ({
  clientId,
  redirectUris: ["https://rp.example/cb"],
  scopes: ["openid"],
  auth: { method: "none" },
  ...overrides,
});

const CLIENTS: readonly ClientRecord[] = [
  client("rp", { backchannelLogout: { uri: LOGOUT_URI } }),
  client("needs-session", { backchannelLogout: { uri: LOGOUT_URI, sessionRequired: true } }),
  client("optional-session", { backchannelLogout: { uri: LOGOUT_URI, sessionRequired: false } }),
  client("rs-signed", { backchannelLogout: { uri: LOGOUT_URI }, idTokenSigningAlg: "ES256" }),
  client("without"),
];

async function setup(): Promise<{ op: Provider; keys: readonly KeyPair[] }> {
  const keys = [
    await generateKeyPair({ alg: "RS256", kid: "rsa-1" }),
    await generateKeyPair({ alg: "ES256", kid: "ec-1" }),
  ];
  const op = createProvider({
    issuer: ISSUER,
    signingKeys: keys,
    store: createMemoryStore({ clients: CLIENTS }),
    claims: () => ({}),
    now: () => NOW_MS,
  });
  return { op, keys };
}

/** The `logout_token` a request carries, which must be its only body parameter. */
async function tokenOf(request: Request | null): Promise<string> {
  if (request === null) {
    throw new Error("expected a request");
  }
  const form = new URLSearchParams(await request.clone().text());
  expect([...form.keys()]).toEqual(["logout_token"]);
  return form.get("logout_token") ?? "";
}

const verifyLogoutToken = (keys: readonly KeyPair[], token: string, audience: string, type = "logout+jwt") =>
  createVerifier({
    keys: createKeySet(keys.map((pair) => pair.publicKey)),
    issuer: ISSUER,
    audience,
    type,
    now: () => NOW_MS,
  })(token);

describe("backchannelLogout", () => {
  it("returns a form POST to the client's URI carrying only the logout token", async () => {
    const { op } = await setup();

    const request = await op.backchannelLogout({ clientId: "rp", sessionId: "sid-1" });

    expect(request).toBeInstanceOf(Request);
    expect(request?.method).toBe("POST");
    expect(request?.url).toBe(LOGOUT_URI);
    expect(request?.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(await tokenOf(request)).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
  });

  it("signs a token that verifies against the provider's keys as logout+jwt, with every claim", async () => {
    const { op, keys } = await setup();

    const token = await tokenOf(await op.backchannelLogout({ clientId: "rp", subject: "user-1", sessionId: "sid-1" }));
    const verified = await verifyLogoutToken(keys, token, "rp");

    expect(verified.ok).toBe(true);
    if (!verified.ok) {
      return;
    }
    expect(verified.value.header).toMatchObject({ typ: "logout+jwt", alg: "RS256", kid: "rsa-1" });
    expect(verified.value.payload).toEqual({
      iss: ISSUER,
      aud: "rp",
      iat: NOW_SECONDS,
      exp: NOW_SECONDS + 120,
      jti: expect.stringMatching(/^[\w-]{22,}$/),
      events: { [EVENT]: {} },
      sub: "user-1",
      sid: "sid-1",
    });
  });

  it("carries sid alone, without sub", async () => {
    const { op, keys } = await setup();

    const token = await tokenOf(await op.backchannelLogout({ clientId: "rp", sessionId: "sid-1" }));
    const verified = await verifyLogoutToken(keys, token, "rp");

    expect(verified.ok && verified.value.payload).toMatchObject({ sid: "sid-1" });
    expect(verified.ok && verified.value.payload).not.toHaveProperty("sub");
  });

  it("carries sub alone, without sid", async () => {
    const { op, keys } = await setup();

    const token = await tokenOf(await op.backchannelLogout({ clientId: "rp", subject: "user-1" }));
    const verified = await verifyLogoutToken(keys, token, "rp");

    expect(verified.ok && verified.value.payload).toMatchObject({ sub: "user-1" });
    expect(verified.ok && verified.value.payload).not.toHaveProperty("sid");
  });

  it("never carries a nonce", async () => {
    const { op, keys } = await setup();

    const token = await tokenOf(await op.backchannelLogout({ clientId: "rp", subject: "user-1", sessionId: "sid-1" }));
    const verified = await verifyLogoutToken(keys, token, "rp");

    expect(verified.ok && verified.value.payload).not.toHaveProperty("nonce");
  });

  it("gives every token its own jti", async () => {
    const { op } = await setup();
    const request = { clientId: "rp", sessionId: "sid-1" };

    const first = await tokenOf(await op.backchannelLogout(request));
    const second = await tokenOf(await op.backchannelLogout(request));

    expect(first).not.toBe(second);
  });

  it("signs with the key of the client's idTokenSigningAlg", async () => {
    const { op, keys } = await setup();

    const token = await tokenOf(await op.backchannelLogout({ clientId: "rs-signed", sessionId: "sid-1" }));
    const verified = await verifyLogoutToken(keys, token, "rs-signed");

    expect(verified.ok && verified.value.header).toMatchObject({ alg: "ES256", kid: "ec-1" });
  });

  it("expires 120 seconds after it is issued, on the provider's clock", async () => {
    const { op, keys } = await setup();
    const token = await tokenOf(await op.backchannelLogout({ clientId: "rp", sessionId: "sid-1" }));

    const late = await createVerifier({
      keys: createKeySet(keys.map((pair) => pair.publicKey)),
      issuer: ISSUER,
      audience: "rp",
      type: "logout+jwt",
      now: () => NOW_MS + 121_000,
    })(token);

    expect(late.ok).toBe(false);
  });

  it("does not verify as an ID token, as a client's ID token check would require", async () => {
    const { op, keys } = await setup();
    const token = await tokenOf(await op.backchannelLogout({ clientId: "rp", sessionId: "sid-1" }));

    const asIdToken = await verifyLogoutToken(keys, token, "rp", "JWT");

    expect(asIdToken.ok).toBe(false);
  });

  it("does not verify for another audience", async () => {
    const { op, keys } = await setup();
    const token = await tokenOf(await op.backchannelLogout({ clientId: "rp", sessionId: "sid-1" }));

    expect((await verifyLogoutToken(keys, token, "other")).ok).toBe(false);
  });

  it("returns null for a client the store does not know", async () => {
    const { op } = await setup();

    expect(await op.backchannelLogout({ clientId: "unknown", sessionId: "sid-1" })).toBeNull();
  });

  it("returns null for a client without back-channel logout", async () => {
    const { op } = await setup();

    expect(await op.backchannelLogout({ clientId: "without", sessionId: "sid-1" })).toBeNull();
  });

  describe("sessionRequired", () => {
    it("throws TypeError for a client that requires the session when the request has none", async () => {
      const { op } = await setup();

      await expect(op.backchannelLogout({ clientId: "needs-session", subject: "user-1" })).rejects.toThrow(TypeError);
    });

    it("accepts a client that requires the session when the request has it", async () => {
      const { op } = await setup();

      expect(await op.backchannelLogout({ clientId: "needs-session", sessionId: "sid-1" })).toBeInstanceOf(Request);
    });

    it("does not require the session when sessionRequired is false", async () => {
      const { op } = await setup();

      expect(await op.backchannelLogout({ clientId: "optional-session", subject: "user-1" })).toBeInstanceOf(Request);
    });

    it("throws TypeError for an unknown client's missing identifiers before it answers null", async () => {
      const { op } = await setup();

      await expect(op.backchannelLogout({ clientId: "unknown" })).rejects.toThrow(TypeError);
    });
  });

  describe("a malformed request", () => {
    it.each([
      ["neither subject nor sessionId", {}],
      ["an empty subject", { subject: "" }],
      ["an empty sessionId", { sessionId: "" }],
      ["a numeric subject", { subject: 1 }],
      ["a null sessionId", { sessionId: null }],
      ["an empty sessionId beside a valid subject", { subject: "user-1", sessionId: "" }],
      ["an empty subject beside a valid sessionId", { subject: "", sessionId: "sid-1" }],
    ])("throws TypeError for %s", async (_name, identifiers) => {
      const { op } = await setup();

      await expect(op.backchannelLogout({ clientId: "rp", ...identifiers } as never)).rejects.toThrow(TypeError);
    });

    it.each([
      ["an empty clientId", ""],
      ["a numeric clientId", 1],
    ])("throws TypeError for %s", async (_name, clientId) => {
      const { op } = await setup();

      await expect(op.backchannelLogout({ clientId, sessionId: "sid-1" } as never)).rejects.toThrow(TypeError);
    });

    it("throws TypeError for a request that is not an object", async () => {
      const { op } = await setup();

      await expect(op.backchannelLogout(null as never)).rejects.toThrow(TypeError);
    });
  });

  it("throws TypeError when the store returns a malformed back-channel registration", async () => {
    const keys = [await generateKeyPair({ alg: "ES256", kid: "ec-1" })];
    const op = createProvider({
      issuer: ISSUER,
      signingKeys: keys,
      store: createMemoryStore({ clients: [client("rp", { backchannelLogout: { uri: "http://rp.example/logout" } })] }),
      claims: () => ({}),
      now: () => NOW_MS,
    });

    await expect(op.backchannelLogout({ clientId: "rp", sessionId: "sid-1" })).rejects.toThrow(TypeError);
  });

  it("does not put the subject or the session in a TypeError message", async () => {
    const { op } = await setup();

    const error = await op
      .backchannelLogout({ clientId: "needs-session", subject: "secret-subject" })
      .catch((caught: unknown) => caught);

    expect(String((error as Error).message)).not.toContain("secret-subject");
  });
});
