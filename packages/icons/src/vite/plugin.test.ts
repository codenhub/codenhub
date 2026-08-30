import { describe, expect, it } from "vitest";

import { IconRegistry } from "../core/registry.js";
import type { IconAttribution, IconFamilyData } from "../core/types.js";
import { viteIcons, viteIconsPlugin } from "./plugin.js";

function createFamily(attribution: IconAttribution = "notice"): IconFamilyData {
  return {
    aliases: { cancel: { parent: "x" } },
    icons: {
      user: { body: '<g stroke-width="2"><path d="user" /></g>' },
      x: { body: '<g stroke-width="2"><path d="x" /></g>' },
    },
    info: {
      attribution,
      author: { name: "Test Authors", url: "https://test.example" },
      license: { spdx: "ISC", title: "ISC License", url: "https://test.example/license" },
      name: "Test Family",
      strokeWidth: 2,
      tier: attribution === "credit" ? "extended" : "core",
      total: 2,
      upstream: { package: "test-icons", version: "1.0.0" },
    },
    prefix: "test",
  };
}

function createPlugin(options: Parameters<typeof viteIcons>[0] = {}) {
  const plugin = viteIcons({ defaultPrefix: "test", families: [createFamily()], ...options });
  return {
    generateBundle: plugin.generateBundle as (this: unknown) => void,
    load: plugin.load as (id: string) => string | null,
    plugin,
    resolveId: plugin.resolveId as (id: string) => string | null,
    transform: plugin.transform as (code: string, id: string) => { code: string } | null,
    transformIndexHtml: plugin.transformIndexHtml as (html: string, ctx: { filename?: string }) => unknown,
  };
}

interface EmittedFile {
  fileName: string;
  source: string;
  type: string;
}

function createBundleContext() {
  const files: EmittedFile[] = [];
  const warnings: string[] = [];
  return {
    context: {
      emitFile: (file: EmittedFile) => files.push(file),
      warn: (message: string) => warnings.push(message),
    },
    files,
    warnings,
  };
}

describe("viteIcons", () => {
  it("resolves the virtual stylesheet module", () => {
    const { plugin, resolveId } = createPlugin();

    expect(plugin.name).toBe("codenhub-icons");
    expect(resolveId("virtual:icons.css")).toBe("\0virtual:icons.css");
    expect(resolveId("some-other-module.css")).toBeNull();
  });

  it("leaves another plugin's resolved virtual module alone", () => {
    // "\0virtual:" is a generic Vite/Rollup convention for a resolved virtual
    // module id, not something unique to this plugin — Astro's own internal
    // pages module uses it too. `load` must only serve ids this plugin itself
    // resolved, or it corrupts modules it was never asked to handle.
    const { load } = createPlugin();

    expect(load("\0virtual:astro:pages")).toBeNull();
  });

  it("serves CSS for the classes it scanned during transform", () => {
    const { load, transform } = createPlugin();

    transform('export const App = () => <i className="ic-user ic-cancel" />;', "app.tsx");
    const css = load("\0virtual:icons.css");

    expect(css).toContain(".ic {");
    expect(css).toContain(".ic-user {");
    expect(css).toContain(".ic-cancel {");
  });

  it("resolves nothing when no family is declared", () => {
    const { load, transform } = createPlugin({ families: [] });

    transform('<i class="ic-user"></i>', "index.html");

    expect(load("\0virtual:icons.css")).not.toContain(".ic-user {");
  });

  it("honors a custom class prefix", () => {
    const { load, transform } = createPlugin({ prefix: "ux" });

    transform('<div class="ux-user"></div>', "main.ts");
    const css = load("\0virtual:icons.css");

    expect(css).toContain(".ux {");
    expect(css).toContain(".ux-user {");
  });

  it("accepts a prepared registry instead of families", () => {
    const registry = new IconRegistry({ defaultPrefix: "test" });
    registry.registerFamily(createFamily());
    const { load, transform } = createPlugin({ families: [], registry });

    transform('<div class="ic-user"></div>', "main.ts");

    expect(load("\0virtual:icons.css")).toContain(".ic-user {");
  });

  it("replaces the package import in a stylesheet", () => {
    const { transform } = createPlugin();

    const result = transform('@import "@codenhub/icons";\n.button { color: red; }', "styles.css");

    expect(result?.code).not.toContain('@import "@codenhub/icons"');
    expect(result?.code).toContain(".ic {");
  });

  it("prepends a preserved license banner by default", () => {
    const { load, transform } = createPlugin();

    transform('<i class="ic-user"></i>', "index.html");
    const css = load("\0virtual:icons.css");

    expect(css?.startsWith("/*!")).toBe(true);
    expect(css).toContain("Test Family");
  });

  it("omits the banner for a family that owes nothing", () => {
    const { load, transform } = createPlugin({ families: [createFamily("none")] });

    transform('<i class="ic-user"></i>', "index.html");

    expect(load("\0virtual:icons.css")?.startsWith("/*!")).toBe(false);
  });

  it("emits the notice as an asset in file mode", () => {
    const { generateBundle, load, transform } = createPlugin({ attribution: "file" });
    transform('<i class="ic-user"></i>', "index.html");
    load("\0virtual:icons.css");

    const { context, files } = createBundleContext();
    generateBundle.call(context);

    expect(load("\0virtual:icons.css")?.startsWith("/*!")).toBe(false);
    expect(files[0]?.fileName).toBe("icons-attribution.txt");
    expect(files[0]?.source).toContain("Test Family");
  });

  it("warns instead of emitting when attribution is turned off", () => {
    const { generateBundle, load, transform } = createPlugin({ attribution: "off" });
    transform('<i class="ic-user"></i>', "index.html");
    load("\0virtual:icons.css");

    const { context, files, warnings } = createBundleContext();
    generateBundle.call(context);

    expect(files).toEqual([]);
    expect(warnings[0]).toContain("Test Family");
  });

  it("stays silent when the build owes no notice", () => {
    const { generateBundle, load, transform } = createPlugin({ attribution: "off", families: [createFamily("none")] });
    transform('<i class="ic-user"></i>', "index.html");
    load("\0virtual:icons.css");

    const { context, warnings } = createBundleContext();
    generateBundle.call(context);

    expect(warnings).toEqual([]);
  });
});

