import { X509Certificate } from "node:crypto";

import { describe, expect, it } from "vitest";

import { exportPublicJwk } from "./export";
import { importKeyPair, importPrivateKey, importPublicKey } from "./import";
import { issuesOf, valueOf } from "./test-fixtures";
import { certificateThumbprint } from "./thumbprint";

// Self-signed certificates OpenSSL 3.5 made for these tests, each with the PUBLIC KEY block of its key.
const EC_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIBeTCCAR+gAwIBAgIUEYSqj/vnAOUrctJv7zdXTkoLFvQwCgYIKoZIzj0EAwIw
EjEQMA4GA1UEAwwHdGVzdC1lYzAeFw0yNjExMTkxMjU5MDVaFw0zNjExMTYxMjU5
MDVaMBIxEDAOBgNVBAMMB3Rlc3QtZWMwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNC
AARM2toloB+0ExxJlj+OewhcUAkcb39PWHhu8KjhIIrARMknR+XJ3ofDUznmH3yD
PCAGHZ1vvc8o0hT3tBZ9uo1xo1MwUTAdBgNVHQ4EFgQUMyZtMjCsZwtw9/o3VxSE
S8dYcV0wHwYDVR0jBBgwFoAUMyZtMjCsZwtw9/o3VxSES8dYcV0wDwYDVR0TAQH/
BAUwAwEB/zAKBggqhkjOPQQDAgNIADBFAiEA01dHT/dYzO6WNsCHlWaZXynARZTl
rBe7jLrRpVglI2ACIFp0AKuBJmN7r6FKenjjTyfJKy7Iv7s8RTt47IvOWMZu
-----END CERTIFICATE-----
`;
const EC_SPKI = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAETNraJaAftBMcSZY/jnsIXFAJHG9/
T1h4bvCo4SCKwETJJ0flyd6Hw1M55h98gzwgBh2db73PKNIU97QWfbqNcQ==
-----END PUBLIC KEY-----
`;
const RSA_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIDBzCCAe+gAwIBAgIUM314YE2cLRXGCHlw91NEhcAcLo8wDQYJKoZIhvcNAQEL
BQAwEzERMA8GA1UEAwwIdGVzdC1yc2EwHhcNMjYxMTE5MTI1OTA1WhcNMzYxMTE2
MTI1OTA1WjATMREwDwYDVQQDDAh0ZXN0LXJzYTCCASIwDQYJKoZIhvcNAQEBBQAD
ggEPADCCAQoCggEBALmexaWBjTEW3YjWABYZ2mV+0nd7VfMtqwH/PUrlIZ7810da
X7+ySQj1v9pFW1ph7CxYOag2mAPHvInI21Ibak88ZUY5cXY3Xvani5jIeOkPqxBn
B6f6zE66vViHA0mID0ZxRvjSuJGUwhsBqvg8h7hiu7U7kOzIkw5zjyc8pT3upOrr
wFurEdA96I1RkURK/c1JYm6ETGJlVB+eCTWXvlJANERCyOYuYbHiPEAXoDDDfR6V
87OjcncWcBxKvlQD7gptZcFi6/yKG5AkcK85nokL+95zBj63F3OSjyjRFJedni9D
HDnNqonTOjBYw7yTVV4L4qUvqDza+140UR+Tgt8CAwEAAaNTMFEwHQYDVR0OBBYE
FATRMYb9LjfLxIFhhzekP2xWjhW5MB8GA1UdIwQYMBaAFATRMYb9LjfLxIFhhzek
P2xWjhW5MA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAJYVN7Xu
qRPUGbVQWxuhSh6gccdpX0L+TVHLLVxOb/M5ov4n4XA+2Gvmcnzpgd/jpy/8x3XB
o2/xtd1AWm5GqUOAG80wBdy+gtEzMSUd8wX1HnS+E5eLaQgnBSD9YmEC2B5lcGTP
JnD+OZx6WUbIEbAzO5qtlG0KKoEuF7Mzas6lgiaZlUWKpzcCwo05THslhInOzxtg
/ejJgm10o0ATYBv07D74budBLqQhRNhBX4Rp58yMj5OUfbCXWUJuT55u9QuYyBHy
/ONIuSemn8vn1Tmw50VR3bvyCr6qMvvAW67OcBcxz/FfjKNSaCNmSIoOFqYkcgwu
L55n3HmG8ba092A=
-----END CERTIFICATE-----
`;
const RSA_SPKI = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuZ7FpYGNMRbdiNYAFhna
ZX7Sd3tV8y2rAf89SuUhnvzXR1pfv7JJCPW/2kVbWmHsLFg5qDaYA8e8icjbUhtq
TzxlRjlxdjde9qeLmMh46Q+rEGcHp/rMTrq9WIcDSYgPRnFG+NK4kZTCGwGq+DyH
uGK7tTuQ7MiTDnOPJzylPe6k6uvAW6sR0D3ojVGRREr9zUliboRMYmVUH54JNZe+
UkA0RELI5i5hseI8QBegMMN9HpXzs6NydxZwHEq+VAPuCm1lwWLr/IobkCRwrzme
iQv73nMGPrcXc5KPKNEUl52eL0McOc2qidM6MFjDvJNVXgvipS+oPNr7XjRRH5OC
3wIDAQAB
-----END PUBLIC KEY-----
`;
const ED_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIBODCB66ADAgECAhRCKJaMIoxgkyy5Wn0Yzu9lU5HDojAFBgMrZXAwEjEQMA4G
A1UEAwwHdGVzdC1lZDAeFw0yNjExMTkxMjU5MDZaFw0zNjExMTYxMjU5MDZaMBIx
EDAOBgNVBAMMB3Rlc3QtZWQwKjAFBgMrZXADIQBoAjBid+NiRvtO9+l7bhRsarYo
gOGs5/+c/WgwJtPuF6NTMFEwHQYDVR0OBBYEFO1y3742IuwC9acUWDw8vhZ5JQ/+
MB8GA1UdIwQYMBaAFO1y3742IuwC9acUWDw8vhZ5JQ/+MA8GA1UdEwEB/wQFMAMB
Af8wBQYDK2VwA0EAXuColOmdm/6LMRXiDn9eylMb6K/pGsAy6gwXS83K4Phnnv0f
jjIVPvr6g6lcqrXUVR+zy27BlYojzUBV6tNbAQ==
-----END CERTIFICATE-----
`;
const ED_SPKI = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAaAIwYnfjYkb7Tvfpe24UbGq2KIDhrOf/nP1oMCbT7hc=
-----END PUBLIC KEY-----
`;

