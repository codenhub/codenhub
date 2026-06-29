import { describe, expect, it } from "vitest";

import {
  buildBrowserHref,
  matchRoute,
  normalizeBasePath,
  normalizePercentEscapes,
  parseAppPath,
  parseLocationPath,
  parseRoutePath,
  stripBasePath,
} from "./path";

// ---------------------------------------------------------------------------
// normalizeBasePath
// ---------------------------------------------------------------------------

describe("normalizeBasePath", () => {
  it("returns empty string for an omitted base path", () => {
    expect(normalizeBasePath()).toBe("");
  });

  it("returns empty string for empty-string and root-slash inputs", () => {
    expect(normalizeBasePath("")).toBe("");
    expect(normalizeBasePath("/")).toBe("");
  });

  it("normalises percent-escape casing in the base path", () => {
    expect(normalizeBasePath("/caf\u00e9")).toBe("/caf%C3%A9");
  });

  it("rejects a base path that does not start with a slash", () => {
    expect(() => normalizeBasePath("app")).toThrow("Router basePath must start with a slash.");
  });

  it("rejects a base path that starts with double-slash", () => {
    expect(() => normalizeBasePath("//example.com")).toThrow("Router basePath must start with a slash.");
  });

  it("rejects a base path containing backslashes", () => {
    expect(() => normalizeBasePath("/app\\sub")).toThrow("Router basePath must not include backslashes.");
  });

  it("rejects a base path containing a query string", () => {
    expect(() => normalizeBasePath("/app?tab=settings")).toThrow(
      "Router basePath must not include a query string or hash.",
    );
  });

  it("rejects a base path containing a hash", () => {
    expect(() => normalizeBasePath("/app#settings")).toThrow(
      "Router basePath must not include a query string or hash.",
    );
  });

  it("rejects a base path that ends with a slash", () => {
    expect(() => normalizeBasePath("/app/")).toThrow("Router basePath must not end with a slash.");
  });

  it("rejects a base path with dot segments", () => {
    expect(() => normalizeBasePath("/admin/../app")).toThrow('must not include "." or ".." path segments.');
    expect(() => normalizeBasePath("/admin/./app")).toThrow('must not include "." or ".." path segments.');
  });
});

// ---------------------------------------------------------------------------
// parseRoutePath
// ---------------------------------------------------------------------------

describe("parseRoutePath", () => {
  it("returns frozen segments for a static route", () => {
    const result = parseRoutePath("/users/settings");
    expect(result.path).toBe("/users/settings");
    expect(result.segments).toEqual([
      { kind: "static", value: "users" },
      { kind: "static", value: "settings" },
    ]);
    expect(Object.isFrozen(result.segments)).toBe(true);
  });

  it("returns param segments for named parameters", () => {
    const result = parseRoutePath("/users/:id");
    expect(result.segments).toEqual([
      { kind: "static", value: "users" },
      { kind: "param", name: "id" },
    ]);
  });

  it("returns an empty segment array for the root route", () => {
    const result = parseRoutePath("/");
    expect(result.segments).toEqual([]);
  });

  it("rejects an empty path", () => {
    expect(() => parseRoutePath("")).toThrow("Route paths must be app-local paths starting with a slash.");
  });

  it("rejects a path that does not start with slash", () => {
    expect(() => parseRoutePath("users/:id")).toThrow("Route paths must be app-local paths starting with a slash.");
  });

  it("rejects a path containing backslashes", () => {
    expect(() => parseRoutePath("/users\\:id")).toThrow("Route paths must not include backslashes.");
  });

  it("rejects a path containing a query string", () => {
    expect(() => parseRoutePath("/users?tab=active")).toThrow("Route paths must not include a query string or hash.");
  });

  it("rejects a path containing a hash", () => {
    expect(() => parseRoutePath("/users#active")).toThrow("Route paths must not include a query string or hash.");
  });

  it("rejects a parameter segment with an empty name", () => {
    expect(() => parseRoutePath("/users/:")).toThrow("Route path parameters must have a name.");
  });

  it("rejects duplicate parameter names", () => {
    expect(() => parseRoutePath("/teams/:id/users/:id")).toThrow("Route path parameters must use unique names.");
  });

  it("rejects dot segments in route paths", () => {
    expect(() => parseRoutePath("/admin/../users")).toThrow('must not include "." or ".." path segments.');
    expect(() => parseRoutePath("/admin/./users")).toThrow('must not include "." or ".." path segments.');
  });
});

