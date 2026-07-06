import { describe, expect, it, vi } from "vitest";

import { parseAppPath } from "./path";
import { createRegistry } from "./registry";

describe("createRegistry", () => {
  // ---------------------------------------------------------------------------
  // add / validation
  // ---------------------------------------------------------------------------

  describe("add", () => {
    it("shouldAcceptValidStaticAndParameterisedRoutePaths", () => {
      const registry = createRegistry();
      expect(() => registry.add("/users", vi.fn())).not.toThrow();
      expect(() => registry.add("/users/:id", vi.fn())).not.toThrow();
    });

    it("shouldRejectEmptyPath", () => {
      const registry = createRegistry();
      expect(() => registry.add("", vi.fn())).toThrow(Error);
    });

    it("shouldRejectPathMissingLeadingSlash", () => {
      const registry = createRegistry();
      expect(() => registry.add("users/:id", vi.fn())).toThrow(Error);
    });

    it("shouldRejectPathContainingBackslashes", () => {
      const registry = createRegistry();
      expect(() => registry.add("/users\\:id", vi.fn())).toThrow(Error);
    });

    it("shouldRejectPathContainingQueryString", () => {
      const registry = createRegistry();
      expect(() => registry.add("/users?tab=active", vi.fn())).toThrow(Error);
    });

    it("shouldRejectPathContainingHash", () => {
      const registry = createRegistry();
      expect(() => registry.add("/users#active", vi.fn())).toThrow(Error);
    });

    it("shouldRejectDuplicateParameterNames", () => {
      const registry = createRegistry();
      expect(() => registry.add("/teams/:id/users/:id", vi.fn())).toThrow(Error);
    });

    it("shouldRejectDotSegments", () => {
      const registry = createRegistry();
      expect(() => registry.add("/admin/../users", vi.fn())).toThrow(Error);
      expect(() => registry.add("/admin/./users", vi.fn())).toThrow(Error);
    });

    it("shouldRejectDuplicateRoutePaths", () => {
      const registry = createRegistry();
      registry.add("/users/:id", vi.fn());
      expect(() => registry.add("/users/:id", vi.fn())).toThrow(Error);
    });
  });

  // ---------------------------------------------------------------------------
  // setFallback / getFallback
  // ---------------------------------------------------------------------------

  describe("setFallback / getFallback", () => {
    it("shouldReturnUndefinedBeforeFallbackIsSet", () => {
      const registry = createRegistry();
      expect(registry.getFallback()).toBeUndefined();
    });

    it("shouldReturnRegisteredFallbackHandler", () => {
      const registry = createRegistry();
      const fallback = vi.fn();
      registry.setFallback(fallback);
      expect(registry.getFallback()).toBe(fallback);
    });

    it("shouldReplaceExistingFallbackWhenSetAgain", () => {
      const registry = createRegistry();
      const firstFallback = vi.fn();
      const secondFallback = vi.fn();
      registry.setFallback(firstFallback);
      registry.setFallback(secondFallback);
      expect(registry.getFallback()).toBe(secondFallback);
    });
  });

  // ---------------------------------------------------------------------------
  // findMatch
  // ---------------------------------------------------------------------------

  describe("findMatch", () => {
    it("shouldReturnNullWhenNoRoutesAreRegistered", () => {
      const registry = createRegistry();
      expect(registry.findMatch(parseAppPath("/users"))).toBeNull();
    });

    it("shouldReturnNullWhenNoRouteMatchesTarget", () => {
      const registry = createRegistry();
      registry.add("/users", vi.fn());
      expect(registry.findMatch(parseAppPath("/settings"))).toBeNull();
    });

    it("shouldReturnFirstMatchingRouteWithMatchObject", () => {
      const handler = vi.fn();
      const registry = createRegistry();
      registry.add("/users/:id", handler);

      const result = registry.findMatch(parseAppPath("/users/alice"));
      expect(result).not.toBeNull();
      expect(result?.match.path).toBe("/users/:id");
      expect(result?.match.pathname).toBe("/users/alice");
      expect(result?.match.params["id"]).toBe("alice");
      expect(result?.route.handler).toBe(handler);
    });

    it("shouldMatchRoutesInRegistrationOrderFirstMatchWins", () => {
      const firstHandler = vi.fn();
      const secondHandler = vi.fn();
      const registry = createRegistry();
      registry.add("/users/:id", firstHandler);
      registry.add("/users/settings", secondHandler);

      const result = registry.findMatch(parseAppPath("/users/settings"));
      // The first-registered pattern wins because :id also matches 'settings'.
      expect(result?.route.handler).toBe(firstHandler);
    });

    it("shouldReturnStaticRouteWhenItIsRegisteredFirst", () => {
      const staticHandler = vi.fn();
      const paramHandler = vi.fn();
      const registry = createRegistry();
      registry.add("/users/settings", staticHandler);
      registry.add("/users/:id", paramHandler);

      const result = registry.findMatch(parseAppPath("/users/settings"));
      expect(result?.route.handler).toBe(staticHandler);
    });

    it("shouldPopulateSearchParamsAndHashOnMatchObject", () => {
      const registry = createRegistry();
      registry.add("/users/:id", vi.fn());

      const result = registry.findMatch(parseAppPath("/users/alice?tab=posts#bio"));
      expect(result?.match.searchParams.get("tab")).toBe("posts");
      expect(result?.match.hash).toBe("#bio");
    });

    it("shouldReturnNullForMalformedPercentEncodedParameter", () => {
      const registry = createRegistry();
      registry.add("/users/:id", vi.fn());
      expect(registry.findMatch(parseAppPath("/users/%E0%A4%A"))).toBeNull();
    });

    it("shouldReturnParamsAsPlainObjectsWithObjectPrototype", () => {
      const registry = createRegistry();
      registry.add("/users/:id", vi.fn());

      const result = registry.findMatch(parseAppPath("/users/alice"));
      expect(Object.getPrototypeOf(result?.match.params)).toBe(Object.prototype);
    });

    it("shouldCapturePrototypePollutingParameterNamesAsSafeOwnProperties", () => {
      const registry = createRegistry();
      registry.add("/users/:__proto__", vi.fn());

      const result = registry.findMatch(parseAppPath("/users/alice"));
      expect(Object.hasOwn(result?.match.params ?? {}, "__proto__")).toBe(true);
      expect(result?.match.params["__proto__"]).toBe("alice");
    });
  });
});
