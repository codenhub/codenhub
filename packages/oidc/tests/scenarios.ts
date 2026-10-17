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
const SIGNED_OUT_URI = "https://app.example/signed-out";

function check(condition: boolean, what: string): void {
  if (!condition) {
    throw new Error(what);
  }
}

type AuthMethod = "none" | "client_secret_basic" | "client_secret_post" | "client_secret_jwt" | "private_key_jwt";

/** A provider and a `fetch` that answers the client's requests from it, with no network. */
async function setUp(modules: Modules, auth: AuthMethod, accessToken?: providerModule.AccessTokenFormat) {
  const { jwt, provider, testing } = modules;
  const signingKey = await jwt.generateKeyPair({ alg: "ES256", kid: "op-1" });
  const secret = provider.generateClientSecret();
  const clientKey = await jwt.generateKeyPair({ alg: "ES256", kid: "rp-1" });
  const hmacKey = await jwt.generateSecretKey({ alg: "HS256" });
  const registered =
    auth === "none"
      ? ({ method: "none" } as const)
      : auth === "client_secret_basic"
        ? ({ method: "client_secret_basic", secretHash: await provider.hashClientSecret(secret) } as const)
        : auth === "client_secret_post"
          ? ({ method: "client_secret_post", secretHash: await provider.hashClientSecret(secret) } as const)
          : auth === "client_secret_jwt"
            ? ({ method: "client_secret_jwt", key: hmacKey } as const)
            : ({ method: "private_key_jwt", keys: jwt.createKeySet([clientKey.publicKey]) } as const);
  const store = testing.createMemoryStore({
    clients: [
      {
        clientId: "app",
        redirectUris: [REDIRECT_URI],
        scopes: ["openid", "profile", "offline_access"],
        auth: registered,
        postLogoutRedirectUris: [SIGNED_OUT_URI],
      },
    ],
  });
  const op = provider.createProvider({
    issuer: ISSUER,
    signingKeys: [signingKey],
    store,
    claims: ({ subject }) => ({ name: `User ${subject}`, email: "never-released@example.com" }),
    ...(accessToken === undefined ? {} : { accessToken }),
  });
  const fetchFromProvider: typeof fetch = async (input, init) =>
    (await op.handle(new Request(input, init))) ?? new Response(null, { status: 404 });
  const clientAuth =
    auth === "none"
      ? ({ method: "none" } as const)
      : auth === "client_secret_basic"
        ? ({ method: "client_secret_basic", secret } as const)
        : auth === "client_secret_post"
          ? ({ method: "client_secret_post", secret } as const)
          : auth === "client_secret_jwt"
            ? ({ method: "client_secret_jwt", key: hmacKey } as const)
            : ({ method: "private_key_jwt", key: clientKey.privateKey } as const);
  return { op, fetchFromProvider, clientAuth, signingKey };
}

/** Runs a sign-in through the provider's authorization step, as the app's login page would. */
async function signIn(
  modules: Modules,
  auth: AuthMethod,
  maxAge = 300,
  accessToken?: providerModule.AccessTokenFormat,
) {
  const { op, fetchFromProvider, clientAuth, signingKey } = await setUp(modules, auth, accessToken);
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
    maxAge,
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
  return { rp, signedIn: signedIn.value, signingKey };
}

