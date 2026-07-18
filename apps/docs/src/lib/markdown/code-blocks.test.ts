import { describe, expect, it } from "vitest";

import { createCodeBlockTransformer, getCodeBlockLabel, parseCodeTitle } from "./code-blocks";

describe("Markdown code block labels", () => {
  it("uses a quoted title from fence metadata", () => {
    expect(getCodeBlockLabel({ language: "ts", meta: 'lineNumbers title="src/file.ts"' })).toBe("src/file.ts");
  });

  it("parses single-quoted titles containing spaces", () => {
    expect(parseCodeTitle("title='src/example file.ts'")).toBe("src/example file.ts");
  });

  it("ignores malformed and empty titles", () => {
    expect(parseCodeTitle('title="" title=unquoted')).toBeUndefined();
  });

  it.each([
    ["ts", "TypeScript"],
    ["js", "JavaScript"],
    ["sh", "Shell"],
    ["html", "HTML"],
    ["unknown-lang", "Unknown lang"],
    [undefined, "Plain text"],
  ])("maps the %s fence to a readable label", (language, label) => {
    expect(getCodeBlockLabel({ language })).toBe(label);
  });

  it("annotates Shiki output with the metadata title", () => {
    const pre = { type: "element", tagName: "pre", properties: {}, children: [] };
    const transformer = createCodeBlockTransformer();

    transformer.pre.call({ options: { lang: "ts", meta: { __raw: 'title="src/file.ts"' } } }, pre);

    expect(pre.properties).toMatchObject({ dataCodeLabel: "src/file.ts" });
  });

  it("annotates existing fences with their readable language", () => {
    const pre = { type: "element", tagName: "pre", properties: {}, children: [] };
    const transformer = createCodeBlockTransformer();

    transformer.pre.call({ options: { lang: "tsx" } }, pre);

    expect(pre.properties).toMatchObject({ dataCodeLabel: "TSX" });
  });
});
