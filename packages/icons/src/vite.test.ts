import { describe, expect, it } from "vitest";

import { IconRegistry } from "./registry/registry.js";
import { viteIcons, viteIconsPlugin } from "./vite.js";

describe("viteIcons", () => {
  it("resolves virtual module ID correctly", () => {
    const plugin = viteIconsPlugin();
    expect(plugin.name).toBe("codenhub-icons");

    const resolveFn = plugin.resolveId as (id: string) => string | null;
    const resolved = resolveFn("virtual:codenhub-icons.css");
    expect(resolved).toBe("\0virtual:codenhub-icons.css");

    const unhandled = resolveFn("some-other-module.css");
    expect(unhandled).toBeNull();
  });

  it("scans code during transform and generates CSS on load", () => {
    const plugin = viteIcons();

    const codeSample = `
      export function App() {
        return <i className="ic-user ic-settings ic-close"></i>;
      }
    `;
    const transformFn = plugin.transform as (code: string, id: string) => null;
    transformFn(codeSample, "app.tsx");

    const loadFn = plugin.load as (id: string) => string | null;
    const cssResult = loadFn("\0virtual:codenhub-icons.css");

    expect(typeof cssResult).toBe("string");
    expect(cssResult).toContain(".ic,");
    expect(cssResult).toContain(".ic-user {");
    expect(cssResult).toContain(".ic-settings {");
    expect(cssResult).toContain(".ic-close {");
    expect(cssResult).toContain("mask-image: url(");
  });

  it("supports custom prefix and registry in Vite plugin", () => {
    const customRegistry = new IconRegistry({ defaultPrefix: "custom" });
    customRegistry.registerIcon("home", "<svg><path d='home'/></svg>");

    const plugin = viteIcons({
      prefix: "myicon",
      registry: customRegistry,
    });

    const transformFn = plugin.transform as (code: string, id: string) => null;
    transformFn(`<div class="myicon-home"></div>`, "main.ts");

    const loadFn = plugin.load as (id: string) => string | null;
    const css = loadFn("\0virtual:codenhub-icons.css");

    expect(css).toContain(".myicon,");
    expect(css).toContain(".myicon-home {");
  });

  it("replaces @import directives in CSS files", () => {
    const plugin = viteIcons();
    const transformFn = plugin.transform as (code: string, id: string) => { code: string; map: null } | null;

    // First populate an icon class
    const jsxTransform = plugin.transform as (code: string, id: string) => null;
    jsxTransform('<i className="ic-close"></i>', "app.tsx");

    const cssCode = `@import "@codenhub/icons";\n body { color: black; }`;
    const result = transformFn(cssCode, "styles.css");

    expect(result).not.toBeNull();
    expect(result?.code).toContain(".ic,");
    expect(result?.code).toContain(".ic-close {");
    expect(result?.code).not.toContain('@import "@codenhub/icons";');
  });

  it("replaces icon tags with inline SVG when mode is 'svg' in HTML", () => {
    const plugin = viteIcons({ mode: "svg" });
    const htmlTransform = plugin.transformIndexHtml as unknown as (
      html: string,
      ctx: Record<string, unknown>,
    ) => string;

    const htmlInput = '<button><i class="ic-search" aria-hidden="true"></i> Search</button>';
    const result = htmlTransform(htmlInput, {});

    expect(result).toContain("<svg");
    expect(result).toContain('aria-hidden="true"');
    expect(result).not.toContain("<i class=");
  });

  it("replaces icon tags with inline SVG in JS/JSX when mode is 'svg'", () => {
    const customRegistry = new IconRegistry({ defaultPrefix: "custom" });
    customRegistry.registerIcon("close", '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>');

    const plugin = viteIcons({
      mode: "svg",
      prefix: "ic",
      registry: customRegistry,
      strokeWidth: 2,
    });

    const transformFn = plugin.transform as (code: string, id: string) => { code: string; map: null } | null;
    const jsxInput = `export function CloseButton() { return <i className="ic-close btn-icon" id="btn-1"></i>; }`;
    const result = transformFn(jsxInput, "component.tsx");

    expect(result).not.toBeNull();
    expect(result?.code).toContain("<svg");
    expect(result?.code).toContain('className="btn-icon"');
    expect(result?.code).toContain('id="btn-1"');
    expect(result?.code).toContain('stroke-width="2"');
    expect(result?.code).not.toContain("<i ");
  });
});
