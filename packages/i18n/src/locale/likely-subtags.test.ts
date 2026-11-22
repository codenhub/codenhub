// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { cachedTagCount, canonicalizeTag, maximizeTag } from "./likely-subtags";

describe("maximizeTag", () => {
  it("adds likely subtags, or returns undefined for a tag Intl.Locale rejects", () => {
    expect(maximizeTag("zh-TW")).toBe("zh-hant-tw");
    expect(maximizeTag("x-test")).toBeUndefined();
    expect(maximizeTag("x-test")).toBeUndefined();
  });

  it("computes each tag once", () => {
    const maximize = vi.spyOn(Intl.Locale.prototype, "maximize");

    try {
      maximizeTag("pt-AO");
      maximizeTag("pt-AO");
      maximizeTag("pt-AO");

      expect(maximize.mock.calls.length).toBeLessThanOrEqual(1);
    } finally {
      maximize.mockRestore();
    }
  });

  it("stays bounded for tags from untrusted preferences", () => {
    for (let index = 0; index < 5_000; index += 1) {
      maximizeTag(`en-x-${index.toString(36)}`);
    }
    maximizeTag(`en-x-${"a1234567".repeat(20)}`);

    expect(cachedTagCount().maximized).toBeLessThanOrEqual(1_000);
    expect(maximizeTag("en-x-0")).toBe("en-latn-us");
  });
});

describe("canonicalizeTag", () => {
  it("writes a tag as Intl does, or returns undefined for a tag Intl rejects", () => {
    expect(canonicalizeTag("iw-il")).toBe("he-IL");
    expect(canonicalizeTag("x-test")).toBeUndefined();
    expect(canonicalizeTag("en-")).toBeUndefined();
  });

  it("computes each tag once", () => {
    const canonicalize = vi.spyOn(Intl, "getCanonicalLocales");

    try {
      canonicalizeTag("pt-ao");
      canonicalizeTag("pt-ao");
      canonicalizeTag("pt-ao");

      expect(canonicalize.mock.calls.length).toBeLessThanOrEqual(1);
    } finally {
      canonicalize.mockRestore();
    }
  });

  it("stays bounded", () => {
    for (let index = 0; index < 5_000; index += 1) {
      canonicalizeTag(`en-x-${index.toString(36)}`);
    }

    expect(cachedTagCount().canonical).toBeLessThanOrEqual(1_000);
  });
});
