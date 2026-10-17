import {
  type JwtPayload,
  type KeyPair,
  type SecretKey,
  type SigningKey,
  createKeySet,
  generateKeyPair,
  generateSecretKey,
  sign,
} from "@codenhub/jwt";
import { describe, expect, it } from "vitest";

import { parseParameters } from "../shared/parameters";
import { createMemoryStore } from "../testing/memory-store";
import { type ClientAuthResult, authenticateClient } from "./client-auth";
import { type ResolvedOptions, resolveOptions } from "./options";
import { generateClientSecret, hashClientSecret } from "./secrets";
import type { ClientRecord } from "./types";

const ISSUER = "https://op.example";
const TOKEN_ENDPOINT = `${ISSUER}/token`;
const REDIRECT_URI = "https://app.example/cb";
const NOW_MS = 1_800_000_000_000;
const NOW_SECONDS = NOW_MS / 1000;
const ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

interface Fixtures {
  readonly clients: readonly ClientRecord[];
  readonly postSecret: string;
  readonly hmacKey: SecretKey;
  readonly clientKey: KeyPair;
  readonly otherKey: KeyPair;
}

/** One client per authentication method, plus the keys the tests sign assertions with. */
async function fixtures(): Promise<Fixtures> {
  const basicSecret = generateClientSecret();
  const postSecret = generateClientSecret();
  const hmacKey = await generateSecretKey({ alg: "HS256", extractable: false });
  const clientKey = await generateKeyPair({ alg: "ES256", kid: "client-k1" });
  // Same kid as clientKey, so a signature check decides the outcome rather than key selection.
  const otherKey = await generateKeyPair({ alg: "ES256", kid: "client-k1" });
  const base = { redirectUris: [REDIRECT_URI], scopes: ["openid"] };
  const clients: ClientRecord[] = [
    { clientId: "public", ...base, auth: { method: "none" } },
    {
      clientId: "basic",
      ...base,
      auth: { method: "client_secret_basic", secretHash: await hashClientSecret(basicSecret) },
    },
    {
      clientId: "post",
      ...base,
      auth: { method: "client_secret_post", secretHash: await hashClientSecret(postSecret) },
    },
    { clientId: "hmac", ...base, auth: { method: "client_secret_jwt", key: hmacKey } },
    { clientId: "keyed", ...base, auth: { method: "private_key_jwt", keys: createKeySet([clientKey.publicKey]) } },
  ];
  return { clients, postSecret, hmacKey, clientKey, otherKey };
}

/** Provider options over a memory store holding `clients`. The provider's own key plays no part in client authentication. */
async function setup(clients: readonly ClientRecord[]): Promise<ResolvedOptions> {
  const store = createMemoryStore({ clients });
  const signingKey = await generateKeyPair({ alg: "ES256", kid: "provider-k1" });
  return resolveOptions({
    issuer: ISSUER,
    signingKeys: [signingKey],
    store,
    claims: () => ({}),
    now: () => NOW_MS,
  });
}

/** Authenticates a form body, optionally with an `authorization` header, as the token endpoint would. */
async function authenticate(
  options: ResolvedOptions,
  body: Record<string, string>,
  authorization?: string,
): Promise<ClientAuthResult> {
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (authorization !== undefined) {
    headers.authorization = authorization;
  }
  const encoded = new URLSearchParams(body).toString();
  const request = new Request(TOKEN_ENDPOINT, { method: "POST", headers, body: encoded });
  const parsed = parseParameters(encoded);
  if (!parsed.ok) {
    throw new Error("test body must parse");
  }
  return authenticateClient(options, request, parsed.parameters);
}

/** The Basic header for an id and secret, each form-urlencoded as RFC 6749 §2.3.1 requires. */
const basicHeader = (clientId: string, secret: string): string =>
  `Basic ${btoa(`${encodeURIComponent(clientId)}:${encodeURIComponent(secret)}`)}`;

/** A client assertion (RFC 7523) with valid defaults, which a test overrides for one claim. */
function assertion(key: SigningKey, claims: JwtPayload): Promise<string> {
  return sign({
    payload: { iss: "keyed", sub: "keyed", aud: ISSUER, exp: NOW_SECONDS + 300, jti: "jti-1", ...claims },
    key,
  });
}

