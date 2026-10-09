import { describe, expect, it } from "vitest";

import { parseReferenceConfig } from "./reference-config.ts";

const path = "packages/example/package.json";

describe("parseReferenceConfig", () => {
  it("returns null when the key is absent or false", () => {
    expect(parseReferenceConfig({ codenhub: { docs: {} } }, path)).toBeNull();
    expect(parseReferenceConfig({ codenhub: { docs: { reference: false } } }, path)).toBeNull();
    expect(parseReferenceConfig({}, path)).toBeNull();
  });

  it("defaults prose to true for an empty object", () => {
    expect(parseReferenceConfig({ codenhub: { docs: { reference: {} } } }, path)).toEqual({
      entrypoints: undefined,
      exclude: undefined,
      prose: true,
    });
  });

  it("reads entrypoints, exclude, and prose", () => {
    const config = parseReferenceConfig(
      {
        codenhub: { docs: { reference: { entrypoints: [".", "./sub"], exclude: ["src/internal/**"], prose: false } } },
      },
      path,
    );
    expect(config).toEqual({ entrypoints: [".", "./sub"], exclude: ["src/internal/**"], prose: false });
  });

  it("rejects a non-object, non-false value", () => {
    expect(() => parseReferenceConfig({ codenhub: { docs: { reference: "yes" } } }, path)).toThrow(
      /expected an object/,
    );
  });

  it('rejects an entrypoint that is not "." or "./"-prefixed', () => {
    expect(() => parseReferenceConfig({ codenhub: { docs: { reference: { entrypoints: ["sub"] } } } }, path)).toThrow(
      /entrypoints/,
    );
  });

  it("rejects an explicitly empty entrypoints array", () => {
    expect(() => parseReferenceConfig({ codenhub: { docs: { reference: { entrypoints: [] } } } }, path)).toThrow(
      /at least one key/,
    );
  });

  it("rejects a non-boolean prose", () => {
    expect(() => parseReferenceConfig({ codenhub: { docs: { reference: { prose: "no" } } } }, path)).toThrow(/prose/);
  });
  it("reads pages with an entrypoint label and split pages", () => {
    const pages = {
      ".": { label: "Overview", split: { composition: { label: "Composition", source: ["src/composition/**"] } } },
      "./sub": { split: { parts: { source: ["src/parts/*.ts"] } } },
    };
    expect(parseReferenceConfig({ codenhub: { docs: { reference: { pages } } } }, path)?.pages).toEqual(pages);
  });

  it.each([
    ["a non-object pages", "yes"],
    ["a key that is not an exports subpath", { sub: {} }],
    ["an empty label", { ".": { label: " " } }],
    ["a split page named index", { ".": { split: { index: { source: ["src/**"] } } } }],
    ["a split page name that is not kebab-case", { ".": { split: { fooBar: { source: ["src/**"] } } } }],
    ["a split page with no source", { ".": { split: { parts: {} } } }],
    ["a split page with an empty source", { ".": { split: { parts: { source: [] } } } }],
    ["a split page with an empty label", { ".": { split: { parts: { label: "", source: ["src/**"] } } } }],
  ])("rejects %s", (_case, pages) => {
    expect(() => parseReferenceConfig({ codenhub: { docs: { reference: { pages } } } }, path)).toThrow(/pages/);
  });
});
