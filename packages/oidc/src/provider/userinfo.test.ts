import { generateKeyPair } from "@codenhub/jwt";
import { describe, expect, it } from "vitest";

import { digestKey } from "../shared/encoding";
import { createMemoryStore, type MemoryStore } from "../testing/memory-store";
import { type ResolvedOptions, resolveOptions } from "./options";
import type { ClaimsRequest } from "./types";
import { handleUserinfo } from "./userinfo";

const ISSUER = "https://op.example";
const ENDPOINT = `${ISSUER}/userinfo`;
const NOW_MS = 1_800_000_000_000;
const NOW_S = 1_800_000_000;
const SUBJECT = "user-1";
const CLIENT_ID = "client-1";
const ACCESS_TOKEN = "access.token-value_1";

interface Fixture {
  readonly options: ResolvedOptions;
  readonly store: MemoryStore;
  readonly requests: ClaimsRequest[];
}

const setUp = async (
  claims: (request: ClaimsRequest) => Readonly<Record<string, unknown>> = () => ({
    email: "ada@example.test",
    name: "Ada",
  }),
): Promise<Fixture> => {
  const store = createMemoryStore();
  const requests: ClaimsRequest[] = [];
  const pair = await generateKeyPair({ alg: "ES256", kid: "2026-10" });
  const options = resolveOptions({
    issuer: ISSUER,
    signingKeys: [pair],
    store,
    claims: (request) => {
      requests.push(request);
      return claims(request);
    },
    scopes: { "read:orders": ["order_count"] },
    now: () => NOW_MS,
  });
  return { options, store, requests };
};

const saveAccessToken = async (store: MemoryStore, token: string, expiresAt = NOW_S + 600): Promise<void> => {
  await store.saveAccessToken(await digestKey(token), {
    grantId: "grant-1",
    clientId: CLIENT_ID,
    subject: SUBJECT,
    scopes: ["openid", "email"],
    expiresAt,
  });
};

const getWithToken = (token: string): Request =>
  new Request(ENDPOINT, { headers: { authorization: `Bearer ${token}` } });

