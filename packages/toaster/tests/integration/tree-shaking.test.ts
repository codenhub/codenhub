// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { build } from "tsdown";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/*
 * The package declares itself free of side effects, so a consumer that imports it without using
 * anything ships none of it. Each scenario is a small consumer module bundled against the built
 * `dist/` and minified, the way a consumer's build would.
 */
// Forward slashes, because the path is pasted into source code, where a Windows backslash is an escape.
const distPath = (file: string): string =>
  fileURLToPath(new URL(`../../dist/${file}`, import.meta.url)).replaceAll("\\", "/");
const distEntry = distPath("index.js");
const dialogEntry = distPath("dialog.js");

// A string only the dialog code carries, and one only the toast code carries.
const DIALOG_MARKER = "toast-dialog";
const TOAST_MARKER = "data-toast-message";

// Gzipped bytes a bundle calling only `toast("…")` may reach; see docs/internal/roadmap.md.
const TOAST_BUDGET_GZIP_BYTES = 9_500;

// Created in `beforeAll`, so a run filtered to other tests leaves no directory behind.
let workspace: string;

/** Bundles `source`, where `DIST` and `DIALOG` name the two entries, and returns the minified output. */
const bundle = async (name: string, source: string): Promise<string> => {
  const entry = join(workspace, `${name}.ts`);
  const outDir = join(workspace, `out-${name}`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(entry, source.replaceAll("DIALOG", dialogEntry).replaceAll("DIST", distEntry));
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
    if (!existsSync(distEntry) || !existsSync(dialogEntry)) {
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
    ["bare-dialog-import", `import "DIALOG";`],
    ["unused-singletons", `import { toast } from "DIST"; import { dialog } from "DIALOG"; void 0;`],
    ["unused-factories", `import { createToaster } from "DIST"; import { createDialogs } from "DIALOG"; void 0;`],
  ])("drops the whole package from %s", async (name, source) => {
    const output = await bundle(name, source);
    expect(output.length).toBeLessThan(100);
  });

  // Dialogs have their own entry so that an app showing only toasts does not ship them, and the
  // reverse; the two meet only through an attribute on the open dialog.
  it("keeps toasts, and only toasts, when only toasts are used", async () => {
    const output = await bundle(
      "toast-only",
      `import { toast } from "DIST"; export const show = () => toast("Saved");`,
    );
    expect(output).toContain(TOAST_MARKER);
    expect(output).not.toContain(DIALOG_MARKER);
  });

  // The size budget in docs/internal/roadmap.md: what the smallest real use may cost gzipped.
  it("keeps a minimal toast within the size budget", async () => {
    const output = await bundle("budget", `import { toast } from "DIST"; export const show = () => toast("Saved");`);
    expect(gzipSync(output).length).toBeLessThanOrEqual(TOAST_BUDGET_GZIP_BYTES);
  });

  it("keeps dialogs, and only dialogs, when only dialogs are used", async () => {
    const output = await bundle(
      "dialog-only",
      `import { dialog } from "DIALOG"; export const ask = () => dialog.confirm("Delete?");`,
    );
    expect(output).toContain(DIALOG_MARKER);
    expect(output).not.toContain(TOAST_MARKER);
  });

  // The map is for size attribution only, and `files` leaves it out of the
  // tarball, so a reference to it would point consumers' tools at nothing.
  it.each([distEntry, dialogEntry])("ships %s without a source map reference", (file) => {
    expect(readFileSync(file, "utf8")).not.toContain("sourceMappingURL");
  });
});
