import { describe, expect, it } from "vitest";

import { isJwsAlgorithm } from "./limits";
import { deepFreeze, fail, ok } from "./result";

describe("deepFreeze", () => {
  it("should freeze nested plain objects and arrays", () => {
    const value = deepFreeze({ list: [{ name: "a" }], inner: { deeper: {} } });

    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.list)).toBe(true);
    expect(Object.isFrozen(value.list[0])).toBe(true);
    expect(Object.isFrozen(value.inner.deeper)).toBe(true);
  });

  it("should leave byte arrays unfrozen, since freezing one that holds elements throws", () => {
    const value = deepFreeze({ bytes: new Uint8Array([1, 2]) });

    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.bytes)).toBe(false);
  });

  it("should end on a cycle", () => {
    const value: { self?: unknown } = {};
    value.self = value;

    expect(Object.isFrozen(deepFreeze(value))).toBe(true);
  });

  it("should not run a getter", () => {
    let calls = 0;
    const value = {
      get member() {
        calls++;
        return {};
      },
    };

    deepFreeze(value);

    expect(calls).toBe(0);
  });

  it("should freeze a value nested deeper than the call stack allows recursion", () => {
    let value: { next?: unknown } = {};
    const root = value;
    for (let depth = 0; depth < 100_000; depth++) {
      const next = {};
      value.next = next;
      value = next;
    }

    deepFreeze(root);

    expect(Object.isFrozen(value)).toBe(true);
  });
});

describe("ok", () => {
  it("should wrap the value in a deep-frozen successful result", () => {
    const result = ok({ nested: { a: 1 } });

    expect(result).toEqual({ ok: true, value: { nested: { a: 1 } } });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.value.nested)).toBe(true);
  });
});

describe("fail", () => {
  it("should hold every issue in order in a deep-frozen failed result", () => {
    const result = fail({ code: "malformed", path: ["header"] }, { code: "too_large", params: { maximum: 1 } });

    expect(result).toEqual({
      ok: false,
      error: {
        issues: [
          { code: "malformed", path: ["header"] },
          { code: "too_large", params: { maximum: 1 } },
        ],
      },
    });
    expect(Object.isFrozen(result.error.issues)).toBe(true);
    expect(Object.isFrozen(result.error.issues[0].path)).toBe(true);
  });
});

describe("isJwsAlgorithm", () => {
  it("should accept every supported algorithm", () => {
    expect(["ES256", "EdDSA", "Ed25519", "RS256", "PS256", "HS256"].every(isJwsAlgorithm)).toBe(true);
  });

  it("should reject none in any casing and other casings of supported algorithms", () => {
    expect(["none", "NONE", "None", "hs256", "es256", "HS384", "", 256].some(isJwsAlgorithm)).toBe(false);
  });
});
