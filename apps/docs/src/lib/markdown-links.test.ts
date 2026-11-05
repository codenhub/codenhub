import { describe, expect, it } from "vitest";

import { rewritePackageMarkdownLinks } from "./markdown-links";

describe("package markdown links", () => {
  it("rewrites package-relative Markdown links", () => {
    const html =
      '<p><a href="../reference.md#errors">Reference</a> <a href="https://example.com/file.md">External</a></p>';

    expect(
      rewritePackageMarkdownLinks(html, {
        packageSlug: "example",
        sourceRelativePath: "guides/setup.md",
      }),
    ).toBe(
      '<p><a href="/example/reference/#errors">Reference</a> <a href="https://example.com/file.md">External</a></p>',
    );
  });

  it("rewrites package-relative assets and legal resources", () => {
    const html = '<p><img src="../assets/setup.svg"><a href="../../NOTICE">Notice</a></p>';

    expect(
      rewritePackageMarkdownLinks(html, {
        packageSlug: "example",
        sourceRelativePath: "guides/setup.md",
      }),
    ).toBe('<p><img src="/example/assets/setup.svg"><a href="/example/NOTICE">Notice</a></p>');
  });

  it("preserves complete queries and fragments when rewriting links", () => {
    expect(
      rewritePackageMarkdownLinks('<a href="reference.md?filter=a?b#first#second">Reference</a>', {
        packageSlug: "example",
        sourceRelativePath: "index.md",
      }),
    ).toBe('<a href="/example/reference/?filter=a?b#first#second">Reference</a>');
  });

  it("routes a translation's links to translated pages under the locale and the rest to English", () => {
    const html = '<a href="./guides/setup.md">Setup</a> <a href="../reference.md">Reference</a>';

    expect(rewritePackageMarkdownLinks(html, { packageSlug: "example", sourceRelativePath: "pt-BR/index.md" })).toBe(
      '<a href="/pt-BR/example/guides/setup/">Setup</a> <a href="/example/reference/">Reference</a>',
    );
  });
});
