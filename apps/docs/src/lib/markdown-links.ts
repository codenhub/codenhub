import { isTranslationLocale } from "@codenhub/tools/documentation";

interface RewriteOptions {
  packageSlug: string;
  /** The document's path relative to the package `docs/`, its locale folder included. */
  sourceRelativePath: string;
}

function rewriteUrl(url: string, options: RewriteOptions): string {
  if (/^(?:[a-z]+:|\/|#)/i.test(url)) {
    return url;
  }

  const fragmentIndex = url.indexOf("#");
  const pathAndQuery = fragmentIndex === -1 ? url : url.slice(0, fragmentIndex);
  const fragment = fragmentIndex === -1 ? undefined : url.slice(fragmentIndex + 1);
  const queryIndex = pathAndQuery.indexOf("?");
  const targetPath = queryIndex === -1 ? pathAndQuery : pathAndQuery.slice(0, queryIndex);
  const query = queryIndex === -1 ? undefined : pathAndQuery.slice(queryIndex + 1);
  const sourceUrl = new URL(options.sourceRelativePath, "https://docs.codenhub.invalid/docs/");
  const targetUrl = new URL(targetPath, sourceUrl);
  const isDocsTarget = targetUrl.pathname.startsWith("/docs/");
  const targetRelativePath = isDocsTarget ? targetUrl.pathname.slice("/docs/".length) : undefined;
  if (targetRelativePath?.startsWith("internal/")) {
    return url;
  }

  // A translation's route puts its locale before the package slug
  // (`docs/specs/packages-translations.md`, "Documentation site").
  const [firstSegment = "", ...restSegments] = targetRelativePath?.split("/") ?? [];
  const locale = restSegments.length > 0 && isTranslationLocale(firstSegment) ? firstSegment : undefined;
  const routedPath = locale === undefined ? targetRelativePath : restSegments.join("/");
  const isMarkdownTarget = routedPath?.toLowerCase().endsWith(".md") === true;
  const targetRoute = isMarkdownTarget
    ? routedPath!.replace(/(^|\/)index\.md$/i, "").replace(/\.md$/i, "")
    : (routedPath ?? (["/LICENSE", "/NOTICE"].includes(targetUrl.pathname) ? targetUrl.pathname.slice(1) : undefined));
  if (targetRoute === undefined) {
    return url;
  }
  const suffix = `${query === undefined ? "" : `?${query}`}${fragment === undefined ? "" : `#${fragment}`}`;
  const packageRoute = locale === undefined ? `/${options.packageSlug}` : `/${locale}/${options.packageSlug}`;
  const route = `${packageRoute}/${targetRoute}`.replace(/\/$/, "");
  return `${route}${isMarkdownTarget ? "/" : ""}${suffix}`;
}

export function rewritePackageMarkdownLinks(html: string, options: RewriteOptions): string {
  return html.replaceAll(/(?:href|src)=(['"])([^'"]+)\1/g, (attribute, _quote: string, url: string) =>
    attribute.replace(url, rewriteUrl(url, options)),
  );
}
