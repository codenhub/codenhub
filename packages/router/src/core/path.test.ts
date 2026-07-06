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
  it("shouldReturnEmptyStringForOmittedBasePath", () => {
    expect(normalizeBasePath()).toBe("");
  });

  it("shouldReturnEmptyStringForEmptyStringAndRootSlashInputs", () => {
    expect(normalizeBasePath("")).toBe("");
    expect(normalizeBasePath("/")).toBe("");
  });

  it("shouldNormalisePercentEscapeCasingInBasePath", () => {
    expect(normalizeBasePath("/caf\u00e9")).toBe("/caf%C3%A9");
  });

  it("shouldRejectBasePathThatDoesNotStartWithSlash", () => {
    expect(() => normalizeBasePath("app")).toThrow("Router basePath must start with a slash.");
  });

  it("shouldRejectBasePathThatStartsWithDoubleSlash", () => {
    expect(() => normalizeBasePath("//example.com")).toThrow("Router basePath must start with a slash.");
  });

  it("shouldRejectBasePathContainingBackslashes", () => {
    expect(() => normalizeBasePath("/app\\sub")).toThrow("Router basePath must not include backslashes.");
  });

  it("shouldRejectBasePathContainingQueryString", () => {
    expect(() => normalizeBasePath("/app?tab=settings")).toThrow(
      "Router basePath must not include a query string or hash.",
    );
  });

  it("shouldRejectBasePathContainingHash", () => {
    expect(() => normalizeBasePath("/app#settings")).toThrow(
      "Router basePath must not include a query string or hash.",
    );
  });

  it("shouldRejectBasePathThatEndsWithSlash", () => {
    expect(() => normalizeBasePath("/app/")).toThrow("Router basePath must not end with a slash.");
  });

  it("shouldRejectBasePathWithDotSegments", () => {
    expect(() => normalizeBasePath("/admin/../app")).toThrow('must not include "." or ".." path segments.');
    expect(() => normalizeBasePath("/admin/./app")).toThrow('must not include "." or ".." path segments.');
  });

  it("shouldRejectBasePathWithConsecutiveSlashes", () => {
    expect(() => normalizeBasePath("/app//sub")).toThrow("Router basePath must not include consecutive slashes.");
  });
});

// ---------------------------------------------------------------------------
// parseRoutePath
// ---------------------------------------------------------------------------

describe("parseRoutePath", () => {
  it("shouldReturnFrozenSegmentsForStaticRoute", () => {
    const result = parseRoutePath("/users/settings");
    expect(result.path).toBe("/users/settings");
    expect(result.segments).toEqual([
      { kind: "static", value: "users" },
      { kind: "static", value: "settings" },
    ]);
    expect(Object.isFrozen(result.segments)).toBe(true);
  });

  it("shouldReturnParamSegmentsForNamedParameters", () => {
    const result = parseRoutePath("/users/:id");
    expect(result.segments).toEqual([
      { kind: "static", value: "users" },
      { kind: "param", name: "id" },
    ]);
  });

  it("shouldReturnEmptySegmentArrayForRootRoute", () => {
    const result = parseRoutePath("/");
    expect(result.segments).toEqual([]);
  });

  it("shouldRejectEmptyPath", () => {
    expect(() => parseRoutePath("")).toThrow("Route paths must be app-local paths starting with a slash.");
  });

  it("shouldRejectPathThatDoesNotStartWithSlash", () => {
    expect(() => parseRoutePath("users/:id")).toThrow("Route paths must be app-local paths starting with a slash.");
  });

  it("shouldRejectPathContainingBackslashes", () => {
    expect(() => parseRoutePath("/users\\:id")).toThrow("Route paths must not include backslashes.");
  });

  it("shouldRejectPathContainingQueryString", () => {
    expect(() => parseRoutePath("/users?tab=active")).toThrow("Route paths must not include a query string or hash.");
  });

  it("shouldRejectPathContainingHash", () => {
    expect(() => parseRoutePath("/users#active")).toThrow("Route paths must not include a query string or hash.");
  });

  it("shouldRejectParameterSegmentWithEmptyName", () => {
    expect(() => parseRoutePath("/users/:")).toThrow("Route path parameters must have a name.");
  });

  it("shouldRejectDuplicateParameterNames", () => {
    expect(() => parseRoutePath("/teams/:id/users/:id")).toThrow("Route path parameters must use unique names.");
  });

  it("shouldRejectDotSegmentsInRoutePaths", () => {
    expect(() => parseRoutePath("/admin/../users")).toThrow('must not include "." or ".." path segments.');
    expect(() => parseRoutePath("/admin/./users")).toThrow('must not include "." or ".." path segments.');
  });

  it("shouldRejectConsecutiveSlashesInRoutePaths", () => {
    expect(() => parseRoutePath("/users//settings")).toThrow("Route paths must not include consecutive slashes.");
  });
});

