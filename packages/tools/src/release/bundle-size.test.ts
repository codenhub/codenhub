import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { rolldown } from "rolldown";
import { describe, expect, it } from "vitest";

import type { WorkspacePackage } from "../workspace/discover.ts";
import { BUNDLER, checkBundleSize, measureEntrypoint, measurePackage } from "./bundle-size.ts";
import { serializeSizeReport, type SizeReport } from "./size-report.ts";

/**
 * Writes a built package on disk: `dist/index.js` imports a dependency, a peer,
 * and a Node.js builtin, and `dist/lazy.js` is reached by a dynamic import.
 */
async function createBuiltPackage(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "codenhub-size-"));
  await mkdir(join(directory, "dist"));
  await mkdir(join(directory, "node_modules/dependency"), { recursive: true });
  await writeFile(
    join(directory, "dist/index.js"),
    [
      `import { inlined } from "dependency";`,
      `import { shared } from "peer";`,
      `import { readFile } from "node:fs/promises";`,
      `export const answer = () => inlined + shared + readFile.name;`,
      `export const later = () => import("./lazy.js");`,
      "",
    ].join("\n"),
  );
  await writeFile(join(directory, "dist/lazy.js"), `export const lazy = "a lazily loaded module";\n`);
  await writeFile(
    join(directory, "node_modules/dependency/package.json"),
    JSON.stringify({ exports: { import: "./index.js" }, name: "dependency", type: "module" }),
  );
  // A function, unlike a constant, is not folded into the code that uses it,
  // so its bytes stay attributable to the dependency.
  await writeFile(
    join(directory, "node_modules/dependency/index.js"),
    `export function inlined() { return "INLINED_TEXT" + Math.random(); }\n`,
  );
  return directory;
}

function createPackage(directory: string): WorkspacePackage {
  return {
    directory,
    directoryName: "example",
    isPrivate: false,
    location: "packages/example",
    manifest: {
      exports: { ".": { import: "./dist/index.js", types: "./dist/index.d.ts" }, "./styles": "./dist/index.css" },
      name: "@fixture/example",
      peerDependencies: { peer: "^1.0.0" },
      version: "1.0.0",
    },
    name: "@fixture/example",
    scripts: {},
    unscopedName: "example",
    workspaceDependencies: [],
  };
}

const built = async () => ({ isSuccess: true, output: "" });

