import { describe, expect, it } from "vitest";

import { parseMarkdown } from "./document-policy.ts";
import { orderLlmsFullDocuments, orderLlmsFullSources, rebaseMarkdownTargets, renderLlmsFull } from "./llms-full.ts";

describe("parseMarkdown", () => {
  it("shouldSplitFrontmatterFromTheAuthoredBody", () => {
    expect(parseMarkdown("---\ntitle: Example\ndescription: A page.\n---\n\n# Example\n")).toEqual({
      body: "\n# Example\n",
      frontmatter: { description: "A page.", title: "Example" },
    });
  });

  it("shouldUnquoteScalarValues", () => {
    expect(parseMarkdown('---\ntitle: "Example: subtitle"\n---\n# Example').frontmatter).toEqual({
      title: "Example: subtitle",
    });
  });

  it("shouldKeepDocumentsWithoutFrontmatterIntact", () => {
    expect(parseMarkdown("# Example\n\n---\n")).toEqual({ body: "# Example\n\n---\n", frontmatter: {} });
  });
});

describe("orderLlmsFullSources", () => {
  it("shouldPlaceTheReadmeFirstAndTheDocumentationIndexBeforeOtherPages", () => {
    expect(
      orderLlmsFullSources([
        "README.md",
        "docs/reference.md",
        "docs/guides/setup.md",
        "docs/index.md",
        "docs/internal/decisions.md",
        "src/index.ts",
      ]),
    ).toEqual(["README.md", "docs/index.md", "docs/guides/setup.md", "docs/reference.md"]);
  });

  it("shouldOmitAMissingReadmeRatherThanFailing", () => {
    expect(orderLlmsFullSources(["docs/index.md"])).toEqual(["docs/index.md"]);
  });
});

describe("orderLlmsFullDocuments", () => {
  it("shouldOrderTheWaySidebarDoesWithFolderPagesInlinedAfterTheirIndex", () => {
    const documents = [
      { body: "", order: 5, sourcePath: "docs/reference.md" },
      { body: "", sourcePath: "docs/concepts.md" },
      { body: "", order: 2, sourcePath: "docs/guides/index.md" },
      { body: "", sourcePath: "docs/guides/alpha.md" },
      { body: "", order: 1, sourcePath: "docs/guides/zeta.md" },
      { body: "", sourcePath: "docs/index.md" },
    ];

    expect(orderLlmsFullDocuments(documents).map((document) => document.sourcePath)).toEqual([
      "docs/index.md",
      "docs/guides/index.md",
      "docs/guides/zeta.md",
      "docs/guides/alpha.md",
      "docs/reference.md",
      "docs/concepts.md",
    ]);
  });
});

describe("rebaseMarkdownTargets", () => {
  it("shouldResolveRelativeTargetsAgainstThePackageRoot", () => {
    expect(rebaseMarkdownTargets("[Reference](reference.md) ![Diagram](assets/diagram.svg)", "docs")).toBe(
      "[Reference](docs/reference.md) ![Diagram](docs/assets/diagram.svg)",
    );
  });

  it("shouldPreserveFragmentsWhileRebasing", () => {
    expect(rebaseMarkdownTargets("[Errors](reference.md#errors)", "docs")).toBe("[Errors](docs/reference.md#errors)");
  });

  it("shouldLeaveExternalRootRelativeAndAnchorTargetsAlone", () => {
    const body = "[Site](https://example.com) [Root](/index.md) [Here](#usage)";

    expect(rebaseMarkdownTargets(body, "docs")).toBe(body);
  });

  it("shouldRebaseReferenceDefinitionsAndHtmlAttributes", () => {
    expect(rebaseMarkdownTargets('[ref]: reference.md\n<img src="assets/diagram.svg">', "docs")).toBe(
      '[ref]: docs/reference.md\n<img src="docs/assets/diagram.svg">',
    );
  });

  it("shouldNotRewritePathsInsideCodeBlocksOrSpans", () => {
    const body = "```sh\ncat [x](reference.md)\n```\n\nUse `[x](reference.md)` verbatim.";

    expect(rebaseMarkdownTargets(body, "docs")).toBe(body);
  });

  it("shouldNotRewritePathsInsideIndentedCodeBlocks", () => {
    const body = "Example:\n\n    [x](reference.md)\n";

    expect(rebaseMarkdownTargets(body, "docs")).toBe(body);
  });

  it("shouldNotRewritePathsInsideTildeFencedBlocks", () => {
    const body = "~~~sh\ncat [x](reference.md)\n~~~\n";

    expect(rebaseMarkdownTargets(body, "docs")).toBe(body);
  });

  it("shouldStillRebaseTargetsSurroundingACodeBlock", () => {
    expect(rebaseMarkdownTargets("[Before](a.md)\n\n```\n[x](b.md)\n```\n\n[After](c.md)", "docs")).toBe(
      "[Before](docs/a.md)\n\n```\n[x](b.md)\n```\n\n[After](docs/c.md)",
    );
  });

  it("shouldKeepTargetsThatWouldEscapeThePackageRoot", () => {
    expect(rebaseMarkdownTargets("[License](../LICENSE)", "docs")).toBe("[License](LICENSE)");
    expect(rebaseMarkdownTargets("[Outside](../../elsewhere.md)", "docs")).toBe("[Outside](../../elsewhere.md)");
  });
});

describe("renderLlmsFull", () => {
  it("shouldIdentifyEverySourceDocumentAndSeparateSections", () => {
    expect(
      renderLlmsFull([
        { body: "# Example\n\n[Docs](docs/index.md)\n", sourcePath: "README.md" },
        { body: "\n# Overview\n\n[Reference](reference.md)\n", sourcePath: "docs/index.md" },
      ]),
    ).toBe(
      [
        "<!-- Source: README.md -->",
        "",
        "# Example",
        "",
        "[Docs](docs/index.md)",
        "",
        "<!-- Source: docs/index.md -->",
        "",
        "# Overview",
        "",
        "[Reference](docs/reference.md)",
        "",
      ].join("\n"),
    );
  });
});