// ---------------------------------------------------------------------------
// parseAppPath
// ---------------------------------------------------------------------------

describe("parseAppPath", () => {
  it("parses a simple path", () => {
    const result = parseAppPath("/users/alice");
    expect(result.pathname).toBe("/users/alice");
    expect(result.search).toBe("");
    expect(result.hash).toBe("");
    expect(result.href).toBe("/users/alice");
  });

  it("parses query strings and hashes", () => {
    const result = parseAppPath("/users/alice?tab=posts#activity");
    expect(result.search).toBe("?tab=posts");
    expect(result.hash).toBe("#activity");
    expect(result.searchParams.get("tab")).toBe("posts");
  });

  it("normalises percent-escape casing in the pathname", () => {
    const result = parseAppPath("/caf%c3%a9");
    expect(result.pathname).toBe("/caf%C3%A9");
  });

  it("returns frozen segments", () => {
    const result = parseAppPath("/users/alice");
    expect(Object.isFrozen(result.segments)).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(() => parseAppPath("")).toThrow("Router navigation targets must be app-local paths starting with a slash.");
  });

  it("rejects a path without a leading slash", () => {
    expect(() => parseAppPath("settings")).toThrow(
      "Router navigation targets must be app-local paths starting with a slash.",
    );
  });

  it("rejects a path containing backslashes", () => {
    expect(() => parseAppPath("/\\example.com/settings")).toThrow(
      "Router navigation targets must not include backslashes.",
    );
  });

  it("rejects dot segments before URL normalisation", () => {
    expect(() => parseAppPath("/admin/%2e%2e/users")).toThrow('must not include "." or ".." path segments.');
  });
});

// ---------------------------------------------------------------------------
// parseLocationPath
// ---------------------------------------------------------------------------

describe("parseLocationPath", () => {
  function makeLocation(overrides: Partial<Location>): Location {
    return {
      pathname: "/",
      search: "",
      hash: "",
      href: "",
      host: "",
      hostname: "",
      port: "",
      protocol: "",
      origin: "",
      ancestorOrigins: {} as DOMStringList,
      assign: () => {},
      reload: () => {},
      replace: () => {},
      toString: () => "",
      ...overrides,
    };
  }

  it("returns null when the pathname does not start with basePath", () => {
    const location = makeLocation({ pathname: "/settings" });
    expect(parseLocationPath(location, "/app")).toBeNull();
  });

  it("returns the app pathname when it matches the base path exactly", () => {
    const location = makeLocation({ pathname: "/app" });
    const result = parseLocationPath(location, "/app");
    expect(result?.pathname).toBe("/");
  });

  it("strips the base path prefix and preserves query and hash", () => {
    const location = makeLocation({ pathname: "/app/settings", search: "?tab=a", hash: "#top" });
    const result = parseLocationPath(location, "/app");
    expect(result?.pathname).toBe("/settings");
    expect(result?.search).toBe("?tab=a");
    expect(result?.hash).toBe("#top");
  });

  it("returns the full pathname when basePath is empty", () => {
    const location = makeLocation({ pathname: "/settings" });
    const result = parseLocationPath(location, "");
    expect(result?.pathname).toBe("/settings");
  });
});

// ---------------------------------------------------------------------------
// matchRoute
// ---------------------------------------------------------------------------

