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

  it("leaves the package import in a stylesheet alone", () => {
    const { transform } = createPlugin();

    const result = transform('@import "@codenhub/icons";\n.button { color: red; }', "styles.css");

    // The import resolves to the package's own base stylesheet through its
    // exports, so it means the same thing with or without this plugin. The
    // generated masks arrive through the virtual module instead.
    expect(result).toBeNull();
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

  it("emits nothing in the default css mode with auto attribution", () => {
    const { generateBundle, load, transform } = createPlugin();
    transform('<i class="ic-user"></i>', "index.html");
    load("\0virtual:icons.css");

    const { context, files, warnings } = createBundleContext();
    generateBundle.call(context);

    expect(files).toEqual([]);
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

  it("applies the stroke width written as a modifier", () => {
    const { transformIndexHtml } = createPlugin({ mode: "svg" });

    const html = transformIndexHtml('<i class="ic-user/1.5"></i>', {}) as string;

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

  it("keeps a double-quoted SVG intact inside a single-quoted string", () => {
    const { transform } = createPlugin({ mode: "svg" });

    const result = transform(`const markup = '<i class="ic-user"></i>';`, "app.ts");

    expect(result?.code).toContain(`'<svg xmlns="http://www.w3.org/2000/svg"`);
  });

  it("replaces an icon tag written inside a template literal", () => {
    const { transform } = createPlugin({ mode: "svg" });

    const result = transform('const markup = `<i class="ic-user"></i>`;', "app.tsx");

    expect(result?.code).toContain("<svg");
    expect(result?.code).not.toContain("ic-user");
  });

  it("still replaces an icon tag that sits after a line comment", () => {
    const { transform } = createPlugin({ mode: "svg" });

    const result = transform('// a note\nconst markup = "<i class=\\"ic-user\\"></i>";', "app.ts");

    expect(result?.code).toContain("<svg");
    expect(result?.code).toContain("// a note");
  });

  it("leaves markup with no icon class untouched in a JS module", () => {
    const { transform } = createPlugin({ mode: "svg" });

    expect(transform('const markup = "<i class=\\"brand\\"></i>";', "app.ts")).toBeNull();
  });

  it("leaves the stylesheet import alone, since it carries the base rules", () => {
    const { transform } = createPlugin({ mode: "svg" });

    const result = transform('@import "@codenhub/icons";\n.button { color: red; }', "styles.css");

    expect(result).toBeNull();
  });

  it("warns about an icon class on an element it does not rewrite", () => {
    const { generateBundle, transformIndexHtml } = createPlugin({ mode: "svg" });
    const { context, warnings } = createBundleContext();

    transformIndexHtml('<button class="btn ic-user">Save</button>', { filename: "index.html" });
    generateBundle.call(context);

    expect(warnings.join("\n")).toContain("ic-user");
    expect(warnings.join("\n")).toContain('mode "svg" does not rewrite');
  });

  it("does not warn about a class that is not an icon", () => {
    const { generateBundle, transformIndexHtml } = createPlugin({ mode: "svg" });
    const { context, warnings } = createBundleContext();

    transformIndexHtml('<button class="btn ic-absent">Save</button>', { filename: "index.html" });
    generateBundle.call(context);

    expect(warnings.join("\n")).not.toContain("ic-absent");
  });

  it("does not warn when every icon class was rewritten", () => {
    const { generateBundle, transformIndexHtml } = createPlugin({ mode: "svg" });
    const { context, warnings } = createBundleContext();

    transformIndexHtml('<i class="ic-user"></i>', { filename: "index.html" });
    generateBundle.call(context);

    expect(warnings.join("\n")).not.toContain("does not rewrite");
  });

  it("serves an empty virtual stylesheet, since the SVG is inlined into markup", () => {
    const { load } = createPlugin({ mode: "svg" });

    expect(load("\0virtual:icons.css")).toBe("");
  });

  it("leaves non-markup and dependency modules untouched", () => {
    const { transform } = createPlugin({ mode: "svg" });

    expect(transform('<i class="ic-user"></i>', "\0virtual:something")).toBeNull();
    expect(transform('<i class="ic-user"></i>', "node_modules/pkg/index.js")).toBeNull();
    expect(transform("const a = 1;", "app.ts")).toBeNull();
  });

  it("emits the license notice as an asset, since inline SVG carries no banner", () => {
    const { generateBundle, transformIndexHtml } = createPlugin({ mode: "svg" });
    transformIndexHtml('<i class="ic-user"></i>', {});

    const { context, files } = createBundleContext();
    generateBundle.call(context);

    expect(files[0]?.fileName).toBe("icons-attribution.txt");
    expect(files[0]?.source).toContain("Test Family");
  });

  it("warns instead of emitting when attribution is off in svg mode", () => {
    const { generateBundle, transformIndexHtml } = createPlugin({ mode: "svg", attribution: "off" });
    transformIndexHtml('<i class="ic-user"></i>', {});

    const { context, files, warnings } = createBundleContext();
    generateBundle.call(context);

    expect(files).toEqual([]);
    expect(warnings[0]).toContain("Test Family");
  });
});

interface FakeModule {
  url: string;
}

function createDevServer() {
  const invalidated: string[] = [];
  const sent: { type?: string }[] = [];
  const watchers = new Map<string, (filePath: string) => void>();
  const mod: FakeModule = { url: "/@id/virtual:icons.css" };
  const server = {
    moduleGraph: {
      getModuleById: (id: string) => (id === "\0virtual:icons.css" ? mod : undefined),
      invalidateModule: (target: FakeModule) => invalidated.push(target.url),
    },
    ws: { send: (payload: { type?: string }) => sent.push(payload) },
    watcher: { on: (event: string, handler: (filePath: string) => void) => watchers.set(event, handler) },
  };
  // Fails loudly rather than no-opping when the plugin never registered the
  // watcher, so a test cannot pass by skipping the path it means to cover.
  const fire = (event: "change" | "add", filePath: string) => {
    const handler = watchers.get(event);
    if (!handler) {
      throw new Error(`plugin registered no "${event}" watcher`);
    }
    handler(filePath);
  };
  return { fire, invalidated, sent, server };
}

describe("viteIcons dev invalidation", () => {
  it("refreshes the stylesheet when a transform turns up a new class", () => {
    const { plugin, transform } = createPlugin();
    const { invalidated, sent, server } = createDevServer();
    (plugin.configureServer as (server: unknown) => void)(server);

    transform('export const App = () => <i className="ic-user" />;', "app.tsx");

    expect(invalidated).toEqual(["/@id/virtual:icons.css"]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: "update" });
  });

  it("does not refresh again for a class it has already seen", () => {
    const { plugin, transform } = createPlugin();
    const { invalidated, server } = createDevServer();
    (plugin.configureServer as (server: unknown) => void)(server);

    transform('<i class="ic-user"></i>', "page.tsx");
    invalidated.length = 0;
    transform('<i class="ic-user"></i>', "page.tsx");

    expect(invalidated).toEqual([]);
  });

  it("refreshes when the file watcher reports a change to a source file", () => {
    const { plugin } = createPlugin();
    const { fire, invalidated, server } = createDevServer();
    (plugin.configureServer as (server: unknown) => void)(server);

    fire("change", "src/page.tsx");

    expect(invalidated).toEqual(["/@id/virtual:icons.css"]);
  });

  it("refreshes when the file watcher reports a newly added source file", () => {
    const { plugin } = createPlugin();
    const { fire, invalidated, server } = createDevServer();
    (plugin.configureServer as (server: unknown) => void)(server);

    fire("add", "src/new-page.tsx");

    expect(invalidated).toEqual(["/@id/virtual:icons.css"]);
  });

  it("ignores a watcher event for a file it would never scan", () => {
    const { plugin } = createPlugin();
    const { fire, invalidated, server } = createDevServer();
    (plugin.configureServer as (server: unknown) => void)(server);

    fire("change", "node_modules/pkg/index.js");
    fire("add", "notes.md");

    expect(invalidated).toEqual([]);
  });
});

describe("viteIconsPlugin", () => {
  it("is the same plugin factory under its named alias", () => {
    expect(viteIconsPlugin).toBe(viteIcons);
  });
});