// ---------------------------------------------------------------------------
// parseAppPath
// ---------------------------------------------------------------------------

describe("parseAppPath", () => {
  it("shouldParseSimplePath", () => {
    const result = parseAppPath("/users/alice");
    expect(result.pathname).toBe("/users/alice");
    expect(result.search).toBe("");
    expect(result.hash).toBe("");
    expect(result.href).toBe("/users/alice");
  });

  it("shouldParseQueryStringsAndHashes", () => {
    const result = parseAppPath("/users/alice?tab=posts#activity");
    expect(result.search).toBe("?tab=posts");
    expect(result.hash).toBe("#activity");
    expect(result.searchParams.get("tab")).toBe("posts");
  });

  it("shouldNormalisePercentEscapeCasingInPathname", () => {
    const result = parseAppPath("/caf%c3%a9");
    expect(result.pathname).toBe("/caf%C3%A9");
  });

  it("shouldReturnFrozenSegments", () => {
    const result = parseAppPath("/users/alice");
    expect(Object.isFrozen(result.segments)).toBe(true);
  });

  it("shouldRejectEmptyString", () => {
    expect(() => parseAppPath("")).toThrow("Router navigation targets must be app-local paths starting with a slash.");
  });

  it("shouldRejectPathWithoutLeadingSlash", () => {
    expect(() => parseAppPath("settings")).toThrow(
      "Router navigation targets must be app-local paths starting with a slash.",
    );
  });

  it("shouldRejectPathContainingBackslashes", () => {
    expect(() => parseAppPath("/\\example.com/settings")).toThrow(
      "Router navigation targets must not include backslashes.",
    );
  });

  it("shouldRejectDotSegmentsBeforeUrlNormalisation", () => {
    expect(() => parseAppPath("/admin/%2e%2e/users")).toThrow('must not include "." or ".." path segments.');
  });

  it("shouldRejectConsecutiveSlashesInAppPaths", () => {
    expect(() => parseAppPath("/users//settings")).toThrow(
      "Router navigation targets must not include consecutive slashes.",
    );
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

  it("shouldReturnNullWhenPathnameDoesNotStartWithBasePath", () => {
    const location = makeLocation({ pathname: "/settings" });
    expect(parseLocationPath(location, "/app")).toBeNull();
  });

  it("shouldReturnAppPathnameWhenItMatchesBasePathExactly", () => {
    const location = makeLocation({ pathname: "/app" });
    const result = parseLocationPath(location, "/app");
    expect(result?.pathname).toBe("/");
  });

  it("shouldStripBasePathPrefixAndPreserveQueryAndHash", () => {
    const location = makeLocation({ pathname: "/app/settings", search: "?tab=a", hash: "#top" });
    const result = parseLocationPath(location, "/app");
    expect(result?.pathname).toBe("/settings");
    expect(result?.search).toBe("?tab=a");
    expect(result?.hash).toBe("#top");
  });

  it("shouldReturnFullPathnameWhenBasePathIsEmpty", () => {
    const location = makeLocation({ pathname: "/settings" });
    const result = parseLocationPath(location, "");
    expect(result?.pathname).toBe("/settings");
  });
});

// ---------------------------------------------------------------------------
// matchRoute
// ---------------------------------------------------------------------------

describe("matchRoute", () => {
  it("shouldReturnNullForSegmentCountMismatch", () => {
    const pattern = parseRoutePath("/users/:id");
    const target = parseAppPath("/users");
    expect(matchRoute(pattern, target)).toBeNull();
  });

  it("shouldReturnNullWhenStaticSegmentDoesNotMatch", () => {
    const pattern = parseRoutePath("/users/settings");
    const target = parseAppPath("/users/profile");
    expect(matchRoute(pattern, target)).toBeNull();
  });

  it("shouldCaptureNamedParameters", () => {
    const pattern = parseRoutePath("/users/:id");
    const target = parseAppPath("/users/alice");
    const params = matchRoute(pattern, target);
    expect(params?.["id"]).toBe("alice");
  });

  it("shouldDecodePercentEncodedParameterValues", () => {
    const pattern = parseRoutePath("/users/:id");
    const target = parseAppPath("/users/alice%2042");
    const params = matchRoute(pattern, target);
    expect(params?.["id"]).toBe("alice 42");
  });

  it("shouldReturnNullForMalformedPercentEncodedParameterValues", () => {
    const pattern = parseRoutePath("/users/:id");
    const target = parseAppPath("/users/%E0%A4%A");
    expect(matchRoute(pattern, target)).toBeNull();
  });

  it("shouldSetPrototypePollutingParameterNamesAsSafeOwnProperties", () => {
    const pattern = parseRoutePath("/users/:__proto__");
    const target = parseAppPath("/users/alice");
    const params = matchRoute(pattern, target);
    expect(Object.hasOwn(params ?? {}, "__proto__")).toBe(true);
    expect(params?.["__proto__"]).toBe("alice");
  });

  it("shouldKeepParamsAsPlainObjectsWithNullPrototype", () => {
    const pattern = parseRoutePath("/users/:id");
    const target = parseAppPath("/users/alice");
    const params = matchRoute(pattern, target);
    expect(Object.getPrototypeOf(params)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildBrowserHref
// ---------------------------------------------------------------------------

describe("buildBrowserHref", () => {
  it("shouldReturnAppPathAsIsWhenBasePathIsEmpty", () => {
    expect(buildBrowserHref("/settings", "")).toBe("/settings");
  });

  it("shouldPrependBasePath", () => {
    expect(buildBrowserHref("/settings", "/app")).toBe("/app/settings");
  });

  it("shouldAddTrailingSlashForRootPath", () => {
    expect(buildBrowserHref("/", "/app")).toBe("/app/");
  });

  it("shouldPreserveQueryStringsAndHashes", () => {
    expect(buildBrowserHref("/settings?tab=a#top", "/app")).toBe("/app/settings?tab=a#top");
  });
});

// ---------------------------------------------------------------------------
// stripBasePath
// ---------------------------------------------------------------------------

describe("stripBasePath", () => {
  it("shouldReturnPathnameUnchangedWhenBasePathIsEmpty", () => {
    expect(stripBasePath("/settings", "")).toBe("/settings");
  });

  it("shouldReturnRootSlashWhenPathnameExactlyMatchesBasePath", () => {
    expect(stripBasePath("/app", "/app")).toBe("/");
  });

  it("shouldReturnRootSlashWhenPathnameIsBasePathPlusTrailingSlash", () => {
    expect(stripBasePath("/app/", "/app")).toBe("/");
  });

  it("shouldStripBasePathPrefix", () => {
    expect(stripBasePath("/app/settings", "/app")).toBe("/settings");
  });

  it("shouldReturnNullWhenPathnameIsOutsideBasePath", () => {
    expect(stripBasePath("/settings", "/app")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// normalizePercentEscapes
// ---------------------------------------------------------------------------

describe("normalizePercentEscapes", () => {
  it("shouldUppercaseLowercaseHexDigitsInPercentEscapes", () => {
    expect(normalizePercentEscapes("/caf%c3%a9")).toBe("/caf%C3%A9");
  });

  it("shouldLeaveAlreadyUppercaseEscapesUnchanged", () => {
    expect(normalizePercentEscapes("/caf%C3%A9")).toBe("/caf%C3%A9");
  });

  it("shouldLeaveNonEscapedCharactersUnchanged", () => {
    expect(normalizePercentEscapes("/settings")).toBe("/settings");
  });
});

// ---------------------------------------------------------------------------
// Trailing slash and dot segment location parsing tests
// ---------------------------------------------------------------------------

describe("parseLocationPath with trailing slash and dot segments", () => {
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

  it("shouldStripTrailingSlashFromLocationPathname", () => {
    const location = makeLocation({ pathname: "/app/settings/" });
    const result = parseLocationPath(location, "/app");
    expect(result?.pathname).toBe("/settings");
  });

  it("shouldReturnNullWhenLocationPathnameContainsDotSegments", () => {
    const location1 = makeLocation({ pathname: "/app/admin/%2e%2e/users" });
    const result1 = parseLocationPath(location1, "/app");
    expect(result1).toBeNull();

    const location2 = makeLocation({ pathname: "/app/admin/../users" });
    const result2 = parseLocationPath(location2, "/app");
    expect(result2).toBeNull();
  });

  it("shouldStripTrailingSlashInParseAppPath", () => {
    const result = parseAppPath("/users/");
    expect(result.pathname).toBe("/users");
    expect(result.segments).toEqual(["users"]);
  });
});
