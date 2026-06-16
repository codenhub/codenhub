import { normalizePercentEscapes } from "../core/path";
import type { ConnectRouterLinksOptions } from "./types";

const DEFAULT_LINK_SELECTOR = "a[href]";

/** Enables delegated SPA navigation for same-origin app-local anchors and returns a disconnect function. */
export function connectRouterLinks(options: ConnectRouterLinksOptions): () => void {
  const root = options.root ?? document;
  const selector = options.selector ?? DEFAULT_LINK_SELECTOR;
  const listener = (event: Event): void => {
    if (!(event instanceof MouseEvent) || shouldKeepNativeClick(event)) {
      return;
    }

    const anchor = findAnchor(event.target, selector);
    if (anchor === null || shouldKeepNativeAnchor(anchor)) {
      return;
    }

    const appPath = toAppPath(anchor.href, options.router.href("/"));
    if (appPath === null) {
      return;
    }

    event.preventDefault();
    options.router.navigate(appPath);
  };
  const target = root as EventTarget;

  target.addEventListener("click", listener);

  return () => {
    target.removeEventListener("click", listener);
  };
}

function shouldKeepNativeClick(event: MouseEvent): boolean {
  return (
    event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
  );
}

function shouldKeepNativeAnchor(anchor: HTMLAnchorElement): boolean {
  const target = anchor.getAttribute("target");

  return (
    anchor.hasAttribute("download") ||
    anchor.hasAttribute("data-router-ignore") ||
    (target !== null && target !== "" && target.toLowerCase() !== "_self")
  );
}

function findAnchor(target: EventTarget | null, selector: string): HTMLAnchorElement | null {
  if (!(target instanceof Node)) {
    return null;
  }

  const element = target instanceof Element ? target : target.parentElement;
  const anchor = element?.closest(selector);

  return anchor instanceof HTMLAnchorElement ? anchor : null;
}

function toAppPath(href: string, rootHref: string): string | null {
  const url = new URL(href, window.location.href);
  if (url.origin !== window.location.origin) {
    return null;
  }

  const pathname = normalizePercentEscapes(url.pathname);
  const basePath = getBasePath(rootHref);
  if (basePath === "") {
    return url.pathname + url.search + url.hash;
  }
  if (pathname === basePath || pathname === basePath + "/") {
    return "/" + url.search + url.hash;
  }
  if (pathname.startsWith(basePath + "/")) {
    return url.pathname.slice(basePath.length) + url.search + url.hash;
  }

  return null;
}

function getBasePath(rootHref: string): string {
  const url = new URL(rootHref, window.location.href);
  if (url.origin !== window.location.origin) {
    return "";
  }
  const pathname = normalizePercentEscapes(url.pathname);
  if (pathname === "/") {
    return "";
  }

  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}