describe("handleUserinfo", () => {
  it("shouldReleaseOnlyTheClaimsTheGrantedScopesAllow", async () => {
    const { options, store } = await setUp();
    await saveAccessToken(store, ACCESS_TOKEN);

    const response = await handleUserinfo(options, getWithToken(ACCESS_TOKEN));

    expect(await response.json()).toEqual({ email: "ada@example.test", sub: SUBJECT });
  });

  it("shouldKeepSubjectWhenTheCallbackReturnsAnotherSub", async () => {
    const { options, store } = await setUp(() => ({ sub: "someone-else", email: "ada@example.test" }));
    await saveAccessToken(store, ACCESS_TOKEN);

    const response = await handleUserinfo(options, getWithToken(ACCESS_TOKEN));

    expect(await response.json()).toMatchObject({ sub: SUBJECT });
  });

  it("shouldNotRunAGetterOnTheCallbackResult", async () => {
    const claims: Record<string, unknown> = {};
    Object.defineProperty(claims, "email", {
      enumerable: true,
      get: () => {
        throw new Error("getter must not run");
      },
    });
    const { options, store } = await setUp(() => claims);
    await saveAccessToken(store, ACCESS_TOKEN);

    const response = await handleUserinfo(options, getWithToken(ACCESS_TOKEN));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sub: SUBJECT });
  });

  it("shouldAnswerWithNoStoreCaching", async () => {
    const { options, store } = await setUp();
    await saveAccessToken(store, ACCESS_TOKEN);

    const response = await handleUserinfo(options, getWithToken(ACCESS_TOKEN));

    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("shouldPassTheGrantedScopesAndClientToTheCallback", async () => {
    const { options, store, requests } = await setUp();
    await saveAccessToken(store, ACCESS_TOKEN);

    await handleUserinfo(options, getWithToken(ACCESS_TOKEN));

    expect(requests).toEqual([
      { subject: SUBJECT, clientId: CLIENT_ID, scopes: ["openid", "email"], claims: ["email", "email_verified"] },
    ]);
  });

  it("shouldRejectWhenTheClaimsCallbackRejects", async () => {
    const { options, store } = await setUp(() => {
      throw new Error("directory unavailable");
    });
    await saveAccessToken(store, ACCESS_TOKEN);

    await expect(handleUserinfo(options, getWithToken(ACCESS_TOKEN))).rejects.toThrow("directory unavailable");
  });

  it("shouldReleaseClaimsForABearerTokenSentWithPostAndNoBody", async () => {
    const { options, store } = await setUp();
    await saveAccessToken(store, ACCESS_TOKEN);

    const response = await handleUserinfo(
      options,
      new Request(ENDPOINT, { method: "POST", headers: { authorization: `Bearer ${ACCESS_TOKEN}` } }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ email: "ada@example.test", sub: SUBJECT });
  });

  it("shouldRespond403InsufficientScopeWhenTheTokenLacksOpenid", async () => {
    const { options, store, requests } = await setUp();
    await store.saveAccessToken(await digestKey(ACCESS_TOKEN), {
      grantId: "grant-1",
      clientId: CLIENT_ID,
      subject: SUBJECT,
      scopes: ["email"],
      expiresAt: NOW_S + 600,
    });

    const response = await handleUserinfo(options, getWithToken(ACCESS_TOKEN));

    expect(response.status).toBe(403);
    expect(response.headers.get("www-authenticate")).toBe('Bearer error="insufficient_scope"');
    expect(requests).toEqual([]);
  });

  it("shouldRespond401WithBearerChallengeWhenNoAuthorizationHeader", async () => {
    const { options } = await setUp();

    const response = await handleUserinfo(options, new Request(ENDPOINT));

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
  });

  it("shouldRespond400WhenTheSchemeIsNotBearer", async () => {
    const { options } = await setUp();

    const response = await handleUserinfo(
      options,
      new Request(ENDPOINT, { headers: { authorization: `Basic ${ACCESS_TOKEN}` } }),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("www-authenticate")).toBe('Bearer error="invalid_request"');
  });

  it("shouldRespond400WhenTheTokenIsMalformed", async () => {
    const { options } = await setUp();

    const response = await handleUserinfo(options, getWithToken("bad token!"));

    expect(response.status).toBe(400);
    expect(response.headers.get("www-authenticate")).toBe('Bearer error="invalid_request"');
  });

  it("shouldIgnoreATokenInTheRequestBody", async () => {
    const { options, store } = await setUp();
    await saveAccessToken(store, ACCESS_TOKEN);

    const response = await handleUserinfo(
      options,
      new Request(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `access_token=${ACCESS_TOKEN}`,
      }),
    );

    expect(response.status).toBe(401);
  });

  it("shouldRespond401InvalidTokenWhenTheTokenIsUnknown", async () => {
    const { options } = await setUp();

    const response = await handleUserinfo(options, getWithToken(ACCESS_TOKEN));

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe('Bearer error="invalid_token"');
  });

  it("shouldRespond401InvalidTokenWhenTheTokenIsExpired", async () => {
    const { options, store } = await setUp();
    await saveAccessToken(store, ACCESS_TOKEN, NOW_S);

    const response = await handleUserinfo(options, getWithToken(ACCESS_TOKEN));

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe('Bearer error="invalid_token"');
  });

  it("shouldRespond401InvalidTokenWhenARefreshTokenIsPresentedAsAccessToken", async () => {
    const { options, store } = await setUp();
    await store.saveRefreshToken(await digestKey(ACCESS_TOKEN), {
      grantId: "grant-1",
      clientId: CLIENT_ID,
      subject: SUBJECT,
      scopes: ["openid", "email"],
      authTime: NOW_S,
      expiresAt: NOW_S + 3600,
    });

    const response = await handleUserinfo(options, getWithToken(ACCESS_TOKEN));

    expect(response.status).toBe(401);
  });

  it("shouldRespond405WhenMethodIsPut", async () => {
    const { options } = await setUp();

    const response = await handleUserinfo(options, new Request(ENDPOINT, { method: "PUT" }));

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, POST, OPTIONS");
  });

  it("shouldRespond204ToPreflight", async () => {
    const { options } = await setUp();

    const response = await handleUserinfo(options, new Request(ENDPOINT, { method: "OPTIONS" }));

    expect(response.status).toBe(204);
  });
});
