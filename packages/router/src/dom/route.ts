import { parseRoutePath } from "../core/path";
import type { DefinePageRouteOptions, PageRoute } from "./types";

/** Defines immutable page route metadata for `mountRouter()` and throws when the route path is invalid. */
export function definePageRoute(options: DefinePageRouteOptions): PageRoute {
  parseRoutePath(options.path);

  const page = options.page === undefined ? undefined : Object.freeze({ ...options.page });
  const route: PageRoute = {
    path: options.path,
    ...(page === undefined ? {} : { page }),
    render: options.render,
    ...(options.destroy === undefined ? {} : { destroy: options.destroy }),
    ...(options.title === undefined ? {} : { title: options.title }),
  };

  return Object.freeze(route);
}
