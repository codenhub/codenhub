// Test-only key fixtures. Never import from package code.
// RSA and EC keys were generated once with node:crypto; the Ed25519 key is RFC 8037 Appendix A.1.

import type { JwtIssue, JwtResult } from "../core/types";

export const EC_P256_PRIVATE_JWK = {
  kty: "EC",
  crv: "P-256",
  x: "IKNP3cQvCwir3LiWs-roVqQEYIOGQFwnJOH4CdDfHr0",
  y: "XaSOW26eaTekkV6B0XiGDvJs6piS5CfqdI3Qx5uagMg",
  d: "aDwBUpy9BFTaLx1mcg3flelLcsCFKx6pW33xAsTd0BY",
};

export const EC_P256_PUBLIC_JWK = {
  kty: "EC",
  crv: "P-256",
  x: "IKNP3cQvCwir3LiWs-roVqQEYIOGQFwnJOH4CdDfHr0",
  y: "XaSOW26eaTekkV6B0XiGDvJs6piS5CfqdI3Qx5uagMg",
};

export const ED25519_PRIVATE_JWK = {
  kty: "OKP",
  crv: "Ed25519",
  x: "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo",
  d: "nWGxne_9WmC6hEr0kuwsxERJxWl7MmkZcDusAxyuf2A",
};

export const ED25519_PUBLIC_JWK = {
  kty: "OKP",
  crv: "Ed25519",
  x: "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo",
};

export const RSA_2048_PRIVATE_JWK = {
  kty: "RSA",
  n: "qksZJVak1zK0eXJ5m66L6-ffLwIdcBRZsCvMxuVyTc2aMKwVoNhahqK_l55jDyduV9P21swvt-CRylF8Ha4H-P3M9cjLI3JnRGvhDqp_1Ljn6JDp4x0-aOiK9yLNdS79DPhgAQlzhbCC66er9uGBVcrvyiuuDFruNWG0Xz9CyM7j2CaO1djjhX9m_FC9RMEE7tt4k6Bn1aXGhXmrkbVavgvvyUqPpbEe24LQmK2rRIp_IjJSkYIj92I0q8Zpg2-NJl79L1u7eu6FzTfXNYAF2HRahzPfuCAW3C57UBhyAXuv0QboPrTm78-F8u82ZcLqqc6tJ2YGin4C8dY0aJG5Rw",
  e: "AQAB",
  d: "Ofbo_sQgxN1N__6-tQazOt_IoKQcKA_NPYGTKOplv2TqBII2tHKgUa6o_29asYhO71dHcHK9FV470b1tvV6E-TROpSStPIoO64O67faMH3i2-3sEGZnVKflpf9iZTbdqTBVo_EFe0JU14wfGKXk1wGGcwFig3DTBW2s_7aHHVjlCYl4vw-DArl89R5CytQKBFm-xUqnoJzmaRUADl-KYJehqN9UQjXpH02G_b2k3w5BxNIY91cMYtLeT4e9D2TtTC6iqMEg0ixNim_RQnJSd4vg8lKGcH2VYh3rZXKNBKyx3IelPpTC1OZ4F62iZULWs55eiMF5NIs27HL6n1nxprQ",
  p: "7-SPfyX0zXH1EvyeEv1LUEVGo-GajWfvjWxMTtHIqDD7JCU7H1RX2kgiuV2hUm2asYrB9v_FCqj9cICT3YSlYYtdwC9n8FFKRK1P6a8un8Q9IrB7JryYgJDf7hxnJSDHIYBq5qSKgC1IpinUNp-EQrDj0PToOSg0_IP6314MrMU",
  q: "tbo3F48QU0yVIBEMwQoRE9-YctMGbGPJtBrpnCrCBhKz08e8Xw60N5VBrnnsWxR0_XDi0g7885NNss4zRy95eVOdv8q9UEB8P0AKHqSbLB5e2YrUL_iRtynPVizCf88ToXg8jebMTKvY9hcCgzjlO_C3qCvCyMN-cOFjT1X-hps",
  dp: "uBBqHggUjnIqtbfI3g8lc2DEM8hNmsQt5Rg8cJm8WXjDqdc7Ru2jPuPsaMgzmJhqgmFSNF_JY0WIuIKfce9uKasScvysxpLI5msIjugQYRvkQLKiu3UnmjYO65c1eSJuSAFNhMypTHHydTRRFNxOUhGBq3nOmNSF21605iA2n3U",
  dq: "AmScWxwQK_ijMhPnZhda2Dcmi8SJnh3GRy_fiaXqfif65DwKF_palyzI-6IxYZWoYLn-0qNN42s6J7Odaz-NyvI17pOd4JOozzBpsbObM36G4zh3yNXuHUpYp5rZSNOSP5sUuQ2j_RJ6PetZph62rg5ibL1-yCQC4zukkiPgwSc",
  qi: "B1my3TBx0dGY5-kylR5ZYhWwSGAEJ8huTzakE9CH5PkyGDNALrYSAkKgdrie0lQHb_OLdlmwYdlMc0uIrHgSuQaY_LcBDo4Y75d_2jg1qEkWHkCq2qCGf1nemzzzX0gnQ6wsSaFgBPZdN_7Mu4JAG2lDAKJiLDgfUJQdXdG1p-4",
};

