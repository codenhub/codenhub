// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "tsdown";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/*
 * The package declares itself free of side effects, so a consumer that imports it without using
 * anything ships none of it. Each scenario is a small consumer module bundled against the built
 * `dist/` and minified, the way a consumer's build would.
 */
// Forward slashes, because the path is pasted into source code, where a Windows backslash is an escape.
const distEntry = fileURLToPath(new URL("../../dist/index.js", import.meta.url)).replaceAll("\\", "/");

// Created in `beforeAll`, so a run filtered to other tests leaves no directory behind.
let workspace: string;

/** Bundles `source` and returns the minified output. */
const bundle = async (name: string, source: string): Promise<string> => {
  const entry = join(workspace, `${name}.ts`);
  const outDir = join(workspace, `out-${name}`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(entry, source.replaceAll("DIST", distEntry));
  await build({
    config: false,
    entry: [entry],
    outDir,
    format: "esm",
    platform: "neutral",
    minify: true,
    dts: false,
    clean: false,
    logLevel: "silent",
  });
  const [file] = readdirSync(outDir).filter((candidate) => candidate.endsWith(".js"));
  return readFileSync(join(outDir, file as string), "utf8");
};

describe("tree shaking", { timeout: 30_000 }, () => {
  beforeAll(() => {
    if (!existsSync(distEntry)) {
      throw new Error("run `pnpm build` in packages/toaster first: this test reads dist/");
    }
    workspace = mkdtempSync(join(tmpdir(), "toaster-tree-shaking-"));
  });

  afterAll(() => {
    if (workspace) {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it.each([
    ["bare-import", `import "DIST";`],
    ["unused-singletons", `import { dialog, toast } from "DIST"; void 0;`],
    ["unused-factory", `import { createToaster } from "DIST"; void 0;`],
  ])("drops the whole package from %s", async (name, source) => {
    const output = await bundle(name, source);
    expect(output.length).toBeLessThan(100);
  });

  it("keeps the package when it is used", async () => {
    const output = await bundle("used", `import { toast } from "DIST"; export const show = () => toast("Saved");`);
    expect(output.length).toBeGreaterThan(10_000);
  });

  // The map is for size attribution only, and `files` leaves it out of the
  // tarball, so a reference to it would point consumers' tools at nothing.
  it("ships the entrypoint without a source map reference", () => {
    expect(readFileSync(distEntry, "utf8")).not.toContain("sourceMappingURL");
  });
});
