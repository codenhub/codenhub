import { generateKeyPairSync } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import Provider from "oidc-provider";

/*
 * panva's oidc-provider running as a real HTTP server on 127.0.0.1, presented to the client under the
 * https issuer `https://op.test`. The package refuses non-https URLs, so `fetch` rewrites each request to
 * the local port and sets the forwarded headers the provider (`proxy = true`) reads to rebuild its URLs.
 */

export const ISSUER = "https://op.test";
export const CLIENT_ID = "rp";
export const CLIENT_SECRET = "a-client-secret-of-reasonable-length-0123456789";
export const REDIRECT_URI = "https://rp.test/callback";
export const ACCOUNT_ID = "user-1";
export const SCOPE = ["openid", "profile", "offline_access"];

export interface RunningProvider {
  /** The fetch to give the client: `https://op.test/...` goes to the local server. */
  readonly fetch: typeof fetch;
  /** Plays the browser: follows redirects with cookies from `url` until one targets the redirect URI. */
  readonly browse: (url: string) => Promise<string>;
  readonly close: () => Promise<void>;
}

/** Starts oidc-provider with one static client and an interaction route that signs `user-1` in at once. */
export async function startProvider(): Promise<RunningProvider> {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...privateKey.export({ format: "jwk" }), kid: "op-rs256", use: "sig", alg: "RS256" };

  const provider = new Provider(ISSUER, {
    clients: [
      {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uris: [REDIRECT_URI],
        response_types: ["code"],
        grant_types: ["authorization_code", "refresh_token"],
        token_endpoint_auth_method: "client_secret_basic",
      },
    ],
    jwks: { keys: [jwk] },
    // Non-default scopes and the claims each one releases must be declared, or the provider drops them.
    scopes: SCOPE,
    claims: { openid: ["sub"], profile: ["name"] },
    pkce: { required: () => true },
    features: { devInteractions: { enabled: false } },
    interactions: {
      url: (_context: unknown, interaction: { uid: string }) => `${ISSUER}/interaction/${interaction.uid}`,
    },
    findAccount: (_context: unknown, id: string) => ({
      accountId: id,
      claims: () => ({ sub: id, name: "Ada Lovelace" }),
    }),
  });
  provider.proxy = true;

  const handle = provider.callback();
  const server: Server = createServer((request, response) => {
    if (!request.url?.startsWith("/interaction/")) {
      handle(request, response);
      return;
    }
    void (async () => {
      try {
        const { params } = await provider.interactionDetails(request, response);
        const grant = new provider.Grant({ accountId: ACCOUNT_ID, clientId: params.client_id ?? "" });
        grant.addOIDCScope(SCOPE.join(" "));
        const grantId = await grant.save();
        await provider.interactionFinished(
          request,
          response,
          { login: { accountId: ACCOUNT_ID }, consent: { grantId } },
          { mergeWithLastSubmission: false },
        );
      } catch (error: unknown) {
        response.statusCode = 500;
        response.end(String(error));
      }
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  const rewritten: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const headers = new Headers(request.headers);
    headers.set("x-forwarded-proto", url.protocol.slice(0, -1));
    headers.set("x-forwarded-host", url.host);
    const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.text();
    return fetch(`http://127.0.0.1:${port}${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      body,
      redirect: request.redirect,
    });
  };

  const jar = new Map<string, string>();
  const browse = async (start: string): Promise<string> => {
    let current = start;
    for (let step = 0; step < 10; step += 1) {
      // Each hop depends on the Location of the one before it, so the requests cannot overlap.
      // oxlint-disable-next-line no-await-in-loop -- each redirect's URL comes from the previous response.
      const response = await rewritten(current, {
        redirect: "manual",
        headers: { cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; ") },
      });
      for (const cookie of response.headers.getSetCookie()) {
        const [pair = ""] = cookie.split(";");
        const separator = pair.indexOf("=");
        jar.set(pair.slice(0, separator), pair.slice(separator + 1));
      }
      const location = response.headers.get("location");
      if (location === null) {
        // oxlint-disable-next-line no-await-in-loop -- this is the last hop, read before the loop ends.
        throw new Error(`the browser stopped at ${response.status} ${current}: ${await response.text()}`);
      }
      current = new URL(location, current).href;
      if (current.startsWith(REDIRECT_URI)) {
        return current;
      }
    }
    throw new Error("too many redirects");
  };

  return {
    fetch: rewritten,
    browse,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
