import { describe, expect, it } from "vitest";

import { remarkAlerts } from "./remark-alerts";

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
      { type: "paragraph", children: [{ type: "text", value: "Second paragraph." }] },
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
    expect(alert.children?.[0]?.children).toContainEqual({ type: "text", value: title });
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

  it.each(["Ordinary quote", "[!UNKNOWN]\nBody", "[!NOTE] trailing text"])(
    "preserves the non-alert blockquote %s",
    (marker) => {
      const quote = createBlockquote(marker);
      const original = structuredClone(quote);

      expect(transform(quote)).toEqual(original);
    },
  );
});
