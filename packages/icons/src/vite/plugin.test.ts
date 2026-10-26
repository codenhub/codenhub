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
    // A bundle with no HTML entry, as a library build has.
    generateBundle(this: unknown) {
      (plugin.generateBundle as (this: unknown, options: object, bundle: object) => void).call(this, {}, {});
    },
    load: plugin.load as (id: string) => string | null,
    plugin,
    resolveId: plugin.resolveId as (id: string) => string | null,
    transform: plugin.transform as (code: string, id: string) => { code: string } | null,
    transformIndexHtml: plugin.transformIndexHtml as (
      html: string,
      ctx: { filename?: string; server?: unknown },
    ) => unknown,
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
    expect(html).not.toContain("<i");
  });

  it("keeps the icon class and the classes beside it on the emitted element", () => {
    const { transformIndexHtml } = createPlugin({ mode: "svg" });

    const html = transformIndexHtml('<i class="ic-user brand-mark"></i>', {}) as string;

    expect(html).toContain('class="ic-user brand-mark"');
  });

  it.each([
    ['<i class="ic-user"></i>', "without a size class"],
    ['<i class="brand-mark ic-user"></i>', "with the icon class written second"],
    ['<i class="ic-user ic-xs"></i>', "with a size class"],
  ])("emits an element the base svg rule matches: %s (%s)", (markup) => {
    const { transformIndexHtml } = createPlugin({ mode: "svg" });

    const html = transformIndexHtml(markup, {}) as string;
    const classValue = /^<svg\b[^>]*\bclass="([^"]*)"/.exec(html)?.[1] ?? "";

    // The base stylesheet reaches an inlined icon through `svg[class^="ic-"]`
    // and `svg[class*=" ic-"]` only.
    expect(classValue.startsWith("ic-") || classValue.includes(" ic-")).toBe(true);
  });

  it("does not read an attribute that only ends in class as the class", () => {
    const { transformIndexHtml } = createPlugin({ mode: "svg" });

    const html = transformIndexHtml('<i data-class="ic-user"></i>', {}) as string;

    expect(html).toBe('<i data-class="ic-user"></i>');
  });

  it("drops the bare prefix class, whose mask rules would paint the svg box", () => {
    const { transformIndexHtml } = createPlugin({ mode: "svg" });

    const html = transformIndexHtml('<i class="ic ic-user"></i>', {}) as string;

    expect(html).toContain('class="ic-user"');
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

    expect(result?.code).toContain('<svg class=\\"ic-user\\" xmlns=\\"http://www.w3.org/2000/svg\\"');
  });

  it("keeps a double-quoted SVG intact inside a single-quoted string", () => {
    const { transform } = createPlugin({ mode: "svg" });

    const result = transform(`const markup = '<i class="ic-user"></i>';`, "app.ts");

    expect(result?.code).toContain(`'<svg class="ic-user" xmlns="http://www.w3.org/2000/svg"`);
  });

  it("keeps an escaped attribute beside the class as written in a string literal", () => {
    const { transform } = createPlugin({ mode: "svg" });

    const result = transform(`const markup = "<i aria-hidden=\\"true\\" class=\\"ic-user\\"></i>";`, "app.ts");
    const markup = new Function(`${result?.code ?? ""}; return markup;`)() as string;

    expect(markup).toContain('<svg aria-hidden="true" class="ic-user"');
  });

  it.each([
    ['"', `const markup = "<i class=\\"ic-path\\"></i>";`],
    ["'", `const markup = '<i class="ic-path"></i>';`],
    ["`", 'const markup = `<i class="ic-path"></i>`;'],
  ])("keeps a backslash in the artwork inside a %s-quoted string", (_quote, source) => {
    const family = createFamily();
    family.icons.path = { body: String.raw`<text>C:\new</text>` };
    const { transform } = createPlugin({ families: [family], mode: "svg" });

    const result = transform(source, "app.ts");
    const markup = new Function(`${result?.code ?? ""}; return markup;`)() as string;

    expect(markup).toContain(String.raw`<text>C:\new</text>`);
  });

  it.each([
    ['"', `const markup = "<i class=\\"ic-path\\"></i>";`],
    ["'", `const markup = '<i class="ic-path"></i>';`],
    ["`", 'const markup = `<i class="ic-path"></i>`;'],
  ])("keeps line breaks in the artwork inside a %s-quoted string", (_quote, source) => {
    const family = createFamily();
    family.icons.path = { body: "<g>\n<path d='a' />\r\n</g>" };
    const { transform } = createPlugin({ families: [family], mode: "svg" });

    const result = transform(source, "app.ts");
    const markup = new Function(`${result?.code ?? ""}; return markup;`)() as string;

    expect(markup).toContain("<g>\n<path d='a' />\r\n</g>");
  });

  it("keeps a line break in the artwork raw inside a tagged template", () => {
    const family = createFamily();
    family.icons.path = { body: "<g>\n<path d='a' /></g>" };
    const { transform } = createPlugin({ families: [family], mode: "svg" });

    const result = transform('const markup = String.raw`<i class="ic-path"></i>`;', "app.ts");
    const markup = new Function(`${result?.code ?? ""}; return markup;`)() as string;

    expect(markup).toContain("<g>\n<path d='a' /></g>");
  });

  it.each([
    ['"', 'const ok = true; const markup = `<p>${ok ? "<i class=\\"ic-user\\"></i>" : ""}</p>`;'],
    ["'", "const ok = true; const markup = `<p>${ok ? '<i class=\"ic-user\"></i>' : ''}</p>`;"],
    ["`", 'const ok = true; const markup = `<p>${ok ? `<i class="ic-user"></i>` : ``}</p>`;'],
  ])("escapes an icon tag in a %s-quoted string inside a template expression", (_quote, source) => {
    const { transform } = createPlugin({ mode: "svg" });

    const result = transform(source, "app.ts");
    const markup = new Function(`${result?.code ?? ""}; return markup;`)() as string;

    expect(markup).toContain('<p><svg class="ic-user" xmlns="http://www.w3.org/2000/svg"');
  });

  it("finds the string an icon tag sits in after a template expression with nested braces closes", () => {
    const { transform } = createPlugin({ mode: "svg" });

    const source = 'const a = `${{ b: 1 }.b}`; const markup = "<i class=\\"ic-user\\"></i>";';
    const result = transform(source, "app.ts");
    const markup = new Function(`${result?.code ?? ""}; return markup;`)() as string;

    expect(markup).toContain('<svg class="ic-user"');
  });

  describe("a multicolor icon's paint", () => {
    const logos: IconFamilyData = {
      ...createFamily(),
      icons: { google: { body: '<stop style="stop-color: #fff" /><path fill="#ea4335" d="g" />' } },
      info: { ...createFamily().info, multicolor: true },
      prefix: "logos",
    };

    it("is a camel-cased style object on every element in bare JSX", () => {
      const { transform } = createPlugin({ families: [createFamily(), logos], mode: "svg" });

      const code = transform('export const App = () => <i className="ic-logos-google" />;', "app.tsx")?.code;

      expect(code).toContain('style={{"fill":"var(--ic-color, #ea4335)"}}');
      expect(code).toContain('<stop style={{"stopColor":"#fff"}} />');
      expect(code).not.toContain('style="');
    });

    it("stays a style string in HTML", () => {
      const { transformIndexHtml } = createPlugin({ families: [createFamily(), logos], mode: "svg" });

      const html = transformIndexHtml('<i class="ic-logos-google"></i>', {}) as string;

      expect(html).toContain('style="fill: var(--ic-color, #ea4335)"');
    });
  });

  describe("a brand icon's color", () => {
    const brand: IconFamilyData = {
      ...createFamily(),
      icons: { mark: { body: '<path d="mark" />', color: "#181717" } },
      prefix: "brand",
    };

    it("is a style object in bare JSX, which React requires", () => {
      const { transform } = createPlugin({ families: [createFamily(), brand], mode: "svg" });

      const code = transform('export const App = () => <i className="ic-brand-mark" />;', "app.tsx")?.code;

      expect(code).toContain('<g color="#181717" style={{"color":"var(--ic-color, #181717)"}}>');
      expect(code).not.toContain('style="');
    });

    it("is a style object after JSX text with an apostrophe, which the quote scanner reads as a string", () => {
      const { transform } = createPlugin({ families: [createFamily(), brand], mode: "svg" });

      const code = transform(
        'export const App = () => <p>Don\'t <i className="ic-brand-mark" /></p>;',
        "app.tsx",
      )?.code;

      expect(code).toContain('style={{"color":"var(--ic-color, #181717)"}}');
    });

    it("is a style object for JSX in a .js file", () => {
      const { transform } = createPlugin({ families: [createFamily(), brand], mode: "svg" });

      const code = transform('export const App = () => <i className="ic-brand-mark" />;', "app.js")?.code;

      expect(code).toContain('style={{"color":"var(--ic-color, #181717)"}}');
    });

    it("stays an escaped style string for a className tag inside a string literal", () => {
      const { transform } = createPlugin({ families: [createFamily(), brand], mode: "svg" });

      const code = transform(`const markup = "<i className='ic-brand-mark' />";`, "app.tsx")?.code;

      expect(code).toContain('style=\\"color: var(--ic-color, #181717)\\"');
      expect(code).not.toContain("style={{");
    });

    it("stays a style string inside a string literal in a JSX file", () => {
      const { transform } = createPlugin({ families: [createFamily(), brand], mode: "svg" });

      const code = transform('const markup = `<i class="ic-brand-mark"></i>`;', "app.tsx")?.code;

      expect(code).toContain('style="color: var(--ic-color, #181717)"');
    });

    it("stays a style string in a template that is not JSX", () => {
      const { transform } = createPlugin({ families: [createFamily(), brand], mode: "svg" });

      const code = transform('<template><i class="ic-brand-mark"></i></template>', "app.vue")?.code;

      expect(code).toContain('style="color: var(--ic-color, #181717)"');
    });
  });

  it("replaces an icon tag written inside a template literal", () => {
    const { transform } = createPlugin({ mode: "svg" });

    const result = transform('const markup = `<i class="ic-user"></i>`;', "app.tsx");

    expect(result?.code).toContain("<svg");
    expect(result?.code).not.toContain("<i ");
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

  it("replaces an icon tag in an .astro template without escaping it", () => {
    const { transform } = createPlugin({ mode: "svg" });

    const result = transform(
      ["---", 'const title = "Home";', "---", '<i class="ic-user"></i>'].join("\n"),
      "index.astro",
    );

    expect(result?.code).toContain('<svg class="ic-user" xmlns="http://www.w3.org/2000/svg"');
    expect(result?.code).not.toContain("<i ");
  });

  it("escapes an icon tag written inside an .astro frontmatter string", () => {
    const { transform } = createPlugin({ mode: "svg" });

    const result = transform(
      ["---", 'const markup = "<i class=\\"ic-user\\"></i>";', "---", "<div></div>"].join("\n"),
      "index.astro",
    );

    expect(result?.code).toContain('<svg class=\\"ic-user\\" xmlns=\\"http://www.w3.org/2000/svg\\"');
  });

  it("escapes each half of an .astro file for what that half is", () => {
    const { transform } = createPlugin({ mode: "svg" });

    const result = transform(
      ["---", 'const markup = "<i class=\\"ic-user\\"></i>";', "---", '<i class="ic-x"></i>'].join("\n"),
      "index.astro",
    );

    // The frontmatter copy is escaped for the string holding it; the template
    // copy is not, because escaping it would corrupt the rendered markup.
    expect(result?.code).toContain('<svg class=\\"ic-user\\" xmlns=\\"http://www.w3.org/2000/svg\\"');
    expect(result?.code).toContain('<svg class="ic-x" xmlns="http://www.w3.org/2000/svg"');
  });

  it("replaces an icon tag in an .astro file that opens with no frontmatter", () => {
    const { transform } = createPlugin({ mode: "svg" });

    const result = transform('<i class="ic-user"></i>', "component.astro");

    expect(result?.code).toContain('<svg class="ic-user" xmlns="http://www.w3.org/2000/svg"');
  });

  it("treats an empty frontmatter fence as frontmatter", () => {
    const { transform } = createPlugin({ mode: "svg" });

    const result = transform(["---", "---", '<i class="ic-user"></i>'].join("\n"), "index.astro");

    expect(result?.code).toContain('<svg class="ic-user" xmlns="http://www.w3.org/2000/svg"');
    expect(result?.code).not.toContain('\\"');
  });

  it("escapes an icon tag in a template script whose end tag has whitespace before its bracket", () => {
    const { transform } = createPlugin({ mode: "svg" });

    const source = ["---", "---", "<script>", '  el.innerHTML = "<i class=\\"ic-user\\"></i>";', "</script >"].join(
      "\n",
    );
    const result = transform(source, "index.astro");

    expect(result?.code).toContain('<svg class=\\"ic-user\\" xmlns=\\"http://www.w3.org/2000/svg\\"');
  });

  it("escapes an icon tag inside an .astro template script block", () => {
    const { transform } = createPlugin({ mode: "svg" });

    const source = ["---", "---", "<script>", '  el.innerHTML = "<i class=\\"ic-user\\"></i>";', "</script>"].join(
      "\n",
    );
    const result = transform(source, "index.astro");

    expect(result?.code).toContain('<svg class=\\"ic-user\\" xmlns=\\"http://www.w3.org/2000/svg\\"');
  });

  it("leaves template markup unescaped while escaping a script beside it", () => {
    const { transform } = createPlugin({ mode: "svg" });

    const source = [
      "---",
      "---",
      '<i class="ic-x"></i>',
      "<script>",
      '  el.innerHTML = "<i class=\\"ic-user\\"></i>";',
      "</script>",
    ].join("\n");
    const result = transform(source, "index.astro");

    expect(result?.code).toContain('<svg class="ic-x" xmlns="http://www.w3.org/2000/svg"');
    expect(result?.code).toContain('<svg class=\\"ic-user\\" xmlns=\\"http://www.w3.org/2000/svg\\"');
  });

  it("keeps a script tag's own attributes out of the JavaScript it escapes", () => {
    const { transform } = createPlugin({ mode: "svg" });

    // The opening tag carries quotes of its own. Handing them to the scan that
    // looks for the string around a match would make it read the body wrong.
    const source = ['<script type="module">', '  el.innerHTML = "<i class=\\"ic-user\\"></i>";', "</script>"].join(
      "\n",
    );
    const result = transform(source, "index.astro");

    expect(result?.code).toContain('<script type="module">');
    expect(result?.code).toContain('<svg class=\\"ic-user\\" xmlns=\\"http://www.w3.org/2000/svg\\"');
  });

  it("warns about an icon class it does not rewrite in an .astro file", () => {
    const { generateBundle, transform } = createPlugin({ mode: "svg" });
    const { context, warnings } = createBundleContext();

    transform(["---", "---", '<button class="btn ic-user">Save</button>'].join("\n"), "index.astro");
    generateBundle.call(context);

    expect(warnings.join("\n")).toContain("ic-user");
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

  it("does not warn about the icon class it keeps on a tag rewritten in a module", () => {
    const { generateBundle, transform } = createPlugin({ mode: "svg" });
    const { context, warnings } = createBundleContext();

    transform('const markup = "<i class=\\"ic-user\\"></i>";', "app.ts");
    generateBundle.call(context);

    expect(warnings.join("\n")).not.toContain("does not rewrite");
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

describe("viteIcons dev HTML injection", () => {
  it("injects the stylesheet script at the site root by default", () => {
    const { plugin, transformIndexHtml } = createPlugin();
    (plugin.configResolved as (config: { base: string }) => void)({ base: "/" });

    const result = transformIndexHtml("<html><head></head></html>", { server: {} }) as { attrs: { src: string } }[];

    expect(result[0].attrs.src).toBe("/@id/virtual:icons.css");
  });

  it("prefixes the injected script with a configured base", () => {
    // Regression test: a root-absolute `/@id/...` script `src` bypasses
    // Vite's own base-prefixed serving, so under a non-root base (an app
    // mounted at a subpath behind a reverse proxy, e.g. `packages/icons/demo`
    // run with `--base /icons/` under `apps/demo`'s dev proxy) the browser
    // requested the stylesheet at the wrong, un-prefixed URL -- which a
    // path-based proxy never forwards to this dev server at all, so a
    // different (or no) plugin instance silently answered instead.
    const { plugin, transformIndexHtml } = createPlugin();
    (plugin.configResolved as (config: { base: string }) => void)({ base: "/icons/" });

    const result = transformIndexHtml("<html><head></head></html>", { server: {} }) as { attrs: { src: string } }[];

    expect(result[0].attrs.src).toBe("/icons/@id/virtual:icons.css");
  });

  /** Runs a build's hooks in Vite's order: transform, generateBundle, transformIndexHtml. */
  function build(sources: string[], bundle: Record<string, object> = HTML_BUNDLE) {
    const { plugin, transform } = createPlugin();
    const emitted: { name?: string; source: string; type: string }[] = [];
    const context = { emitFile: (file: (typeof emitted)[number]) => (emitted.push(file), "ref0"), warn: () => {} };
    sources.forEach((source, index) => transform(source, `/app/page${index}.html`));
    (plugin.generateBundle as (this: unknown, options: object, bundle: object) => void).call(context, {}, bundle);
    // Vite 5 and 6 call this hook without a plugin context.
    const tags = (plugin.transformIndexHtml as (html: string, ctx: object) => unknown)("<html></html>", {});
    return { emitted, tags };
  }

  const HTML_BUNDLE = { "index.js": { facadeModuleId: "/app/index.html", type: "chunk" } };

  it("links an emitted stylesheet in a build, so a strict CSP allows it", () => {
    // An inline <style> is refused by `style-src 'self'` without a nonce or
    // hash, which left every icon blank in production with no warning.
    const { emitted, tags } = build(['<i class="ic-user"></i>']);

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ name: "codenhub-icons.css", type: "asset" });
    expect(emitted[0].source).toContain(".ic-user {");
    expect(tags).toEqual([
      { attrs: { href: "__VITE_ASSET__ref0__", rel: "stylesheet" }, injectTo: "head", tag: "link" },
    ]);
  });

  it("emits no stylesheet for a build without an HTML entry", () => {
    const { emitted } = build(['<i class="ic-user"></i>'], {
      "index.js": { facadeModuleId: "/app/src/index.ts", type: "chunk" },
    });

    expect(emitted).toEqual([]);
  });

  it("emits the same stylesheet whatever order the classes were found in", () => {
    // The asset's file name hashes its content, and Vite processes pages in
    // no fixed order, so an order-dependent stylesheet busted caches for nothing.
    const first = build(['<i class="ic-x"></i>', '<i class="ic-user"></i>']).emitted[0].source;
    const second = build(['<i class="ic-user"></i>', '<i class="ic-x"></i>']).emitted[0].source;

    expect(first).toBe(second);
  });
});

describe("viteIconsPlugin", () => {
  it("is the same plugin factory under its named alias", () => {
    expect(viteIconsPlugin).toBe(viteIcons);
  });
});
