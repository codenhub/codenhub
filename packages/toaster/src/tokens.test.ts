import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
      applyGlobalTokens({ border: "yellow", successBg: "purple" }, TEST_STYLE_ID);
      const styleElement = getOwnedStyle(TEST_STYLE_ID);
      expect(styleElement).not.toBeNull();
      expect(getStyleText(TEST_STYLE_ID)).toContain(`[data-toast-instance="${TEST_STYLE_ID}"]`);
      expect(getStyleText(TEST_STYLE_ID)).toContain("--toast-color-success-bg: purple;");
      expect(getStyleText(TEST_STYLE_ID)).toContain("--toast-color-border: yellow;");
    });

    it("should replace/update the existing style element on subsequent calls", () => {
      applyGlobalTokens({ successBg: "purple" }, TEST_STYLE_ID);
      expect(getStyleText(TEST_STYLE_ID)).toContain("--toast-color-success-bg: purple;");

      applyGlobalTokens({ border: "yellow", successBg: "orange" }, TEST_STYLE_ID);
      expect(getStyleText(TEST_STYLE_ID)).toContain("--toast-color-success-bg: orange;");
      expect(getStyleText(TEST_STYLE_ID)).toContain("--toast-color-border: yellow;");
    });

    it("should remove the style element if subsequent call passes empty or null tokens", () => {
      applyGlobalTokens({ successBg: "purple" }, TEST_STYLE_ID);
      expect(getOwnedStyle(TEST_STYLE_ID)).not.toBeNull();

      applyGlobalTokens(null, TEST_STYLE_ID);
      expect(getOwnedStyle(TEST_STYLE_ID)).toBeNull();
    });

    it("should skip rewriting the rule when the same tokens object is reapplied unchanged", () => {
      const tokens = { successBg: "purple" };
      applyGlobalTokens(tokens, TEST_STYLE_ID);
      const styleElement = getOwnedStyle(TEST_STYLE_ID)!;
      const rule = styleElement.sheet!.cssRules[0] as CSSStyleRule;
      const cssTextSetter = vi.spyOn(rule.style, "cssText", "set");

      // Same object reference, same connected element: a dispatch reapplying
      // unchanged instance tokens (see core.ts's getParent()) should not
      // reset and rewrite the rule for nothing.
      applyGlobalTokens(tokens, TEST_STYLE_ID);
      expect(cssTextSetter).not.toHaveBeenCalled();
      expect(getOwnedStyle(TEST_STYLE_ID)).toBe(styleElement);

      applyGlobalTokens({ successBg: "orange" }, TEST_STYLE_ID);
      expect(cssTextSetter).toHaveBeenCalled();
      expect(getStyleText(TEST_STYLE_ID)).toContain("--toast-color-success-bg: orange;");

      cssTextSetter.mockRestore();
    });

    it("should scope style elements per styleId so instances do not clobber each other", () => {
      const idA = "toast-instance-a";
      const idB = "toast-instance-b";

      applyGlobalTokens({ successBg: "red" }, idA);
      applyGlobalTokens({ successBg: "blue" }, idB);

      expect(getStyleText(idA)).toContain("red");
      expect(getStyleText(idB)).toContain("blue");

      getOwnedStyle(idA)?.remove();
      getOwnedStyle(idB)?.remove();
    });
  });
});
