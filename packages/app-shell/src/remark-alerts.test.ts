import { describe, expect, it } from "vitest";

import { remarkAlerts } from "./remark-alerts.ts";

interface TestNode {
  children?: TestNode[];
  data?: {
    hName?: string;
    hProperties?: Record<string, unknown>;
  };
  type: string;
  value?: string;
}

function createBlockquote(marker: string): TestNode {
  return {
    type: "blockquote",
    children: [
      {
        type: "paragraph",
        children: [
          { type: "text", value: `${marker}\nFormatted ` },
          { type: "strong", children: [{ type: "text", value: "body" }] },
        ],
      },
      {
        type: "paragraph",
        children: [{ type: "text", value: "Second paragraph." }],
      },
    ],
  };
}

function transform(node: TestNode): TestNode {
  const tree = { type: "root", children: [node] };
  remarkAlerts()(tree);
  return tree.children[0];
}

describe("remarkAlerts", () => {
  it.each([
    ["NOTE", "Note", "info"],
    ["TIP", "Tip", "success"],
    ["IMPORTANT", "Important", "important"],
    ["WARNING", "Warning", "warning"],
    ["CAUTION", "Caution", "destructive"],
  ])("transforms %s alerts with semantic intent metadata", (type, title, intent) => {
    const alert = transform(createBlockquote(`[!${type}]`));

    expect(alert.data).toMatchObject({
      hName: "aside",
      hProperties: {
        className: ["markdown-alert", "alert", intent],
        "data-alert-type": type.toLowerCase(),
      },
    });
    expect(alert.children?.[0]).toMatchObject({
      data: { hProperties: { className: ["markdown-alert-title"] } },
      type: "paragraph",
    });
    expect(alert.children?.[0]?.children).toContainEqual({
      type: "text",
      value: title,
    });
  });

  it("preserves body paragraphs and inline formatting", () => {
    const alert = transform(createBlockquote("[!NOTE]"));

    expect(alert.children?.[1]?.children).toEqual([
      { type: "text", value: "Formatted " },
      { type: "strong", children: [{ type: "text", value: "body" }] },
    ]);
    expect(alert.children?.[2]).toEqual({
      type: "paragraph",
      children: [{ type: "text", value: "Second paragraph." }],
    });
  });

  // GitHub wants the marker alone on its line, but several published package
  // READMEs put the text right after it (codenhub/codenhub#395), and the sites
  // render those published copies, so the one-line form is accepted too.
  it("transforms an alert whose text follows the marker on its line", () => {
    const alert = transform(createBlockquote("[!WARNING] This package is experimental."));

    expect(alert.data).toMatchObject({
      hProperties: { "data-alert-type": "warning" },
    });
    expect(alert.children?.[1]?.children).toEqual([
      { type: "text", value: "This package is experimental.\nFormatted " },
      { type: "strong", children: [{ type: "text", value: "body" }] },
    ]);
  });

  it.each(["Ordinary quote", "[!UNKNOWN]\nBody", "[!NOTE]trailing text", "Text before [!NOTE] marker"])(
    "preserves the non-alert blockquote %s",
    (marker) => {
      const quote = createBlockquote(marker);
      const original = structuredClone(quote);

      expect(transform(quote)).toEqual(original);
    },
  );
});
