interface RewriteOptions {
  packageSlug: string;
  sourceRelativePath: string;
}

function rewriteUrl(url: string, options: RewriteOptions): string {
  if (/^(?:[a-z]+:|\/|#)/i.test(url)) {
    return url;
  }

  const [pathAndQuery, fragment] = url.split("#", 2);
  const [targetPath, query] = pathAndQuery.split("?", 2);
  if (!targetPath.toLowerCase().endsWith(".md")) {
    return url;
  }

  const sourceUrl = new URL(options.sourceRelativePath, "https://docs.codenhub.invalid/docs/");
  const targetUrl = new URL(targetPath, sourceUrl);
  if (!targetUrl.pathname.startsWith("/docs/")) {
    return url;
  }
  const targetRelativePath = targetUrl.pathname.slice("/docs/".length);
  if (targetRelativePath.startsWith("internal/")) {
    return url;
  }

  const targetRoute = targetRelativePath.replace(/(^|\/)index\.md$/i, "").replace(/\.md$/i, "");
  const suffix = `${query === undefined ? "" : `?${query}`}${fragment === undefined ? "" : `#${fragment}`}`;
  return `/${options.packageSlug}/${targetRoute}`.replace(/\/$/, "") + `/${suffix}`;
}

export function rewritePackageMarkdownLinks(html: string, options: RewriteOptions): string {
  return html.replaceAll(/href=(['"])([^'"]+)\1/g, (attribute, _quote: string, url: string) =>
    attribute.replace(url, rewriteUrl(url, options)),
  );
}