/** The status and JSON body of a failed client authentication. */
async function errorOf(result: ClientAuthResult): Promise<{ readonly status: number; readonly body: unknown }> {
  if (result.ok) {
    throw new Error("expected a failure");
  }
  return { status: result.response.status, body: await result.response.clone().json() };
}

/** The WWW-Authenticate challenge of a failed client authentication, or null when it sends none. */
function challengeOf(result: ClientAuthResult): string | null {
  if (result.ok) {
    throw new Error("expected a failure");
  }
  return result.response.headers.get("www-authenticate");
}

describe("authenticateClient: successful methods", () => {
  it("authenticates a public client by client_id alone", async () => {
    const options = await setup((await fixtures()).clients);

    const result = await authenticate(options, { client_id: "public" });

    expect(result.ok && result.client.clientId).toBe("public");
  });

  it("authenticates client_secret_basic, with a form-encoded secret containing ':' and '+'", async () => {
    const secret = "pa:ss+w rd";
    const { clients } = await fixtures();
    const withSecret = await Promise.all(
      clients.map(async (client) =>
        client.clientId === "basic"
          ? { ...client, auth: { method: "client_secret_basic" as const, secretHash: await hashClientSecret(secret) } }
          : client,
      ),
    );
    const options = await setup(withSecret);

    const result = await authenticate(options, {}, basicHeader("basic", secret));

    expect(result.ok && result.client.clientId).toBe("basic");
  });

  it("decodes a plus sign in a Basic credential as a space", async () => {
    const { clients } = await fixtures();
    const withSecret = await Promise.all(
      clients.map(async (client) =>
        client.clientId === "basic"
          ? { ...client, auth: { method: "client_secret_basic" as const, secretHash: await hashClientSecret("a b") } }
          : client,
      ),
    );
    const options = await setup(withSecret);

    const result = await authenticate(options, {}, `Basic ${btoa("basic:a+b")}`);

    expect(result.ok).toBe(true);
  });

  it("authenticates client_secret_post", async () => {
    const { clients, postSecret } = await fixtures();
    const options = await setup(clients);

    const result = await authenticate(options, { client_id: "post", client_secret: postSecret });

    expect(result.ok && result.client.clientId).toBe("post");
  });

  it("authenticates client_secret_jwt with an HS256 assertion", async () => {
    const { clients, hmacKey } = await fixtures();
    const options = await setup(clients);
    const token = await sign({
      payload: { iss: "hmac", sub: "hmac", aud: ISSUER, exp: NOW_SECONDS + 300, jti: "jti-1" },
      key: hmacKey,
    });

    const result = await authenticate(options, {
      client_id: "hmac",
      client_assertion_type: ASSERTION_TYPE,
      client_assertion: token,
    });

    expect(result.ok && result.client.clientId).toBe("hmac");
  });

  it("authenticates private_key_jwt with an assertion addressed to the issuer", async () => {
    const { clients, clientKey } = await fixtures();
    const options = await setup(clients);
    const token = await assertion(clientKey.privateKey, {});

    const result = await authenticate(options, {
      client_id: "keyed",
      client_assertion_type: ASSERTION_TYPE,
      client_assertion: token,
    });

    expect(result.ok && result.client.clientId).toBe("keyed");
  });

  it("accepts an assertion issued 30 seconds in the future, within clock tolerance", async () => {
    const { clients, clientKey } = await fixtures();
    const options = await setup(clients);
    const token = await assertion(clientKey.privateKey, { iat: NOW_SECONDS + 30 });

    const result = await authenticate(options, {
      client_id: "keyed",
      client_assertion_type: ASSERTION_TYPE,
      client_assertion: token,
    });

    expect(result.ok && result.client.clientId).toBe("keyed");
  });

  it("accepts an assertion whose exp is 30 seconds in the past, within clock tolerance", async () => {
    const { clients, clientKey } = await fixtures();
    const options = await setup(clients);
    const token = await assertion(clientKey.privateKey, { exp: NOW_SECONDS - 30 });

    const result = await authenticate(options, {
      client_id: "keyed",
      client_assertion_type: ASSERTION_TYPE,
      client_assertion: token,
    });

    expect(result.ok && result.client.clientId).toBe("keyed");
  });

  it("accepts an assertion whose exp is exactly 300 seconds ahead", async () => {
    const { clients, clientKey } = await fixtures();
    const options = await setup(clients);
    const token = await assertion(clientKey.privateKey, { exp: NOW_SECONDS + 300 });

    const result = await authenticate(options, {
      client_id: "keyed",
      client_assertion_type: ASSERTION_TYPE,
      client_assertion: token,
    });

    expect(result.ok && result.client.clientId).toBe("keyed");
  });

  it("authenticates private_key_jwt with an assertion addressed to the token endpoint", async () => {
    const { clients, clientKey } = await fixtures();
    const options = await setup(clients);
    const token = await assertion(clientKey.privateKey, { aud: TOKEN_ENDPOINT });

    const result = await authenticate(options, {
      client_id: "keyed",
      client_assertion_type: ASSERTION_TYPE,
      client_assertion: token,
    });

    expect(result.ok).toBe(true);
  });
});

