import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  await writeFile(join(directory, "node_modules/dependency/index.js"), `export const inlined = "INLINED_TEXT";\n`);
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
    const measured = await measureEntrypoint(join(directory, "dist/index.js"), ["peer"]);
    const withPeerInlined = measureEntrypoint(join(directory, "dist/index.js"), []);

    expect(measured.minified).toBeGreaterThan("INLINED_TEXT".length + "a lazily loaded module".length);
    expect(measured.gzip).toBeGreaterThan(0);
    expect(measured.sha256).toMatch(/^[0-9a-f]{64}$/u);
    // Without `peer` external, rolldown has to resolve it, and nothing installs it.
    await expect(withPeerInlined).rejects.toThrow("Could not resolve 'peer'");
  });

  it("measures the same bytes from any directory", async () => {
    const [first, second] = await Promise.all([createBuiltPackage(), createBuiltPackage()]);

    const measured = await Promise.all(
      [first, second].map((directory) => measureEntrypoint(join(directory, "dist/index.js"), ["peer"])),
    );

    expect(measured[0]).toEqual(measured[1]);
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
