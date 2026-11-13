import { generateKeyPair } from "@codenhub/jwt";
import {
  createProvider,
  type AuthorizationInteraction,
  type OidcIssue,
  type Provider,
  type ProviderOptions,
} from "@codenhub/oidc/provider";
import { createMemoryStore } from "@codenhub/oidc/testing";

import { buildClients, CLIENT_IDS, callbackUrl, type ClientSecrets } from "./clients";
import { TEST_SUBJECT, TEST_USER_CLAIMS } from "./user";

/** What the host needs to run. `worker.ts` reads it from the environment. */
export interface HostConfig {
  /** The public `https` origin the host is served from. It is the issuer, byte for byte. */
  readonly issuer: string;
  /** The suite's origin, such as `https://www.certification.openid.net`. */
  readonly suiteOrigin: string;
  /** The test plan's alias, the segment of the callback URL `/test/a/<alias>/callback`. */
  readonly alias: string;
  readonly secrets: ClientSecrets;
  /** Signing keys. Omit them to generate an RS256 pair, which the Config OP plan needs listed in discovery. */
  readonly signingKeys?: ProviderOptions["signingKeys"];
  /** The current time in milliseconds since the Unix epoch, for the provider and the sessions alike. For tests. */
  readonly now?: () => number;
}

/** A running host: one provider, one in-memory store, and the sessions of the browsers that signed in. */
export interface Host {
  readonly provider: Provider;
  /** Answers every request: the provider's endpoints, the authorization and end-session steps, and the extras. */
  fetch(request: Request): Promise<Response>;
}

/** What the browser's session cookie names: when this browser's user last authenticated. */
interface Session {
  /** The identifier the grant carries as `sid`. It is not the cookie, which the client never sees. */
  readonly sid: string;
  readonly authTime: number;
}

const COOKIE = "conformance_session";

/**
 * Starts the host, and fails loudly when a promise it makes does not hold: the control client must refuse an
 * authorization request without PKCE, which {@link selfCheck} proves before the first request is answered.
 */
export async function createHost(config: HostConfig): Promise<Host> {
  const clients = await buildClients(config.suiteOrigin, config.alias, config.secrets);
  const store = createMemoryStore({ clients });
  const signingKeys = config.signingKeys ?? [
    await generateKeyPair({ alg: "RS256", kid: `conformance-${crypto.randomUUID()}` }),
  ];
  const now = config.now ?? Date.now;
  const provider = createProvider({
    issuer: config.issuer,
    signingKeys,
    store,
    now,
    // The provider keeps only the claims the granted scopes release, so the whole record is safe to return.
    claims: () => TEST_USER_CLAIMS,
    // `wrangler tail` shows why the suite's requests were refused. A diagnostic holds no token or secret.
    onDiagnostic: (diagnostic) => {
      console.warn(
        `OIDC ${diagnostic.endpoint} ${diagnostic.status} ${diagnostic.reason} ${diagnostic.clientId ?? ""}`,
      );
    },
  });
  await selfCheck(provider, config);

  const sessions = new Map<string, Session>();
  const authorizationEndpoint = new URL(provider.metadata.authorization_endpoint);
  const endSessionEndpoint = new URL(provider.metadata.end_session_endpoint ?? `${config.issuer}/logout`);

  const authorize = async (request: Request): Promise<Response> => {
    const begun = await provider.beginAuthorization(request);
    if (!begun.ok) {
      return begun.error.redirect ?? errorPage("The authorization request was refused.", begun.error.issues);
    }
    const interaction = begun.value;
    const seconds = Math.floor(now() / 1000);
    const existing = sessions.get(cookieValue(request) ?? "");
    const stale =
      interaction.maxAge !== undefined &&
      (interaction.maxAge === 0 || seconds - (existing?.authTime ?? 0) > interaction.maxAge);
    const needsLogin = existing === undefined || interaction.prompt.includes("login") || stale;

    if (needsLogin && interaction.prompt.includes("none")) {
      return finish(provider, interaction, { error: "login_required" });
    }
    // The host has no login page: signing in is recording that this browser is the test user, now.
    const session = needsLogin ? { sid: crypto.randomUUID(), authTime: seconds } : existing;
    const token = needsLogin ? crypto.randomUUID() : (cookieValue(request) ?? "");
    sessions.set(token, session);
    const answered = await finish(provider, interaction, {
      subject: TEST_SUBJECT,
      authTime: session.authTime,
      scopes: interaction.scopes,
      amr: ["pwd"],
      sessionId: session.sid,
    });
    return needsLogin ? withCookie(answered, `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=None`) : answered;
  };

  const logout = async (request: Request): Promise<Response> => {
    const ended = await provider.endSession(request);
    if (!ended.ok) {
      return errorPage("The logout request was refused.", ended.error.issues);
    }
    // A conformance host signs the browser out without asking: there is no user to confirm with.
    sessions.delete(cookieValue(request) ?? "");
    const answered = ended.value.redirect ?? page(200, "Signed out", "You are signed out.");
    return withCookie(answered, `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=None; Max-Age=0`);
  };

  return {
    provider,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.origin !== new URL(config.issuer).origin) {
        return page(
          500,
          "Wrong origin",
          `This host answers as ${config.issuer}, but the request was for ${url.origin}. Set ISSUER to the origin it is served from.`,
        );
      }
      const answered = await provider.handle(request);
      if (answered !== null) {
        return answered;
      }
      if (url.pathname === authorizationEndpoint.pathname) {
        return authorize(request);
      }
      if (url.pathname === endSessionEndpoint.pathname) {
        return logout(request);
      }
      if (url.pathname === "/self-check") {
        // createHost threw if this did not hold, so reaching it again means it still does.
        return Response.json({ ok: true, controlClient: CLIENT_IDS.control, requiresPkce: true });
      }
      if (url.pathname === "/") {
        return page(200, "OpenID conformance host", `Discovery: ${config.issuer}/.well-known/openid-configuration`);
      }
      return page(404, "Not found", "No such page.");
    },
  };
}

