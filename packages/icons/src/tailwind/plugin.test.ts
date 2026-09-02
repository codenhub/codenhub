import { describe, expect, it } from "vitest";

import type { IconFamilyData } from "../core/types.js";
import { createIconsTailwindPlugin } from "./plugin.js";
import type { TailwindIconsOptions } from "./plugin.js";

function createFamily(prefix: string, overrides?: Partial<IconFamilyData>): IconFamilyData {
  return {
    icons: {
      heart: { body: '<g stroke-width="2"><path d="heart" /></g>' },
      star: { body: '<g stroke-width="2"><path d="star" /></g>' },
    },
    info: {
      attribution: "notice",
      author: { name: `${prefix} authors`, url: `https://example.test/${prefix}` },
      license: { spdx: "MIT", title: "MIT License", url: "https://example.test/license" },
      name: prefix,
      strokeWidth: 2,
      tier: "core",
      total: 2,
      upstream: { package: `${prefix}-source`, version: "1.0.0" },
    },
    prefix,
    ...overrides,
  };
}

type UtilityResult = Record<string, string> | null;

/**
 * Runs the plugin the way Tailwind does and captures what it registered.
 *
 * Tailwind is not invoked here: the plugin's contract is the calls it makes
 * into the plugin API, so the API is stood in for and the calls are recorded.
 */
function runPlugin(families: IconFamilyData[], options?: TailwindIconsOptions) {
  const created = createIconsTailwindPlugin(families) as unknown as {
    (options?: TailwindIconsOptions): { handler: (api: unknown) => void };
  };

  const base: Record<string, Record<string, string>>[] = [];
  let values: Record<string, string> = {};
  let resolve: ((value: string, extra?: { modifier?: string | null }) => UtilityResult) | undefined;

  created(options).handler({
    addBase: (rules: Record<string, Record<string, string>>) => base.push(rules),
    matchUtilities: (
      utilities: Record<string, (value: string, extra?: { modifier?: string | null }) => UtilityResult>,
      config: { values: Record<string, string> },
    ) => {
      values = config.values;
      resolve = utilities.ic;
    },
  });

  return {
    base,
    resolve: (value: string, modifier?: string | null): UtilityResult => resolve?.(value, { modifier }) ?? null,
    values,
  };
}

