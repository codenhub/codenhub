import { describe, expect, it } from "vitest";

import { postcssIconsPlugin } from "./postcss.js";

describe("postcss plugin entrypoint", () => {
  it("should create postcssIconsPlugin", () => {
    const plugin = postcssIconsPlugin({ injectBase: true });

    let appended = "";
    const mockRoot = {
      toString: () => ".button { color: red; } /* ic-close */",
      append: (css: unknown) => {
        appended += String(css);
      },
    };

    plugin.Once(mockRoot);
    expect(appended).toContain(".ic,");
    expect(appended).toContain(".ic-close {");
  });
});
