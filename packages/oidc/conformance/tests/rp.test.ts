import { beforeAll, describe, expect, it } from "vitest";

import { CLIENT_IDS } from "../src/clients";
import { createHost, type Host } from "../src/host";
import { type Browser, connect, type RelyingParty, type RelyingPartyConfig } from "../src/rp";
import { ALIAS, authorize, CALLBACK, ISSUER, SECRETS, SUITE_ORIGIN } from "./support";

let host: Host;
const requested: string[] = [];

/** Routes the client's requests to the provider host, and records each path. */
const hostFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init);
  requested.push(new URL(request.url).pathname);
  return host.fetch(request);
}) as typeof fetch;

/** Signs in on the host's login page, as the suite's browser does, and returns where it sent the browser back. */
const hostBrowser: Browser = async (url) => {
  const answered = await authorize((request) => host.fetch(request), url);
  const location = answered.headers.get("location");
  return answered.status === 302 && location !== null ? location : answered;
};

function config(overrides: Partial<RelyingPartyConfig> = {}): RelyingPartyConfig {
  return {
    issuer: ISSUER,
    clientId: CLIENT_IDS.first,
    secret: SECRETS.first,
    redirectUri: CALLBACK,
    fetch: hostFetch,
    browser: hostBrowser,
    ...overrides,
  };
}

async function connected(overrides: Partial<RelyingPartyConfig> = {}): Promise<RelyingParty> {
  const party = await connect(config(overrides));
  if (!("signIn" in party)) {
    throw new Error(`Discovery failed: ${JSON.stringify(party)}`);
  }
  return party;
}

beforeAll(async () => {
  host = await createHost({ issuer: ISSUER, suiteOrigin: SUITE_ORIGIN, alias: ALIAS, secrets: SECRETS });
});

describe("the relying party", () => {
  it("signs in against this package's provider through userinfo", async () => {
    const party = await connected();

    await expect(party.signIn()).resolves.toEqual({ step: "userinfo", ok: true });
  });

  it("signs in again with the same client, reusing the key set it fetched", async () => {
    const party = await connected();
    await party.signIn();
    requested.length = 0;

    await expect(party.signIn()).resolves.toEqual({ step: "userinfo", ok: true });
    expect(requested).not.toContain("/jwks");
  });

  it("stops before the code exchange once the module has ended", async () => {
    const party = await connected();
    requested.length = 0;

    await expect(party.signIn(async () => true)).resolves.toEqual({ step: "authorization", ok: true });
    expect(requested).not.toContain("/token");
  });

  it("reports the client's issues without the secret it sent", async () => {
    const party = await connected({ secret: "not-the-registered-secret" });

    const outcome = await party.signIn();

    expect(outcome).toMatchObject({ step: "callback", ok: false });
    expect(outcome.issues).toEqual([expect.stringMatching(/^provider_error/)]);
    expect(JSON.stringify(outcome)).not.toContain("not-the-registered-secret");
  });

  it("reports an authorization endpoint that did not redirect back", async () => {
    const party = await connected({ browser: async () => new Response("no", { status: 400 }) });

    await expect(party.signIn()).resolves.toEqual({ step: "authorization", ok: false, status: 400 });
  });

  it("reports a discovery document the client refuses", async () => {
    const otherIssuer = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await hostFetch(input, init);
      const metadata = (await response.json()) as Record<string, unknown>;
      return Response.json({ ...metadata, issuer: "https://elsewhere.test" });
    }) as typeof fetch;

    await expect(connect(config({ fetch: otherIssuer }))).resolves.toEqual({
      step: "discovery",
      ok: false,
      issues: ["issuer_mismatch at metadata.issuer"],
    });
  });
});
