import { type KeyPair, exportPublicJwk, generateKeyPair, generateSecretKey, sign } from "@codenhub/jwt";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { MAX_BODY_BYTES } from "../shared/limits";
import type { OidcIssue, OidcResult } from "../shared/types";
import { createProviderKeySet } from "./id-token";
import { createLogoutTokenValidator, type LogoutTokenValidator, readBackchannelLogout } from "./logout-token";
import { resolveClientOptions } from "./options";
import type { ClientOptions } from "./types";

const ISSUER = "https://op.example";
const CLIENT_ID = "app";
const NOW_S = Math.floor(Date.now() / 1000);
const EVENT = "http://schemas.openid.net/event/backchannel-logout";
const ENDPOINT = "https://app.example/backchannel-logout";

let keys: KeyPair;
let otherKeys: KeyPair;
let jwks: { readonly keys: readonly unknown[] };

beforeAll(async () => {
  keys = await generateKeyPair({ alg: "ES256", kid: "op-1" });
  otherKeys = await generateKeyPair({ alg: "ES256", kid: "op-1" });
  jwks = { keys: [await exportPublicJwk(keys.publicKey)] };
});

const serveJwks = () =>
  vi.fn(
    async () => new Response(JSON.stringify(jwks), { status: 200, headers: { "content-type": "application/json" } }),
  );