describe("measureEntrypoint", () => {
  it("inlines dependencies and dynamic imports and leaves peers and builtins external", async () => {
    const directory = await createBuiltPackage();
    const entry = join(directory, "dist/index.js");
    const grow = async (file: string, text: string): Promise<void> => {
      const contents = await readFile(join(directory, file), "utf8");
      await writeFile(join(directory, file), contents.replace(text, `${text}${"x".repeat(100)}`));
    };

    const before = await measureEntrypoint(entry, ["peer"]);
    await grow("node_modules/dependency/index.js", "INLINED_TEXT");
    const withLongerDependency = await measureEntrypoint(entry, ["peer"]);
    await grow("dist/lazy.js", "a lazily loaded module");
    const withLongerLazyModule = await measureEntrypoint(entry, ["peer"]);

    // A string literal grown by 100 characters grows the bundle by exactly that
    // much only when the module holding it is inside the bundle.
    expect(withLongerDependency.minified - before.minified).toBe(100);
    expect(withLongerLazyModule.minified - withLongerDependency.minified).toBe(100);
    expect(before.gzip).toBeGreaterThan(0);
    expect(before.sha256).toMatch(/^[0-9a-f]{64}$/u);
    // Neither `peer` nor `node:fs/promises` is installed, so bundling succeeds
    // only because both stay external; making the peer internal fails.
    await expect(measureEntrypoint(entry, [])).rejects.toThrow("Could not resolve 'peer'");
  });

  it("measures the same bytes from any directory", async () => {
    const [first, second] = await Promise.all([createBuiltPackage(), createBuiltPackage()]);

    const measured = await Promise.all(
      [first, second].map((directory) => measureEntrypoint(join(directory, "dist/index.js"), ["peer"])),
    );

    expect(measured[0]).toEqual(measured[1]);
  });

  it("measures each export alone, tree-shaken", async () => {
    const directory = await createBuiltPackage();
    const entry = join(directory, "dist/index.js");

    const before = await measureEntrypoint(entry, ["peer"]);
    const contents = await readFile(join(directory, "dist/lazy.js"), "utf8");
    await writeFile(join(directory, "dist/lazy.js"), contents.replace("lazily", `lazily${"x".repeat(100)}`));
    const after = await measureEntrypoint(entry, ["peer"]);

    expect(Object.keys(before.exports ?? {})).toEqual(["answer", "later"]);
    // Only `later` reaches the lazy module, so only it grows.
    expect(after.exports?.later?.minified).toBe((before.exports?.later?.minified ?? 0) + 100);
    expect(after.exports?.answer).toEqual(before.exports?.answer);
    expect(before.exports?.answer?.minified).toBeLessThan(before.minified);
    expect(before.exports?.answer?.gzip).toBeGreaterThan(0);
  });

  it("attributes every byte to a file, the dependency it came from, or neither", async () => {
    const directory = await createBuiltPackage();

    const { files, minified } = await measureEntrypoint(join(directory, "dist/index.js"), ["peer"]);

    expect(Object.keys(files ?? {}).sort()).toEqual([
      "(unattributed)",
      "dist/index.js",
      "dist/lazy.js",
      "node_modules/dependency",
    ]);
    expect(Object.values(files ?? {}).reduce((sum, bytes) => sum + bytes, 0)).toBe(minified);
  });

  it("attributes bytes through the build's source maps to the source files", async () => {
    const directory = await createBuiltPackage();
    await mkdir(join(directory, "src"));
    await writeFile(join(directory, "src/big.ts"), `export const big = "${"b".repeat(400)}";\n`);
    await writeFile(join(directory, "src/small.ts"), `export const small = "${"s".repeat(40)}";\n`);
    await writeFile(
      join(directory, "src/index.ts"),
      `export { big } from "./big.ts";\nexport { small } from "./small.ts";\n`,
    );
    const build = await rolldown({ input: join(directory, "src/index.ts"), logLevel: "silent" });
    await build.write({ file: join(directory, "dist/mapped.js"), format: "esm", sourcemap: true });
    await build.close();

    const { files, minified, sha256 } = await measureEntrypoint(join(directory, "dist/mapped.js"), []);
    await rm(join(directory, "dist/mapped.js.map"));
    const unmapped = await measureEntrypoint(join(directory, "dist/mapped.js"), []);

    expect(files?.["src/big.ts"]).toBeGreaterThanOrEqual(400);
    expect(files?.["src/small.ts"]).toBeGreaterThanOrEqual(40);
    expect(files?.["src/small.ts"]).toBeLessThan(400);
    expect(Object.keys(files ?? {})[0]).toBe("src/big.ts");
    expect(Object.values(files ?? {}).reduce((sum, bytes) => sum + bytes, 0)).toBe(minified);
    // Reading the map changes what is attributed, never the measured bytes.
    expect(unmapped.sha256).toBe(sha256);
    expect(Object.keys(unmapped.files ?? {})).not.toContain("src/big.ts");
  });
});

