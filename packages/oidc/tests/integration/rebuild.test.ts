import { createVerifier, generateKeyPair, importKeySet, type KeyPair } from "@codenhub/jwt";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createProvider, type Provider } from "../../src/provider";
import { createMemoryStore, type MemoryStore } from "../../src/testing";
import {
  answer,
  authorizationUrl,
  codeForm,
  DISCOVERY_URL,
  ISSUER,
  issueCode,
  issueTokens,
  JWKS_URL,
  PUBLIC_CLIENT,
  type ProviderSetup,
  redeem,
  refreshForm,
  setUpProvider,
  SUBJECT,
  userinfoRequest,
} from "./provider-support";

/** Builds a provider over the setup's store and clock, as an app does when its configuration changes. */
function rebuild(setup: ProviderSetup, signingKeys: readonly KeyPair[]): ProviderSetup {
  const provider = createProvider({
    issuer: ISSUER,
    signingKeys,
    store: setup.store,
    claims: () => ({ name: "Ada Lovelace", email: "ada@example.com" }),
    now: () => setup.now.ms,
  });
  return { ...setup, provider };
}

/** The `kid` in the header of a token, read without verifying it. */
const kidOf = (token: string): unknown =>
  (JSON.parse(Buffer.from(token.split(".")[0] ?? "", "base64url").toString("utf8")) as { kid?: unknown }).kid;

/** Verifies an ID token against the JWKS the provider publishes, as a relying party that fetched it would. */
async function verifiesAgainstJwks(provider: Provider, setup: ProviderSetup, idToken: string): Promise<boolean> {
  const response = await answer(provider, new Request(JWKS_URL));
  const keys = await importKeySet(await response.json());
  if (!keys.ok) {
    throw new Error("the published JWKS did not import");
  }
  const verified = await createVerifier({
    keys: keys.value,
    issuer: ISSUER,
    audience: PUBLIC_CLIENT,
    now: () => setup.now.ms,
  })(idToken);
  return verified.ok;
}

describe("creating a provider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("performs no I/O and makes no store call", async () => {
    const memory = createMemoryStore();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const calls = (Object.keys(memory) as (keyof MemoryStore)[])
      .filter((name) => typeof memory[name] === "function")
      .map((name) => vi.spyOn(memory, name));
    const claims = vi.fn(() => ({}));
    const signingKey = await generateKeyPair({ alg: "ES256", kid: "op-1" });

    const provider = createProvider({ issuer: ISSUER, signingKeys: [signingKey], store: memory, claims });

    // Synchronous, so nothing it started could still be pending, and nothing it did reached the store or the network.
    expect(provider).not.toBeInstanceOf(Promise);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call).not.toHaveBeenCalled();
    }
    expect(claims).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is cheap to repeat: two providers over one store and keys publish the same metadata", async () => {
    const setup = await setUpProvider();

    const first = rebuild(setup, [setup.signingKey]);
    const second = rebuild(setup, [setup.signingKey]);

    expect(first.provider).not.toBe(second.provider);
    expect(first.provider.metadata).toEqual(second.provider.metadata);
    expect(await (await answer(first.provider, new Request(DISCOVERY_URL))).json()).toEqual(
      await (await answer(second.provider, new Request(DISCOVERY_URL))).json(),
    );
  });
});

