import {
  type KeyPair,
  createKeySet,
  createVerifier,
  generateKeyPair,
  generateSecretKey,
  type SecretKey,
} from "@codenhub/jwt";
import { beforeAll, describe, expect, it } from "vitest";

import { authenticate, formEncode } from "./client-auth";
import { type ResolvedClientOptions, resolveClientOptions } from "./options";
import type { ClientAuth } from "./types";

const ISSUER = "https://op.example";
const CLIENT_ID = "app";
const REDIRECT_URI = "https://app.example/callback";
const NOW_MS = 1_800_000_000_000;
const NOW_S = NOW_MS / 1000;

const metadata = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/authorize`,
  token_endpoint: `${ISSUER}/token`,
  jwks_uri: `${ISSUER}/jwks`,
  response_types_supported: ["code"],
  subject_types_supported: ["public"],
  id_token_signing_alg_values_supported: ["ES256"],
  token_endpoint_auth_methods_supported: [
    "none",
    "client_secret_basic",
    "client_secret_post",
    "client_secret_jwt",
    "private_key_jwt",
  ],
};

const resolve = (auth: ClientAuth): ResolvedClientOptions =>
  resolveClientOptions({ metadata, clientId: CLIENT_ID, redirectUri: REDIRECT_URI, auth, now: () => NOW_MS });

/** Decodes the payload of a compact JWT without verifying it, to inspect the claims this module chose. */
const payloadOf = (token: string): Record<string, unknown> => {
  const segment = token.split(".")[1] ?? "";
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as Record<string, unknown>;
};

let clientKeys: KeyPair;
let secretKey: SecretKey;

beforeAll(async () => {
  clientKeys = await generateKeyPair({ alg: "ES256", kid: "rp-1" });
  secretKey = await generateSecretKey({ alg: "HS256" });
});

describe("formEncode", () => {
  it("writes a space as a plus sign", () => {
    expect(formEncode("a b")).toBe("a+b");
  });

  it("percent-encodes a plus sign, so it is not read as a space", () => {
    expect(formEncode("a+b")).toBe("a%2Bb");
  });

  it("encodes a non-ASCII character as its UTF-8 bytes", () => {
    expect(formEncode("é")).toBe("%C3%A9");
  });
});

describe("authenticate", () => {
  it("sends the client id in the body for a public client", async () => {
    const form = new URLSearchParams();

    const headers = await authenticate(resolve({ method: "none" }), form);

    expect(form.get("client_id")).toBe(CLIENT_ID);
    expect(headers).toEqual({});
  });

  it("sends Basic credentials in the authorization header and not in the body", async () => {
    const form = new URLSearchParams();

    const headers = await authenticate(resolve({ method: "client_secret_basic", secret: "s3cret" }), form);

    expect(headers.authorization).toBe(`Basic ${Buffer.from("app:s3cret").toString("base64")}`);
    expect(form.has("client_id")).toBe(false);
    expect(form.has("client_secret")).toBe(false);
  });

  it("form-encodes the secret before it is joined to the client id", async () => {
    const headers = await authenticate(
      resolve({ method: "client_secret_basic", secret: "p+ss:w rd/?=" }),
      new URLSearchParams(),
    );

    expect(headers.authorization).toBe(`Basic ${Buffer.from("app:p%2Bss%3Aw+rd%2F%3F%3D").toString("base64")}`);
  });

  it.each(["a", "ab", "abc", "ÿþý", "é".repeat(7), "x".repeat(10)])(
    "pads the base64 credentials to the standard alphabet for the secret %j",
    async (secret) => {
      const headers = await authenticate(resolve({ method: "client_secret_basic", secret }), new URLSearchParams());

      expect(headers.authorization).toBe(
        `Basic ${Buffer.from(`app:${formEncode(secret)}`, "utf8").toString("base64")}`,
      );
    },
  );

  it("writes the plus sign of standard base64 for credentials that produce one", async () => {
    // `~` is unreserved, so it stays raw and its byte yields `+` in base64; `?` is escaped, so no `/` can appear.
    const headers = await authenticate(
      resolve({ method: "client_secret_basic", secret: "~~??" }),
      new URLSearchParams(),
    );

    expect(headers.authorization).toBe(`Basic ${Buffer.from("app:~~%3F%3F").toString("base64")}`);
    expect(headers.authorization).toBe("Basic YXBwOn5+JTNGJTNG");
  });

  it("sends the client id and secret in the body for client_secret_post", async () => {
    const form = new URLSearchParams();

    const headers = await authenticate(resolve({ method: "client_secret_post", secret: "s3cret" }), form);

    expect(form.get("client_id")).toBe(CLIENT_ID);
    expect(form.get("client_secret")).toBe("s3cret");
    expect(headers).toEqual({});
  });

  it("sends an HS256 client assertion signed with the secret for client_secret_jwt", async () => {
    const form = new URLSearchParams();

    await authenticate(resolve({ method: "client_secret_jwt", key: secretKey }), form);

    expect(form.get("client_assertion_type")).toBe("urn:ietf:params:oauth:client-assertion-type:jwt-bearer");
    const verify = createVerifier({ keys: createKeySet([secretKey]), audience: ISSUER, now: () => NOW_MS });
    const verified = await verify(form.get("client_assertion"));
    expect(verified.ok).toBe(true);
  });

  it("sends an ES256 client assertion signed with the private key for private_key_jwt", async () => {
    const form = new URLSearchParams();

    await authenticate(resolve({ method: "private_key_jwt", key: clientKeys.privateKey }), form);

    const verify = createVerifier({ keys: createKeySet([clientKeys.publicKey]), audience: ISSUER, now: () => NOW_MS });
    const verified = await verify(form.get("client_assertion"));
    expect(verified.ok).toBe(true);
  });

  it("names the client as issuer and subject, and the issuer identifier as audience", async () => {
    const form = new URLSearchParams();

    await authenticate(resolve({ method: "private_key_jwt", key: clientKeys.privateKey }), form);

    expect(payloadOf(form.get("client_assertion") ?? "")).toMatchObject({
      iss: CLIENT_ID,
      sub: CLIENT_ID,
      aud: ISSUER,
    });
  });

  it("gives the assertion a 60 second lifetime from the clock", async () => {
    const form = new URLSearchParams();

    await authenticate(resolve({ method: "private_key_jwt", key: clientKeys.privateKey }), form);

    expect(payloadOf(form.get("client_assertion") ?? "")).toMatchObject({ iat: NOW_S, exp: NOW_S + 60 });
  });

  it("gives every assertion a fresh jti", async () => {
    const options = resolve({ method: "private_key_jwt", key: clientKeys.privateKey });
    const first = new URLSearchParams();
    const second = new URLSearchParams();

    await authenticate(options, first);
    await authenticate(options, second);

    expect(payloadOf(first.get("client_assertion") ?? "").jti).not.toBe(
      payloadOf(second.get("client_assertion") ?? "").jti,
    );
  });
});