describe("authenticateClient: invalid_client failures", () => {
  it("rejects a wrong client secret", async () => {
    const options = await setup((await fixtures()).clients);

    const result = await authenticate(options, { client_id: "post", client_secret: "wrong" });

    expect(await errorOf(result)).toEqual({ status: 401, body: { error: "invalid_client" } });
  });

  it("rejects a client secret presented for a public client", async () => {
    const { clients, postSecret } = await fixtures();
    const options = await setup(clients);

    const result = await authenticate(options, { client_id: "public", client_secret: postSecret });

    expect(await errorOf(result)).toEqual({ status: 401, body: { error: "invalid_client" } });
  });

  it("rejects no secret for a client that registered one", async () => {
    const options = await setup((await fixtures()).clients);

    const result = await authenticate(options, { client_id: "post" });

    expect(await errorOf(result)).toEqual({ status: 401, body: { error: "invalid_client" } });
  });

  it("rejects an unknown client", async () => {
    const options = await setup((await fixtures()).clients);

    const result = await authenticate(options, { client_id: "nobody" });

    expect(await errorOf(result)).toEqual({ status: 401, body: { error: "invalid_client" } });
  });

  it("rejects a wrong Basic secret and sends a WWW-Authenticate challenge", async () => {
    const options = await setup((await fixtures()).clients);

    const result = await authenticate(options, {}, basicHeader("basic", "wrong"));

    expect(await errorOf(result)).toEqual({ status: 401, body: { error: "invalid_client" } });
    expect(await challengeOf(result)).toBe('Basic realm="token"');
  });

  it("rejects Basic credentials for a client registered for post, with a challenge", async () => {
    const options = await setup((await fixtures()).clients);

    const result = await authenticate(options, {}, basicHeader("post", "anything"));

    expect(await errorOf(result)).toEqual({ status: 401, body: { error: "invalid_client" } });
    expect(await challengeOf(result)).toBe('Basic realm="token"');
  });

  it("rejects an authorization header with another scheme, with a Basic challenge", async () => {
    const options = await setup((await fixtures()).clients);

    const result = await authenticate(options, { client_id: "public" }, "Bearer abc");

    expect(await errorOf(result)).toEqual({ status: 401, body: { error: "invalid_client" } });
    expect(await challengeOf(result)).toBe('Basic realm="token"');
  });

  it("rejects an empty authorization header, with a Basic challenge", async () => {
    const options = await setup((await fixtures()).clients);

    const result = await authenticate(options, { client_id: "public" }, "");

    expect(await errorOf(result)).toEqual({ status: 401, body: { error: "invalid_client" } });
    expect(await challengeOf(result)).toBe('Basic realm="token"');
  });

  it("rejects a bare Basic scheme with nothing after it, with a Basic challenge", async () => {
    const options = await setup((await fixtures()).clients);

    const result = await authenticate(options, { client_id: "public" }, "Basic");

    expect(await errorOf(result)).toEqual({ status: 401, body: { error: "invalid_client" } });
    expect(await challengeOf(result)).toBe('Basic realm="token"');
  });

  it("accepts the Basic scheme in lowercase", async () => {
    const secret = "pa ss";
    const { clients } = await fixtures();
    const withSecret = await Promise.all(
      clients.map(async (client) =>
        client.clientId === "basic"
          ? { ...client, auth: { method: "client_secret_basic" as const, secretHash: await hashClientSecret(secret) } }
          : client,
      ),
    );
    const options = await setup(withSecret);

    const result = await authenticate(options, {}, basicHeader("basic", secret).replace("Basic ", "basic "));

    expect(result.ok && result.client.clientId).toBe("basic");
  });

  it("rejects Basic with two spaces after the scheme, with a challenge", async () => {
    const options = await setup((await fixtures()).clients);

    const result = await authenticate(options, {}, `Basic  ${btoa("basic:anything")}`);

    expect(await errorOf(result)).toEqual({ status: 401, body: { error: "invalid_client" } });
    expect(await challengeOf(result)).toBe('Basic realm="token"');
  });

  it("rejects Basic credentials with an empty client id, with a challenge", async () => {
    const options = await setup((await fixtures()).clients);

    const result = await authenticate(options, {}, `Basic ${btoa(":secret")}`);

    expect(await errorOf(result)).toEqual({ status: 401, body: { error: "invalid_client" } });
    expect(await challengeOf(result)).toBe('Basic realm="token"');
  });

  it("rejects Basic credentials with no colon", async () => {
    const options = await setup((await fixtures()).clients);

    const result = await authenticate(options, {}, `Basic ${btoa("basic")}`);

    expect(await errorOf(result)).toEqual({ status: 401, body: { error: "invalid_client" } });
  });

  it("rejects Basic credentials that are not strict base64", async () => {
    const options = await setup((await fixtures()).clients);

    const result = await authenticate(options, {}, "Basic !!!!");

    expect(await errorOf(result)).toEqual({ status: 401, body: { error: "invalid_client" } });
  });

  it("rejects an assertion with the wrong audience", async () => {
    const { clients, clientKey } = await fixtures();
    const options = await setup(clients);
    const token = await assertion(clientKey.privateKey, { aud: "https://elsewhere.example" });

    const result = await authenticate(options, {
      client_id: "keyed",
      client_assertion_type: ASSERTION_TYPE,
      client_assertion: token,
    });

    expect(await errorOf(result)).toEqual({ status: 401, body: { error: "invalid_client" } });
  });

  it("rejects an assertion with the wrong issuer", async () => {
    const { clients, clientKey } = await fixtures();
    const options = await setup(clients);
    const token = await assertion(clientKey.privateKey, { iss: "someone-else" });

    const result = await authenticate(options, {
      client_id: "keyed",
      client_assertion_type: ASSERTION_TYPE,
      client_assertion: token,
    });

    expect(await errorOf(result)).toEqual({ status: 401, body: { error: "invalid_client" } });
  });

  it("rejects an expired assertion", async () => {
    const { clients, clientKey } = await fixtures();
    const options = await setup(clients);
    const token = await assertion(clientKey.privateKey, { exp: NOW_SECONDS - 90 });

    const result = await authenticate(options, {
      client_id: "keyed",
      client_assertion_type: ASSERTION_TYPE,
      client_assertion: token,
    });

    expect(await errorOf(result)).toEqual({ status: 401, body: { error: "invalid_client" } });
  });

  it("rejects an assertion issued 90 seconds in the future", async () => {
    const { clients, clientKey } = await fixtures();
    const options = await setup(clients);
    const token = await assertion(clientKey.privateKey, { iat: NOW_SECONDS + 90 });

    const result = await authenticate(options, {
      client_id: "keyed",
      client_assertion_type: ASSERTION_TYPE,
      client_assertion: token,
    });

    expect(await errorOf(result)).toEqual({ status: 401, body: { error: "invalid_client" } });
  });

  it("rejects an assertion whose exp is 90 seconds in the past", async () => {
    const { clients, clientKey } = await fixtures();
    const options = await setup(clients);
    const token = await assertion(clientKey.privateKey, { exp: NOW_SECONDS - 90 });

    const result = await authenticate(options, {
      client_id: "keyed",
      client_assertion_type: ASSERTION_TYPE,
      client_assertion: token,
    });

    expect(await errorOf(result)).toEqual({ status: 401, body: { error: "invalid_client" } });
  });

  it("rejects an assertion whose exp is past the 300-second lifetime plus clock tolerance", async () => {
    const { clients, clientKey } = await fixtures();
    const options = await setup(clients);
    const token = await assertion(clientKey.privateKey, { exp: NOW_SECONDS + 361 });

    const result = await authenticate(options, {
      client_id: "keyed",
      client_assertion_type: ASSERTION_TYPE,
      client_assertion: token,
    });

    expect(await errorOf(result)).toEqual({ status: 401, body: { error: "invalid_client" } });
  });

  it("rejects an assertion whose exp is ten years ahead", async () => {
    const { clients, clientKey } = await fixtures();
    const options = await setup(clients);
    const token = await assertion(clientKey.privateKey, { exp: NOW_SECONDS + 10 * 365 * 24 * 3600 });

    const result = await authenticate(options, {
      client_id: "keyed",
      client_assertion_type: ASSERTION_TYPE,
      client_assertion: token,
    });

    expect(await errorOf(result)).toEqual({ status: 401, body: { error: "invalid_client" } });
  });

  it("rejects an assertion signed by another key with the same kid", async () => {
    const { clients, otherKey } = await fixtures();
    const options = await setup(clients);
    const token = await assertion(otherKey.privateKey, {});

    const result = await authenticate(options, {
      client_id: "keyed",
      client_assertion_type: ASSERTION_TYPE,
      client_assertion: token,
    });

    expect(await errorOf(result)).toEqual({ status: 401, body: { error: "invalid_client" } });
  });

  it("rejects an assertion whose subject is not the client", async () => {
    const { clients, clientKey } = await fixtures();
    const options = await setup(clients);
    const token = await assertion(clientKey.privateKey, { sub: "someone" });

    const result = await authenticate(options, {
      client_id: "keyed",
      client_assertion_type: ASSERTION_TYPE,
      client_assertion: token,
    });

    expect(await errorOf(result)).toEqual({ status: 401, body: { error: "invalid_client" } });
  });

  it("rejects a private_key_jwt assertion presented for a client_secret_jwt client", async () => {
    const { clients, clientKey } = await fixtures();
    const options = await setup(clients);
    const token = await assertion(clientKey.privateKey, { iss: "hmac", sub: "hmac" });

    const result = await authenticate(options, {
      client_id: "hmac",
      client_assertion_type: ASSERTION_TYPE,
      client_assertion: token,
    });

    expect(await errorOf(result)).toEqual({ status: 401, body: { error: "invalid_client" } });
  });
});

