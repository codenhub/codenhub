import { build, type Plugin, type Rolldown } from "vite";
import { describe, expect, it } from "vitest";

import type { IconFamilyData } from "../../src/core/types.js";
import { viteIcons } from "../../src/vite/plugin.js";

const family: IconFamilyData = {
  icons: { user: { body: '<path d="user" />' } },
  info: {
    attribution: "notice",
    author: { name: "Test Authors", url: "https://test.example" },
    license: { spdx: "ISC", title: "ISC License", url: "https://test.example/license" },
    name: "Test Family",
    tier: "core",
    total: 1,
    upstream: { package: "test-icons", version: "1.0.0" },
  },
  prefix: "test",
};

const PAGE_ID = "/page.astro";

/**
 * Stands in for Astro's compiler as Astro 7 registers it: an `enforce: "pre"`
 * plugin listed ahead of the user's `vite.plugins`, whose ordinary `transform`
 * turns `.astro` source into JavaScript and re-quotes frontmatter strings with
 * double quotes. It serves the page itself, so the build needs no files.
 */
function astroCompilerStandIn(source: string): Plugin {
  return {
    enforce: "pre",
    load: (id) => (id === PAGE_ID ? source : null),
    name: "astro-compiler-stand-in",
    resolveId: (id) => (id.endsWith("page.astro") ? PAGE_ID : null),
    transform(code, id) {
      if (id !== PAGE_ID) {
        return null;
      }
      const [, frontmatter = "", template = ""] = code.split(/^---$/m);
      const requoted = frontmatter.replace(/'([^']*)'/g, (_match, body: string) => JSON.stringify(body));
      return `${requoted}\nexport default ${JSON.stringify(template.trim())};\n`;
    },
  };
}

async function buildPage(source: string): Promise<string> {
  const output = (await build({
    build: { minify: false, rollupOptions: { input: "page.astro" }, write: false },
    configFile: false,
    logLevel: "silent",
    plugins: [astroCompilerStandIn(source), viteIcons({ defaultPrefix: "test", families: [family], mode: "svg" })],
  })) as Rolldown.RolldownOutput;
  return output.output.find((file) => file.type === "chunk")?.code ?? "";
}

describe("viteIcons beside a compiler listed ahead of it", () => {
  // codenhub/codenhub#451: Astro's compiler ran first, so the svg landed
  // unescaped in a string the compiler had re-quoted, and the build failed.
  it("rewrites an .astro frontmatter string before the compiler re-quotes it", async () => {
    const code = await buildPage(
      [
        "---",
        'const icon = \'<i aria-hidden="true" class="ic-user"></i>\';',
        "console.log(icon);",
        "---",
        "<p></p>",
      ].join("\n"),
    );

    expect(code).toContain('<svg aria-hidden=\\"true\\" class=\\"ic-user\\"');
  });
});