export const RSA_2048_PUBLIC_JWK = {
  kty: "RSA",
  n: "qksZJVak1zK0eXJ5m66L6-ffLwIdcBRZsCvMxuVyTc2aMKwVoNhahqK_l55jDyduV9P21swvt-CRylF8Ha4H-P3M9cjLI3JnRGvhDqp_1Ljn6JDp4x0-aOiK9yLNdS79DPhgAQlzhbCC66er9uGBVcrvyiuuDFruNWG0Xz9CyM7j2CaO1djjhX9m_FC9RMEE7tt4k6Bn1aXGhXmrkbVavgvvyUqPpbEe24LQmK2rRIp_IjJSkYIj92I0q8Zpg2-NJl79L1u7eu6FzTfXNYAF2HRahzPfuCAW3C57UBhyAXuv0QboPrTm78-F8u82ZcLqqc6tJ2YGin4C8dY0aJG5Rw",
  e: "AQAB",
};

export const RSA_1024_PUBLIC_JWK = {
  kty: "RSA",
  n: "2ezq1wQ-hm2c_wiP9eg_rS84zwiuEPnx-Q7rVNJFhdXQQCURd4LVu04uaHQ5oqhuI8CpmfnE6fQfLkdxG-6LizcpJruTtocjkJPNcOonPO80nk1OlZX-AbHlvLHexQqBdCJLBgPo-Kmqmd_L3SAvgaLCs4xp_TdUbDQC5OFSRRM",
  e: "AQAB",
};

/** 64 random bytes. */
export const HMAC_SECRET_JWK = {
  kty: "oct",
  k: "-6CimqzIBpfSS8O6O0unuOI7JFmEoaLQKc942gGXqf6WLBM3CHM17I4wQSyUxYr4qpsQ-YQnySykN3DVysTT9w",
};

/** The issues of a failed result, or an empty list for a successful one. */
export const issuesOf = (result: JwtResult<unknown>): readonly JwtIssue[] => (result.ok ? [] : result.error.issues);

/** The value of a successful result. Fails the test when the result is a failure. */
export const valueOf = <T>(result: JwtResult<T>): T => {
  if (!result.ok) {
    throw new Error(`Expected success, got: ${JSON.stringify(result.error.issues)}`);
  }
  return result.value;
};

/** Returns a copy of `jwk` with `changes` applied; an `undefined` change removes the member. */
export const withMembers = (jwk: object, changes: Record<string, unknown>): Record<string, unknown> => {
  const copy: Record<string, unknown> = { ...jwk, ...changes };
  for (const [name, value] of Object.entries(changes)) {
    if (value === undefined) {
      delete copy[name];
    }
  }
  return copy;
};
