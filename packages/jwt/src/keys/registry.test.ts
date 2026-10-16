import { describe, expect, it } from "vitest";

import { generateSecretKey } from "./generate";
import { getKeyEntry, getKeyEntryOfKind, isRegisteredKey } from "./registry";

describe("getKeyEntry", () => {
  it("should return the CryptoKey of a key created by the package", async () => {
    const key = await generateSecretKey({ alg: "HS256" });
    expect(getKeyEntry(key).cryptoKey.type).toBe("secret");
  });

  it.each([{ kind: "secret", alg: "HS256", extractable: false }, null, undefined, "key"])(
    "should throw TypeError for a look-alike or non-object (%o)",
    (forged) => {
      expect(() => getKeyEntry(forged)).toThrow(TypeError);
    },
  );

  it("should throw TypeError for a copy of a real key", async () => {
    const key = await generateSecretKey({ alg: "HS256" });
    expect(() => getKeyEntry({ ...key })).toThrow(TypeError);
  });
});

describe("getKeyEntryOfKind", () => {
  it("should throw TypeError for a key of another kind", async () => {
    const key = await generateSecretKey({ alg: "HS256" });
    expect(() => getKeyEntryOfKind(key, "public")).toThrow(TypeError);
  });
});

describe("isRegisteredKey", () => {
  it("should tell real keys from look-alikes", async () => {
    const key = await generateSecretKey({ alg: "HS256" });
    expect([isRegisteredKey(key), isRegisteredKey({ ...key }), isRegisteredKey(null)]).toEqual([true, false, false]);
  });
});
