// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyGlobalTokens, buildInlineStyle } from "./tokens";

const TEST_STYLE_ID = "test-toast-tokens";

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
      document.getElementById(TEST_STYLE_ID)?.remove();
    });

    afterEach(() => {
      document.getElementById(TEST_STYLE_ID)?.remove();
    });

    it("should do nothing when tokens is null, undefined, or empty", () => {
      applyGlobalTokens(null, TEST_STYLE_ID);
      expect(document.getElementById(TEST_STYLE_ID)).toBeNull();

      applyGlobalTokens(undefined, TEST_STYLE_ID);
      expect(document.getElementById(TEST_STYLE_ID)).toBeNull();

      applyGlobalTokens({}, TEST_STYLE_ID);
      expect(document.getElementById(TEST_STYLE_ID)).toBeNull();
    });

    it("should create an instance-scoped style element when valid tokens are supplied", () => {
      applyGlobalTokens({ success: "purple", border: "yellow" }, TEST_STYLE_ID);
      const styleElement = document.getElementById(TEST_STYLE_ID) as HTMLStyleElement | null;
      expect(styleElement).not.toBeNull();
      expect(styleElement?.textContent).toContain(`[data-toast-instance="${TEST_STYLE_ID}"] {`);
      expect(styleElement?.textContent).toContain("--toast-color-success: purple;");
      expect(styleElement?.textContent).toContain("--toast-color-border: yellow;");
    });

    it("should replace/update the existing style element on subsequent calls", () => {
      applyGlobalTokens({ success: "purple" }, TEST_STYLE_ID);
      expect(document.getElementById(TEST_STYLE_ID)?.textContent).toContain("--toast-color-success: purple;");

      applyGlobalTokens({ success: "orange", border: "yellow" }, TEST_STYLE_ID);
      const el = document.getElementById(TEST_STYLE_ID);
      expect(el?.textContent).toContain("--toast-color-success: orange;");
      expect(el?.textContent).toContain("--toast-color-border: yellow;");
    });

    it("should remove the style element if subsequent call passes empty or null tokens", () => {
      applyGlobalTokens({ success: "purple" }, TEST_STYLE_ID);
      expect(document.getElementById(TEST_STYLE_ID)).not.toBeNull();

      applyGlobalTokens(null, TEST_STYLE_ID);
      expect(document.getElementById(TEST_STYLE_ID)).toBeNull();
    });

    it("should scope style elements per styleId so instances do not clobber each other", () => {
      const idA = "toast-instance-a";
      const idB = "toast-instance-b";

      applyGlobalTokens({ success: "red" }, idA);
      applyGlobalTokens({ success: "blue" }, idB);

      expect(document.getElementById(idA)?.textContent).toContain("red");
      expect(document.getElementById(idB)?.textContent).toContain("blue");

      document.getElementById(idA)?.remove();
      document.getElementById(idB)?.remove();
    });
  });
});
