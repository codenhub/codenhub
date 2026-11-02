import { describe, expect, it } from "vitest";

import { describeEntrypoints } from "./bundle-breakdown";

describe("describeEntrypoints", () => {
  const entry = { gzip: 40, minified: 100, sha256: "0".repeat(64) };

  it("lists every subpath in manifest order, sized only where the release measured it", () => {
    const report = { bundler: "rolldown@1.1.5", entrypoints: { "./client": entry } };

    expect(describeEntrypoints([".", "./client", "./styles"], report)).toEqual([
      { subpath: "." },
      { exports: undefined, size: { gzip: 40, minified: 100 }, subpath: "./client" },
      { subpath: "./styles" },
    ]);
    expect(describeEntrypoints(["."], undefined)).toEqual([{ subpath: "." }]);
  });

  it("lists an entrypoint's exports by name, each with its share of the entrypoint", () => {
    const [root] = describeEntrypoints(["."], {
      bundler: "rolldown@1.2.15",
      entrypoints: {
        ".": {
          ...entry,
          exports: { getErrorRegistry: { gzip: 10, minified: 20 }, createAppError: { gzip: 30, minified: 50 } },
        },
      },
    });

    expect(root?.exports).toEqual([
      { gzip: 30, minified: 50, name: "createAppError", share: 0.5 },
      { gzip: 10, minified: 20, name: "getErrorRegistry", share: 0.2 },
    ]);
  });

  it("reads an entrypoint or export with no runtime code as 0 B gzipped", () => {
    const [root] = describeEntrypoints(["."], {
      bundler: "r@1",
      entrypoints: {
        ".": { gzip: 20, minified: 0, sha256: "0".repeat(64), exports: { Type: { gzip: 20, minified: 0 } } },
      },
    });

    expect(root?.size).toEqual({ gzip: 0, minified: 0 });
    expect(root?.exports?.[0]).toEqual({ gzip: 0, minified: 0, name: "Type", share: 0 });
  });

  it("keeps an export named __proto__", () => {
    const exports = Object.create(null) as Record<string, { gzip: number; minified: number }>;
    exports["__proto__"] = { gzip: 1, minified: 1 };

    const [root] = describeEntrypoints(["."], { bundler: "r@1", entrypoints: { ".": { ...entry, exports } } });

    expect(root?.exports?.map(({ name }) => name)).toEqual(["__proto__"]);
  });
});