describe("viteIcons virtual icon modules", () => {
  it("resolves a per-icon module id", () => {
    const { resolveId } = createPlugin();

    expect(resolveId("virtual:@codenhub/icons/test/user")).toBe("\0virtual:@codenhub/icons/test/user");
  });

  it("serves the icon and its rendered markup", () => {
    const { load } = createPlugin();

    const code = load("\0virtual:@codenhub/icons/test/user");

    expect(code).toContain('export const icon = {"body"');
    expect(code).toContain("export const svg =");
    expect(code).toContain("export default svg;");
    expect(code).toContain('viewBox=\\"0 0 24 24\\"');
  });

  it("resolves a bare name through aliases and the default prefix", () => {
    const { load } = createPlugin();

    expect(load("\0virtual:@codenhub/icons/cancel")).toContain('"iconName":"x"');
  });

  it("applies the configured stroke width", () => {
    const { load } = createPlugin({ strokeWidth: 1.5 });

    expect(load("\0virtual:@codenhub/icons/test/user")).toContain('stroke-width=\\"1.5\\"');
  });

  it("names the icon it could not resolve", () => {
    const { load } = createPlugin();

    expect(() => load("\0virtual:@codenhub/icons/test/absent")).toThrow('Unknown icon "test/absent"');
  });

  it("counts a family reached only through an icon module toward attribution", () => {
    const { generateBundle, load } = createPlugin({ attribution: "file" });
    load("\0virtual:@codenhub/icons/test/user");

    const { context, files } = createBundleContext();
    generateBundle.call(context);

    expect(files[0]?.source).toContain("Test Family");
  });
});

describe("viteIcons in svg mode", () => {
  it("replaces an icon tag with inline SVG in markup", () => {
    const { transformIndexHtml } = createPlugin({ mode: "svg" });

    const html = transformIndexHtml('<button><i class="ic-user"></i></button>', {}) as string;

    expect(html).toContain("<svg");
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).not.toContain("ic-user");
  });

  it("keeps classes it does not own on the emitted element", () => {
    const { transformIndexHtml } = createPlugin({ mode: "svg" });

    const html = transformIndexHtml('<i class="ic-user brand-mark"></i>', {}) as string;

    expect(html).toContain('class="brand-mark"');
  });

  it("applies the stroke width written as a class", () => {
    const { transformIndexHtml } = createPlugin({ mode: "svg" });

    const html = transformIndexHtml('<i class="ic-user ic-stroke-1.5"></i>', {}) as string;

    expect(html).toContain('stroke-width="1.5"');
  });

  it("leaves a tag whose icon does not resolve untouched", () => {
    const { transformIndexHtml } = createPlugin({ mode: "svg" });

    const html = transformIndexHtml('<i class="ic-absent"></i>', {}) as string;

    expect(html).toBe('<i class="ic-absent"></i>');
  });

  it("escapes the markup for the string it is embedded in", () => {
    const { transform } = createPlugin({ mode: "svg" });

    const result = transform(`const markup = "<i class=\\"ic-user\\"></i>";`, "app.ts");

    expect(result?.code).toContain('<svg xmlns=\\"http://www.w3.org/2000/svg\\"');
  });

  it("drops the stylesheet import that has nothing to serve", () => {
    const { transform } = createPlugin({ mode: "svg" });

    const result = transform('@import "@codenhub/icons";\n.button { color: red; }', "styles.css");

    expect(result?.code).toBe("\n.button { color: red; }");
  });
});

describe("viteIconsPlugin", () => {
  it("is the same plugin factory under its named alias", () => {
    expect(viteIconsPlugin).toBe(viteIcons);
  });
});
