import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyGlobalTokens } from "./tokens";

const TEST_STYLE_ID = "test-toast-tokens";

function getOwnedStyle(styleId: string): HTMLStyleElement | null {
  return document.head.querySelector(`style[data-toast-token-owner="${styleId}"]`);
}

function getStyleText(styleId: string): string {
  return Array.from(getOwnedStyle(styleId)?.sheet?.cssRules ?? [])
    .map((rule) => rule.cssText)
    .join("");
}

describe("tokens utilities", () => {
  describe("applyGlobalTokens", () => {
    beforeEach(() => {
      getOwnedStyle(TEST_STYLE_ID)?.remove();
    });

    afterEach(() => {
      getOwnedStyle(TEST_STYLE_ID)?.remove();
    });

    it("should do nothing when tokens is null, undefined, or empty", () => {
      applyGlobalTokens(null, TEST_STYLE_ID);
      expect(getOwnedStyle(TEST_STYLE_ID)).toBeNull();

      applyGlobalTokens(undefined, TEST_STYLE_ID);
      expect(getOwnedStyle(TEST_STYLE_ID)).toBeNull();

      applyGlobalTokens({}, TEST_STYLE_ID);
      expect(getOwnedStyle(TEST_STYLE_ID)).toBeNull();
    });

    it("should create an instance-scoped style element when valid tokens are supplied", () => {
      applyGlobalTokens({ success: "purple", border: "yellow" }, TEST_STYLE_ID);
      const styleElement = getOwnedStyle(TEST_STYLE_ID);
      expect(styleElement).not.toBeNull();
      expect(getStyleText(TEST_STYLE_ID)).toContain(`[data-toast-instance="${TEST_STYLE_ID}"]`);
      expect(getStyleText(TEST_STYLE_ID)).toContain("--toast-color-success: purple;");
      expect(getStyleText(TEST_STYLE_ID)).toContain("--toast-color-border: yellow;");
    });

    it("should replace/update the existing style element on subsequent calls", () => {
      applyGlobalTokens({ success: "purple" }, TEST_STYLE_ID);
      expect(getStyleText(TEST_STYLE_ID)).toContain("--toast-color-success: purple;");

      applyGlobalTokens({ success: "orange", border: "yellow" }, TEST_STYLE_ID);
      expect(getStyleText(TEST_STYLE_ID)).toContain("--toast-color-success: orange;");
      expect(getStyleText(TEST_STYLE_ID)).toContain("--toast-color-border: yellow;");
    });

    it("should remove the style element if subsequent call passes empty or null tokens", () => {
      applyGlobalTokens({ success: "purple" }, TEST_STYLE_ID);
      expect(getOwnedStyle(TEST_STYLE_ID)).not.toBeNull();

      applyGlobalTokens(null, TEST_STYLE_ID);
      expect(getOwnedStyle(TEST_STYLE_ID)).toBeNull();
    });

    it("should scope style elements per styleId so instances do not clobber each other", () => {
      const idA = "toast-instance-a";
      const idB = "toast-instance-b";

      applyGlobalTokens({ success: "red" }, idA);
      applyGlobalTokens({ success: "blue" }, idB);

      expect(getStyleText(idA)).toContain("red");
      expect(getStyleText(idB)).toContain("blue");

      getOwnedStyle(idA)?.remove();
      getOwnedStyle(idB)?.remove();
    });
  });
});
