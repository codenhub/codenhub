import type { RouteParams } from "./types";

const ROUTER_URL_BASE = "http://router.local";
const PATHNAME_END_PATTERN = /[?#]/;
const PERCENT_ESCAPE_PATTERN = /%[0-9a-fA-F]{2}/g;
const ENCODED_DOT_PATTERN = /%2e/gi;

interface StaticRouteSegment {
  kind: "static";
  value: string;
}

interface ParamRouteSegment {
  kind: "param";
  name: string;
}

type RouteSegment = StaticRouteSegment | ParamRouteSegment;

export interface ParsedPath {
  pathname: string;
  search: string;
  searchParams: URLSearchParams;
  hash: string;
  href: string;
  canMatch: boolean;
}

export interface RoutePattern {
  path: string;
  segments: readonly RouteSegment[];
}

export function normalizeBasePath(basePath = ""): string {
  if (basePath === "" || basePath === "/") {
    return "";
  }
  if (!basePath.startsWith("/") || basePath.startsWith("//")) {
    throw new Error("Router basePath must start with a slash.");
  }
  if (basePath.includes("\\")) {
    throw new Error("Router basePath must not include backslashes.");
  }
  if (basePath.includes("?") || basePath.includes("#")) {
    throw new Error("Router basePath must not include a query string or hash.");
  }
  assertNoDotPathSegments(basePath, "Router basePath");

  const pathname = toUrlPathname(basePath);
  if (pathname.endsWith("/")) {
    throw new Error("Router basePath must not end with a slash.");
  }

  return pathname;
}

export function parseRoutePath(path: string): RoutePattern {
  assertRoutePath(path);
  const paramNames = new Set<string>();

  const segments = splitPath(toUrlPathname(path)).map((segment): RouteSegment => {
    if (!segment.startsWith(":")) {
      return { kind: "static", value: segment };
    }

    const name = segment.slice(1);
    if (name.length === 0) {
      throw new Error("Route path parameters must have a name.");
    }
    if (paramNames.has(name)) {
      throw new Error("Route path parameters must use unique names.");
    }

    paramNames.add(name);

    return { kind: "param", name };
  });

  return Object.freeze({ path, segments: Object.freeze(segments) });
}

export function parseAppPath(to: string): ParsedPath {
  assertAppPath(to);

  return parseUrlPath(new URL(to, ROUTER_URL_BASE));
}

export function parseLocationPath(currentLocation: Location, basePath: string): ParsedPath {
  const browserPathname = normalizePercentEscapes(currentLocation.pathname || "/");
  const appPathname = stripBasePath(browserPathname, basePath);
  const pathname = appPathname ?? browserPathname;
  const search = currentLocation.search;
  const hash = currentLocation.hash;

  return {
    pathname,
    search,
    searchParams: new URLSearchParams(search),
    hash,
    href: pathname + search + hash,
    canMatch: appPathname !== null,
  };
}

export function buildBrowserHref(to: string, basePath: string): string {
  const target = parseAppPath(to);

  if (basePath === "") {
    return target.href;
  }
  if (target.pathname === "/") {
    return basePath + "/" + target.search + target.hash;
  }

  return basePath + target.href;
}

export function matchRoute(pattern: RoutePattern, target: ParsedPath): RouteParams | null {
  if (!target.canMatch) {
    return null;
  }

  const targetSegments = splitPath(target.pathname);
  if (pattern.segments.length !== targetSegments.length) {
    return null;
  }

  const params = createRouteParams();

  for (const [index, segment] of pattern.segments.entries()) {
    const targetSegment = targetSegments[index];
    if (targetSegment === undefined) {
      return null;
    }
    if (segment.kind === "static") {
      if (segment.value !== targetSegment) {
        return null;
      }

      continue;
    }

    const paramValue = decodeRouteParam(targetSegment);
    if (paramValue === null) {
      return null;
    }

    Object.defineProperty(params, segment.name, {
      configurable: true,
      enumerable: true,
      value: paramValue,
      writable: true,
    });
  }

  return params;
}

function assertRoutePath(path: string): void {
  if (path.length === 0 || !path.startsWith("/") || path.startsWith("//")) {
    throw new Error("Route paths must be app-local paths starting with a slash.");
  }
  if (path.includes("\\")) {
    throw new Error("Route paths must not include backslashes.");
  }
  if (path.includes("?") || path.includes("#")) {
    throw new Error("Route paths must not include a query string or hash.");
  }
  assertNoDotPathSegments(path, "Route paths");
}

function assertAppPath(to: string): void {
  if (to.length === 0 || !to.startsWith("/") || to.startsWith("//")) {
    throw new Error("Router navigation targets must be app-local paths starting with a slash.");
  }
  if (to.includes("\\")) {
    throw new Error("Router navigation targets must not include backslashes.");
  }
  assertNoDotPathSegments(to, "Router navigation targets");
}

function parseUrlPath(url: URL): ParsedPath {
  const pathname = normalizePercentEscapes(url.pathname || "/");
  const search = url.search;
  const hash = url.hash;

  return {
    pathname,
    search,
    searchParams: new URLSearchParams(search),
    hash,
    href: pathname + search + hash,
    canMatch: true,
  };
}

function toUrlPathname(pathname: string): string {
  return normalizePercentEscapes(new URL(pathname, ROUTER_URL_BASE).pathname || "/");
}

export function normalizePercentEscapes(pathname: string): string {
  return pathname.replace(PERCENT_ESCAPE_PATTERN, (percentEscape) => percentEscape.toUpperCase());
}

function createRouteParams(): RouteParams {
  return {};
}

function assertNoDotPathSegments(value: string, subject: string): void {
  const pathnameEndIndex = value.search(PATHNAME_END_PATTERN);
  const pathname = pathnameEndIndex === -1 ? value : value.slice(0, pathnameEndIndex);

  for (const segment of pathname.split("/")) {
    const normalizedSegment = segment.replace(ENCODED_DOT_PATTERN, ".");
    if (normalizedSegment === "." || normalizedSegment === "..") {
      throw new Error(`${subject} must not include "." or ".." path segments.`);
    }
  }
}

function decodeRouteParam(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch (error) {
    if (error instanceof URIError) {
      return null;
    }

    throw error;
  }
}

function stripBasePath(pathname: string, basePath: string): string | null {
  if (basePath === "") {
    return pathname;
  }
  if (pathname === basePath || pathname === basePath + "/") {
    return "/";
  }
  if (pathname.startsWith(basePath + "/")) {
    return pathname.slice(basePath.length);
  }

  return null;
}

function splitPath(pathname: string): string[] {
  if (pathname === "/") {
    return [];
  }

  return pathname.slice(1).split("/");
}
