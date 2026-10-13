import { describe, expect, it, vi } from "vitest";

import type { WorkspacePackage } from "../workspace/discover.ts";
import {
  compareVersions,
  listEntryTargets,
  readPackageReadiness,
  type ReadinessOptions,
  type ReleaseRunner,
} from "./readiness.ts";

function createPackage(manifest: Record<string, unknown> = {}): WorkspacePackage {
  return {
    directory: "/repo/packages/example",
    directoryName: "example",
    isPrivate: false,
    location: "packages/example",
    manifest: {
      exports: { ".": { import: "./dist/index.js", types: "./dist/index.d.ts" } },
      name: "@fixture/example",
      version: "1.2.0",
      ...manifest,
    },
    name: "@fixture/example",
    scripts: {},
    unscopedName: "example",
    workspaceDependencies: [],
  };
}

/** What `npm view <name> version --json` prints on stdout when the registry has no such package. */
const NOT_FOUND_OUTPUT = JSON.stringify({
  error: { code: "E404", detail: "could not be found", summary: "Not Found" },
});

/** Answers `npm view` with a version and `git status` with a clean tree. */
function createRunner(published?: string, changes = ""): ReleaseRunner {
  return vi.fn(async (command: string) => {
    if (command === "npm") {
      return published === undefined
        ? { isSuccess: false, stdout: NOT_FOUND_OUTPUT }
        : { isSuccess: true, stdout: JSON.stringify(published) };
    }
    return { isSuccess: true, stdout: changes };
  });
}

/** Fails `npm view` with the given stdout, and answers `git status` with a clean tree. */
function createFailingRunner(stdout: string): ReleaseRunner {
  return vi.fn(async (command: string) => {
    if (command === "npm") {
      return { isSuccess: false, stdout };
    }
    return { isSuccess: true, stdout: "" };
  });
}

async function checkFor(
  workspacePackage: WorkspacePackage,
  options: ReadinessOptions,
  name: string,
): Promise<{ status: string; detail: string }> {
  const readiness = await readPackageReadiness(workspacePackage, options);
  const check = readiness.checks.find((entry) => entry.name === name);
  return { detail: check?.detail ?? "", status: check?.status ?? "missing" };
}

const packed = async (): Promise<Set<string>> => new Set(["dist/index.js", "dist/index.d.ts", "README.md"]);

describe("compareVersions", () => {
  it("orders release parts numerically", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("0.9.0", "1.0.0")).toBeLessThan(0);
  });

  it("sorts a pre-release below the release it precedes", () => {
    expect(compareVersions("1.0.0-rc.1", "1.0.0")).toBeLessThan(0);
    expect(compareVersions("1.0.0", "1.0.0-rc.1")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0-rc.2", "1.0.0-rc.10")).toBeLessThan(0);
  });

  it("ignores build metadata", () => {
    expect(compareVersions("1.0.0+build.5", "1.0.0")).toBe(0);
  });
});

describe("listEntryTargets", () => {
  it("collects every published target once", () => {
    const targets = listEntryTargets({
      exports: { ".": { import: "./dist/index.js", types: "./dist/index.d.ts" }, "./lib": "./dist/lib.js" },
      main: "./dist/index.js",
      types: "./dist/index.d.ts",
    });

    expect(targets.sort()).toEqual(["dist/index.d.ts", "dist/index.js", "dist/lib.js"]);
  });
});