const signInWith =
  (auth: AuthMethod): Scenario =>
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
  "signs in with client_secret_post": signInWith("client_secret_post"),
  "signs in with client_secret_jwt": signInWith("client_secret_jwt"),
  "signs in with private_key_jwt": signInWith("private_key_jwt"),

  // max_age=0 asks for a login after the request, which the app reports as now.
  "signs in under max_age=0": async (modules) => {
    const { signedIn } = await signIn(modules, "none", 0);
    check(signedIn.claims.sub === "user-1", "wrong sub");
  },

  "issues JWT access tokens a resource server verifies": async (modules) => {
    const audience = "https://api.example";
    const { rp, signedIn, signingKey } = await signIn(modules, "none", 300, { format: "jwt", audience });
    const verify = modules.jwt.createVerifier({
      keys: modules.jwt.createKeySet([signingKey.publicKey]),
      issuer: ISSUER,
      audience,
      type: "at+jwt",
    });
    const verified = await verify(signedIn.tokens.accessToken);
    check(verified.ok && verified.value.payload.sub === "user-1", "access token did not verify as at+jwt");
    const claims = await rp.userinfo({ accessToken: signedIn.tokens.accessToken, subject: "user-1" });
    check(claims.ok, "userinfo refused a JWT access token");
  },

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

  "logs out at the provider and returns to the app": async (modules) => {
    const { rp, signedIn } = await signIn(modules, "none");
    const url = rp.endSessionUrl({
      idTokenHint: signedIn.tokens.idToken,
      postLogoutRedirectUri: SIGNED_OUT_URI,
      state: "bye",
    });
    const { op } = await setUp(modules, "none");
    // A second provider with other keys cannot verify the hint, so it names no user but still redirects.
    const foreign = await op.endSession(new Request(url));
    check(foreign.ok && foreign.value.subject === undefined, "a hint from other keys named a user");
    check(
      foreign.ok && foreign.value.redirect?.headers.get("location") === `${SIGNED_OUT_URI}?state=bye`,
      "no redirect to the registered URI",
    );
  },

  "revokes a sign-in from the client": async (modules) => {
    const { rp, signedIn } = await signIn(modules, "client_secret_basic");
    const revoked = await rp.revoke({ token: signedIn.tokens.refreshToken as string, tokenTypeHint: "refresh_token" });
    check(revoked.ok, `revoke failed: ${JSON.stringify(revoked)}`);
    const claims = await rp.userinfo({ accessToken: signedIn.tokens.accessToken, subject: "user-1" });
    check(!claims.ok, "access token not revoked with its refresh token");
    const again = await rp.revoke({ token: signedIn.tokens.accessToken });
    check(again.ok, "revoking a revoked token was not answered 200");
  },

  "gets a client_credentials token and revokes it": async (modules) => {
    const { jwt, provider, testing, client } = modules;
    const secret = provider.generateClientSecret();
    const store = testing.createMemoryStore({
      clients: [
        {
          clientId: "service",
          redirectUris: [],
          scopes: ["orders:read"],
          auth: { method: "client_secret_post", secretHash: await provider.hashClientSecret(secret) },
          grantTypes: ["client_credentials"],
        },
      ],
    });
    const op = provider.createProvider({
      issuer: ISSUER,
      signingKeys: [await jwt.generateKeyPair({ alg: "ES256", kid: "op-1" })],
      store,
      claims: () => ({}),
      scopes: { "orders:read": [] },
    });
    const fetchFromProvider: typeof fetch = async (input, init) =>
      (await op.handle(new Request(input, init))) ?? new Response(null, { status: 404 });
    const service = client.createClient({
      metadata: op.metadata,
      clientId: "service",
      auth: { method: "client_secret_post", secret },
      fetch: fetchFromProvider,
    });
    const tokens = await service.clientCredentials();
    check(tokens.ok, `client_credentials failed: ${JSON.stringify(tokens)}`);
    if (!tokens.ok) {
      throw new Error("unreachable");
    }
    check(tokens.value.scope?.join(" ") === "orders:read", "wrong scope");
    check(tokens.value.refreshToken === undefined && tokens.value.idToken === undefined, "unexpected tokens");
    const revoked = await service.revoke({ token: tokens.value.accessToken });
    check(revoked.ok, "revoke failed");
  },

  // Run here as well as on Node.js because a bundler once dropped the check as dead code.
  "refuses invalid UTF-8 escapes": async (modules) => {
    const { op } = await setUp(modules, "none");
    const begun = await op.beginAuthorization(new Request(`${ISSUER}/authorize?client_id=app&login_hint=%E9`));
    check(
      !begun.ok && begun.error.redirect === null && begun.error.issues[0]?.params?.reason === "malformed",
      `invalid escape accepted: ${JSON.stringify(begun)}`,
    );
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
