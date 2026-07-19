import { describe, expect, it } from "vitest";

import { createDocumentGraph, validateDocumentGraph } from "./document-graph";

const BASE_FILES = {
  "README.md": "# Example\n\n[Docs](docs/index.md)",
  "docs/index.md": "---\ntitle: Example\n---\n\n# Example\n\n## Quick start",
  "llms-full.txt": "# Example\n\n[Docs](docs/index.md)",
  "llms.txt": "# Example\n\n[Docs](docs/index.md)",
};

function getIssueCodes(
  files: Record<string, string>,
  npmFiles: string[] = Object.keys(files),
  siteFiles: string[] = Object.keys(files).filter(
    (filePath) =>
      filePath === "LICENSE" ||
      filePath === "NOTICE" ||
      (filePath.startsWith("docs/") && !filePath.startsWith("docs/internal/")),
  ),
): string[] {
  const graph = createDocumentGraph(files);
  return validateDocumentGraph(graph, {
    npmFiles: new Set(npmFiles),
    siteFiles: new Set(siteFiles),
  }).map(({ code }) => code);
}

describe("package document graph", () => {
  it("discovers every validation surface and excludes internal Markdown", () => {
    const graph = createDocumentGraph({
      ...BASE_FILES,
      "docs/guide.md": "# Guide",
      "docs/internal/decision.md": "# Decision\n\n[Missing](missing.md)",
    });

    expect(graph.documents.map(({ path }) => path)).toEqual([
      "README.md",
      "docs/guide.md",
      "docs/index.md",
      "llms-full.txt",
      "llms.txt",
    ]);
  });

  it("rejects a malformed external URL without making a request", () => {
    expect(getIssueCodes({ ...BASE_FILES, "README.md": "# Example\n\n[Bad](https://[invalid)" })).toContain(
      "invalid-external-url",
    );
  });

  it("rejects a path that escapes the package root", () => {
    expect(getIssueCodes({ ...BASE_FILES, "README.md": "# Example\n\n[Outside](../outside.md)" })).toContain(
      "package-root-escape",
    );
  });

  it("rejects site-root paths that are not package-relative", () => {
    expect(getIssueCodes({ ...BASE_FILES, "README.md": "# Example\n\n[Docs](/docs/index.md)" })).toContain(
      "package-root-escape",
    );
  });

  it("rejects links from public docs into internal docs", () => {
    expect(
      getIssueCodes({
        ...BASE_FILES,
        "docs/index.md": "# Example\n\n[Decision](internal/decision.md)",
        "docs/internal/decision.md": "# Decision",
      }),
    ).toContain("internal-target");
  });

  it("rejects a missing local target including image assets", () => {
    expect(getIssueCodes({ ...BASE_FILES, "docs/index.md": "# Example\n\n![Diagram](assets/missing.svg)" })).toContain(
      "missing-target",
    );
  });

  it("rejects missing local targets in authored HTML", () => {
    expect(
      getIssueCodes({ ...BASE_FILES, "docs/index.md": '# Example\n\n<img src="assets/missing.svg" alt="">' }),
    ).toContain("missing-target");
  });

  it("rejects a package file that the documentation site does not publish", () => {
    expect(
      getIssueCodes(
        { ...BASE_FILES, LICENSE: "License", "docs/index.md": "# Example\n\n[License](../LICENSE)" },
        [...Object.keys(BASE_FILES), "LICENSE"],
        Object.keys(BASE_FILES).filter((filePath) => filePath.startsWith("docs/")),
      ),
    ).toContain("site-unpublished-target");
  });

  it("allows root README and LLM surfaces to link npm-published package files", () => {
    expect(
      getIssueCodes({ ...BASE_FILES, "llms.txt": "# Example\n\n[Readme](README.md)" }, Object.keys(BASE_FILES)),
    ).not.toContain("site-unpublished-target");
  });

  it("rejects a package-owned target absent from the npm pack inventory", () => {
    expect(
      getIssueCodes(
        {
          ...BASE_FILES,
          "docs/assets/diagram.svg": "<svg/>",
          "docs/index.md": "# Example\n\n![Diagram](assets/diagram.svg)",
        },
        Object.keys(BASE_FILES),
      ),
    ).toContain("npm-unpublished-target");
  });

  it("validates fragments with deterministic GitHub-compatible duplicate slugs", () => {
    expect(
      getIssueCodes({
        ...BASE_FILES,
        "README.md": "# Example\n\n[Second](docs/index.md#quick-start-1)",
        "docs/index.md": "# Example\n\n## Quick start\n\n## Quick start",
      }),
    ).not.toContain("invalid-fragment");
  });

  it("matches rendered heading text when headings contain inline HTML", () => {
    expect(
      getIssueCodes({
        ...BASE_FILES,
        "README.md": "# Example\n\n[Section](docs/index.md#hello-world)",
        "docs/index.md": "# Example\n\n## Hello <em>world</em>",
      }),
    ).not.toContain("invalid-fragment");
  });

  it("uses the first duplicate reference definition", () => {
    expect(
      getIssueCodes({
        ...BASE_FILES,
        "README.md": "# Example\n\n[Docs][docs]\n\n[docs]: docs/index.md\n[docs]: docs/missing.md",
      }),
    ).not.toContain("missing-target");
  });

  it("rejects a fragment absent from the target Markdown headings", () => {
    expect(getIssueCodes({ ...BASE_FILES, "README.md": "# Example\n\n[No section](docs/index.md#missing)" })).toContain(
      "invalid-fragment",
    );
  });

  it("allows public docs to escape docs only for package-root legal files", () => {
    const files = {
      ...BASE_FILES,
      LICENSE: "License",
      "docs/guides/setup.md": "# Setup\n\n[License](../../LICENSE)",
    };

    expect(getIssueCodes(files, Object.keys(files))).toEqual([]);
  });

  it("rejects non-legal escapes from public docs", () => {
    expect(
      getIssueCodes({
        ...BASE_FILES,
        "docs/index.md": "# Example\n\n[Manifest](../package.json)",
        "package.json": "{}",
      }),
    ).toContain("invalid-docs-escape");
  });

  it("resolves llms-full Markdown links from the package root", () => {
    expect(
      getIssueCodes({ ...BASE_FILES, "llms-full.txt": "# Example\n\n[Quick start](docs/index.md#quick-start)" }),
    ).toEqual([]);
  });

  it("reports missing required documentation surfaces", () => {
    expect(getIssueCodes({ "README.md": "# Example" }, ["README.md"])).toContain("missing-required-surface");
  });

  it("reports internal documentation included by npm pack", () => {
    expect(getIssueCodes(BASE_FILES, [...Object.keys(BASE_FILES), "docs/internal/decision.md"])).toContain(
      "internal-published",
    );
  });

  it("reports a public Markdown document omitted from npm pack", () => {
    expect(getIssueCodes({ ...BASE_FILES, "docs/guide.md": "# Guide" }, Object.keys(BASE_FILES))).toContain(
      "npm-unpublished-target",
    );
  });

  it("reports an unlinked public resource omitted from npm pack", () => {
    expect(
      getIssueCodes({ ...BASE_FILES, "docs/assets/diagram.svg": "<svg/>" }, Object.keys(BASE_FILES), [
        ...Object.keys(BASE_FILES),
        "docs/assets/diagram.svg",
      ]),
    ).toContain("npm-unpublished-target");
  });
});
