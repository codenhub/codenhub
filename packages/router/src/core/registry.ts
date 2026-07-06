import { matchRoute, parseRoutePath, type ParsedPath, type RoutePattern } from "./path";
import type { NotFoundHandler, RouteHandler, RouterMatch } from "./types";

interface RegisteredRoute {
  pattern: RoutePattern;
  handler: RouteHandler;
}

/** @internal */
export interface MatchResult {
  match: RouterMatch;
  route: RegisteredRoute;
}

/** @internal */
export interface Registry {
  /**
   * Parses and appends a route pattern + handler to the registration table.
   *
   * @throws {Error} If the path is empty, not app-local, contains backslashes,
   *   a query string, a hash, dot segments, duplicate parameter names, or if
   *   the exact same route path is already registered.
   */
  add(path: string, handler: RouteHandler): void;

  /** Replaces the fallback used when no registered route matches. */
  setFallback(handler: NotFoundHandler): void;

  /**
   * Returns the first registered route that matches `target`, or null when
   * none match.
   */
  findMatch(target: ParsedPath): MatchResult | null;

  /** Returns the current not-found fallback, if one has been set. */
  getFallback(): NotFoundHandler | undefined;
}

/** @internal */
export function createRegistry(): Registry {
  const routes: RegisteredRoute[] = [];
  let fallbackHandler: NotFoundHandler | undefined;

  return {
    add(path, handler) {
      const pattern = parseRoutePath(path);
      if (routes.some((r) => r.pattern.path === pattern.path)) {
        throw new Error(`Route path "${path}" is already registered.`);
      }
      routes.push({ pattern, handler });
    },

    setFallback(handler) {
      fallbackHandler = handler;
    },

    findMatch(target) {
      for (const route of routes) {
        const params = matchRoute(route.pattern, target);
        if (params === null) {
          continue;
        }

        const match: RouterMatch = {
          path: route.pattern.path,
          pathname: target.pathname,
          params,
          searchParams: target.searchParams,
          hash: target.hash,
        };

        return { match, route };
      }

      return null;
    },

    getFallback() {
      return fallbackHandler;
    },
  };
}