/** A validator for this client, whose JWKS is served from memory. */
const validatorWith = (overrides: Partial<ClientOptions> = {}): LogoutTokenValidator => {
  const options = resolveClientOptions({
    metadata: {
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/authorize`,
      token_endpoint: `${ISSUER}/token`,
      jwks_uri: `${ISSUER}/jwks`,
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["ES256"],
    },
    clientId: CLIENT_ID,
    auth: { method: "none" },
    fetch: serveJwks(),
    now: () => NOW_S * 1000,
    ...overrides,
  });
  return createLogoutTokenValidator(options, createProviderKeySet(options));
};

const baseClaims = (): Record<string, unknown> => ({
  iss: ISSUER,
  aud: CLIENT_ID,
  iat: NOW_S,
  exp: NOW_S + 120,
  jti: "jti-1",
  events: { [EVENT]: {} },
  sub: "user-1",
  sid: "session-1",
});

interface TokenOptions {
  /** Claims to remove after the changes are applied. */
  readonly remove?: readonly string[];
  readonly key?: KeyPair["privateKey"];
  /** The `typ` header, or `null` for none. */
  readonly typ?: string | null;
}

/** Signs a logout token from the base claims, with the changes and removals applied. */
async function tokenWith(changes: Record<string, unknown> = {}, options: TokenOptions = {}): Promise<string> {
  const payload = { ...baseClaims(), ...changes };
  for (const name of options.remove ?? []) {
    delete payload[name];
  }
  const typ = options.typ === undefined ? "logout+jwt" : options.typ;
  return sign({ payload, key: options.key ?? keys.privateKey, ...(typ === null ? {} : { header: { typ } }) });
}

const issuesOf = (result: OidcResult<unknown>): readonly OidcIssue[] => {
  if (result.ok) {
    throw new Error("expected a failed result");
  }
  return result.error.issues;
};

/**
 * Each issue as `code path jwtCode`, so a test names every issue it expects in one line. A token's issues all have
 * paths under `logout_token`, which is checked here once and left out of the summary.
 */
const summarize = (result: OidcResult<unknown>): string[] =>
  issuesOf(result).map((issue) => {
    const path = issue.path ?? [];
    if (issue.code !== "invalid_logout_request" && path[0] !== "logout_token") {
      throw new Error("expected a token issue under logout_token");
    }
    const shown = issue.code === "invalid_logout_request" ? path : path.slice(1);
    return [issue.code, shown.join("."), issue.params?.jwtCode ?? issue.params?.reason ?? ""].join(" ").trim();
  });

const base64url = (value: unknown): string =>
  btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

const formRequest = (body: BodyInit, init: RequestInit = {}): Request =>
  new Request(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    ...init,
  });

describe("createLogoutTokenValidator", () => {
  describe("a valid token", () => {
    it("should return who signed out, and when the token was issued and expires", async () => {
      const result = await validatorWith()(await tokenWith());

      expect(result).toEqual({
        ok: true,
        value: { subject: "user-1", sessionId: "session-1", jti: "jti-1", issuedAt: NOW_S, expiresAt: NOW_S + 120 },
      });
      expect(Object.isFrozen(result.ok && result.value)).toBe(true);
    });

    it("should accept a token with only sub, and leave sessionId out", async () => {
      const result = await validatorWith()(await tokenWith({}, { remove: ["sid"] }));

      expect(result.ok && result.value).toEqual({
        subject: "user-1",
        jti: "jti-1",
        issuedAt: NOW_S,
        expiresAt: NOW_S + 120,
      });
    });

    it("should accept a token with only sid, and leave subject out", async () => {
      const result = await validatorWith()(await tokenWith({}, { remove: ["sub"] }));

      expect(result.ok && result.value).toEqual({
        sessionId: "session-1",
        jti: "jti-1",
        issuedAt: NOW_S,
        expiresAt: NOW_S + 120,
      });
    });

    it.each(["application/logout+jwt", "Logout+JWT"])("should accept the typ %s", async (typ) => {
      expect((await validatorWith()(await tokenWith({}, { typ }))).ok).toBe(true);
    });

    it("should accept an audience list that includes the client, with azp naming it", async () => {
      const token = await tokenWith({ aud: [CLIENT_ID, "other"], azp: CLIENT_ID });

      expect((await validatorWith()(token)).ok).toBe(true);
    });

    it("should accept other members of events alongside the logout event", async () => {
      const token = await tokenWith({ events: { [EVENT]: {}, "https://other.example/event": {} } });

      expect((await validatorWith()(token)).ok).toBe(true);
    });

    it("should accept a token that expired within the clock tolerance", async () => {
      const token = await tokenWith({ iat: NOW_S - 150, exp: NOW_S - 30 });

      expect((await validatorWith()(token)).ok).toBe(true);
    });

    it("should accept the same token twice, since replays are the app's to refuse", async () => {
      const verify = validatorWith();
      const token = await tokenWith();

      expect((await verify(token)).ok).toBe(true);
      expect((await verify(token)).ok).toBe(true);
    });
  });

  describe("a token of another kind", () => {
    it("should refuse an ID token of the same provider", async () => {
      const idToken = await sign({
        payload: { iss: ISSUER, sub: "user-1", aud: CLIENT_ID, iat: NOW_S, exp: NOW_S + 300, nonce: "n", sid: "s" },
        key: keys.privateKey,
        header: { typ: "JWT" },
      });

      expect(summarize(await validatorWith()(idToken))).toEqual([
        "invalid_logout_token header.typ wrong_type",
        "invalid_logout_token payload.jti missing_claim",
        "invalid_logout_token payload.events missing_claim",
      ]);
    });

    it("should refuse an ID token's claims under a logout+jwt header", async () => {
      const token = await sign({
        payload: { iss: ISSUER, sub: "user-1", aud: CLIENT_ID, iat: NOW_S, exp: NOW_S + 300, nonce: "n" },
        key: keys.privateKey,
        header: { typ: "logout+jwt" },
      });

      expect(summarize(await validatorWith()(token))).toEqual([
        "invalid_logout_token payload.jti missing_claim",
        "invalid_logout_token payload.events missing_claim",
      ]);
    });

    it.each([
      ["JWT", "JWT"],
      ["at+jwt", "at+jwt"],
      ["secevent+jwt", "secevent+jwt"],
    ])("should refuse the typ %s", async (_name, typ) => {
      expect(summarize(await validatorWith()(await tokenWith({}, { typ })))).toEqual([
        "invalid_logout_token header.typ wrong_type",
      ]);
    });

    it("should refuse a token without typ", async () => {
      expect(summarize(await validatorWith()(await tokenWith({}, { typ: null })))).toEqual([
        "invalid_logout_token header.typ wrong_type",
      ]);
    });
  });

  describe("a forged or misdirected token", () => {
    it("should refuse a token signed by a key the provider does not publish", async () => {
      const result = await validatorWith()(await tokenWith({}, { key: otherKeys.privateKey }));

      expect(issuesOf(result).map((issue) => issue.params?.jwtCode)).toEqual(["bad_signature"]);
    });

    it("should refuse an HMAC-signed token, whatever its secret", async () => {
      const secret = await generateSecretKey({ alg: "HS256" });
      const result = await validatorWith()(await tokenWith({}, { key: secret as unknown as KeyPair["privateKey"] }));

      expect(result.ok).toBe(false);
      expect(issuesOf(result).every((issue) => issue.code === "invalid_logout_token")).toBe(true);
    });

    it("should refuse another issuer", async () => {
      expect(summarize(await validatorWith()(await tokenWith({ iss: "https://evil.example" })))).toEqual([
        "invalid_logout_token payload.iss wrong_issuer",
      ]);
    });

    it("should refuse a token for another client", async () => {
      expect(summarize(await validatorWith()(await tokenWith({ aud: "other" })))).toEqual([
        "invalid_logout_token payload.aud wrong_audience",
      ]);
    });

    it("should refuse several audiences without azp, as for an ID token", async () => {
      expect(summarize(await validatorWith()(await tokenWith({ aud: [CLIENT_ID, "other"] })))).toEqual([
        "azp_mismatch payload.azp",
      ]);
    });

    it("should refuse an azp naming another client", async () => {
      expect(summarize(await validatorWith()(await tokenWith({ azp: "other" })))).toEqual(["azp_mismatch payload.azp"]);
    });

    it("should refuse a token expired beyond the clock tolerance", async () => {
      const token = await tokenWith({ iat: NOW_S - 200, exp: NOW_S - 61 });

      expect(summarize(await validatorWith()(token))).toEqual(["invalid_logout_token payload.exp expired"]);
    });

    it("should refuse a token issued beyond the clock tolerance in the future", async () => {
      const token = await tokenWith({ iat: NOW_S + 61, exp: NOW_S + 181 });

      expect(summarize(await validatorWith()(token))).toEqual(["invalid_logout_token payload.iat issued_in_future"]);
    });

    it("should apply a clock tolerance of 0 when the client sets it", async () => {
      const token = await tokenWith({ iat: NOW_S - 150, exp: NOW_S - 30 });

      expect(summarize(await validatorWith({ clockTolerance: 0 })(token))).toEqual([
        "invalid_logout_token payload.exp expired",
      ]);
    });
  });

  describe("a token with wrong claims", () => {
    it.each(["iat", "exp", "jti", "events"])("should refuse a token without %s", async (claim) => {
      expect(summarize(await validatorWith()(await tokenWith({}, { remove: [claim] })))).toEqual([
        `invalid_logout_token payload.${claim} missing_claim`,
      ]);
    });

    it.each([
      ["an array", []],
      ["null", null],
      ["a string", EVENT],
      ["an object without the logout event", { "https://other.example/event": {} }],
      ["the logout event with a string value", { [EVENT]: "logout" }],
      ["the logout event with a null value", { [EVENT]: null }],
      ["the logout event with an array value", { [EVENT]: [] }],
    ])("should refuse events as %s", async (_name, events) => {
      expect(summarize(await validatorWith()(await tokenWith({ events })))).toEqual([
        "invalid_logout_token payload.events invalid_claim",
      ]);
    });

    it("should refuse an events object that holds the logout event only through its prototype", async () => {
      const token = await tokenWith({ events: JSON.parse(`{"__proto__":{"${EVENT}":{}}}`) });

      expect(summarize(await validatorWith()(token))).toEqual(["invalid_logout_token payload.events invalid_claim"]);
    });

    it.each([
      ["a string", "n"],
      ["an empty string", ""],
      ["null", null],
    ])("should refuse a nonce that is %s", async (_name, nonce) => {
      expect(summarize(await validatorWith()(await tokenWith({ nonce })))).toEqual([
        "invalid_logout_token payload.nonce invalid_claim",
      ]);
    });

    it("should refuse a token with neither sub nor sid, naming sid", async () => {
      expect(summarize(await validatorWith()(await tokenWith({}, { remove: ["sub", "sid"] })))).toEqual([
        "invalid_logout_token payload.sid missing_claim",
      ]);
    });

    it.each([
      ["sub", { sub: "" }, "payload.sub invalid_claim"],
      ["sid", { sid: "" }, "payload.sid invalid_claim"],
      ["jti", { jti: "" }, "payload.jti invalid_claim"],
    ])("should refuse an empty %s", async (_name, changes, expected) => {
      expect(summarize(await validatorWith()(await tokenWith(changes)))).toEqual([`invalid_logout_token ${expected}`]);
    });

    it.each([1, null, ["session-1"]])("should refuse the sid %j", async (sid) => {
      expect(summarize(await validatorWith()(await tokenWith({ sid })))).toEqual([
        "invalid_logout_token payload.sid invalid_claim",
      ]);
    });

    it("should report every problem it finds", async () => {
      const token = await tokenWith({ nonce: "n", events: {}, azp: "other" }, { remove: ["sub", "sid"] });

      expect(summarize(await validatorWith()(token))).toEqual([
        "invalid_logout_token payload.events invalid_claim",
        "invalid_logout_token payload.sid missing_claim",
        "invalid_logout_token payload.nonce invalid_claim",
        "azp_mismatch payload.azp",
      ]);
    });
  });

  describe("sessionRequired", () => {
    it("should refuse a token with only sub", async () => {
      const verify = validatorWith({ backchannelLogout: { sessionRequired: true } });

      expect(summarize(await verify(await tokenWith({}, { remove: ["sid"] })))).toEqual([
        "invalid_logout_token payload.sid missing_claim",
      ]);
    });

    it("should accept a token with sid", async () => {
      const verify = validatorWith({ backchannelLogout: { sessionRequired: true } });

      expect((await verify(await tokenWith({}, { remove: ["sub"] }))).ok).toBe(true);
    });
  });

  describe("hostile input", () => {
    it.each([
      ["an empty string", ""],
      ["not a JWT", "logout"],
      ["an unsigned token", `${base64url({ alg: "none", typ: "logout+jwt" })}.${base64url(baseClaims())}.`],
      ["a token longer than the verifier reads", "a".repeat(9000)],
    ])("should return a failure for %s, never throw", async (_name, token) => {
      const result = await validatorWith()(token);

      expect(result.ok).toBe(false);
      expect(issuesOf(result).every((issue) => issue.code === "invalid_logout_token")).toBe(true);
    });

    it("should never put a claim value in an issue", async () => {
      const token = await tokenWith(
        { iss: "https://secret-iss.example", sub: "", sid: 7, nonce: "secret-nonce", events: "secret-events" },
        { typ: "secret+typ" },
      );

      const serialized = JSON.stringify(await validatorWith()(token));

      expect(serialized).not.toMatch(/secret/);
    });

    it.each([undefined, 1, null, {}])("should reject %j as a caller bug", async (token) => {
      await expect(validatorWith()(token as unknown as string)).rejects.toThrow(
        "verifyLogoutToken: logoutToken must be a string",
      );
    });
  });
});

describe("readBackchannelLogout", () => {
  it("should verify the logout_token of a form POST", async () => {
    const request = formRequest(new URLSearchParams({ logout_token: await tokenWith() }));

    const result = await readBackchannelLogout(validatorWith(), request);

    expect(result.ok && result.value.sessionId).toBe("session-1");
  });

  it("should accept a UTF-8 charset and ignore other parameters", async () => {
    const request = formRequest(new URLSearchParams({ logout_token: await tokenWith(), other: "x" }), {
      headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
    });

    expect((await readBackchannelLogout(validatorWith(), request)).ok).toBe(true);
  });

  it("should return the token's issues when the request is well formed", async () => {
    const request = formRequest(new URLSearchParams({ logout_token: await tokenWith({}, { typ: "JWT" }) }));

    expect(summarize(await readBackchannelLogout(validatorWith(), request))).toEqual([
      "invalid_logout_token header.typ wrong_type",
    ]);
  });

  it.each(["GET", "PUT"])("should refuse the method %s", async (method) => {
    const token = await tokenWith();
    const request =
      method === "GET"
        ? new Request(`${ENDPOINT}?logout_token=${token}`)
        : formRequest(new URLSearchParams({ logout_token: token }), { method });

    expect(summarize(await readBackchannelLogout(validatorWith(), request))).toEqual([
      "invalid_logout_request request.method",
    ]);
  });

  it.each([
    ["JSON", "application/json"],
    ["text", "text/plain"],
    ["another charset", "application/x-www-form-urlencoded; charset=iso-8859-1"],
    ["multipart", "multipart/form-data; boundary=x"],
  ])("should refuse a %s body", async (_name, contentType) => {
    const request = formRequest(new URLSearchParams({ logout_token: await tokenWith() }), {
      headers: { "content-type": contentType },
    });

    expect(summarize(await readBackchannelLogout(validatorWith(), request))).toEqual([
      "invalid_logout_request request.headers.content-type",
    ]);
  });

  it("should refuse a request without a content type", async () => {
    const request = new Request(ENDPOINT, { method: "POST", body: new Blob([`logout_token=${await tokenWith()}`]) });

    expect(summarize(await readBackchannelLogout(validatorWith(), request))).toEqual([
      "invalid_logout_request request.headers.content-type",
    ]);
  });

  it("should refuse a body over the size limit without verifying anything", async () => {
    const fetchJwks = serveJwks();
    const verify = validatorWith({ fetch: fetchJwks });
    const request = formRequest(`logout_token=${await tokenWith()}&pad=${"a".repeat(MAX_BODY_BYTES)}`);

    expect(summarize(await readBackchannelLogout(verify, request))).toEqual([
      "invalid_logout_request request.body too_large",
    ]);
    expect(fetchJwks).not.toHaveBeenCalled();
  });

  it("should refuse a streamed body that passes the size limit with no content-length", async () => {
    const chunk = new TextEncoder().encode("a".repeat(MAX_BODY_BYTES));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.close();
      },
    });
    const request = formRequest(body, { duplex: "half" } as RequestInit);

    expect(summarize(await readBackchannelLogout(validatorWith(), request))).toEqual([
      "invalid_logout_request request.body too_large",
    ]);
  });

  it("should refuse a body that is not UTF-8", async () => {
    const request = formRequest(new Uint8Array([0x6c, 0xff, 0xfe]));

    expect(summarize(await readBackchannelLogout(validatorWith(), request))).toEqual([
      "invalid_logout_request request.body unreadable",
    ]);
  });

  it("should refuse two logout_token parameters, even when both are the same valid token", async () => {
    const token = await tokenWith();
    const request = formRequest(`logout_token=${token}&logout_token=${token}`);

    expect(summarize(await readBackchannelLogout(validatorWith(), request))).toEqual([
      "invalid_logout_request request.body duplicate",
    ]);
  });

  it("should refuse a duplicate whose second copy is empty", async () => {
    const request = formRequest(`logout_token=${await tokenWith()}&logout_token=`);

    expect(summarize(await readBackchannelLogout(validatorWith(), request))).toEqual([
      "invalid_logout_request request.body duplicate",
    ]);
  });

  it.each([
    ["no body", ""],
    ["an empty logout_token", "logout_token="],
    ["another parameter only", "id_token=x"],
  ])("should refuse %s as a missing logout_token", async (_name, body) => {
    expect(summarize(await readBackchannelLogout(validatorWith(), formRequest(body)))).toEqual([
      "invalid_logout_request request.body.logout_token",
    ]);
  });

  it.each([
    ["too many parameters", Array.from({ length: 40 }, (_, index) => `p${index}=1`).join("&"), "too_many"],
    ["a parameter too long", `logout_token=${"a".repeat(5000)}`, "too_long"],
    ["an invalid UTF-8 escape", "logout_token=%ff", "malformed"],
  ])("should refuse %s", async (_name, body, reason) => {
    expect(summarize(await readBackchannelLogout(validatorWith(), formRequest(body)))).toEqual([
      `invalid_logout_request request.body ${reason}`,
    ]);
  });

  it("should throw when the body was already read", async () => {
    const request = formRequest(new URLSearchParams({ logout_token: await tokenWith() }));
    await request.text();

    await expect(readBackchannelLogout(validatorWith(), request)).rejects.toThrow(
      "readBackchannelLogout: the request body was already read",
    );
  });
});
