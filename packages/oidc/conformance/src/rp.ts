import { type Client, createClient, discover, type OidcIssue } from "@codenhub/oidc/client";

/** The scopes the relying party asks for: the standard ones whose claims the RP plans release at userinfo. */
const SCOPES = ["openid", "profile", "email", "address", "phone"];

/** Where a sign-in stopped, and why. */
export interface Outcome {
  /** The last step the relying party took. */
  readonly step: "discovery" | "authorization" | "callback" | "userinfo";
  /** Whether that step succeeded. A sign-in that reaches `userinfo` with `ok` is complete. */
  readonly ok: boolean;
  /**
   * Each issue the client reported, as `code` or `code:jwtCode` and the path it names, such as
   * `invalid_id_token:wrong_issuer at id_token.payload.iss`. Issues carry no values, so no token or secret is here.
   */
  readonly issues?: readonly string[];
  /** The HTTP status of an authorization endpoint that did not redirect back to the client. */
  readonly status?: number;
}

/**
 * Plays the user's browser: requests the authorization URL and returns the URL the provider redirected back to,
 * or the response when it did not redirect.
 */
export type Browser = (authorizationUrl: string) => Promise<string | Response>;

/** How the relying party is registered at the provider under test. */
export interface RelyingPartyConfig {
  readonly issuer: string;
  readonly clientId: string;
  /** Sent with `client_secret_basic`, the method both RP plans register the client with. */
  readonly secret: string;
  readonly redirectUri: string;
  /**
   * The `fetch` for discovery, the token, userinfo and JWKS endpoints.
   *
   * @defaultValue `globalThis.fetch`
   */
  readonly fetch?: typeof fetch;
  /** @defaultValue {@link redirectBrowser} with `fetch` */
  readonly browser?: Browser;
}

/** A relying party that has discovered its provider, and signs in with one client across attempts. */
export interface RelyingParty {
  /**
   * Signs in once: authorization, callback, then userinfo. `stop` is asked before each step after the
   * authorization; when it answers `true`, the sign-in ends early with the step reached marked `ok`, because a
   * suite module that has finished fails a request it did not expect.
   */
  signIn(stop?: () => Promise<boolean>): Promise<Outcome>;
}

/**
 * The browser a suite RP plan needs: its authorization endpoint answers at once with a redirect, so one request
 * without following it is the whole user interaction.
 */
export function redirectBrowser(fetcher: typeof fetch = globalThis.fetch): Browser {
  return async (url) => {
    const response = await fetcher(url, { redirect: "manual" });
    const location = response.headers.get("location");
    return location === null ? response : new URL(location, url).href;
  };
}

/** Formats the client's issues so a log shows why it refused without any value the response carried. */
export function describeIssues(issues: readonly OidcIssue[]): string[] {
  return issues.map((issue) => {
    const jwtCode = (issue.params as { jwtCode?: unknown } | undefined)?.jwtCode;
    const code = typeof jwtCode === "string" ? `${issue.code}:${jwtCode}` : issue.code;
    return issue.path === undefined || issue.path.length === 0 ? code : `${code} at ${issue.path.join(".")}`;
  });
}

/**
 * Discovers the provider and creates the client. One relying party is kept for a whole suite module, so the key
 * set it caches carries from one sign-in to the next, as a deployed app's does: the key rotation modules depend
 * on it.
 *
 * @returns The relying party, or the outcome of a discovery the client refused.
 */
export async function connect(config: RelyingPartyConfig): Promise<RelyingParty | Outcome> {
  const fetcher = config.fetch ?? globalThis.fetch;
  const discovered = await discover(config.issuer, { fetch: fetcher });
  if (!discovered.ok) {
    return { step: "discovery", ok: false, issues: describeIssues(discovered.error.issues) };
  }
  const client = createClient({
    metadata: discovered.value,
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    auth: { method: "client_secret_basic", secret: config.secret },
    fetch: fetcher,
  });
  const browser = config.browser ?? redirectBrowser(fetcher);
  return { signIn: (stop = async () => false) => signIn(client, browser, stop) };
}

async function signIn(client: Client, browser: Browser, stop: () => Promise<boolean>): Promise<Outcome> {
  const { url, pending } = await client.authorize({ scope: SCOPES });
  const returned = await browser(url);
  if (typeof returned !== "string") {
    return { step: "authorization", ok: false, status: returned.status };
  }
  if (await stop()) {
    return { step: "authorization", ok: true };
  }
  const signedIn = await client.callback(returned, pending);
  if (!signedIn.ok) {
    return { step: "callback", ok: false, issues: describeIssues(signedIn.error.issues) };
  }
  if (await stop()) {
    return { step: "callback", ok: true };
  }
  const claims = await client.userinfo({
    accessToken: signedIn.value.tokens.accessToken,
    subject: signedIn.value.claims.sub,
  });
  return claims.ok
    ? { step: "userinfo", ok: true }
    : { step: "userinfo", ok: false, issues: describeIssues(claims.error.issues) };
}
