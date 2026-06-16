import { normalizePercentEscapes } from "../core/path";
import type { ConnectRouterLinksOptions } from "./types";

const DEFAULT_LINK_SELECTOR = "a[href]";

/**
 * Enables delegated SPA navigation for same-origin app-local anchors inside the
 * delegated root and returns a disconnect function. Browser selector and DOM API
 * errors, plus errors from intercepted navigation, are not caught.
 */
export function connectRouterLinks(options: ConnectRouterLinksOptions): () => void {
  const root = options.root ?? document;
  const selector = options.selector ?? DEFAULT_LINK_SELECTOR;
  const listener = (event: Event): void => {
    if (!(event instanceof MouseEvent) || shouldKeepNativeClick(event)) {
      return;
    }

    const anchor = findAnchor(event.target, selector);
    if (
      anchor === null ||
      !isInsideDelegatedRoot(anchor, root) ||
      shouldKeepNativeAnchor(anchor) ||
      shouldKeepNativeSameDocumentAnchor(anchor)
    ) {
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

function shouldKeepNativeSameDocumentAnchor(anchor: HTMLAnchorElement): boolean {
  if (!anchor.getAttribute("href")?.includes("#")) {
    return false;
  }

  const url = new URL(anchor.href, window.location.href);

  return (
    url.origin === window.location.origin &&
    normalizePercentEscapes(url.pathname) === normalizePercentEscapes(window.location.pathname) &&
    url.search === window.location.search
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

function isInsideDelegatedRoot(anchor: HTMLAnchorElement, root: ParentNode): boolean {
  return root instanceof Node && root.contains(anchor);
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