describe("matchRoute", () => {
  it("returns null for segment count mismatch", () => {
    const pattern = parseRoutePath("/users/:id");
    const target = parseAppPath("/users");
    expect(matchRoute(pattern, target)).toBeNull();
  });

  it("returns null when a static segment does not match", () => {
    const pattern = parseRoutePath("/users/settings");
    const target = parseAppPath("/users/profile");
    expect(matchRoute(pattern, target)).toBeNull();
  });

  it("captures named parameters", () => {
    const pattern = parseRoutePath("/users/:id");
    const target = parseAppPath("/users/alice");
    const params = matchRoute(pattern, target);
    expect(params?.["id"]).toBe("alice");
  });

  it("decodes percent-encoded parameter values", () => {
    const pattern = parseRoutePath("/users/:id");
    const target = parseAppPath("/users/alice%2042");
    const params = matchRoute(pattern, target);
    expect(params?.["id"]).toBe("alice 42");
  });

  it("returns null for malformed percent-encoded parameter values", () => {
    const pattern = parseRoutePath("/users/:id");
    const target = parseAppPath("/users/%E0%A4%A");
    expect(matchRoute(pattern, target)).toBeNull();
  });

  it("sets prototype-polluting parameter names as safe own properties", () => {
    const pattern = parseRoutePath("/users/:__proto__");
    const target = parseAppPath("/users/alice");
    const params = matchRoute(pattern, target);
    expect(Object.hasOwn(params ?? {}, "__proto__")).toBe(true);
    expect(params?.["__proto__"]).toBe("alice");
  });

  it("keeps params as plain objects with Object.prototype", () => {
    const pattern = parseRoutePath("/users/:id");
    const target = parseAppPath("/users/alice");
    const params = matchRoute(pattern, target);
    expect(Object.getPrototypeOf(params)).toBe(Object.prototype);
  });
});

// ---------------------------------------------------------------------------
// buildBrowserHref
// ---------------------------------------------------------------------------

describe("buildBrowserHref", () => {
  it("returns the app path as-is when basePath is empty", () => {
    expect(buildBrowserHref("/settings", "")).toBe("/settings");
  });

  it("prepends the base path", () => {
    expect(buildBrowserHref("/settings", "/app")).toBe("/app/settings");
  });

  it("adds a trailing slash for the root path", () => {
    expect(buildBrowserHref("/", "/app")).toBe("/app/");
  });

  it("preserves query strings and hashes", () => {
    expect(buildBrowserHref("/settings?tab=a#top", "/app")).toBe("/app/settings?tab=a#top");
  });
});

// ---------------------------------------------------------------------------
// stripBasePath
// ---------------------------------------------------------------------------

describe("stripBasePath", () => {
  it("returns the pathname unchanged when basePath is empty", () => {
    expect(stripBasePath("/settings", "")).toBe("/settings");
  });

  it("returns '/' when pathname exactly matches basePath", () => {
    expect(stripBasePath("/app", "/app")).toBe("/");
  });

  it("returns '/' when pathname is basePath + trailing slash", () => {
    expect(stripBasePath("/app/", "/app")).toBe("/");
  });

  it("strips the base path prefix", () => {
    expect(stripBasePath("/app/settings", "/app")).toBe("/settings");
  });

  it("returns null when pathname is outside basePath", () => {
    expect(stripBasePath("/settings", "/app")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// normalizePercentEscapes
// ---------------------------------------------------------------------------

describe("normalizePercentEscapes", () => {
  it("uppercases lowercase hex digits in percent escapes", () => {
    expect(normalizePercentEscapes("/caf%c3%a9")).toBe("/caf%C3%A9");
  });

  it("leaves already-uppercase escapes unchanged", () => {
    expect(normalizePercentEscapes("/caf%C3%A9")).toBe("/caf%C3%A9");
  });

  it("leaves non-escaped characters unchanged", () => {
    expect(normalizePercentEscapes("/settings")).toBe("/settings");
  });
});