/**
 * Proves that the control client refuses an authorization request without PKCE, even with a `nonce`, which is
 * what a client with `requirePkce: false` would be allowed to send. If it does not, the suite's clients are not
 * the only ones that can go without PKCE, and the host is not a faithful test of the provider.
 */
async function selfCheck(provider: Provider, config: HostConfig): Promise<void> {
  const url = new URL(provider.metadata.authorization_endpoint);
  url.search = new URLSearchParams({
    client_id: CLIENT_IDS.control,
    redirect_uri: callbackUrl(config.suiteOrigin, `${config.alias}-control`),
    response_type: "code",
    scope: "openid",
    state: "self-check",
    nonce: "self-check",
  }).toString();
  const begun = await provider.beginAuthorization(new Request(url));
  if (begun.ok || !begun.error.issues.some((issue) => issue.path?.[0] === "code_challenge")) {
    throw new Error("Self-check failed: the control client did not refuse an authorization request without PKCE.");
  }
}

async function finish(
  provider: Provider,
  interaction: AuthorizationInteraction,
  outcome: Parameters<Provider["completeAuthorization"]>[1],
): Promise<Response> {
  const completed = await provider.completeAuthorization(interaction.id, outcome);
  return completed.ok
    ? completed.value
    : errorPage("The authorization request could not be completed.", completed.error.issues);
}

function cookieValue(request: Request): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === COOKIE) {
      return value.join("=");
    }
  }
  return undefined;
}

function withCookie(response: Response, cookie: string): Response {
  const copy = new Response(response.body, response);
  copy.headers.append("Set-Cookie", cookie);
  return copy;
}

function errorPage(message: string, issues: readonly OidcIssue[]): Response {
  const codes = issues.map((issue) => [issue.code, ...(issue.path ?? [])].join(" ")).join("; ");
  return page(400, "Error", `${message} ${codes}`);
}

function page(status: number, title: string, text: string): Response {
  const escape = (value: string): string =>
    value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title></head><body><h1>${escape(title)}</h1><p>${escape(text)}</p></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}
