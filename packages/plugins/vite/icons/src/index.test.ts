import { describe, expect, it } from "vitest";

import { iconsPlugin } from "./index";

interface MinimalIndexHtmlTransformContext {
  path: string;
  filename: string;
}

type IndexHtmlHandler = (this: unknown, html: string, context: MinimalIndexHtmlTransformContext) => unknown;
type TransformHandler = (this: unknown, code: string, id: string) => unknown;

function getTransformIndexHtmlHandler(options?: Parameters<typeof iconsPlugin>[0]): IndexHtmlHandler {
  const plugin = iconsPlugin(options);
  const { transformIndexHtml } = plugin;

  if (!transformIndexHtml) {
    throw new Error("iconsPlugin transformIndexHtml handler is not available");
  }

  if (typeof transformIndexHtml === "function") {
    return transformIndexHtml as IndexHtmlHandler;
  }

  return transformIndexHtml.handler as IndexHtmlHandler;
}

function getTransformHook(options?: Parameters<typeof iconsPlugin>[0]): TransformHandler {
  const plugin = iconsPlugin(options);
  const { transform } = plugin;

  if (!transform) {
    throw new Error("iconsPlugin transform hook is not available");
  }

  if (typeof transform === "function") {
    return transform as TransformHandler;
  }

  return transform.handler as TransformHandler;
}

async function runTransformIndexHtml(html: string, options?: Parameters<typeof iconsPlugin>[0]): Promise<string> {
  const transformIndexHtml = getTransformIndexHtmlHandler(options);
  const context: MinimalIndexHtmlTransformContext = { path: "/index.html", filename: "index.html" };
  const transformed = await transformIndexHtml.call({}, html, context);

  if (typeof transformed === "string") {
    return transformed;
  }

  throw new Error("iconsPlugin transformIndexHtml handler returned a non-string result");
}

async function runTransform(
  code: string,
  id: string,
  options?: Parameters<typeof iconsPlugin>[0],
): Promise<{ code: string; map: null } | null> {
  const transform = getTransformHook(options);
  const transformed = await transform.call({}, code, id);

  if (transformed === null || transformed === undefined) {
    return null;
  }

  if (typeof transformed === "string") {
    return { code: transformed, map: null };
  }

  if (typeof transformed === "object" && "code" in transformed && typeof transformed.code === "string") {
    return { code: transformed.code, map: null };
  }

  throw new Error("iconsPlugin transform hook returned an unsupported result");
}

describe("iconsPlugin", () => {
  it("should move non-icon classes from the marker element to the rendered svg", async () => {
    const transformed = await runTransformIndexHtml(`<div><i class="ic-success size-4 text-green-500"></i></div>`);

    expect(transformed).toContain(`<svg class="size-4 text-green-500"`);
    expect(transformed).not.toContain("ic-success");
  });

  it("should keep passthrough attributes around class", async () => {
    const transformed = await runTransformIndexHtml(
      `<div><i id="status" class="ic-info size-4" aria-hidden="true"></i></div>`,
    );

    expect(transformed).toContain(`<svg class="size-4" id="status" aria-hidden="true"`);
  });

  it("should consume explicit closing icon marker tags", async () => {
    const transformed = await runTransformIndexHtml(`<button><i class="ic-sun block"></i></button>`);

    expect(transformed).toContain(`<svg class="block"`);
    expect(transformed).not.toContain("</i>");
  });

  it("should replace when a valid icon marker appears after an invalid marker", async () => {
    const transformed = await runTransformIndexHtml(`<div><i class="ic-missing text-red ic-error"></i></div>`);

    expect(transformed).toContain(`<svg class="ic-missing text-red"`);
    expect(transformed).not.toContain("<i class=");
  });

  it("should keep html unchanged for unknown icon names", async () => {
    const html = `<div><i class="ic-does-not-exist text-blue"></i></div>`;

    expect(await runTransformIndexHtml(html)).toBe(html);
  });

  it("should resolve alternative icon names", async () => {
    const transformed = await runTransformIndexHtml(`<button><i class="ic-dismiss size-4"></i></button>`);

    expect(transformed).toContain(`<svg class="size-4"`);
    expect(transformed).toContain(`<path d="M18 6 6 18"`);
    expect(transformed).not.toContain("ic-dismiss");
  });

  it("should not leak regex state across calls", async () => {
    const first = await runTransformIndexHtml(`<div><i class="ic-success"></i></div>`);
    const second = await runTransformIndexHtml(`<div><i class="ic-error"></i></div>`);

    expect(first).toContain("<svg");
    expect(second).toContain("<svg");
  });

  it("should transform JS/TS files and ignore unsupported extensions", async () => {
    const supported = await runTransform(`<i class="ic-warning utility"></i>`, "entry.ts?import");
    const unsupported = await runTransform(`<i class="ic-warning utility"></i>`, "styles.css");

    expect(supported).toMatchObject({ map: null });
    expect(supported?.code ?? "").toContain(`<svg class="utility"`);
    expect(unsupported).toBeNull();
  });

  it("should match className in JSX/TSX and output className on svg", async () => {
    const supported = await runTransform(`<i className="ic-warning utility"></i>`, "Component.tsx");
    expect(supported).toMatchObject({ map: null });
    expect(supported?.code ?? "").toContain(`<svg className="utility"`);
  });
});

