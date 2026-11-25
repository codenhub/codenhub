/** A NIST curve's field prime `p` and coefficient `b` in y² = x³ − 3x + b (SEC 2 §2.4.2, §2.5.1, §2.6.1). */
interface NistCurve {
  readonly p: bigint;
  readonly b: bigint;
}

const NIST_CURVES: Readonly<Record<"P-256" | "P-384" | "P-521", NistCurve>> = Object.freeze({
  "P-256": {
    p: 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn,
    b: 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn,
  },
  "P-384": {
    p: 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffeffffffff0000000000000000ffffffffn,
    b: 0xb3312fa7e23ee7e4988e056be3f82d19181d9c6efe8141120314088f5013875ac656398d8a2ed19d2a85c8edd3ec2aefn,
  },
  "P-521": {
    p: (1n << 521n) - 1n,
    b: 0x0051953eb9618e1c9a1f929a21a0b68540eea2da725b99b315f3b8b489918ef109e156193951ec7e937b1652c0bd3bb1bf073573df883d2c34f1ef451fd46b503f00n,
  },
});

/**
 * Whether the big-endian coordinates `x` and `y` are a point on the NIST curve: both less than `p`, and
 * y² ≡ x³ − 3x + b (mod p). WebKit's Web Crypto imports a point off the curve, which lets an attacker learn a
 * recipient's private key from the agreements it answers, so the package checks the point itself. The inputs are
 * public, so the check need not run in constant time.
 */
export function isOnNistCurve(curve: "P-256" | "P-384" | "P-521", x: Uint8Array, y: Uint8Array): boolean {
  const { p, b } = NIST_CURVES[curve];
  const px = toBigInt(x);
  const py = toBigInt(y);
  if (px >= p || py >= p) {
    return false;
  }
  return (py * py) % p === (((px * px * px - 3n * px + b) % p) + p) % p;
}

function toBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  return value;
}