describe("authenticateClient: invalid_request failures", () => {
  it("rejects two credential methods at once", async () => {
    const { clients, postSecret } = await fixtures();
    const options = await setup(clients);

    const result = await authenticate(
      options,
      { client_id: "post", client_secret: postSecret },
      basicHeader("basic", "anything"),
    );

    expect(await errorOf(result)).toEqual({ status: 400, body: { error: "invalid_request" } });
  });

  it("rejects a body client_id that differs from the Basic one", async () => {
    const options = await setup((await fixtures()).clients);

    const result = await authenticate(options, { client_id: "other" }, basicHeader("basic", "anything"));

    expect(await errorOf(result)).toEqual({ status: 400, body: { error: "invalid_request" } });
  });

  it("rejects an assertion without client_id", async () => {
    const { clients, clientKey } = await fixtures();
    const options = await setup(clients);
    const token = await assertion(clientKey.privateKey, {});

    const result = await authenticate(options, {
      client_assertion_type: ASSERTION_TYPE,
      client_assertion: token,
    });

    expect(await errorOf(result)).toEqual({ status: 400, body: { error: "invalid_request" } });
  });

  it("rejects an assertion with another client_assertion_type", async () => {
    const { clients, clientKey } = await fixtures();
    const options = await setup(clients);
    const token = await assertion(clientKey.privateKey, {});

    const result = await authenticate(options, {
      client_id: "keyed",
      client_assertion_type: "urn:example:other",
      client_assertion: token,
    });

    expect(await errorOf(result)).toEqual({ status: 400, body: { error: "invalid_request" } });
  });

  it("rejects a request with no credentials and no client_id", async () => {
    const options = await setup((await fixtures()).clients);

    const result = await authenticate(options, {});

    expect(await errorOf(result)).toEqual({ status: 400, body: { error: "invalid_request" } });
  });
});
