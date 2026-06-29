import { describe, expect, it, vi } from "vitest";

import { parseAppPath } from "./path";
import { createRegistry } from "./registry";

describe("createRegistry", () => {
  // ---------------------------------------------------------------------------
  // add / validation
  // ---------------------------------------------------------------------------

  describe("add", () => {
    it("accepts valid static and parameterised route paths", () => {
      const registry = createRegistry();
      expect(() => registry.add("/users", vi.fn())).not.toThrow();
      expect(() => registry.add("/users/:id", vi.fn())).not.toThrow();
    });

    it("rejects an empty path", () => {
      const registry = createRegistry();
      expect(() => registry.add("", vi.fn())).toThrow(Error);
    });

    it("rejects a path missing a leading slash", () => {
      const registry = createRegistry();
      expect(() => registry.add("users/:id", vi.fn())).toThrow(Error);
    });

    it("rejects a path containing backslashes", () => {
      const registry = createRegistry();
      expect(() => registry.add("/users\\:id", vi.fn())).toThrow(Error);
    });

    it("rejects a path containing a query string", () => {
      const registry = createRegistry();
      expect(() => registry.add("/users?tab=active", vi.fn())).toThrow(Error);
    });

    it("rejects a path containing a hash", () => {
      const registry = createRegistry();
      expect(() => registry.add("/users#active", vi.fn())).toThrow(Error);
    });

    it("rejects duplicate parameter names", () => {
      const registry = createRegistry();
      expect(() => registry.add("/teams/:id/users/:id", vi.fn())).toThrow(Error);
    });

    it("rejects dot segments", () => {
      const registry = createRegistry();
      expect(() => registry.add("/admin/../users", vi.fn())).toThrow(Error);
      expect(() => registry.add("/admin/./users", vi.fn())).toThrow(Error);
    });
  });

  // ---------------------------------------------------------------------------
  // setFallback / getFallback
  // ---------------------------------------------------------------------------

  describe("setFallback / getFallback", () => {
    it("returns undefined before a fallback is set", () => {
      const registry = createRegistry();
      expect(registry.getFallback()).toBeUndefined();
    });

    it("returns the registered fallback handler", () => {
      const registry = createRegistry();
      const fallback = vi.fn();
      registry.setFallback(fallback);
      expect(registry.getFallback()).toBe(fallback);
    });

    it("replaces an existing fallback when set again", () => {
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
    it("returns null when no routes are registered", () => {
      const registry = createRegistry();
      expect(registry.findMatch(parseAppPath("/users"))).toBeNull();
    });

    it("returns null when no route matches the target", () => {
      const registry = createRegistry();
      registry.add("/users", vi.fn());
      expect(registry.findMatch(parseAppPath("/settings"))).toBeNull();
    });

    it("returns the first matching route with its match object", () => {
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

    it("matches routes in registration order (first-match wins)", () => {
      const firstHandler = vi.fn();
      const secondHandler = vi.fn();
      const registry = createRegistry();
      registry.add("/users/:id", firstHandler);
      registry.add("/users/settings", secondHandler);

      const result = registry.findMatch(parseAppPath("/users/settings"));
      // The first-registered pattern wins because :id also matches 'settings'.
      expect(result?.route.handler).toBe(firstHandler);
    });

    it("returns the static route when it is registered first", () => {
      const staticHandler = vi.fn();
      const paramHandler = vi.fn();
      const registry = createRegistry();
      registry.add("/users/settings", staticHandler);
      registry.add("/users/:id", paramHandler);

      const result = registry.findMatch(parseAppPath("/users/settings"));
      expect(result?.route.handler).toBe(staticHandler);
    });

    it("populates searchParams and hash on the match object", () => {
      const registry = createRegistry();
      registry.add("/users/:id", vi.fn());

      const result = registry.findMatch(parseAppPath("/users/alice?tab=posts#bio"));
      expect(result?.match.searchParams.get("tab")).toBe("posts");
      expect(result?.match.hash).toBe("#bio");
    });

    it("returns null for a malformed percent-encoded parameter", () => {
      const registry = createRegistry();
      registry.add("/users/:id", vi.fn());
      expect(registry.findMatch(parseAppPath("/users/%E0%A4%A"))).toBeNull();
    });

    it("returns params as plain objects with Object.prototype", () => {
      const registry = createRegistry();
      registry.add("/users/:id", vi.fn());

      const result = registry.findMatch(parseAppPath("/users/alice"));
      expect(Object.getPrototypeOf(result?.match.params)).toBe(Object.prototype);
    });

    it("captures prototype-polluting parameter names as safe own properties", () => {
      const registry = createRegistry();
      registry.add("/users/:__proto__", vi.fn());

      const result = registry.findMatch(parseAppPath("/users/alice"));
      expect(Object.hasOwn(result?.match.params ?? {}, "__proto__")).toBe(true);
      expect(result?.match.params["__proto__"]).toBe("alice");
    });
  });
});
