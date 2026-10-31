import { describe, expect, it } from "vitest";

import { isExternalLink, rehypeMarkdownEnhancements } from "./rehype-enhancements";

interface TestElement {
  children: TestElement[];
  properties?: Record<string, unknown>;
  tagName?: string;
  type: "element" | "root" | "text";
  value?: string;
}

function element(tagName: string, properties: Record<string, unknown>, children: TestElement[]): TestElement {
  return { type: "element", tagName, properties, children };
}

function text(value: string): TestElement {
  return { type: "text", value, children: [] };
}

function transform(children: TestElement[], siteOrigin = "https://docs.example.com"): TestElement {
  const tree: TestElement = { type: "root", children };
  rehypeMarkdownEnhancements({ siteOrigin })(tree);
  return tree;
}

describe("heading anchors", () => {
  it.each(["h4", "h5", "h6"])("adds a permalink to reference member %s", (tagName) => {
    const heading = element(tagName, { id: "settokens" }, [text("setTokens")]);
    const tree: TestElement = { type: "root", children: [heading] };

    rehypeMarkdownEnhancements()(tree, { path: "C:/repo/packages/theme/docs/reference/index.md" });

    expect(heading.children.at(-1)).toMatchObject({
      tagName: "a",
      properties: { href: "#settokens", ariaLabel: "Link to setTokens", className: ["heading-anchor"] },
    });
  });

  it.each(["h2", "h3"])("adds an accessible anchor to %s", (tagName) => {
    const heading = element(tagName, { id: "install" }, [text("Install "), element("code", {}, [text("now")])]);

    transform([heading]);

    expect(heading.children.at(-1)).toMatchObject({
      properties: { ariaLabel: "Link to Install now", className: ["heading-anchor"], href: "#install" },
      tagName: "a",
    });
  });

  it.each(["h1", "h4"])("does not add an anchor to %s", (tagName) => {
    const heading = element(tagName, { id: "heading" }, [text("Heading")]);

    transform([heading]);

    expect(heading.children).toEqual([text("Heading")]);
  });

  it("offers a line break after each slash of a reference page's import specifier", () => {
    const heading = element("h1", { id: "codenhuberrorregistriesbrowser" }, [
      text("@codenhub/error/registries/browser"),
    ]);
    const tree: TestElement = { type: "root", children: [heading] };

    rehypeMarkdownEnhancements()(tree, { path: "C:/repo/packages/error/docs/reference/registries/browser.md" });

    expect(heading.children).toEqual([
      text("@codenhub/"),
      element("wbr", {}, []),
      text("error/"),
      element("wbr", {}, []),
      text("registries/"),
      element("wbr", {}, []),
      text("browser"),
    ]);
    expect(heading.properties?.className).toEqual(["reference-title"]);
  });

  it("leaves slashes in a guide's title alone", () => {
    const heading = element("h1", { id: "a-b" }, [text("Read/write")]);

    transform([heading]);

    expect(heading.children).toEqual([text("Read/write")]);
    expect(heading.properties?.className).toBeUndefined();
  });

  it("marks each reference H3 as a symbol section", () => {
    const symbol = element("h3", { id: "apperror" }, [text("AppError")]);
    const member = element("h4", { id: "code" }, [text("code")]);
    const tree: TestElement = { type: "root", children: [symbol, member] };

    rehypeMarkdownEnhancements()(tree, { path: "/repo/packages/error/docs/reference/index.md" });

    expect(symbol.properties?.className).toEqual(["reference-symbol"]);
    expect(member.properties?.className).toBeUndefined();
  });

  it("leaves a heading without an id unchanged", () => {
    const heading = element("h2", {}, [text("Heading")]);

    transform([heading]);

    expect(heading.children).toEqual([text("Heading")]);
  });
});

describe("external links", () => {
  it.each([
    ["https://other.example/path", true],
    ["http://other.example/path", true],
    ["https://docs.example.com/path", false],
    ["/packages/", false],
    ["../reference/", false],
    ["#install", false],
    ["mailto:hello@example.com", false],
  ])("classifies %s", (href, expected) => {
    expect(isExternalLink(href, "https://docs.example.com")).toBe(expected);
  });

  it("adds accessible SVG treatment and rel without changing navigation", () => {
    const link = element("a", { href: "https://other.example/path" }, [text("Other")]);

    transform([link]);

    expect(link.properties).toMatchObject({
      className: ["external-link"],
      href: "https://other.example/path",
      rel: ["external"],
    });
    expect(link.properties).not.toHaveProperty("target");
    expect(link.children.at(-1)).toMatchObject({
      properties: { ariaHidden: "true", className: ["external-link-icon"] },
      tagName: "span",
    });
  });

  it.each(["/packages/", "https://docs.example.com/packages/"])("leaves the internal link %s unchanged", (href) => {
    const link = element("a", { href }, [text("Internal")]);
    const original = structuredClone(link);

    transform([link]);

    expect(link).toEqual(original);
  });
});

