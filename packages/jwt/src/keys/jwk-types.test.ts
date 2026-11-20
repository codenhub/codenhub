import { describe, expectTypeOf, it } from "vitest";

import type {
  EcPrivateJwk,
  EcPublicJwk,
  Jwk,
  OctJwk,
  OkpPublicJwk,
  PrivateJwk,
  PublicJwk,
  RsaPrivateJwk,
  RsaPublicJwk,
  SecretJwk,
} from "../core/types";
import { exportPrivateJwk, exportPublicJwk, exportSecretJwk } from "./export";
import { importPublicKey, importSecretKey } from "./import";

// Type tests: `tsc -b` checks them, and vitest runs the bodies only for the runtime assertions they hold, none.
describe("JWK types", () => {
  it("should give each export function its precise JWK type", () => {
    expectTypeOf(exportPublicJwk).returns.resolves.toEqualTypeOf<PublicJwk>();
    expectTypeOf(exportPrivateJwk).returns.resolves.toEqualTypeOf<PrivateJwk>();
    expectTypeOf(exportSecretJwk).returns.resolves.toEqualTypeOf<SecretJwk>();
    expectTypeOf<SecretJwk>().toEqualTypeOf<OctJwk>();
  });

  it("should narrow a public JWK on kty to its members and algorithms", () => {
    const narrow = (jwk: PublicJwk) => {
      if (jwk.kty === "EC") {
        expectTypeOf(jwk).toEqualTypeOf<EcPublicJwk>();
        expectTypeOf(jwk.x).toEqualTypeOf<string>();
        expectTypeOf(jwk.alg).toEqualTypeOf<"ES256" | "ES384" | "ES512">();
        expectTypeOf(jwk.crv).toEqualTypeOf<"P-256" | "P-384" | "P-521">();
      } else if (jwk.kty === "OKP") {
        expectTypeOf(jwk).toEqualTypeOf<OkpPublicJwk>();
        expectTypeOf(jwk.alg).toEqualTypeOf<"EdDSA" | "Ed25519">();
      } else {
        expectTypeOf(jwk).toEqualTypeOf<RsaPublicJwk>();
        expectTypeOf(jwk.n).toEqualTypeOf<string>();
      }
    };
    expectTypeOf(narrow).toBeFunction();
  });

  it("should give a private JWK its private members after narrowing", () => {
    const narrow = (jwk: PrivateJwk) => {
      if (jwk.kty === "RSA") {
        expectTypeOf(jwk).toEqualTypeOf<RsaPrivateJwk>();
        expectTypeOf(jwk.qi).toEqualTypeOf<string>();
      } else if (jwk.kty === "EC") {
        expectTypeOf(jwk).toEqualTypeOf<EcPrivateJwk>();
        expectTypeOf(jwk.d).toEqualTypeOf<string>();
      }
    };
    expectTypeOf(narrow).toBeFunction();
  });

  it("should read any member of any JWK by name, absent where its type has none", () => {
    expectTypeOf<EcPublicJwk["n"]>().toEqualTypeOf<undefined>();
    expectTypeOf<PublicJwk["d"]>().toEqualTypeOf<undefined>();
    expectTypeOf<Jwk["x"]>().toEqualTypeOf<string | undefined>();
    const isPrivate = (jwk: Jwk) => {
      if (jwk.d !== undefined) {
        expectTypeOf(jwk).toEqualTypeOf<PrivateJwk>();
      }
    };
    expectTypeOf(isPrivate).toBeFunction();
  });

  it("should refuse a JWK of one type as another", () => {
    const rsa = {} as RsaPublicJwk;
    // @ts-expect-error An RSA JWK has no curve or coordinates.
    const ec: EcPublicJwk = rsa;
    // @ts-expect-error A public JWK lacks d.
    const ecPrivate: EcPrivateJwk = {} as EcPublicJwk;
    expectTypeOf([ec, ecPrivate]).toBeArray();
  });

  it("should still accept any JWK, and any object, as an import's input", () => {
    expectTypeOf(importPublicKey).parameter(0).toEqualTypeOf<unknown>();
    expectTypeOf(importSecretKey)
      .parameter(0)
      .toEqualTypeOf<Uint8Array | ArrayBuffer | ArrayBufferView | CryptoKey | object>();
    expectTypeOf<OctJwk>().toExtend<object>();
  });
});
