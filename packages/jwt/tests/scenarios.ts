import type * as jwt from "../dist/index.js";

/*
 * Checks every runtime runs against the built package: each browser engine through Playwright, and
 * workerd through Miniflare. Node.js runs the unit tests on the source. Each runtime brings its own Web
 * Crypto, so the same calls are made in each and must give the same answer there.
 *
 * The module is given to each check rather than imported, so this file imports nothing at run time:
 * the browser page and the worker each load it beside the built package from their own place.
 */

export type Jwt = typeof jwt;

/** What the runner knows about its runtime that a scenario cannot find out from inside it. */
export interface ScenarioOptions {
  /**
   * Retry Ed25519 generation that fails with `OperationError`, for Linux WebKit (see `generatePair`).
   * The runner sets it because the page cannot tell: Playwright's `Desktop Safari` device gives every
   * WebKit page a macOS user agent, whatever the host.
   */
  readonly retryEd25519Generation?: boolean;
}

type Scenario = (module: Jwt, options: ScenarioOptions) => Promise<void>;

const ASYMMETRIC = ["ES256", "EdDSA", "Ed25519", "RS256", "PS256"] as const;
const ALGORITHMS = [...ASYMMETRIC, "HS256"] as const;
type Algorithm = (typeof ALGORITHMS)[number];

const PAYLOAD = { sub: "user-1", iss: "https://issuer.example" };

function check(condition: boolean, what: string, actual: unknown): void {
  if (!condition) {
    throw new Error(`${what}: ${JSON.stringify(actual)}`);
  }
}

/** Verifies `token` with `key` and checks it carries the payload and algorithm it was signed with. */
async function expectVerified(module: Jwt, token: string, key: jwt.VerificationKey, alg: Algorithm): Promise<void> {
  const result = await module.createVerifier({
    keys: module.createKeySet([key]),
  })(token);
  check(result.ok, "verification failed", result);
  if (result.ok) {
    check(result.value.header.alg === alg, "wrong alg", result.value.header);
    check(result.value.payload.sub === PAYLOAD.sub, "wrong payload", result.value.payload);
  }
}