describe("code blocks", () => {
  it("marks reference signatures and overloads for wrapping without changing code text", () => {
    const signature = "export declare function ok(): Ok<void>;\n";
    const overload = "export declare function ok<T>(value: T): Ok<T>;\n";
    const pre = (value: string) => element("pre", { dataLanguage: "ts" }, [element("code", {}, [text(value)])]);
    const first = pre(signature);
    const second = pre(overload);
    const example = pre("const result = ok(1);\n");
    const tree: TestElement = {
      type: "root",
      children: [
        element("h3", { id: "ok" }, [text("ok")]),
        text("\n"),
        first,
        element("p", {}, [text("Creates a result.")]),
        second,
        element("p", {}, [element("strong", {}, [text("Example")])]),
        example,
      ],
    };

    rehypeMarkdownEnhancements()(tree, { path: "C:/repo/packages/error/docs/reference/index.md" });

    expect(first.properties?.dataReferenceSignature).toBe("");
    expect(second.properties?.dataReferenceSignature).toBe("");
    expect(example.properties?.dataReferenceSignature).toBeUndefined();
    expect(first.children[0]?.children).toEqual([text(signature)]);
    expect(second.children[0]?.children).toEqual([text(overload)]);
  });

  it.each(["guides/setup.md", "reference.md"])("keeps code in %s horizontally scrollable", (relativePath) => {
    const pre = element("pre", { dataLanguage: "ts" }, [element("code", {}, [text("export type Long = string;")])]);
    const tree: TestElement = {
      type: "root",
      children: [element("h3", {}, [text("Long")]), pre],
    };

    rehypeMarkdownEnhancements()(tree, { path: `C:/repo/packages/error/docs/${relativePath}` });

    expect(pre.properties?.dataReferenceSignature).toBeUndefined();
  });

  it("wraps highlighted code with a labelled header and native copy button", () => {
    const code = element("code", {}, [text("const value = 1;\n")]);
    const pre = element("pre", { className: ["astro-code"], dataCodeLabel: "src/file.ts" }, [code]);
    const tree = transform([pre]);
    const figure = tree.children[0];

    expect(figure).toMatchObject({
      properties: { className: ["code-block"] },
      tagName: "figure",
    });
    expect(figure.children[0]).toMatchObject({
      properties: { className: ["code-block-header"] },
      tagName: "figcaption",
    });
    expect(figure.children[0]?.children[0]).toEqual({
      type: "text",
      value: "src/file.ts",
      children: [],
    });
    expect(figure.children[0]?.children[1]).toMatchObject({
      properties: {
        ariaDescribedBy: "code-copy-status-1",
        ariaLabel: "Copy src/file.ts code",
        className: ["code-copy-button"],
        dataCodeCopy: "",
        title: "Copy code",
        type: "button",
      },
      tagName: "button",
    });
    expect(figure.children[0]?.children[2]).toMatchObject({
      children: [{ type: "text", value: "" }],
      properties: {
        ariaLive: "polite",
        className: ["code-copy-status", "sr-only"],
        id: "code-copy-status-1",
      },
      tagName: "span",
    });
    expect(figure.children[1]).toBe(pre);
  });

  it("associates repeated code blocks with distinct polite status output", () => {
    const firstPre = element("pre", { dataCodeLabel: "TypeScript" }, [element("code", {}, [])]);
    const secondPre = element("pre", { dataCodeLabel: "Shell" }, [element("code", {}, [])]);
    const tree = transform([firstPre, secondPre]);
    const firstHeader = tree.children[0]!.children[0]!;
    const secondHeader = tree.children[1]!.children[0]!;

    expect(firstHeader.children[1]?.properties?.ariaDescribedBy).toBe("code-copy-status-1");
    expect(firstHeader.children[2]?.properties?.id).toBe("code-copy-status-1");
    expect(secondHeader.children[1]?.properties?.ariaDescribedBy).toBe("code-copy-status-2");
    expect(secondHeader.children[2]?.properties?.id).toBe("code-copy-status-2");
  });

  it("does not wrap an ordinary preformatted block", () => {
    const pre = element("pre", {}, [text("plain")]);
    const tree = transform([pre]);

    expect(tree.children[0]).toBe(pre);
  });
});

describe("tables", () => {
  it("wraps a table in a horizontal-overflow container", () => {
    const table = element("table", {}, [
      element("tbody", {}, [element("tr", {}, [element("td", {}, [text("cell")])])]),
    ]);
    const tree = transform([table]);
    const wrapper = tree.children[0];

    expect(wrapper).toMatchObject({ properties: { className: ["table-wrap"] }, tagName: "div" });
    expect(wrapper.children[0]).toBe(table);
    expect(table.properties?.className).toEqual(["edged", "ruled"]);
  });

  it("enhances links inside table cells before wrapping", () => {
    const link = element("a", { href: "https://other.example/x" }, [text("Ref")]);
    const table = element("table", {}, [element("tbody", {}, [element("tr", {}, [element("td", {}, [link])])])]);
    transform([table]);

    expect(link.properties).toMatchObject({ className: ["external-link"], rel: ["external"] });
  });
});
