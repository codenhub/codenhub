// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyGlobalTokens, buildInlineStyle } from "./tokens";

describe("tokens utilities", () => {
  describe("buildInlineStyle", () => {
    it("should return empty string when tokens is null or undefined", () => {
      expect(buildInlineStyle(null)).toBe("");
      expect(buildInlineStyle(undefined)).toBe("");
    });

    it("should return empty string when tokens is empty", () => {
      expect(buildInlineStyle({})).toBe("");
    });

    it("should return correct inline css custom properties for supported tokens", () => {
      expect(buildInlineStyle({ success: "red" })).toBe("--toast-color-success: red;");
      expect(
        buildInlineStyle({
          success: "red",
          successSubtle: "blue",
          successStrong: "green",
        }),
      ).toBe("--toast-color-success: red; --toast-color-success-subtle: blue; --toast-color-success-strong: green;");
    });

    it("should ignore unsupported token keys", () => {
      // @ts-expect-error testing invalid token keys
      expect(buildInlineStyle({ invalid: "color", success: "red" })).toBe("--toast-color-success: red;");
    });
  });

  describe("applyGlobalTokens", () => {
    beforeEach(() => {
      const existing = document.getElementById("global-toast-tokens");
      if (existing) {
        existing.remove();
      }
    });

    afterEach(() => {
      const existing = document.getElementById("global-toast-tokens");
      if (existing) {
        existing.remove();
      }
    });

    it("should do nothing when tokens is null, undefined, or empty", () => {
      applyGlobalTokens(null);
      expect(document.getElementById("global-toast-tokens")).toBeNull();

      applyGlobalTokens(undefined);
      expect(document.getElementById("global-toast-tokens")).toBeNull();

      applyGlobalTokens({});
      expect(document.getElementById("global-toast-tokens")).toBeNull();
    });

    it("should create a global style element when valid tokens are supplied", () => {
      applyGlobalTokens({ success: "purple", border: "yellow" });
      const styleElement = document.getElementById("global-toast-tokens") as HTMLStyleElement | null;
      expect(styleElement).not.toBeNull();
      expect(styleElement?.textContent).toContain(":root {");
      expect(styleElement?.textContent).toContain("--toast-color-success: purple;");
      expect(styleElement?.textContent).toContain("--toast-color-border: yellow;");
    });

    it("should replace/update the existing style element on subsequent calls", () => {
      applyGlobalTokens({ success: "purple" });
      let styleElement = document.getElementById("global-toast-tokens") as HTMLStyleElement | null;
      expect(styleElement?.textContent).toContain("--toast-color-success: purple;");

      applyGlobalTokens({ success: "orange", border: "yellow" });
      styleElement = document.getElementById("global-toast-tokens") as HTMLStyleElement | null;
      expect(styleElement?.textContent).toContain("--toast-color-success: orange;");
      expect(styleElement?.textContent).toContain("--toast-color-border: yellow;");
    });

    it("should remove the style element if subsequent call passes empty or null tokens", () => {
      applyGlobalTokens({ success: "purple" });
      expect(document.getElementById("global-toast-tokens")).not.toBeNull();

      applyGlobalTokens(null);
      expect(document.getElementById("global-toast-tokens")).toBeNull();
    });
  });
});
