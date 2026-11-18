// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { cachedTagCount, maximizeTag } from "./likely-subtags";

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

    expect(cachedTagCount()).toBeLessThanOrEqual(1_000);
    expect(maximizeTag("en-x-0")).toBe("en-latn-us");
  });
});
