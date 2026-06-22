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
    expect(outputHtml).toContain('<div class="spinner"></div>');
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
});