describe("measurePackage", () => {
  it("builds first and measures every JavaScript entrypoint", async () => {
    const directory = await createBuiltPackage();
    const order: string[] = [];

    const report = await measurePackage(createPackage(directory), {
      build: async () => {
        order.push("build");
        return { isSuccess: true, output: "" };
      },
      measure: async (file, peers) => {
        order.push(`measure ${file.endsWith(join("dist", "index.js"))} ${peers.join(",")}`);
        return { gzip: 1, minified: 2, sha256: "aa" };
      },
    });

    expect(order).toEqual(["build", "measure true peer"]);
    expect(report).toEqual({ bundler: BUNDLER, entrypoints: { ".": { gzip: 1, minified: 2, sha256: "aa" } } });
  });

  it("hands the build its timeout", async () => {
    const directory = await createBuiltPackage();
    const timeouts: (number | undefined)[] = [];

    await measurePackage(createPackage(directory), {
      build: async (_workspacePackage, timeoutMs) => {
        timeouts.push(timeoutMs);
        return { isSuccess: true, output: "" };
      },
      measure: async () => ({ gzip: 1, minified: 2, sha256: "aa" }),
      timeoutMs: 1234,
    });

    expect(timeouts).toEqual([1234]);
  });

  it("says a build that hit the timeout timed out, rather than failed", async () => {
    const directory = await createBuiltPackage();

    await expect(
      measurePackage(createPackage(directory), {
        build: async () => ({ didTimeOut: true, isSuccess: false, output: "partial" }),
        timeoutMs: 600_000,
      }),
    ).rejects.toThrow("did not finish building within 600 s");
  });

  it("refuses to measure a package that does not build", async () => {
    const directory = await createBuiltPackage();

    await expect(
      measurePackage(createPackage(directory), { build: async () => ({ isSuccess: false, output: "tsdown failed" }) }),
    ).rejects.toThrow("did not build");
  });
});

describe("checkBundleSize", () => {
  it("is ready when size.json matches the build", async () => {
    const directory = await createBuiltPackage();
    const workspacePackage = createPackage(directory);
    await writeFile(
      join(directory, "size.json"),
      serializeSizeReport(await measurePackage(workspacePackage, { build: built })),
    );

    const check = await checkBundleSize(workspacePackage, { build: built });

    expect(check).toEqual({ detail: "size.json matches 1 measured entrypoint(s)", name: "size", status: "ready" });
  });

  it("blocks when size.json is missing", async () => {
    const directory = await createBuiltPackage();

    const check = await checkBundleSize(createPackage(directory), { build: built });

    expect(check.status).toBe("blocked");
    expect(check.detail).toContain("no size.json");
  });

  it("reports a size.json it cannot read as unreadable, not as missing", async () => {
    const directory = await createBuiltPackage();
    await mkdir(join(directory, "size.json"));

    const check = await checkBundleSize(createPackage(directory), { build: built });

    expect(check.status).toBe("blocked");
    expect(check.detail).toContain("size.json could not be read");
  });

  it("blocks when the build no longer matches size.json", async () => {
    const directory = await createBuiltPackage();
    const workspacePackage = createPackage(directory);
    await writeFile(
      join(directory, "size.json"),
      serializeSizeReport(await measurePackage(workspacePackage, { build: built })),
    );
    await writeFile(join(directory, "dist/lazy.js"), `export const lazy = "changed after the cut";\n`);

    const check = await checkBundleSize(workspacePackage, { build: built });

    expect(check.status).toBe("blocked");
    expect(check.detail).toContain("size.json does not match this build: . is");
  });

  it("blocks when size.json is not a size report or the build fails", async () => {
    const directory = await createBuiltPackage();
    const workspacePackage = createPackage(directory);
    const recorded: SizeReport = { bundler: BUNDLER, entrypoints: {} };
    await writeFile(join(directory, "size.json"), "{}");

    const unreadable = await checkBundleSize(workspacePackage, { build: built });
    await writeFile(join(directory, "size.json"), serializeSizeReport(recorded));
    const unbuilt = await checkBundleSize(workspacePackage, {
      build: async () => ({ isSuccess: false, output: "" }),
    });

    expect(unreadable).toMatchObject({ name: "size", status: "blocked" });
    expect(unreadable.detail).toContain("is not a size report");
    expect(unbuilt).toMatchObject({ name: "size", status: "blocked" });
    expect(unbuilt.detail).toContain("did not build");
  });
});
