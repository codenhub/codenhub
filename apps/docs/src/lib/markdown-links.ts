interface RewriteOptions {
  packageSlug: string;
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

  const isMarkdownTarget = targetRelativePath?.toLowerCase().endsWith(".md") === true;
  const targetRoute = isMarkdownTarget
    ? targetRelativePath!.replace(/(^|\/)index\.md$/i, "").replace(/\.md$/i, "")
    : (targetRelativePath ??
      (["/LICENSE", "/NOTICE"].includes(targetUrl.pathname) ? targetUrl.pathname.slice(1) : undefined));
  if (targetRoute === undefined) {
    return url;
  }
  const suffix = `${query === undefined ? "" : `?${query}`}${fragment === undefined ? "" : `#${fragment}`}`;
  const route = `/${options.packageSlug}/${targetRoute}`.replace(/\/$/, "");
  return `${route}${isMarkdownTarget ? "/" : ""}${suffix}`;
}

export function rewritePackageMarkdownLinks(html: string, options: RewriteOptions): string {
  return html.replaceAll(/(?:href|src)=(['"])([^'"]+)\1/g, (attribute, _quote: string, url: string) =>
    attribute.replace(url, rewriteUrl(url, options)),
  );
}