const derOf = (pem: string): Uint8Array =>
  Uint8Array.from(atob(pem.replace(/-----[A-Z ]+-----|\s/g, "")), (char) => char.charCodeAt(0));

const pemOf = (der: Uint8Array, label = "CERTIFICATE"): string => {
  const base64 = btoa(String.fromCharCode(...der));
  return [`-----BEGIN ${label}-----`, ...(base64.match(/.{1,64}/g) ?? []), `-----END ${label}-----`, ""].join("\n");
};

/** A DER TLV with a definite length, short or long form. */
const tlv = (tag: number, ...parts: Uint8Array[]): Uint8Array => {
  const content = Uint8Array.from(parts.flatMap((part) => [...part]));
  const length =
    content.length < 0x80
      ? [content.length]
      : content.length < 0x100
        ? [0x81, content.length]
        : [0x82, content.length >> 8, content.length & 0xff];
  return Uint8Array.from([tag, ...length, ...content]);
};

const SEQUENCE = 0x30;
const INTEGER = tlv(0x02, Uint8Array.of(1));
const EMPTY_SEQUENCE = tlv(SEQUENCE);
const VERSION_3 = tlv(0xa0, tlv(0x02, Uint8Array.of(2)));
const SIGNATURE = tlv(0x03, Uint8Array.of(0));

/** A certificate whose to-be-signed part holds `fields`; nothing here is signed or checked. */
const certificateOf = (...fields: Uint8Array[]): string =>
  pemOf(tlv(SEQUENCE, tlv(SEQUENCE, ...fields), EMPTY_SEQUENCE, SIGNATURE));

/** The fields before the key: serial number, signature algorithm, issuer, validity, subject. */
const BEFORE_KEY = [INTEGER, EMPTY_SEQUENCE, EMPTY_SEQUENCE, EMPTY_SEQUENCE, EMPTY_SEQUENCE];

const jwkOf = async (pem: string, alg: "ES256" | "RS256" | "EdDSA") =>
  exportPublicJwk(valueOf(await importPublicKey(pem, { alg })));

