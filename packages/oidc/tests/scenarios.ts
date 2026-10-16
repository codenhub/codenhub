import type * as jwtModule from "@codenhub/jwt";

import type * as clientModule from "../src/client";
import type * as providerModule from "../src/provider";
import type * as testingModule from "../src/testing";

/*
 * The authorization code flow, this client against this provider, through the public entrypoints only.
 * Node.js runs it on the source (`tests/integration/end-to-end.test.ts`) and workerd on the built
 * package (`tests/integration/workerd.test.ts`). The modules are passed in rather than imported, so this
 * file imports nothing at run time and each runtime loads it beside its own copy of the package.
 */

export interface Modules {
  readonly jwt: typeof jwtModule;
  readonly client: typeof clientModule;
  readonly provider: typeof providerModule;
  readonly testing: typeof testingModule;
}

type Scenario = (modules: Modules) => Promise<void>;

const ISSUER = "https://op.example";
const REDIRECT_URI = "https://app.example/callback";

function check(condition: boolean, what: string): void {
  if (!condition) {
    throw new Error(what);
  }
}

/** A provider and a `fetch` that answers the client's requests from it, with no network. */
async function setUp(modules: Modules, auth: "none" | "client_secret_basic" | "private_key_jwt") {
  const { jwt, provider, testing } = modules;
  const signingKey = await jwt.generateKeyPair({ alg: "ES256", kid: "op-1" });
  const secret = provider.generateClientSecret();
  const clientKey = await jwt.generateKeyPair({ alg: "ES256", kid: "rp-1" });
  const registered =
    auth === "none"
      ? ({ method: "none" } as const)
      : auth === "client_secret_basic"
        ? ({ method: "client_secret_basic", secretHash: await provider.hashClientSecret(secret) } as const)
        : ({ method: "private_key_jwt", keys: jwt.createKeySet([clientKey.publicKey]) } as const);
  const store = testing.createMemoryStore({
    clients: [
      {
        clientId: "app",
        redirectUris: [REDIRECT_URI],
        scopes: ["openid", "profile", "offline_access"],
        auth: registered,
      },
    ],
  });
  const op = provider.createProvider({
    issuer: ISSUER,
    signingKeys: [signingKey],
    store,
    claims: ({ subject }) => ({ name: `User ${subject}`, email: "never-released@example.com" }),
  });
  const fetchFromProvider: typeof fetch = async (input, init) =>
    (await op.handle(new Request(input, init))) ?? new Response(null, { status: 404 });
  const clientAuth =
    auth === "none"
      ? ({ method: "none" } as const)
      : auth === "client_secret_basic"
        ? ({ method: "client_secret_basic", secret } as const)
        : ({ method: "private_key_jwt", key: clientKey.privateKey } as const);
  return { op, fetchFromProvider, clientAuth };
}

/** Runs a sign-in through the provider's authorization step, as the app's login page would. */
async function signIn(modules: Modules, auth: "none" | "client_secret_basic" | "private_key_jwt") {
  const { op, fetchFromProvider, clientAuth } = await setUp(modules, auth);
  const discovered = await modules.client.discover(ISSUER, { fetch: fetchFromProvider });
  check(discovered.ok, "discovery failed");
  if (!discovered.ok) {
    throw new Error("unreachable");
  }
  const rp = modules.client.createClient({
    metadata: discovered.value,
    clientId: "app",
    redirectUri: REDIRECT_URI,
    auth: clientAuth,
    fetch: fetchFromProvider,
  });
  const { url, pending } = await rp.authorize({
    scope: ["openid", "profile", "offline_access"],
    prompt: ["consent"],
    maxAge: 300,
  });
  const begun = await op.beginAuthorization(new Request(url));
  check(begun.ok, "beginAuthorization failed");
  if (!begun.ok) {
    throw new Error("unreachable");
  }
  const completed = await op.completeAuthorization(begun.value.id, {
    subject: "user-1",
    authTime: Math.floor(Date.now() / 1000),
    scopes: begun.value.scopes,
    amr: ["pwd"],
  });
  check(completed.ok && completed.value.status === 302, "completeAuthorization failed");
  if (!completed.ok) {
    throw new Error("unreachable");
  }
  const location = completed.value.headers.get("location") ?? "";
  const signedIn = await rp.callback(location, JSON.parse(JSON.stringify(pending)));
  check(signedIn.ok, `callback failed: ${JSON.stringify(signedIn)}`);
  if (!signedIn.ok) {
    throw new Error("unreachable");
  }
  return { rp, signedIn: signedIn.value };
}

const signInWith =
  (auth: "none" | "client_secret_basic" | "private_key_jwt"): Scenario =>
  async (modules) => {
    const { signedIn } = await signIn(modules, auth);
    check(signedIn.claims.sub === "user-1", "wrong sub");
    check(signedIn.claims.iss === ISSUER, "wrong iss");
    check(signedIn.claims.aud === "app", "wrong aud");
    check(typeof signedIn.claims.auth_time === "number", "no auth_time");
    check(typeof signedIn.tokens.refreshToken === "string", "no refresh token");
  };

export const scenarios: Readonly<Record<string, Scenario>> = {
  "signs in a public client": signInWith("none"),
  "signs in with client_secret_basic": signInWith("client_secret_basic"),
  "signs in with private_key_jwt": signInWith("private_key_jwt"),

  "fetches userinfo for the granted scopes": async (modules) => {
    const { rp, signedIn } = await signIn(modules, "none");
    const claims = await rp.userinfo({ accessToken: signedIn.tokens.accessToken, subject: signedIn.claims.sub });
    check(claims.ok, "userinfo failed");
    check(claims.ok && claims.value.name === "User user-1", "missing profile claim");
    check(claims.ok && !("email" in claims.value), "released a claim outside the scopes");
  },

  "rotates refresh tokens and revokes the family on reuse": async (modules) => {
    const { rp, signedIn } = await signIn(modules, "none");
    const refreshToken = signedIn.tokens.refreshToken as string;
    const first = await rp.refresh({ refreshToken, subject: "user-1" });
    check(first.ok, "refresh failed");
    if (!first.ok) {
      throw new Error("unreachable");
    }
    check(first.value.tokens.refreshToken !== refreshToken, "refresh token not rotated");
    const reused = await rp.refresh({ refreshToken, subject: "user-1" });
    check(!reused.ok && reused.error.issues[0].code === "provider_error", "reuse not refused");
    const rotated = await rp.refresh({ refreshToken: first.value.tokens.refreshToken as string, subject: "user-1" });
    check(!rotated.ok, "family not revoked after reuse");
    const claims = await rp.userinfo({ accessToken: first.value.tokens.accessToken, subject: "user-1" });
    check(!claims.ok, "access token not revoked after reuse");
  },
};

/** Runs one scenario by name and reports `ok` or the failure, for runtimes that can only return text. */
export async function runScenario(modules: Modules, name: string): Promise<string> {
  const scenario = scenarios[name];
  if (scenario === undefined) {
    return `unknown scenario ${name}`;
  }
  try {
    await scenario(modules);
    return "ok";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