describe("readPackageReadiness", () => {
  it("accepts a version newer than the published one", async () => {
    const check = await checkFor(createPackage(), { readPack: packed, run: createRunner("1.1.0") }, "version");

    expect(check.status).toBe("ready");
    expect(check.detail).toContain("1.2.0 is newer than the published 1.1.0");
  });

  it("blocks a version already on the registry", async () => {
    const check = await checkFor(createPackage(), { readPack: packed, run: createRunner("1.2.0") }, "version");

    expect(check.status).toBe("blocked");
  });

  it("treats an unpublished name as a first release", async () => {
    const check = await checkFor(createPackage(), { readPack: packed, run: createRunner() }, "version");

    expect(check.status).toBe("ready");
    expect(check.detail).toContain("first published version");
  });

  it("reports a failed lookup that is not a 404 as unknown, not as a first release", async () => {
    const check = await checkFor(createPackage(), { readPack: packed, run: createFailingRunner("") }, "version");

    expect(check.status).toBe("unknown");
    expect(check.detail).toContain("could not report the published version");
  });

  it("reports a failed lookup with non-JSON output as unknown", async () => {
    const run = createFailingRunner("npm error network request to https://registry.npmjs.org failed");
    const check = await checkFor(createPackage(), { readPack: packed, run }, "version");

    expect(check.status).toBe("unknown");
  });

  it("reports a failed lookup with another error code as unknown", async () => {
    const run = createFailingRunner(JSON.stringify({ error: { code: "ETIMEDOUT", summary: "timed out" } }));
    const check = await checkFor(createPackage(), { readPack: packed, run }, "version");

    expect(check.status).toBe("unknown");
  });

  it("reports a failure with malformed JSON as unknown rather than throwing", async () => {
    const check = await checkFor(createPackage(), { readPack: packed, run: createFailingRunner("{") }, "version");

    expect(check.status).toBe("unknown");
  });

  it("blocks a manifest with no version", async () => {
    const workspacePackage = createPackage();
    delete (workspacePackage.manifest as Record<string, unknown>).version;

    const check = await checkFor(workspacePackage, { readPack: packed, run: createRunner("1.0.0") }, "version");

    expect(check.status).toBe("blocked");
  });

  it("blocks an uncommitted working tree", async () => {
    const runner = createRunner("1.1.0", " M packages/example/src/index.ts");

    const check = await checkFor(createPackage(), { readPack: packed, run: runner }, "worktree");

    expect(check.status).toBe("blocked");
    expect(check.detail).toContain("1 uncommitted change(s)");
  });

  it("scopes the working-tree check to the package directory", async () => {
    const runner = createRunner("1.1.0");

    await readPackageReadiness(createPackage(), { readPack: packed, run: runner });

    // The pathspec resolves against the working directory git runs in, so it
    // must stay `.` and the working directory must be the package itself.
    expect(runner).toHaveBeenCalledWith("git", ["status", "--porcelain", "--", "."], "/repo/packages/example");
  });

  it("blocks a tarball missing an entry point", async () => {
    const readPack = async (): Promise<Set<string>> => new Set(["README.md"]);

    const check = await checkFor(createPackage(), { readPack, run: createRunner("1.1.0") }, "tarball");

    expect(check.status).toBe("blocked");
    expect(check.detail).toContain("dist/index.js");
  });

  it("accepts a wildcard entry target the tarball has a match for", async () => {
    const workspacePackage = createPackage({
      exports: {
        ".": { import: "./dist/index.js", types: "./dist/index.d.ts" },
        "./data/*": { import: "./dist/data/*.js", types: "./dist/data/*.d.ts" },
      },
    });
    const readPack = async (): Promise<Set<string>> =>
      new Set(["dist/index.js", "dist/index.d.ts", "dist/data/lucide.js", "dist/data/lucide.d.ts"]);

    const check = await checkFor(workspacePackage, { readPack, run: createRunner("1.1.0") }, "tarball");

    expect(check.status).toBe("ready");
  });

  it("blocks a wildcard entry target with no matching file in the tarball", async () => {
    const workspacePackage = createPackage({
      exports: {
        ".": { import: "./dist/index.js", types: "./dist/index.d.ts" },
        "./data/*": { import: "./dist/data/*.js", types: "./dist/data/*.d.ts" },
      },
    });
    const readPack = async (): Promise<Set<string>> => new Set(["dist/index.js", "dist/index.d.ts"]);

    const check = await checkFor(workspacePackage, { readPack, run: createRunner("1.1.0") }, "tarball");

    expect(check.status).toBe("blocked");
    expect(check.detail).toContain("dist/data/*.js");
  });

  it("reports an unreadable tarball as unresolved rather than ready", async () => {
    const readPack = async (): Promise<Set<string>> => {
      throw new Error("npm is not installed");
    };

    const check = await checkFor(createPackage(), { readPack, run: createRunner("1.1.0") }, "tarball");

    expect(check.status).toBe("unknown");
    expect(check.detail).toContain("npm is not installed");
  });

  it("reports every precondition in a stable order", async () => {
    const readiness = await readPackageReadiness(createPackage(), { readPack: packed, run: createRunner("1.1.0") });

    expect(readiness.checks.map(({ name }) => name)).toEqual(["version", "worktree", "tarball"]);
  });
});