describe("importPublicKey with a certificate", () => {
  it.each([
    ["ES256", EC_CERTIFICATE, EC_SPKI],
    ["RS256", RSA_CERTIFICATE, RSA_SPKI],
    ["EdDSA", ED_CERTIFICATE, ED_SPKI],
  ] as const)("should import the %s key of an OpenSSL certificate", async (alg, certificate, spki) => {
    expect(await jwkOf(certificate, alg)).toEqual(await jwkOf(spki, alg));
  });

  it("should give the key the kid option", async () => {
    expect(valueOf(await importPublicKey(EC_CERTIFICATE, { alg: "ES256", kid: "cert-1" })).kid).toBe("cert-1");
  });

  it("should import the key of a version 1 certificate, which has no version field", async () => {
    const certificate = certificateOf(...BEFORE_KEY, derOf(EC_SPKI));
    expect(await jwkOf(certificate, "ES256")).toEqual(await jwkOf(EC_SPKI, "ES256"));
  });

  it("should import the key of a certificate with extensions after it", async () => {
    const certificate = certificateOf(VERSION_3, ...BEFORE_KEY, derOf(EC_SPKI), tlv(0xa3, EMPTY_SEQUENCE));
    expect(await jwkOf(certificate, "ES256")).toEqual(await jwkOf(EC_SPKI, "ES256"));
  });

  it("should refuse a certificate for a key of another type than alg as unsupported_key", async () => {
    expect(issuesOf(await importPublicKey(EC_CERTIFICATE, { alg: "RS256" }))).toEqual([
      { code: "unsupported_key", path: ["kty"] },
    ]);
  });

  it.each([
    ["importPrivateKey", importPrivateKey],
    ["importKeyPair", importKeyPair],
  ] as const)("should refuse a certificate in %s as invalid_key", async (_name, importKey) => {
    expect(issuesOf(await importKey(EC_CERTIFICATE, { alg: "ES256" }))).toEqual([{ code: "invalid_key" }]);
  });

  it.each([
    ["a missing key", certificateOf(VERSION_3, ...BEFORE_KEY)],
    ["one field too few before the key", certificateOf(VERSION_3, ...BEFORE_KEY.slice(1), derOf(EC_SPKI))],
    ["a key that is not a SEQUENCE", certificateOf(...BEFORE_KEY, tlv(0x04, derOf(EC_SPKI)))],
    ["a serial number that is not an INTEGER", certificateOf(EMPTY_SEQUENCE, ...BEFORE_KEY.slice(1), derOf(EC_SPKI))],
    ["an outer element that is not a SEQUENCE", pemOf(tlv(0x31, tlv(SEQUENCE, ...BEFORE_KEY, derOf(EC_SPKI))))],
    ["bytes after the certificate", pemOf(Uint8Array.from([...derOf(EC_CERTIFICATE), 0]))],
    ["a truncated certificate", pemOf(derOf(EC_CERTIFICATE).subarray(0, 200))],
    ["an indefinite length", pemOf(Uint8Array.of(SEQUENCE, 0x80, 0, 0))],
    ["a length longer than four bytes", pemOf(Uint8Array.of(SEQUENCE, 0x85, 0, 0, 0, 0, 1, 0))],
    ["a length past the end", pemOf(Uint8Array.of(SEQUENCE, 0x82, 0xff, 0xff, 0))],
    ["an empty element", pemOf(Uint8Array.of())],
    ["a lone tag byte", pemOf(Uint8Array.of(SEQUENCE))],
  ])("should refuse a certificate with %s as invalid_key", async (_name, certificate) => {
    expect(issuesOf(await importPublicKey(certificate, { alg: "ES256" }))).toEqual([{ code: "invalid_key" }]);
  });

  it("should refuse mismatched labels as invalid_key", async () => {
    const mixed = EC_CERTIFICATE.replace("END CERTIFICATE", "END PUBLIC KEY");
    expect(issuesOf(await importPublicKey(mixed, { alg: "ES256" }))).toEqual([{ code: "invalid_key" }]);
  });
});

describe("certificateThumbprint", () => {
  /** The x5t#S256 of a certificate (RFC 7515 §4.1.8), computed by node:crypto apart from the package's code. */
  const x5tS256Of = (pem: string): string =>
    Buffer.from(new X509Certificate(pem).fingerprint256.replaceAll(":", ""), "hex").toString("base64url");

  it.each([
    ["EC", EC_CERTIFICATE],
    ["RSA", RSA_CERTIFICATE],
    ["Ed25519", ED_CERTIFICATE],
  ])("should give the %s certificate the base64url SHA-256 of its DER", async (_name, pem) => {
    expect(await certificateThumbprint(pem)).toBe(x5tS256Of(pem));
  });

  it("should read CRLF line breaks, escaped line breaks and surrounding whitespace", async () => {
    const expected = x5tS256Of(EC_CERTIFICATE);
    for (const pem of [
      EC_CERTIFICATE.replaceAll("\n", "\r\n"),
      EC_CERTIFICATE.replaceAll("\n", "\\n"),
      `\n  ${EC_CERTIFICATE}\n`,
    ]) {
      // oxlint-disable-next-line no-await-in-loop
      expect(await certificateThumbprint(pem)).toBe(expected);
    }
  });

  it.each([
    ["a PUBLIC KEY block", EC_SPKI],
    ["two certificates", `${EC_CERTIFICATE}\n${RSA_CERTIFICATE}`],
    ["a body that is not base64", EC_CERTIFICATE.replace(/\n[A-Za-z0-9]/, "\n!")],
    ["a body that is not one DER SEQUENCE", "-----BEGIN CERTIFICATE-----\nMAAA\n-----END CERTIFICATE-----"],
    ["headers", EC_CERTIFICATE.replace("-----\n", "-----\nComment: x\n\n")],
    ["not a string", new TextEncoder().encode(EC_CERTIFICATE)],
  ])("should throw a TypeError for %s", async (_name, pem) => {
    await expect(certificateThumbprint(pem as never)).rejects.toThrow(
      new TypeError("certificateThumbprint: pem must be a single CERTIFICATE PEM block."),
    );
  });

  it("should name the length limit for a PEM longer than 16384 characters", async () => {
    const padded = `${EC_CERTIFICATE}${" ".repeat(16_385 - EC_CERTIFICATE.length)}`;

    await expect(certificateThumbprint(padded)).rejects.toThrow(
      new TypeError("certificateThumbprint: pem must be at most 16384 characters."),
    );
  });
});
