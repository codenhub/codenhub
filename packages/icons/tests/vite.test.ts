import { describe, expect, it } from "vitest";

import { IconRegistry } from "../src/registry/registry.js";
import { viteIcons } from "../src/vite.js";

describe("viteIcons", () => {
  it("resolves virtual module ID correctly", () => {
    const plugin = viteIcons();
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
        return <i className="ic-user ic-settings"></i>;
      }
    `;
    const transformFn = plugin.transform as (code: string) => null;
    transformFn(codeSample);

    const loadFn = plugin.load as (id: string) => string | null;
    const cssResult = loadFn("\0virtual:codenhub-icons.css");

    expect(typeof cssResult).toBe("string");
    expect(cssResult).toContain(".ic,");
    expect(cssResult).toContain(".ic-user {");
    expect(cssResult).toContain(".ic-settings {");
    expect(cssResult).toContain("mask-image: url(");
  });

  it("supports custom prefix and registry in Vite plugin", () => {
    const customRegistry = new IconRegistry({ defaultPrefix: "custom" });
    customRegistry.registerIcon("home", "<svg><path d='home'/></svg>");

    const plugin = viteIcons({
      prefix: "myicon",
      registry: customRegistry,
    });

    const transformFn = plugin.transform as (code: string) => null;
    transformFn(`<div class="myicon-home"></div>`);

    const loadFn = plugin.load as (id: string) => string | null;
    const css = loadFn("\0virtual:codenhub-icons.css");

    expect(css).toContain(".myicon,");
    expect(css).toContain(".myicon-home {");
  });
});