describe("iconsPlugin — custom icons option", () => {
  it("should resolve a consumer-supplied icon that is not in the built-in registry", async () => {
    const options = {
      icons: { star: `<svg viewBox="0 0 24 24"><path d="M12 2l3 7h7l-6 5 2 7-6-4-6 4 2-7-6-5h7z"/></svg>` },
    };
    const transformed = await runTransformIndexHtml(`<div><i class="ic-star"></i></div>`, options);

    expect(transformed).toContain(`<svg viewBox="0 0 24 24"`);
    expect(transformed).not.toContain("ic-star");
  });

  it("should let consumer icons override built-in icons of the same name", async () => {
    const customMarkup = `<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="5"/></svg>`;
    const options = { icons: { close: customMarkup } };
    const transformed = await runTransformIndexHtml(`<i class="ic-close"></i>`, options);

    expect(transformed).toContain(customMarkup);
    expect(transformed).not.toContain(`<path d="M18 6 6 18"`);
  });

  it("should resolve consumer icons via their alternativeNames", async () => {
    const markup = `<svg viewBox="0 0 24 24"><rect width="24" height="24"/></svg>`;
    const options = {
      icons: { square: { markup, alternativeNames: ["rect", "box"] } },
    };
    const byAlias = await runTransformIndexHtml(`<i class="ic-rect"></i>`, options);
    const byPrimary = await runTransformIndexHtml(`<i class="ic-square"></i>`, options);

    expect(byAlias).toContain(`<rect width="24"`);
    expect(byPrimary).toContain(`<rect width="24"`);
  });

  it("should still resolve built-in icons when consumer icons are provided", async () => {
    const options = {
      icons: { star: `<svg viewBox="0 0 24 24"><path d="M12 2l3 7h7z"/></svg>` },
    };
    const transformed = await runTransformIndexHtml(`<i class="ic-success"></i>`, options);

    expect(transformed).toContain(`<svg`);
    expect(transformed).not.toContain("ic-success");
  });

  describe("shouldClear option", () => {
    it("should not resolve built-in icons when shouldClear is true", async () => {
      const transformed = await runTransformIndexHtml(`<i class="ic-success"></i>`, { shouldClear: true });

      expect(transformed).toBe(`<i class="ic-success"></i>`);
    });

    it("should resolve consumer icons when shouldClear is true", async () => {
      const customMarkup = `<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="5"/></svg>`;
      const options = { shouldClear: true, icons: { custom: customMarkup } };
      const transformed = await runTransformIndexHtml(`<i class="ic-custom"></i>`, options);

      expect(transformed).toContain(customMarkup);
      expect(transformed).not.toContain("ic-custom");
    });
  });

  describe("JS context quote escaping and stroke-width verification", () => {
    it("should escape double quotes when matching class inside double-quoted JS string context", async () => {
      const jsCode = `const icon = "<div><i class='ic-success size-4'></i></div>";`;
      const result = await runTransform(jsCode, "entry.ts");
      expect(result).not.toBeNull();
      expect(result?.code).toContain('xmlns=\\"http://www.w3.org/2000/svg\\"');
      expect(result?.code).toContain('const icon = "<div><svg');
      expect(result?.code).toContain("class='size-4'");
    });

    it("should keep stroke-width='2' in the transformed SVGs", async () => {
      const transformed = await runTransformIndexHtml(`<div><i class="ic-search"></i></div>`);
      expect(transformed).toContain('stroke-width="2"');
    });

    it("should not corrupt JSX tags when preceding attribute has quotes on same line", async () => {
      const jsxCode = `const b = <span className="label">Label</span> <i className="ic-success size-4" />;`;
      const result = await runTransform(jsxCode, "Component.tsx");
      expect(result).not.toBeNull();
      expect(result?.code).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(result?.code).not.toContain('xmlns=\\"');
    });

    it("should escape double quotes in multiline JS string with backslash-newline", async () => {
      const jsCode = `const icon = "<div>\\\n  <i class='ic-success'></i>\\\n</div>";`;
      const result = await runTransform(jsCode, "entry.ts");
      expect(result).not.toBeNull();
      expect(result?.code).toContain('xmlns=\\"http://www.w3.org/2000/svg\\"');
    });

    it("should not be confused by quotes inside comments", async () => {
      const jsCode = `// const a = "hello"\nconst icon = "<div><i class='ic-success'></i></div>";`;
      const result = await runTransform(jsCode, "entry.ts");
      expect(result).not.toBeNull();
      expect(result?.code).toContain('xmlns=\\"http://www.w3.org/2000/svg\\"');
    });

    it("should not be confused by quotes inside regular expressions", async () => {
      const jsCode = `const r = /"/; const icon = "<i class='ic-success'></i>";`;
      const result = await runTransform(jsCode, "entry.ts");
      expect(result).not.toBeNull();
      expect(result?.code).toContain('xmlns=\\"http://www.w3.org/2000/svg\\"');
    });

    it("should not be confused by quotes inside regular expressions in single quotes", async () => {
      const jsCode = `const r = /"/; const icon = '<i class="ic-success"></i>';`;
      const result = await runTransform(jsCode, "entry.ts");
      expect(result).not.toBeNull();
      expect(result?.code).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(result?.code).not.toContain('xmlns=\\"');
    });

    it("should transform double-escaped class quotes in double-quoted JS string literals", async () => {
      const jsCode = `const icon = "<div><i class=\\"ic-success size-4\\"></i></div>";`;
      const result = await runTransform(jsCode, "entry.ts");
      expect(result).not.toBeNull();
      expect(result?.code).toContain('class=\\"size-4\\"');
      expect(result?.code).toContain('xmlns=\\"http://www.w3.org/2000/svg\\"');
    });

    it("should not be confused by regex after a line comment", async () => {
      const jsCode = `const r =\n  // comment\n  /"/;\nconst icon = "<i class='ic-success'></i>";`;
      const result = await runTransform(jsCode, "entry.ts");
      expect(result).not.toBeNull();
      expect(result?.code).toContain('xmlns=\\"http://www.w3.org/2000/svg\\"');
    });

    it("should not be confused by regex after a block comment", async () => {
      const jsCode = `const r = /* comment */ /"/;\nconst icon = "<i class='ic-success'></i>";`;
      const result = await runTransform(jsCode, "entry.ts");
      expect(result).not.toBeNull();
      expect(result?.code).toContain('xmlns=\\"http://www.w3.org/2000/svg\\"');
    });

    it("should escape single quotes in single-quoted JS string context when SVG has single quotes", async () => {
      const options = {
        icons: {
          test: `<svg class='foo' id='bar'></svg>`,
        },
      };
      const jsCode = `const icon = '<div><i class="ic-test"></i></div>';`;
      const result = await runTransform(jsCode, "entry.ts", options);
      expect(result).not.toBeNull();
      expect(result?.code).toContain("class=\\'foo\\'");
      expect(result?.code).toContain("id=\\'bar\\'");
    });

    it("should escape backticks and template literals in backtick JS string context when SVG has backticks or template sequences", async () => {
      const options = {
        icons: {
          test: `<svg class='foo' data-val="\`hello\`" id="\${expr}"></svg>`,
        },
      };
      const jsCode = `const icon = \`<div><i class="ic-test"></i></div>\`;`;
      const result = await runTransform(jsCode, "entry.ts", options);
      expect(result).not.toBeNull();
      expect(result?.code).toContain('data-val="\\`hello\\`"');
      expect(result?.code).toContain('id="\\${expr}"');
    });
  });

  describe("HTML transform literal blocks", () => {
    it("should ignore HTML comments, pre, and noscript blocks, but process script and style tags", async () => {
      const inputHtml = `
        <div>
          <!-- <i class="ic-success"></i> -->
          <pre><i class="ic-success"></i></pre>
          <noscript><i class="ic-success"></i></noscript>
          <style>
            .icon-test {
              background: url('<i class="ic-success"></i>');
            }
          </style>
          <script>
            const iconStr = '<i class="ic-success"></i>';
          </script>
        </div>
      `.trim();

      const result = await runTransformIndexHtml(inputHtml);

      // Verify shielded blocks are untouched
      expect(result).toContain('<!-- <i class="ic-success"></i> -->');
      expect(result).toContain('<pre><i class="ic-success"></i></pre>');
      expect(result).toContain('<noscript><i class="ic-success"></i></noscript>');

      // Verify unshielded blocks (script, style) are replaced
      expect(result).toContain("background: url('<svg");
      expect(result).toContain("const iconStr = '<svg");
      expect(result).not.toContain('background: url(\'<i class="ic-success">');
      expect(result).not.toContain('const iconStr = \'<i class="ic-success">');
    });
  });
});
