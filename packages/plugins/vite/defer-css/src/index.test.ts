import type { IndexHtmlTransformHook, IndexHtmlTransformContext } from "vite";
import { describe, expect, it } from "vitest";

import { deferCssPlugin } from "./index";

function getHtml(result: unknown): string | undefined {
  if (typeof result === "string") {
    return result;
  }
  if (result && typeof result === "object" && "html" in result && typeof result.html === "string") {
    return result.html;
  }
  return undefined;
}

describe("deferCssPlugin", () => {
  it("should have correct metadata and structure", () => {
    const plugin = deferCssPlugin();
    expect(plugin.name).toBe("vite-plugin-defer-css");
    expect(plugin.enforce).toBe("post");
    expect(plugin.transformIndexHtml).toBeDefined();
    expect(typeof plugin.transformIndexHtml).toBe("object");
    expect(plugin.transformIndexHtml).toHaveProperty("order", "post");
    expect(plugin.transformIndexHtml).toHaveProperty("handler");
  });

  it("should transform single stylesheet link tag and inject noscript fallback", async () => {
    const plugin = deferCssPlugin();
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
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <div id="app">Hello World</div>
</body>
</html>
    `.trim();

    const result = await handler.call(
      { format: "html" } as unknown as ThisParameterType<IndexHtmlTransformHook>,
      inputHtml,
      { path: "/index.html", filename: "index.html" } as unknown as IndexHtmlTransformContext,
    );

    const outputHtml = getHtml(result);
    expect(outputHtml).toBeDefined();
    if (!outputHtml) {
      throw new Error("Expected html output");
    }

    // Verify preload transformation
    expect(outputHtml).toContain(
      `<link rel="preload" href="/style.css" as="style" onload="this.onload=null;this.rel='stylesheet'">`,
    );

    // Verify noscript fallback injection
    expect(outputHtml).toContain("<noscript>");
    expect(outputHtml).toContain(`<link rel="stylesheet" href="/style.css">`);
    expect(outputHtml).toContain("</noscript>");
    expect(outputHtml).toContain("</head>");
  });

  it("should transform multiple stylesheet link tags", async () => {
    const plugin = deferCssPlugin();
    const transformIndexHtml = plugin.transformIndexHtml;

    if (!transformIndexHtml || typeof transformIndexHtml !== "object") {
      throw new Error("transformIndexHtml should be an object with handler");
    }

    const handler = transformIndexHtml.handler as IndexHtmlTransformHook;

    const inputHtml = `
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="/theme.css">
  <link rel='stylesheet' href="/app.css" />
</head>
<body></body>
</html>
    `.trim();

    const result = await handler.call(
      { format: "html" } as unknown as ThisParameterType<IndexHtmlTransformHook>,
      inputHtml,
      { path: "/index.html", filename: "index.html" } as unknown as IndexHtmlTransformContext,
    );

    const outputHtml = getHtml(result);
    expect(outputHtml).toBeDefined();
    if (!outputHtml) {
      throw new Error("Expected html output");
    }

    // Verify preload transformations
    expect(outputHtml).toContain(
      `<link rel="preload" href="/theme.css" as="style" onload="this.onload=null;this.rel='stylesheet'">`,
    );
    expect(outputHtml).toContain(
      `<link rel="preload" href="/app.css"  as="style" onload="this.onload=null;this.rel='stylesheet'">`,
    );

    // Verify noscript fallbacks
    expect(outputHtml).toContain(`<link rel="stylesheet" href="/theme.css">`);
    expect(outputHtml).toContain(`<link rel='stylesheet' href="/app.css" >`);
  });

  it("should handle different formatting of link tags", async () => {
    const plugin = deferCssPlugin();
    const transformIndexHtml = plugin.transformIndexHtml;

    if (!transformIndexHtml || typeof transformIndexHtml !== "object") {
      throw new Error("transformIndexHtml should be an object with handler");
    }

    const handler = transformIndexHtml.handler as IndexHtmlTransformHook;

    const inputHtml = `<html><head><link href="main.css" rel=stylesheet></head><body></body></html>`;
    const result = await handler.call(
      { format: "html" } as unknown as ThisParameterType<IndexHtmlTransformHook>,
      inputHtml,
      { path: "/index.html", filename: "index.html" } as unknown as IndexHtmlTransformContext,
    );

    const outputHtml = getHtml(result);
    expect(outputHtml).toBeDefined();
    if (!outputHtml) {
      throw new Error("Expected html output");
    }

    expect(outputHtml).toContain(
      `<link href="main.css" rel="preload" as="style" onload="this.onload=null;this.rel='stylesheet'">`,
    );
    expect(outputHtml).toContain(`<link href="main.css" rel=stylesheet>`);
  });

  it("should return unmodified HTML if no stylesheets are present", async () => {
    const plugin = deferCssPlugin();
    const transformIndexHtml = plugin.transformIndexHtml;

    if (!transformIndexHtml || typeof transformIndexHtml !== "object") {
      throw new Error("transformIndexHtml should be an object with handler");
    }

    const handler = transformIndexHtml.handler as IndexHtmlTransformHook;

    const inputHtml = `<html><head><link rel="preload" href="foo.js" as="script"></head><body></body></html>`;
    const result = await handler.call(
      { format: "html" } as unknown as ThisParameterType<IndexHtmlTransformHook>,
      inputHtml,
      { path: "/index.html", filename: "index.html" } as unknown as IndexHtmlTransformContext,
    );

    const outputHtml = getHtml(result);
    expect(outputHtml).toBe(inputHtml);
  });

  it("should match uppercase HEAD tags", async () => {
    const plugin = deferCssPlugin();
    const transformIndexHtml = plugin.transformIndexHtml;
    if (!transformIndexHtml || typeof transformIndexHtml !== "object" || !("handler" in transformIndexHtml)) {
      throw new Error("Expected transformIndexHtml to have handler");
    }
    const handler = transformIndexHtml.handler as IndexHtmlTransformHook;
    const inputHtml = `<html><HEAD><link rel="stylesheet" href="a.css"></HEAD><body></body></html>`;
    const result = await handler.call(
      { format: "html" } as unknown as ThisParameterType<IndexHtmlTransformHook>,
      inputHtml,
      { path: "/index.html", filename: "index.html" } as unknown as IndexHtmlTransformContext,
    );
    const outputHtml = getHtml(result);
    expect(outputHtml).toContain("</HEAD>");
    expect(outputHtml).toContain("<noscript>");
  });

  it("should transform stylesheets with multiple rel values", async () => {
    const plugin = deferCssPlugin();
    const transformIndexHtml = plugin.transformIndexHtml;
    if (!transformIndexHtml || typeof transformIndexHtml !== "object" || !("handler" in transformIndexHtml)) {
      throw new Error("Expected transformIndexHtml to have handler");
    }
    const handler = transformIndexHtml.handler as IndexHtmlTransformHook;
    const inputHtml = `<html><head><link rel="stylesheet prefetch" href="a.css"></head><body></body></html>`;
    const result = await handler.call(
      { format: "html" } as unknown as ThisParameterType<IndexHtmlTransformHook>,
      inputHtml,
      { path: "/index.html", filename: "index.html" } as unknown as IndexHtmlTransformContext,
    );
    const outputHtml = getHtml(result);
    expect(outputHtml).toContain(
      `<link rel="preload" href="a.css" as="style" onload="this.onload=null;this.rel='stylesheet'">`,
    );
  });

  it("should prevent duplicate onload attribute if tag already has one", async () => {
    const plugin = deferCssPlugin();
    const transformIndexHtml = plugin.transformIndexHtml;
    if (!transformIndexHtml || typeof transformIndexHtml !== "object" || !("handler" in transformIndexHtml)) {
      throw new Error("Expected transformIndexHtml to have handler");
    }
    const handler = transformIndexHtml.handler as IndexHtmlTransformHook;
    const inputHtml = `<html><head><link rel="stylesheet" href="a.css" onload="run()"></head><body></body></html>`;
    const result = await handler.call(
      { format: "html" } as unknown as ThisParameterType<IndexHtmlTransformHook>,
      inputHtml,
      { path: "/index.html", filename: "index.html" } as unknown as IndexHtmlTransformContext,
    );
    const outputHtml = getHtml(result);
    expect(outputHtml).toContain(
      `<link rel="preload" href="a.css" as="style" onload="this.onload=null;this.rel='stylesheet'">`,
    );
  });
});
