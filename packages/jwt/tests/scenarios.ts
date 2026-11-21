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

type Scenario = (module: Jwt) => Promise<void>;

const ASYMMETRIC = [
  "ES256",
  "ES384",
  "ES512",
  "EdDSA",
  "Ed25519",
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
] as const;
const SYMMETRIC = ["HS256", "HS384", "HS512"] as const;
const ALGORITHMS = [...ASYMMETRIC, ...SYMMETRIC] as const;
type Algorithm = (typeof ALGORITHMS)[number];
type Symmetric = (typeof SYMMETRIC)[number];
const isSymmetric = (alg: Algorithm): alg is Symmetric => (SYMMETRIC as readonly string[]).includes(alg);

// A fixed exp: workerd reads Date.now() as 0 at module scope, so one computed here would already be past.
const PAYLOAD = { sub: "user-1", iss: "https://issuer.example", exp: 4_102_444_800 };

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

/** A signing key and the key that verifies it, for any algorithm. */
async function keysFor(
  module: Jwt,
  alg: Algorithm,
  extractable = false,
): Promise<{ signing: jwt.SigningKey; verifying: jwt.VerificationKey }> {
  if (isSymmetric(alg)) {
    const secret = await module.generateSecretKey({ alg, extractable });
    return { signing: secret, verifying: secret };
  }
  const pair = await module.generateKeyPair({ alg, extractable });
  return { signing: pair.privateKey, verifying: pair.publicKey };
}

const encodeSegment = (json: string): string =>
  btoa(json).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

const roundtrips = Object.fromEntries(
  ALGORITHMS.map((alg): [string, Scenario] => [
    `${alg} generate, sign and verify`,
    async (module) => {
      const { signing, verifying } = await keysFor(module, alg);
      await expectVerified(module, await module.sign({ payload: PAYLOAD, key: signing }), verifying, alg);
    },
  ]),
);

