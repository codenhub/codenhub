import { rehypeHeadingIds } from "@astrojs/markdown-remark";
import { describe, expect, it } from "vitest";

import config from "./astro.config";
import { rehypeMarkdownEnhancements } from "./src/lib/markdown/rehype-enhancements";
import { remarkAlerts } from "./src/lib/markdown/remark-alerts";

interface ConfiguredProcessor {
  options?: {
    rehypePlugins?: unknown[];
    remarkPlugins?: unknown[];
  };
}

describe("Astro Markdown configuration", () => {
  it("uses the AST processor and code block transformer", () => {
    expect(config.markdown?.processor).toBeDefined();
    expect(config.markdown?.shikiConfig?.transformers).toEqual([
      expect.objectContaining({ name: "codenhub-code-block-label" }),
    ]);
  });

  it("installs package documentation validation and resource publication", () => {
    expect(config.integrations).toEqual([expect.objectContaining({ name: "codenhub-package-documentation" })]);
  });

  it("assigns heading ids before adding anchor controls", () => {
    const processor = config.markdown?.processor as ConfiguredProcessor | undefined;

    expect(processor?.options?.rehypePlugins).toEqual([rehypeHeadingIds, rehypeMarkdownEnhancements]);
    expect(processor?.options?.remarkPlugins).toEqual([remarkAlerts]);
  });

  it("runs heading ids before anchor enhancement", () => {
    const processor = config.markdown?.processor as ConfiguredProcessor;
    const [addHeadingIds, addEnhancements] = processor.options!.rehypePlugins! as Array<
      () => (tree: unknown, file?: unknown) => void
    >;
    const heading = {
      type: "element",
      tagName: "h2",
      properties: {},
      children: [{ type: "text", value: "Quick start" }],
    };
    const tree = { type: "root", children: [heading] };

    addHeadingIds!()(tree, { data: { astro: {} }, history: ["test.md"] });
    addEnhancements!()(tree);

    expect(heading.properties).toMatchObject({ id: "quick-start" });
    expect(heading.children.at(-1)).toMatchObject({
      properties: { href: "#quick-start" },
      tagName: "a",
    });
  });
});