describe("a provider rebuilt over the same store", () => {
  it("accepts a code issued by the previous instance", async () => {
    const previous = await setUpProvider();
    const rebuilt = rebuild(previous, [previous.signingKey]);
    const code = await issueCode(previous);

    const response = await redeem(rebuilt, codeForm(code, PUBLIC_CLIENT));

    expect(response.status).toBe(200);
  });

  it("still treats a code the previous instance spent as a replay", async () => {
    const previous = await setUpProvider();
    const rebuilt = rebuild(previous, [previous.signingKey]);
    const code = await issueCode(previous);
    const issued = await redeem(previous, codeForm(code, PUBLIC_CLIENT));
    const tokens = (await issued.json()) as { access_token: string };

    const replay = await redeem(rebuilt, codeForm(code, PUBLIC_CLIENT));

    expect(replay.status).toBe(400);
    expect((await answer(previous.provider, userinfoRequest(tokens.access_token))).status).toBe(401);
  });

  it("completes an interaction the previous instance began", async () => {
    const previous = await setUpProvider();
    const rebuilt = rebuild(previous, [previous.signingKey]);
    const begun = await previous.provider.beginAuthorization(new Request(authorizationUrl()));
    if (!begun.ok) {
      throw new Error("beginAuthorization failed");
    }

    const completed = await rebuilt.provider.completeAuthorization(begun.value.id, {
      subject: SUBJECT,
      authTime: Math.floor(previous.now.ms / 1000),
      scopes: begun.value.scopes,
    });

    expect(completed.ok).toBe(true);
  });

  it("accepts a refresh token issued by the previous instance, and the previous instance one it issued", async () => {
    const previous = await setUpProvider();
    const rebuilt = rebuild(previous, [previous.signingKey]);
    const issued = await issueTokens(previous);

    const forward = await redeem(rebuilt, refreshForm(issued.tokens.refresh_token ?? "", PUBLIC_CLIENT));
    const next = (await forward.json()) as { refresh_token: string };
    const back = await redeem(previous, refreshForm(next.refresh_token, PUBLIC_CLIENT));

    expect(forward.status).toBe(200);
    expect(back.status).toBe(200);
  });

  it("accepts an access token issued by the previous instance at userinfo", async () => {
    const previous = await setUpProvider();
    const rebuilt = rebuild(previous, [previous.signingKey]);
    const issued = await issueTokens(previous);

    const response = await answer(rebuilt.provider, userinfoRequest(issued.tokens.access_token));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sub: SUBJECT, name: "Ada Lovelace" });
  });
});

describe("rotating a signing key by order, across rebuilds", () => {
  it("publishes the new key while the old one signs, then signs with the new one and still verifies the old tokens", async () => {
    const setup = await setUpProvider();
    const oldKey = setup.signingKey;
    const newKey = await generateKeyPair({ alg: "ES256", kid: "op-2" });

    // Before: one key.
    const before = rebuild(setup, [oldKey]);
    const signedByOld = (await issueTokens(before)).tokens.id_token;

    // Step 1: the new key is added second. It is published, and the old one still signs.
    const staged = rebuild(setup, [oldKey, newKey]);
    const jwks = (await (await answer(staged.provider, new Request(JWKS_URL))).json()) as {
      keys: { kid: string }[];
    };
    const stagedToken = (await issueTokens(staged)).tokens.id_token;

    expect(jwks.keys.map((key) => key.kid)).toEqual(["op-1", "op-2"]);
    expect(kidOf(stagedToken)).toBe("op-1");

    // Step 2: the new key moves first. It signs, and a token the old key signed still verifies while it is listed.
    const rotated = rebuild(setup, [newKey, oldKey]);
    const signedByNew = (await issueTokens(rotated)).tokens.id_token;

    expect(kidOf(signedByNew)).toBe("op-2");
    expect(await verifiesAgainstJwks(rotated.provider, setup, signedByNew)).toBe(true);
    expect(await verifiesAgainstJwks(rotated.provider, setup, signedByOld)).toBe(true);
    expect(await verifiesAgainstJwks(rotated.provider, setup, stagedToken)).toBe(true);

    // Step 3: once the old key is dropped, what it signed no longer verifies, which is why it is kept that long.
    const retired = rebuild(setup, [newKey]);

    expect(await verifiesAgainstJwks(retired.provider, setup, signedByNew)).toBe(true);
    expect(await verifiesAgainstJwks(retired.provider, setup, signedByOld)).toBe(false);
  });
});