describe("createIconsTailwindPlugin", () => {
  it("offers every qualified name of every family it was given", () => {
    const { values } = runPlugin([createFamily("alpha"), createFamily("beta")]);

    expect(values["alpha-heart"]).toBe("alpha:heart");
    expect(values["beta-star"]).toBe("beta:star");
  });

  it("offers no unqualified name without a configured default family", () => {
    const { resolve, values } = runPlugin([createFamily("alpha")]);

    expect(values.heart).toBeUndefined();
    expect(resolve("heart")).toBeNull();
  });

  it("offers unqualified names for the configured default family", () => {
    const { resolve, values } = runPlugin([createFamily("alpha")], { default: "alpha" });

    expect(values.heart).toBe("alpha:heart");
    expect(resolve("alpha:heart")).toMatchObject({ "--ic-mask": "var(--ic-uri)" });
  });

  it("narrows resolution to the requested families", () => {
    const { resolve, values } = runPlugin([createFamily("alpha"), createFamily("beta")], { families: ["alpha"] });

    expect(values["alpha-heart"]).toBe("alpha:heart");
    expect(values["beta-heart"]).toBeUndefined();
    expect(resolve("beta:heart")).toBeNull();
  });

  it("reports a family it cannot provide", () => {
    expect(() => runPlugin([createFamily("alpha")], { families: ["absent"] })).toThrow('unknown icon family "absent"');
  });

  it("rejects a candidate that is not an icon", () => {
    const { resolve } = runPlugin([createFamily("alpha")]);

    expect(resolve("not-an-icon")).toBeNull();
  });

  it("bakes the stroke modifier into the artwork", () => {
    const { resolve } = runPlugin([createFamily("alpha")]);

    const plain = resolve("alpha:heart");
    const thin = resolve("alpha:heart", "1.5");

    expect(thin).not.toBeNull();
    expect(thin?.["--ic-uri"]).not.toBe(plain?.["--ic-uri"]);
    expect(thin?.["--ic-uri"]).toContain("stroke-width=%221.5%22");
  });

  it("falls back to the configured stroke width when no modifier is written", () => {
    const { resolve } = runPlugin([createFamily("alpha")], { strokeWidth: 3 });

    expect(resolve("alpha:heart")?.["--ic-uri"]).toContain("stroke-width=%223%22");
  });

  it("reads the stroke width written the way CSS writes it", () => {
    // A CSS formatter lowercases a property name, so a `strokeWidth` key in a
    // `@plugin` block arrives as `strokewidth` and is silently dropped. The
    // hyphenated spelling is the one that survives being formatted.
    const { resolve } = runPlugin([createFamily("alpha")], { "stroke-width": 3 });

    expect(resolve("alpha:heart")?.["--ic-uri"]).toContain("stroke-width=%223%22");
  });

  it("prefers the JavaScript spelling when both are given", () => {
    const { resolve } = runPlugin([createFamily("alpha")], { "stroke-width": 3, strokeWidth: 1 });

    expect(resolve("alpha:heart")?.["--ic-uri"]).toContain("stroke-width=%221%22");
  });

  it("lets a modifier override the configured stroke width", () => {
    const { resolve } = runPlugin([createFamily("alpha")], { "stroke-width": 3 });

    expect(resolve("alpha:heart", "1.5")?.["--ic-uri"]).toContain("stroke-width=%221.5%22");
  });

  it("reports a default naming a family it does not resolve", () => {
    expect(() => runPlugin([createFamily("alpha")], { default: "absent" })).toThrow(
      'default icon family "absent" is not among the families',
    );
  });

  it("reports a default excluded by the family list", () => {
    // Both options are individually valid, so the mistake is only visible in
    // the pair: without this, `ic-heart` would emit nothing and say nothing.
    expect(() =>
      runPlugin([createFamily("alpha"), createFamily("beta")], { default: "beta", families: ["alpha"] }),
    ).toThrow('default icon family "beta" is not among the families');
  });

  it("honours a custom class prefix", () => {
    const created = createIconsTailwindPlugin([createFamily("alpha")]) as unknown as {
      (options?: TailwindIconsOptions): { handler: (api: unknown) => void };
    };
    let key = "";
    created({ prefix: "icon" }).handler({
      addBase: () => undefined,
      matchUtilities: (utilities: Record<string, unknown>) => {
        key = Object.keys(utilities)[0];
      },
    });

    expect(key).toBe("icon");
  });

  it("emits a family's license notice the first time it is used, and only once", () => {
    const { base, resolve } = runPlugin([createFamily("alpha")]);

    resolve("alpha:heart");
    resolve("alpha:star");

    expect(base).toHaveLength(1);
    expect(base[0][":root"]["--ic-attribution-alpha"]).toContain("MIT License");
  });

  it("emits no notice for a family that is never used", () => {
    const { base, resolve } = runPlugin([createFamily("alpha"), createFamily("beta")]);

    resolve("alpha:heart");

    expect(base).toHaveLength(1);
    expect(Object.keys(base[0][":root"])).toEqual(["--ic-attribution-alpha"]);
  });

  it("emits no notice for a family whose license asks for none", () => {
    const family = createFamily("alpha");
    family.info.attribution = "none";
    const { base, resolve } = runPlugin([family]);

    resolve("alpha:heart");

    expect(base).toEqual([]);
  });

  it("emits no notice when attribution is turned off", () => {
    const { base, resolve } = runPlugin([createFamily("alpha")], { attribution: "off" });

    resolve("alpha:heart");

    expect(base).toEqual([]);
  });
});
