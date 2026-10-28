import { describe, expect, it } from "vitest";

import { buildSiteLlmsTxt } from "./site-llms";

const site = { description: "Shared packages.", siteUrl: "https://docs.example.dev", title: "Example" };

describe("buildSiteLlmsTxt", () => {
  it("links every package's llms files in catalog order", () => {
    const text = buildSiteLlmsTxt(site, [
      { description: "Keyboard shortcuts.", label: "Kbd", name: "@scope/kbd", slug: "kbd", status: "active" },
      { label: "Store", slug: "store", status: "active" },
    ]);

    expect(text).toBe(
      [
        "# Example",
        "",
        "> Shared packages.",
        "",
        "Each package publishes an `llms.txt` that routes to its documentation and an `llms-full.txt` that compiles its README and public documentation into one file. Links to files this site publishes are absolute; other package-relative links, such as `README.md`, stay as authored.",
        "",
        "## Packages",
        "",
        "- [@scope/kbd](https://docs.example.dev/kbd/llms.txt): Keyboard shortcuts.",
        "- [Store](https://docs.example.dev/store/llms.txt)",
        "",
        "## Optional",
        "",
        "- [@scope/kbd full documentation](https://docs.example.dev/kbd/llms-full.txt): The README and every document the package publishes, in one file.",
        "- [Store full documentation](https://docs.example.dev/store/llms-full.txt): The README and every document the package publishes, in one file.",
        "",
      ].join("\n"),
    );
  });

  it("notes a status other than active", () => {
    const text = buildSiteLlmsTxt(site, [
      { description: "Old plugin.", label: "Icons", name: "@scope/icons", slug: "icons", status: "deprecated" },
    ]);

    expect(text).toContain(
      "- [@scope/icons](https://docs.example.dev/icons/llms.txt): Old plugin. Status: deprecated.",
    );
  });
});
