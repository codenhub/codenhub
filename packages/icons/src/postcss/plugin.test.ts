import { describe, expect, it, vi } from "vitest";

import { IconRegistry } from "../core/registry.js";
import type { IconAttribution, IconFamilyData } from "../core/types.js";
import { postcssIcons, postcssIconsPlugin } from "./plugin.js";

function createFamily(attribution: IconAttribution = "notice"): IconFamilyData {
  return {
    icons: { search: { body: '<g stroke-width="2"><path d="search" /></g>' } },
    info: {
      attribution,
      author: { name: "Test Authors", url: "https://test.example" },
      license: { spdx: "ISC", title: "ISC License", url: "https://test.example/license" },
      name: "Test Family",
      strokeWidth: 2,
      tier: attribution === "credit" ? "extended" : "core",
      total: 1,
      upstream: { package: "test-icons", version: "1.0.0" },
    },
    prefix: "test",
  };
}

function run(options: Parameters<typeof postcssIcons>[0], css: string): string {
  const plugin = postcssIcons({ defaultPrefix: "test", families: [createFamily()], ...options });
  let appended = "";
  plugin.Once({ append: (value: unknown) => (appended += String(value)), toString: () => css }, {
    parse: (value: string) => value,
  } as never);
  return appended;
}

describe("postcssIcons", () => {
  it("appends the base rules and a rule for each scanned class", () => {
    const appended = run({}, ".button { color: red; } /* ic-search */");

    expect(appended).toContain(".ic {");
    expect(appended).toContain(".ic-search {");
    expect(appended).toContain("--ic-uri: url(");
  });

  it("honors a custom class prefix", () => {
    const appended = run({ prefix: "ux" }, "<div class='ux-search'></div>");

    expect(appended).toContain(".ux-search {");
  });

  it("accepts a prepared registry instead of families", () => {
    const registry = new IconRegistry({ defaultPrefix: "test" });
    registry.registerFamily(createFamily());

    expect(run({ families: [], registry }, "/* ic-search */")).toContain(".ic-search {");
  });

  it("appends nothing when there is no class and no base rules to write", () => {
    expect(run({ injectBase: false }, ".button { color: red; }")).toBe("");
  });

  it("prepends a preserved license banner by default", () => {
    expect(run({}, "/* ic-search */").startsWith("/*!")).toBe(true);
  });

  it("omits the banner for a family that owes nothing", () => {
    expect(run({ families: [createFamily("none")] }, "/* ic-search */").startsWith("/*!")).toBe(false);
  });

  it("warns instead of writing a banner when attribution is turned off", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const appended = run({ attribution: "off" }, "/* ic-search */");

    expect(appended.startsWith("/*!")).toBe(false);
    expect(warn.mock.calls[0]?.[0]).toContain("Test Family");
    warn.mockRestore();
  });

  it("declares itself to postcss", () => {
    expect(postcssIcons({}).postcssPlugin).toBe("postcss-codenhub-icons");
    expect(postcssIconsPlugin).toBe(postcssIcons);
  });
});
