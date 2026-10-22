import type { IndexHtmlTransformContext, IndexHtmlTransformHook } from "vite";
import { describe, expect, it } from "vitest";

import { addLoaderPlugin } from "./index";

describe("addLoaderPlugin", () => {
  it("should have correct metadata and structure", () => {
    const plugin = addLoaderPlugin();
    expect(plugin.name).toBe("vite-plugin-add-loader");
    expect(plugin.enforce).toBe("post");
    expect(plugin.transformIndexHtml).toBeDefined();
    expect(typeof plugin.transformIndexHtml).toBe("object");
    expect(plugin.transformIndexHtml).toHaveProperty("order", "post");
    expect(plugin.transformIndexHtml).toHaveProperty("handler");
  });

  it("should inject styles and body overlay into HTML", async () => {
    const plugin = addLoaderPlugin();
    const transformIndexHtml = plugin.transformIndexHtml;

    if (!transformIndexHtml || typeof transformIndexHtml !== "object") {
      throw new Error("transformIndexHtml should be an object with handler");
    }

    const handler = transformIndexHtml.handler as IndexHtmlTransformHook;
    expect(typeof handler).toBe("function");

    const inputHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Test Page</title>
</head>
<body>
  <div id="app">Hello World</div>
</body>
</html>
    `.trim();

    const ctx: IndexHtmlTransformContext = {
      path: "/index.html",
      filename: "index.html",
    };

    const result = await handler.call(
      undefined as unknown as ThisParameterType<IndexHtmlTransformHook>,
      inputHtml,
      ctx,
    );

    const outputHtml =
      typeof result === "string"
        ? result
        : result && typeof result === "object" && !Array.isArray(result)
          ? result.html
          : undefined;
    expect(outputHtml).toBeDefined();
    if (!outputHtml) {
      throw new Error("Expected html output");
    }

    // Verify loader styles are injected into head
    expect(outputHtml).toContain("#page-loader {");
    expect(outputHtml).toContain("</style>\n</head>");

    // Verify loader markup is injected after body
    expect(outputHtml).toContain("<body");
    expect(outputHtml).toContain('<div id="page-loader" role="status" aria-label="Loading">');
    expect(outputHtml).toContain('<svg class="spinner"');
  });

  it("should handle body tags with attributes", async () => {
    const plugin = addLoaderPlugin();
    const transformIndexHtml = plugin.transformIndexHtml;

    if (!transformIndexHtml || typeof transformIndexHtml !== "object") {
      throw new Error("transformIndexHtml should be an object with handler");
    }

    const handler = transformIndexHtml.handler as IndexHtmlTransformHook;

    const inputHtml = `<html><head></head><body class="dark-theme" data-test="true"><div id="app"></div></body></html>`;
    const ctx: IndexHtmlTransformContext = {
      path: "/index.html",
      filename: "index.html",
    };

    const result = await handler.call(
      undefined as unknown as ThisParameterType<IndexHtmlTransformHook>,
      inputHtml,
      ctx,
    );

    const outputHtml =
      typeof result === "string"
        ? result
        : result && typeof result === "object" && !Array.isArray(result)
          ? result.html
          : undefined;
    expect(outputHtml).toBeDefined();
    if (!outputHtml) {
      throw new Error("Expected html output");
    }

    expect(outputHtml).toContain('<body class="dark-theme" data-test="true">');
    expect(outputHtml).toContain('<div id="page-loader" role="status" aria-label="Loading">');
  });

  it("should support custom background and spinner colors", async () => {
    const plugin = addLoaderPlugin({
      backgroundColor: "red",
      color: "blue",
    });
    const transformIndexHtml = plugin.transformIndexHtml;

    if (!transformIndexHtml || typeof transformIndexHtml !== "object") {
      throw new Error("transformIndexHtml should be an object");
    }

    const handler = transformIndexHtml.handler as IndexHtmlTransformHook;

    const inputHtml = `<html><head></head><body></body></html>`;
    const result = await handler.call(undefined as unknown as ThisParameterType<IndexHtmlTransformHook>, inputHtml, {
      path: "/index.html",
      filename: "index.html",
    } as unknown as IndexHtmlTransformContext);

    const outputHtml = typeof result === "string" ? result : undefined;
    expect(outputHtml).toContain("#page-loader { background: red; }");
    expect(outputHtml).toContain("#page-loader .spinner { color: blue; }");
  });

  it("should match uppercase HEAD and BODY tags", async () => {
    const plugin = addLoaderPlugin();
    const transformIndexHtml = plugin.transformIndexHtml;

    if (!transformIndexHtml || typeof transformIndexHtml !== "object") {
      throw new Error("transformIndexHtml should be an object");
    }

    const handler = transformIndexHtml.handler as IndexHtmlTransformHook;

    const inputHtml = `<html><HEAD></HEAD><BODY>hello</BODY></html>`;
    const result = await handler.call(undefined as unknown as ThisParameterType<IndexHtmlTransformHook>, inputHtml, {
      path: "/index.html",
      filename: "index.html",
    } as unknown as IndexHtmlTransformContext);

    const outputHtml = typeof result === "string" ? result : undefined;
    expect(outputHtml).toContain("#page-loader {");
    expect(outputHtml).toContain("</HEAD>");
    expect(outputHtml).toContain("<BODY>");
    expect(outputHtml).toContain('<div id="page-loader"');
  });

  it("should return unmodified HTML if HEAD or BODY tags are missing", async () => {
    const plugin = addLoaderPlugin();
    const transformIndexHtml = plugin.transformIndexHtml;

    if (!transformIndexHtml || typeof transformIndexHtml !== "object") {
      throw new Error("transformIndexHtml should be an object");
    }

    const handler = transformIndexHtml.handler as IndexHtmlTransformHook;

    const noHeadHtml = `<html><body>hello</body></html>`;
    const noBodyHtml = `<html><head></head>hello</html>`;

    const ctx = { path: "/index.html", filename: "index.html" } as IndexHtmlTransformContext;

    const result1 = await handler.call(
      undefined as unknown as ThisParameterType<IndexHtmlTransformHook>,
      noHeadHtml,
      ctx,
    );
    const result2 = await handler.call(
      undefined as unknown as ThisParameterType<IndexHtmlTransformHook>,
      noBodyHtml,
      ctx,
    );

    expect(typeof result1 === "string" ? result1 : undefined).toBe(noHeadHtml);
    expect(typeof result2 === "string" ? result2 : undefined).toBe(noBodyHtml);
  });

  it("should inject nonce into style and script tags if nonce option is provided", async () => {
    const plugin = addLoaderPlugin({ nonce: "test-nonce-123" });
    const transformIndexHtml = plugin.transformIndexHtml;

    if (!transformIndexHtml || typeof transformIndexHtml !== "object") {
      throw new Error("transformIndexHtml should be an object");
    }

    const handler = transformIndexHtml.handler as IndexHtmlTransformHook;

    const inputHtml = `<html><head></head><body></body></html>`;
    const result = await handler.call(undefined as unknown as ThisParameterType<IndexHtmlTransformHook>, inputHtml, {
      path: "/index.html",
      filename: "index.html",
    } as unknown as IndexHtmlTransformContext);

    const outputHtml = typeof result === "string" ? result : undefined;
    expect(outputHtml).toContain('<style nonce="test-nonce-123">');
    expect(outputHtml).toContain('<script nonce="test-nonce-123">');
    expect(outputHtml).toContain('<style nonce="test-nonce-123">\n      #page-loader { display: none !important; }');
  });

  it("should ignore dummy head and body tags inside literal blocks", async () => {
    const plugin = addLoaderPlugin();
    const transformIndexHtml = plugin.transformIndexHtml;

    if (!transformIndexHtml || typeof transformIndexHtml !== "object") {
      throw new Error("transformIndexHtml should be an object");
    }

    const handler = transformIndexHtml.handler as IndexHtmlTransformHook;

    const inputHtml = `
<html>
<head>
  <!-- <body> inside comment -->
  <!-- </head> inside comment -->
  <pre><code>
    </head>
    <body>
  </code></pre>
</head>
<body>
  <div id="app"></div>
</body>
</html>
    `.trim();

    const result = await handler.call(undefined as unknown as ThisParameterType<IndexHtmlTransformHook>, inputHtml, {
      path: "/index.html",
      filename: "index.html",
    } as unknown as IndexHtmlTransformContext);

    const outputHtml = typeof result === "string" ? result : undefined;
    expect(outputHtml).toBeDefined();
    if (!outputHtml) {
      throw new Error("Expected html output");
    }

    // Verify it injected loader at the actual head/body, and not in the comment/pre block
    const commentPart = outputHtml.indexOf("<!-- <body> inside comment -->");
    const prePart = outputHtml.indexOf("<pre><code>");
    const actualHeadEnd = outputHtml.lastIndexOf("</head>");
    const actualBodyStart = outputHtml.lastIndexOf("<body>");

    expect(commentPart).toBeGreaterThan(-1);
    expect(prePart).toBeGreaterThan(-1);
    expect(actualHeadEnd).toBeGreaterThan(-1);
    expect(actualBodyStart).toBeGreaterThan(-1);

    // Style is injected before the last actual </head>
    expect(outputHtml.indexOf("<style>")).toBeLessThan(actualHeadEnd);
    expect(outputHtml.indexOf("<style>")).toBeGreaterThan(prePart);

    // Loader body is injected after actualBodyStart (+3 for newline and indentation in LOADER_BODY)
    expect(outputHtml.indexOf('<div id="page-loader"')).toBe(actualBodyStart + "<body>".length + 3);
  });

  it("should support timeout option and fall back to 5000ms default", async () => {
    const plugin = addLoaderPlugin();
    const transformIndexHtml = plugin.transformIndexHtml;
    if (!transformIndexHtml || typeof transformIndexHtml !== "object") {
      throw new Error("Expected transformIndexHtml to be object");
    }
    const handler = transformIndexHtml.handler as IndexHtmlTransformHook;

    const inputHtml = `<html><head></head><body></body></html>`;
    const result = await handler.call(undefined as unknown as ThisParameterType<IndexHtmlTransformHook>, inputHtml, {
      path: "/index.html",
      filename: "index.html",
    } as unknown as IndexHtmlTransformContext);
    const outputHtml = typeof result === "string" ? result : "";
    expect(outputHtml).toContain("setTimeout(removeLoader, 5000);");
  });

  it("should support custom timeout value", async () => {
    const plugin = addLoaderPlugin({ timeout: 3000 });
    const transformIndexHtml = plugin.transformIndexHtml;
    if (!transformIndexHtml || typeof transformIndexHtml !== "object") {
      throw new Error("Expected transformIndexHtml to be object");
    }
    const handler = transformIndexHtml.handler as IndexHtmlTransformHook;

    const inputHtml = `<html><head></head><body></body></html>`;
    const result = await handler.call(undefined as unknown as ThisParameterType<IndexHtmlTransformHook>, inputHtml, {
      path: "/index.html",
      filename: "index.html",
    } as unknown as IndexHtmlTransformContext);
    const outputHtml = typeof result === "string" ? result : "";
    expect(outputHtml).toContain("setTimeout(removeLoader, 3000);");
  });

  it.each(["</script >", "</script\t\n bar>", "</script/>"])(
    "should inject the loader when a script ends with %j",
    async (endTag) => {
      const plugin = addLoaderPlugin();
      const transformIndexHtml = plugin.transformIndexHtml;
      if (!transformIndexHtml || typeof transformIndexHtml !== "object") {
        throw new Error("Expected transformIndexHtml to be object");
      }
      const handler = transformIndexHtml.handler as IndexHtmlTransformHook;

      const inputHtml = `<html><head><script>window.config = {};${endTag}</head><body><script type="module" src="/main.js"></script></body></html>`;
      const result = await handler.call(undefined as unknown as ThisParameterType<IndexHtmlTransformHook>, inputHtml, {
        path: "/index.html",
        filename: "index.html",
      } as unknown as IndexHtmlTransformContext);
      const outputHtml = typeof result === "string" ? result : "";
      expect(outputHtml).toContain(`<script>window.config = {};${endTag}<style>`);
      expect(outputHtml).toContain('<body>\n  <div id="page-loader"');
    },
  );

  it("should return in linear time when a body start tag never closes", async () => {
    const plugin = addLoaderPlugin();
    const transformIndexHtml = plugin.transformIndexHtml;
    if (!transformIndexHtml || typeof transformIndexHtml !== "object") {
      throw new Error("Expected transformIndexHtml to be object");
    }
    const handler = transformIndexHtml.handler as IndexHtmlTransformHook;

    // Retrying the body tag match at every "<body" scanned to the end each time: this took seconds before.
    const inputHtml = `<html><head></head><body${"<body=".repeat(50_000)}`;
    const start = performance.now();
    const result = await handler.call(undefined as unknown as ThisParameterType<IndexHtmlTransformHook>, inputHtml, {
      path: "/index.html",
      filename: "index.html",
    } as unknown as IndexHtmlTransformContext);
    expect(performance.now() - start).toBeLessThan(1_000);
    expect(typeof result === "string" ? result : "").not.toContain('<div id="page-loader"');
  });

  async function transform(html: string, options?: Parameters<typeof addLoaderPlugin>[0]): Promise<string> {
    const transformIndexHtml = addLoaderPlugin(options).transformIndexHtml;
    if (!transformIndexHtml || typeof transformIndexHtml !== "object") {
      throw new Error("Expected transformIndexHtml to be object");
    }
    const handler = transformIndexHtml.handler as IndexHtmlTransformHook;
    const result = await handler.call(undefined as unknown as ThisParameterType<IndexHtmlTransformHook>, html, {
      path: "/index.html",
      filename: "index.html",
    } as unknown as IndexHtmlTransformContext);
    return typeof result === "string" ? result : "";
  }

  it.each([
    ["script start tags that never close", "<script".repeat(50_000)],
    ["script elements that never end", "<script>".repeat(50_000)],
    ["script end tags that never close", `<script>${"</script ".repeat(50_000)}`],
    ["comments that never end", "<!--".repeat(50_000)],
  ])("should return in linear time with %s", async (_, tail) => {
    // Retrying the literal-block match at every candidate scanned to the end each time: 50k took 10.8 s before.
    const start = performance.now();
    const outputHtml = await transform(`<html><head></head><body>${tail}`);
    expect(performance.now() - start).toBeLessThan(1_000);
    expect(outputHtml).toContain('<div id="page-loader"');
  });

  it("should keep a literal block after an unclosed one of another kind", async () => {
    const outputHtml = await transform(
      "<html><head></head><body><style><script>const s = '<body>';</script></body></html>",
    );
    expect(outputHtml).toContain('<body>\n  <div id="page-loader"');
    expect(outputHtml).toContain("<script>const s = '<body>';</script>");
    expect(outputHtml.match(/id="page-loader"/g)).toHaveLength(1);
  });
});