const jwkRoundtrips = Object.fromEntries(
  ALGORITHMS.map((alg): [string, Scenario] => [
    `${alg} JWK export and import`,
    async (module) => {
      if (isSymmetric(alg)) {
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
      const pair = await module.generateKeyPair({ alg, extractable: true });
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

/** The public members of each key type, which `importKeyPair` must find to belong to the private ones. */
const PUBLIC_MEMBERS: Readonly<Record<(typeof ASYMMETRIC)[number], readonly string[]>> = {
  ES256: ["x", "y"],
  ES384: ["x", "y"],
  ES512: ["x", "y"],
  EdDSA: ["x"],
  Ed25519: ["x"],
  RS256: ["n"],
  RS384: ["n"],
  RS512: ["n"],
  PS256: ["n"],
  PS384: ["n"],
  PS512: ["n"],
};

/** Web Crypto parameters for each algorithm's key type, for making PEM keys outside the package. */
const keyParams = (alg: (typeof ASYMMETRIC)[number]): RsaHashedKeyGenParams | EcKeyGenParams | { name: string } => {
  if (alg.startsWith("ES")) {
    return { name: "ECDSA", namedCurve: { ES256: "P-256", ES384: "P-384" }[alg as "ES256" | "ES384"] ?? "P-521" };
  }
  if (alg.startsWith("RS") || alg.startsWith("PS")) {
    return {
      name: alg.startsWith("RS") ? "RSASSA-PKCS1-v1_5" : "RSA-PSS",
      hash: `SHA-${alg.slice(2)}`,
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
    };
  }
  return { name: "Ed25519" };
};

const pemOf = (label: string, der: ArrayBuffer): string => {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(der)));
  const lines = base64.match(/.{1,64}/g) ?? [];
  return [`-----BEGIN ${label}-----`, ...lines, `-----END ${label}-----`, ""].join("\n");
};

// Each runtime's Web Crypto parses the DER, so a PEM key that imports in Node.js may not elsewhere.
const pemImports = Object.fromEntries(
  ASYMMETRIC.map((alg): [string, Scenario] => [
    `${alg} PEM SPKI and PKCS#8 import, sign and verify`,
    async (module) => {
      const pair = (await crypto.subtle.generateKey(keyParams(alg), true, ["sign", "verify"])) as CryptoKeyPair;
      const spki = pemOf("PUBLIC KEY", await crypto.subtle.exportKey("spki", pair.publicKey));
      const pkcs8 = pemOf("PRIVATE KEY", await crypto.subtle.exportKey("pkcs8", pair.privateKey));
      const publicKey = await module.importPublicKey(spki, { alg, kid: "pem" });
      const keyPair = await module.importKeyPair(pkcs8, { alg, kid: "pem" });
      check(publicKey.ok, "SPKI import failed", publicKey);
      check(keyPair.ok, "PKCS#8 import failed", keyPair);
      if (publicKey.ok && keyPair.ok) {
        await expectVerified(
          module,
          await module.sign({ payload: PAYLOAD, key: keyPair.value.privateKey }),
          publicKey.value,
          alg,
        );
      }
    },
  ]),
);

/*
 * SEC 1 and PKCS#1 keys, which Web Crypto cannot export, so these were made once with Node.js
 * (`generateKeyPairSync` and `export({ type: "sec1" | "pkcs1", format: "pem" })`). The package rewraps each
 * as PKCS#8 or SPKI before the runtime parses it. Test keys only.
 */
const LEGACY_PEMS = {
  ES256: [
    "-----BEGIN EC PRIVATE KEY-----",
    "MHcCAQEEIKgP1RXbQbX4Mqfplx+bEPpEkb8otwIX+4D2E0HSu0uKoAoGCCqGSM49",
    "AwEHoUQDQgAEcK3nOLCSm1T8n/huGnhai5x7TwHAY0xS5mAADJokklrk78C+kpP0",
    "MGgW7IQGlZvd2Q9Bb06oAWxXNOwyE9WMfw==",
    "-----END EC PRIVATE KEY-----",
  ],
  ES384: [
    "-----BEGIN EC PRIVATE KEY-----",
    "MIGkAgEBBDAMkyeoioPBDpr18nTD4Zv9cG+/g4UMRwwFJm9G06etf59A6XOw/weY",
    "C/s0fxV6uhCgBwYFK4EEACKhZANiAATwFJBWf/iCnqCvgoQ15wWi9+SASnQIiBKN",
    "DIjrYSU8j09FrboWblg8BLx5wxZK2nmBvn+5c8XdKhjhKG/A/MG+jR2MUn6PgQlb",
    "hy4/9X0lt//nObsvTu7GKw56DE8WTVs=",
    "-----END EC PRIVATE KEY-----",
  ],
  ES512: [
    "-----BEGIN EC PRIVATE KEY-----",
    "MIHcAgEBBEIA4y96+adnODBkRy36J4vst7JvkGgXNZEhaoJgGSuJsunVS+itLFxK",
    "KU8PVKgbBQffZl23ng46r83VDtO/ccnFKtCgBwYFK4EEACOhgYkDgYYABAGJpP+n",
    "q13UAC/tFREYGGpaL4rQTAaRUnNND3M4nUoC3b4KFeshzns6IxckTNGfBT76XP2k",
    "/Kx6rHJySmk1hmjC8wAVz5+Rzgt2CyLusGAukKvsZVuwMGJPO59+YKdY8qoHbZVs",
    "WTDZ8ZvZXod0lZpTBqXxUqd/RwzQeDhmSq0DadDkFQ==",
    "-----END EC PRIVATE KEY-----",
  ],
  rsaPrivate: [
    "-----BEGIN RSA PRIVATE KEY-----",
    "MIIEpQIBAAKCAQEA0YVGE30i2EPhdGONKeyLLKrG46xxXuf7dD4znc1fwFkmEqSs",
    "D6oXGOTI7QBCLzPztL6PWYTDe/w3aK8sQINynrBJrmy4suXCc/rI1r4xr4HIc0zs",
    "4LBrANSx7j1qAiKP5CAJ+Te9IK5Rtq5FXCrTl641wbN/LmNhnBZqSYkhn3kzeBkk",
    "UlBR0U565NfFLQXVjTo8axl5o0Jcq1+gDTUBG5Xqswp3bc4eG3RwV66n8xEq+YDD",
    "cYo/jNRcGlYk3jZxdrIJEgMjM9L4MdnRx02qdT1hunrSElM9FiP9QhQWdQmum2Ip",
    "wSKohKqxWaveNR7N6J2ITkhf80maFqu5SBW3KwIDAQABAoIBABPS7n/z5ELzx+uu",
    "wFGvVLXBDM4dkqEpBZTd48gHrApzhOjZACyqlRfhDGpxjqblB/yEgToLl+wYakJd",
    "51Z3+XWD9ty+4wo44gP+Plgkfmf9jsfrXIhKjj1HDUoeMR8K7R69B083aQ4kCuLk",
    "LKIyrSWEsV0RTN8d6RjkfWGqzMMdVRvHt4guGDL6yTz3x3vUJizY08Fq63Yh08dd",
    "lWYC4TPltuTFmhx4OleDq5nIqioV8wB1B6LjvXtjmYPDbiD6Z9IT+4uVvS9KmO0D",
    "sSwQX6Uy4QnLLPAGe78EUvBtkl4LX+bqpiXC09q3aH2gPTFFMtcZyrj8nPuwuD3n",
    "bjIkzO0CgYEA/cQCmuVO6bnWLnthRiOUUBjVkz6OTc01XtamcrDFFukFJWh4qlWM",
    "QytUp3CJOdM+PCnNVY3v1d4QNdWKERHuEOOr7kK+VWfDIy7oqRnMiCPAZtwtzqm9",
    "qBRvdJl2pkyKCXJCov/ZUGi5/bUvOHL94cE50V/0z2lG4w/or29MXYcCgYEA012I",
    "6ssWmPoHEOV3xWxH1JV/IkeXeOKYpdha7w0zQHUet2LBdl3Cim+6XvDIOZ0Ofwzp",
    "QP0DHcZ5W/VXC9x/1LyQf/0sLh7AH3NAnFHQ4Xa9ZSKXPZyc/sc6tEsK6ADLFqIy",
    "DcDJBPr9tGsslUrMqZ4znkP8P6EKBK2PGt+soj0CgYEA0y8oK9fhkEkDobM0BLbf",
    "WrkQJHXO35iDbeWcp53Mp4BMtBD5OmfvTobk8GOLEABorpDrPOPeUFF5lBOdzw7o",
    "3E1ca/BHjbPIhaMoJHI/8JwwJmneBTrlhtda2eJNB6Byz+Gy6wuYwn4lKqp6HbQ0",
    "7Idton0Eswed4qD+t+Eb4EkCgYEAguOBTiTFsaXjiksPiGotcS/Csu+ylWF9NfZt",
    "GWwLOPdONjIpq6sUNbZKq1BgLY1c1MCiEWSc8Wte69taNDYv0wWSVi/plAXm45Lz",
    "h9oCiByH3IE3Nygs8HlfmRZ/gnw7R6DZbjrcQQFM6tUTnr/bTY5yWKexJZYMJil0",
    "XSf2N+ECgYEAt4CbyMqsYItcxDtP/ykCyUN8V1Q/a9GBtZqCVAKrCVKOVrc97tqw",
    "ViWTiXxvz/4Ym4qbDpwtlDYQil6OrrohdvgpAUZF5VK2OwgtQ1EaJ1DsTq9MfJb7",
    "LqvDmc+rNDKhnjkXkXAPKZLROPWtjOklHM1YoZc0sWB7YXAJfv1poCg=",
    "-----END RSA PRIVATE KEY-----",
  ],
  rsaPublic: [
    "-----BEGIN RSA PUBLIC KEY-----",
    "MIIBCgKCAQEA0YVGE30i2EPhdGONKeyLLKrG46xxXuf7dD4znc1fwFkmEqSsD6oX",
    "GOTI7QBCLzPztL6PWYTDe/w3aK8sQINynrBJrmy4suXCc/rI1r4xr4HIc0zs4LBr",
    "ANSx7j1qAiKP5CAJ+Te9IK5Rtq5FXCrTl641wbN/LmNhnBZqSYkhn3kzeBkkUlBR",
    "0U565NfFLQXVjTo8axl5o0Jcq1+gDTUBG5Xqswp3bc4eG3RwV66n8xEq+YDDcYo/",
    "jNRcGlYk3jZxdrIJEgMjM9L4MdnRx02qdT1hunrSElM9FiP9QhQWdQmum2IpwSKo",
    "hKqxWaveNR7N6J2ITkhf80maFqu5SBW3KwIDAQAB",
    "-----END RSA PUBLIC KEY-----",
  ],
} as const;

const legacyPem = (lines: readonly string[]): string => `${lines.join("\n")}\n`;

const legacyPemImports = Object.fromEntries([
  ...(["ES256", "ES384", "ES512"] as const).map((alg): [string, Scenario] => [
    `${alg} PEM SEC 1 EC PRIVATE KEY import, sign and verify`,
    async (module) => {
      const keyPair = await module.importKeyPair(legacyPem(LEGACY_PEMS[alg]), { alg, kid: "pem" });
      check(keyPair.ok, "SEC 1 import failed", keyPair);
      if (keyPair.ok) {
        await expectVerified(
          module,
          await module.sign({ payload: PAYLOAD, key: keyPair.value.privateKey }),
          keyPair.value.publicKey,
          alg,
        );
      }
    },
  ]),
  [
    "RS256 PEM PKCS#1 RSA PRIVATE KEY and RSA PUBLIC KEY import, sign and verify",
    async (module: Jwt) => {
      const keyPair = await module.importKeyPair(legacyPem(LEGACY_PEMS.rsaPrivate), { alg: "RS256", kid: "pem" });
      const publicKey = await module.importPublicKey(legacyPem(LEGACY_PEMS.rsaPublic), { alg: "RS256", kid: "pem" });
      check(keyPair.ok, "PKCS#1 private import failed", keyPair);
      check(publicKey.ok, "PKCS#1 public import failed", publicKey);
      if (keyPair.ok && publicKey.ok) {
        await expectVerified(
          module,
          await module.sign({ payload: PAYLOAD, key: keyPair.value.privateKey }),
          publicKey.value,
          "RS256",
        );
      }
    },
  ],
]);

const keyPairImports = Object.fromEntries(
  ASYMMETRIC.map((alg): [string, Scenario] => [
    `${alg} key pair import from one private JWK, refusing mismatched halves`,
    async (module) => {
      const pair = await module.generateKeyPair({ alg, extractable: true });
      const privateJwk = await module.exportPrivateJwk(pair.privateKey);
      const imported = await module.importKeyPair(privateJwk, { alg });
      check(imported.ok, "key pair import failed", imported);
      if (imported.ok) {
        // Each imported half works with the matching original half.
        await expectVerified(
          module,
          await module.sign({ payload: PAYLOAD, key: imported.value.privateKey }),
          pair.publicKey,
          alg,
        );
        await expectVerified(
          module,
          await module.sign({ payload: PAYLOAD, key: pair.privateKey }),
          imported.value.publicKey,
          alg,
        );
      }
      const other = await module.exportPrivateJwk(
        (await module.generateKeyPair({ alg, extractable: true })).privateKey,
      );
      const mixed = {
        ...privateJwk,
        ...Object.fromEntries(PUBLIC_MEMBERS[alg].map((name) => [name, other[name as keyof jwt.Jwk]])),
      };
      const refused = await module.importKeyPair(mixed, { alg });
      check(!refused.ok && refused.error.issues[0]?.code === "invalid_key", "mismatched halves were accepted", refused);
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
    async (module) => {
      const { signing, verifying } = await keysFor(module, alg);
      const [header, payload, signature] = (await module.sign({ payload: PAYLOAD, key: signing })).split(".");
      // The first character carries six significant bits, so changing it always changes the signature.
      const tampered = `${signature?.startsWith("A") ? "B" : "A"}${signature?.slice(1)}`;
      await expectRefused(module, `${header}.${payload}.${tampered}`, verifying, "bad_signature");
    },
  ]),
);

const CONTENT_ENCRYPTION = ["A128GCM", "A256GCM", "A128CBC-HS256", "A256CBC-HS512"] as const;
const JWE_CURVES = ["P-256", "P-384", "P-521", "X25519"] as const;
const ECDH_ALGORITHMS = ["ECDH-ES", "ECDH-ES+A128KW", "ECDH-ES+A256KW"] as const;

/** Encrypts to `encryptionKey`, decrypts with `decryptionKey`, and checks the plaintext and header. */
async function expectDecrypted(
  module: Jwt,
  encryptionKey: jwt.JweEncryptionKey,
  decryptionKey: jwt.JweDecryptionKey,
  enc: (typeof CONTENT_ENCRYPTION)[number] | undefined,
): Promise<void> {
  const token = await module.encrypt({ plaintext: "encrypted in this runtime", key: encryptionKey, enc });
  const result = await module.createDecrypter({ keys: module.createJweKeySet([decryptionKey]) })(token);
  check(result.ok, "decryption failed", result);
  if (result.ok) {
    check(new TextDecoder().decode(result.value.plaintext) === "encrypted in this runtime", "wrong plaintext", null);
    check(result.value.header.alg === encryptionKey.alg, "wrong alg", result.value.header);
  }
  const [header, key, iv, ciphertext, tag] = token.split(".");
  const tampered = [header, key, iv, ciphertext, `${tag?.startsWith("A") ? "B" : "A"}${tag?.slice(1)}`].join(".");
  const refused = await module.createDecrypter({ keys: module.createJweKeySet([decryptionKey]) })(tampered);
  check(!refused.ok && refused.error.issues[0]?.code === "decryption_failed", "tampered token was accepted", refused);
}

// Each curve under each ECDH algorithm: the curve decides whether the runtime can agree a key at all.
const ecdhRoundtrips = Object.fromEntries(
  ECDH_ALGORITHMS.flatMap((alg) =>
    JWE_CURVES.map((crv): [string, Scenario] => [
      `JWE ${alg} on ${crv} encrypts and decrypts`,
      async (module) => {
        const pair = await module.generateJweKeyPair({ alg, crv });
        await expectDecrypted(module, pair.publicKey, pair.privateKey, "A128GCM");
      },
    ]),
  ),
);

// Each content encryption algorithm under one wrapped key, RSA-OAEP and AES key wrap, and each dir key.
const contentRoundtrips = Object.fromEntries([
  ...CONTENT_ENCRYPTION.flatMap((enc): [string, Scenario][] => [
    [
      `JWE RSA-OAEP-256 with ${enc} encrypts and decrypts`,
      async (module) => {
        const pair = await module.generateJweKeyPair({ alg: "RSA-OAEP-256" });
        await expectDecrypted(module, pair.publicKey, pair.privateKey, enc);
      },
    ],
    [
      `JWE A256KW with ${enc} encrypts and decrypts`,
      async (module) => {
        const key = await module.generateJweSecretKey({ alg: "A256KW" });
        await expectDecrypted(module, key, key, enc);
      },
    ],
    [
      `JWE dir with ${enc} encrypts and decrypts`,
      async (module) => {
        const key = await module.generateJweSecretKey({ alg: "dir", enc });
        await expectDecrypted(module, key, key, undefined);
      },
    ],
  ]),
  [
    "JWE RSA-OAEP and A128KW encrypt and decrypt",
    async (module: Jwt) => {
      const pair = await module.generateJweKeyPair({ alg: "RSA-OAEP" });
      const key = await module.generateJweSecretKey({ alg: "A128KW" });
      await expectDecrypted(module, pair.publicKey, pair.privateKey, "A256GCM");
      await expectDecrypted(module, key, key, "A128CBC-HS256");
    },
  ],
  ...(["A128GCMKW", "A256GCMKW"] as const).map((alg): [string, Scenario] => [
    `JWE ${alg} encrypts and decrypts`,
    async (module) => {
      const key = await module.generateJweSecretKey({ alg });
      await expectDecrypted(module, key, key, "A128CBC-HS256");
    },
  ]),
  ...(["RSA-OAEP-384", "RSA-OAEP-512"] as const).map((alg): [string, Scenario] => [
    `JWE ${alg} encrypts and decrypts`,
    async (module) => {
      const pair = await module.generateJweKeyPair({ alg });
      await expectDecrypted(module, pair.publicKey, pair.privateKey, "A256GCM");
    },
  ]),
]);

const jweScenarios: Readonly<Record<string, Scenario>> = {
  ...ecdhRoundtrips,
  ...contentRoundtrips,
  "JWE RFC 7516 A.3 vector decrypts": async (module) => {
    const key = await module.importJweSecretKey({ kty: "oct", k: "GawgguFyGrWKav7AX4VKUg" }, { alg: "A128KW" });
    check(key.ok, "key import failed", key);
    if (key.ok) {
      const result = await module.createDecrypter({ keys: module.createJweKeySet([key.value]) })(
        "eyJhbGciOiJBMTI4S1ciLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0.6KB707dM9YTIgHtLvtgWQ8mKwboJW3of9locizkDTHzBC2IlrT1oOQ.AxY8DCtDaGlsbGljb3RoZQ.KDlTtXchhZTGufMYmOYGS4HffxPSUrfmqCHXaI9wOGY.U0m_YmjN04DJvceFICbCVQ",
      );
      check(
        result.ok && new TextDecoder().decode(result.value.plaintext) === "Live long and prosper.",
        "vector did not decrypt",
        result,
      );
    }
  },
  "JWE RSA-OAEP and ECDH PEM keys import and decrypt": async (module) => {
    const rsa = (await crypto.subtle.generateKey(
      { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["encrypt", "decrypt"],
    )) as CryptoKeyPair;
    const ec = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-384" }, true, [
      "deriveBits",
    ])) as CryptoKeyPair;
    const cases = [
      ["RSA-OAEP-256", rsa],
      ["ECDH-ES+A256KW", ec],
    ] as const;
    await Promise.all(
      cases.map(async ([alg, pair]) => {
        const spki = pemOf("PUBLIC KEY", await crypto.subtle.exportKey("spki", pair.publicKey));
        const pkcs8 = pemOf("PRIVATE KEY", await crypto.subtle.exportKey("pkcs8", pair.privateKey));
        const publicKey = await module.importJwePublicKey(spki, { alg });
        const privateKey = await module.importJwePrivateKey(pkcs8, { alg });
        check(publicKey.ok && privateKey.ok, `${alg} PEM import failed`, [publicKey, privateKey]);
        if (publicKey.ok && privateKey.ok) {
          await expectDecrypted(module, publicKey.value, privateKey.value, "A256GCM");
        }
      }),
    );
  },
  "JWE nested JWT signs, encrypts, decrypts and verifies": async (module) => {
    const [signer, recipient] = await Promise.all([
      module.generateKeyPair({ alg: "ES256" }),
      module.generateJweKeyPair({ alg: "ECDH-ES+A128KW" }),
    ]);
    const token = await module.encryptJwt({
      sign: { payload: PAYLOAD, key: signer.privateKey },
      key: recipient.publicKey,
      enc: "A256GCM",
    });
    const result = await module.createNestedVerifier({
      decrypt: module.createDecrypter({ keys: module.createJweKeySet([recipient.privateKey]) }),
      verify: module.createVerifier({ keys: module.createKeySet([signer.publicKey]) }),
    })(token);
    check(result.ok && result.value.payload.sub === PAYLOAD.sub, "nested verification failed", result);
  },
  "JWE low-order X25519 epk is refused": async (module) => {
    const pair = await module.generateJweKeyPair({ alg: "ECDH-ES", crv: "X25519" });
    const header = encodeSegment(
      JSON.stringify({ alg: "ECDH-ES", enc: "A128GCM", epk: { kty: "OKP", crv: "X25519", x: "A".repeat(43) } }),
    );
    const token = [header, "", "AAAAAAAAAAAAAAAA", "AAAA", "AAAAAAAAAAAAAAAAAAAAAA"].join(".");
    const result = await module.createDecrypter({ keys: module.createJweKeySet([pair.privateKey]) })(token);
    check(
      !result.ok && result.error.issues[0]?.code === "malformed" && result.error.issues[0]?.path?.[1] === "epk",
      "low-order point was accepted",
      result,
    );
  },
  "JWE X25519 epk with the high bit set is refused": async (module) => {
    const pair = await module.generateJweKeyPair({ alg: "ECDH-ES", crv: "X25519" });
    // u = 9 with the top bit set, which RFC 7748 masks: one runtime would agree on it and another refuse it.
    const x = `CQ${"A".repeat(39)}IA`;
    const header = encodeSegment(
      JSON.stringify({ alg: "ECDH-ES", enc: "A128GCM", epk: { kty: "OKP", crv: "X25519", x } }),
    );
    const token = [header, "", "AAAAAAAAAAAAAAAA", "AAAA", "AAAAAAAAAAAAAAAAAAAAAA"].join(".");
    const result = await module.createDecrypter({ keys: module.createJweKeySet([pair.privateKey]) })(token);
    check(
      !result.ok && result.error.issues[0]?.code === "malformed" && result.error.issues[0]?.path?.[1] === "epk",
      "a high-bit point was accepted",
      result,
    );
  },
  "JWE P-256 epk not on the curve is refused": async (module) => {
    const pair = await module.generateJweKeyPair({ alg: "ECDH-ES", crv: "P-256" });
    // The x of the P-256 generator as both coordinates: well formed, but not a point on the curve.
    const x = "axfR8uEsQkf4vOblY6RA8ncDfYEt6zOg9KE5RdiYwpY";
    const header = encodeSegment(
      JSON.stringify({ alg: "ECDH-ES", enc: "A128GCM", epk: { kty: "EC", crv: "P-256", x, y: x } }),
    );
    const token = [header, "", "AAAAAAAAAAAAAAAA", "AAAA", "AAAAAAAAAAAAAAAAAAAAAA"].join(".");
    const result = await module.createDecrypter({ keys: module.createJweKeySet([pair.privateKey]) })(token);
    const expected = { ok: false, error: { issues: [{ code: "malformed", path: ["header", "epk"] }] } };
    check(JSON.stringify(result) === JSON.stringify(expected), "an off-curve point was accepted", result);
  },
  "JWE low-order X25519 public key is refused at import": async (module) => {
    await module.generateJweKeyPair({ alg: "ECDH-ES", crv: "X25519" });
    const results = await Promise.all(
      ["A".repeat(43), `AQ${"A".repeat(41)}`].map((x) =>
        module.importJwePublicKey({ kty: "OKP", crv: "X25519", x }, { alg: "ECDH-ES" }),
      ),
    );
    for (const result of results) {
      check(!result.ok && result.error.issues[0]?.code === "invalid_key", "a low-order key was imported", result);
    }
  },
};

export const scenarios: Readonly<Record<string, Scenario>> = {
  ...roundtrips,
  ...jwkRoundtrips,
  ...tamperedSignatures,
  ...leadingZeroImports,
  ...keyPairImports,
  ...pemImports,
  ...legacyPemImports,
  "alg none is refused": async (module) => {
    const { verifying } = await keysFor(module, "HS256");
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
  ...jweScenarios,
};

/**
 * Runs one scenario and gives its outcome as text: `ok`, or the error's name and message, so a
 * runtime that lacks an algorithm reports the exact error it threw.
 */
export async function runScenario(module: Jwt, name: string): Promise<string> {
  const scenario = Object.hasOwn(scenarios, name) ? scenarios[name] : undefined;
  if (scenario === undefined) {
    return `no scenario named ${name}`;
  }
  try {
    await scenario(module);
    return "ok";
  } catch (error) {
    return error instanceof Error ? `${error.name}: ${error.message}` : `threw ${String(error)}`;
  }
}