/** Expects `token` to be refused with exactly one issue of `code` at `path`. */
async function expectRefused(
  module: Jwt,
  token: string,
  key: jwt.VerificationKey,
  code: jwt.JwtIssueCode,
  path?: readonly string[],
): Promise<void> {
  const result = await module.createVerifier({
    keys: module.createKeySet([key]),
  })(token);
  const expected = {
    ok: false,
    error: { issues: [path === undefined ? { code } : { code, path }] },
  };
  check(JSON.stringify(result) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}`, result);
}

/**
 * Generates a key pair, retrying Ed25519 generation that Linux WebKit's libgcrypt backend fails with
 * `OperationError` when the new key's `d` or `x` starts with a zero byte (about 1 call in 128). The
 * trap in packages/jwt/AGENTS.md has the evidence and says when this can go.
 */
async function generatePair(
  module: Jwt,
  alg: (typeof ASYMMETRIC)[number],
  options: ScenarioOptions,
  extractable = false,
): Promise<jwt.KeyPair> {
  const retries = (alg === "EdDSA" || alg === "Ed25519") && options.retryEd25519Generation === true ? 3 : 0;
  for (let attempt = 0; ; attempt++) {
    try {
      // Each attempt runs only after the previous one failed.
      // oxlint-disable-next-line no-await-in-loop
      return await module.generateKeyPair({ alg, extractable });
    } catch (error) {
      if (attempt >= retries || !(error instanceof Error) || error.name !== "OperationError") {
        throw error;
      }
    }
  }
}

/** A signing key and the key that verifies it, for any algorithm. */
async function keysFor(
  module: Jwt,
  alg: Algorithm,
  options: ScenarioOptions,
  extractable = false,
): Promise<{ signing: jwt.SigningKey; verifying: jwt.VerificationKey }> {
  if (alg === "HS256") {
    const secret = await module.generateSecretKey({ alg, extractable });
    return { signing: secret, verifying: secret };
  }
  const pair = await generatePair(module, alg, options, extractable);
  return { signing: pair.privateKey, verifying: pair.publicKey };
}

const encodeSegment = (json: string): string =>
  btoa(json).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

const roundtrips = Object.fromEntries(
  ALGORITHMS.map((alg): [string, Scenario] => [
    `${alg} generate, sign and verify`,
    async (module, options) => {
      const { signing, verifying } = await keysFor(module, alg, options);
      await expectVerified(module, await module.sign({ payload: PAYLOAD, key: signing }), verifying, alg);
    },
  ]),
);

const jwkRoundtrips = Object.fromEntries(
  ALGORITHMS.map((alg): [string, Scenario] => [
    `${alg} JWK export and import`,
    async (module, options) => {
      if (alg === "HS256") {
        const secret = await module.generateSecretKey({
          alg,
          extractable: true,
        });
        const imported = await module.importSecretKey(await module.exportSecretJwk(secret), { alg });
        check(imported.ok, "secret import failed", imported);
        if (imported.ok) {
          await expectVerified(module, await module.sign({ payload: PAYLOAD, key: imported.value }), secret, alg);
        }
        return;
      }
      const pair = await generatePair(module, alg, options, true);
      const privateKey = await module.importPrivateKey(await module.exportPrivateJwk(pair.privateKey), { alg });
      const publicKey = await module.importPublicKey(await module.exportPublicJwk(pair.publicKey), { alg });
      check(privateKey.ok, "private import failed", privateKey);
      check(publicKey.ok, "public import failed", publicKey);
      if (privateKey.ok && publicKey.ok) {
        // Signed by the imported key and verified by the original, then the other way round.
        await expectVerified(
          module,
          await module.sign({ payload: PAYLOAD, key: privateKey.value }),
          pair.publicKey,
          alg,
        );
        await expectVerified(
          module,
          await module.sign({ payload: PAYLOAD, key: pair.privateKey }),
          publicKey.value,
          alg,
        );
      }
    },
  ]),
);

/*
 * Ed25519 keys whose `d` or `x` starts with a zero byte, the keys Linux WebKit's libgcrypt backend cannot
 * generate (packages/jwt/AGENTS.md). Imported from a JWK they must still sign and verify. Test keys only.
 */
const LEADING_ZERO_JWKS = {
  d: {
    kty: "OKP",
    crv: "Ed25519",
    x: "IXrb5y4gcDKi6QL8it18SajsJcRPrscBDPxUlgEcpPI",
    d: "ABtcYTg6wRtEwtEbyoZNuObWNwSBReWBtnldrQ8NxdE",
  },
  x: {
    kty: "OKP",
    crv: "Ed25519",
    x: "ACBNPndAhP1WgHLj62LeKUTiL-HspGlJ2pC3n1yimEY",
    d: "Ti8tZYiLQsQCeGliDH8skQZa5PwP5eFtYY8JrDUoLmY",
  },
} as const;

const leadingZeroImports = Object.fromEntries(
  Object.entries(LEADING_ZERO_JWKS).map(([member, jwk]): [string, Scenario] => [
    `Ed25519 JWK with a leading zero byte in ${member} imports, signs and verifies`,
    async (module) => {
      const publicJwk = { kty: jwk.kty, crv: jwk.crv, x: jwk.x };
      const privateKey = await module.importPrivateKey(jwk, { alg: "Ed25519" });
      const publicKey = await module.importPublicKey(publicJwk, {
        alg: "Ed25519",
      });
      check(privateKey.ok, "private import failed", privateKey);
      check(publicKey.ok, "public import failed", publicKey);
      if (privateKey.ok && publicKey.ok) {
        await expectVerified(
          module,
          await module.sign({ payload: PAYLOAD, key: privateKey.value }),
          publicKey.value,
          "Ed25519",
        );
      }
    },
  ]),
);

const tamperedSignatures = Object.fromEntries(
  ALGORITHMS.map((alg): [string, Scenario] => [
    `${alg} tampered signature is refused`,
    async (module, options) => {
      const { signing, verifying } = await keysFor(module, alg, options);
      const [header, payload, signature] = (await module.sign({ payload: PAYLOAD, key: signing })).split(".");
      // The first character carries six significant bits, so changing it always changes the signature.
      const tampered = `${signature?.startsWith("A") ? "B" : "A"}${signature?.slice(1)}`;
      await expectRefused(module, `${header}.${payload}.${tampered}`, verifying, "bad_signature");
    },
  ]),
);

export const scenarios: Readonly<Record<string, Scenario>> = {
  ...roundtrips,
  ...jwkRoundtrips,
  ...tamperedSignatures,
  ...leadingZeroImports,
  "alg none is refused": async (module, options) => {
    const { verifying } = await keysFor(module, "HS256", options);
    const token = `${encodeSegment('{"alg":"none"}')}.${encodeSegment('{"sub":"admin"}')}.AAAA`;
    await expectRefused(module, token, verifying, "unsupported_alg", ["header", "alg"]);
  },
  "a remote key set fetches and verifies": async (module) => {
    const pair = await module.generateKeyPair({ alg: "ES256", kid: "remote" });
    const jwk = await module.exportPublicJwk(pair.publicKey);
    const requested: string[] = [];
    const keys = module.createRemoteKeySet({
      url: "https://issuer.example/jwks.json",
      fetch: async (input) => {
        requested.push(String(input));
        return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
      },
    });
    const verify = module.createVerifier({ keys });
    const result = await verify(await module.sign({ payload: PAYLOAD, key: pair.privateKey }));
    check(result.ok && result.value.payload.sub === PAYLOAD.sub, "verification failed", result);
    check(JSON.stringify(requested) === '["https://issuer.example/jwks.json"]', "unexpected fetches", requested);
  },
};

/**
 * Runs one scenario and gives its outcome as text: `ok`, or the error's name and message, so a
 * runtime that lacks an algorithm reports the exact error it threw.
 */
export async function runScenario(module: Jwt, name: string, options: ScenarioOptions = {}): Promise<string> {
  const scenario = Object.hasOwn(scenarios, name) ? scenarios[name] : undefined;
  if (scenario === undefined) {
    return `no scenario named ${name}`;
  }
  try {
    await scenario(module, options);
    return "ok";
  } catch (error) {
    return error instanceof Error ? `${error.name}: ${error.message}` : `threw ${String(error)}`;
  }
}
