import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { applyGenerated } from "./apply-generated.ts";
import type { GeneratedFile } from "./generator.ts";

async function createRoot(): Promise<string> {
  return mkdtemp(resolve(tmpdir(), "codenhub-apply-generated-"));
}

describe("applyGenerated", () => {
  it("shouldWriteAFileThatDoesNotExistYet", async () => {
    const root = await createRoot();
    const file: GeneratedFile = { contents: "hello\n", path: "example/output.txt" };

    const outcomes = await applyGenerated([file], { root });

    expect(outcomes).toEqual([{ file, hasDrift: true }]);
    expect(await readFile(resolve(root, file.path), "utf8")).toBe("hello\n");
  });

  it("shouldCreateMissingDirectories", async () => {
    const root = await createRoot();
    const file: GeneratedFile = { contents: "hello\n", path: "nested/deeply/output.txt" };

    await applyGenerated([file], { root });

    await expect(stat(resolve(root, file.path))).resolves.toBeDefined();
  });

  it("shouldLeaveAnUpToDateFileUntouched", async () => {
    const root = await createRoot();
    const file: GeneratedFile = { contents: "hello\n", path: "output.txt" };
    await applyGenerated([file], { root });
    const firstWrite = (await stat(resolve(root, file.path))).mtimeMs;

    const outcomes = await applyGenerated([file], { root });

    expect(outcomes).toEqual([{ file, hasDrift: false }]);
    expect((await stat(resolve(root, file.path))).mtimeMs).toBe(firstWrite);
  });

  it("shouldRewriteAFileWhoseContentsChanged", async () => {
    const root = await createRoot();
    await applyGenerated([{ contents: "old\n", path: "output.txt" }], { root });

    const outcomes = await applyGenerated([{ contents: "new\n", path: "output.txt" }], { root });

    expect(outcomes[0]?.hasDrift).toBe(true);
    expect(await readFile(resolve(root, "output.txt"), "utf8")).toBe("new\n");
  });

  it("shouldReportDriftWithoutWritingDuringADryRun", async () => {
    const root = await createRoot();
    const file: GeneratedFile = { contents: "hello\n", path: "output.txt" };

    const outcomes = await applyGenerated([file], { dryRun: true, root });

    expect(outcomes).toEqual([{ file, hasDrift: true }]);
    await expect(stat(resolve(root, file.path))).rejects.toThrow("ENOENT");
  });

  it("shouldIgnoreLineEndingDifferencesWhenDiffing", async () => {
    const root = await createRoot();
    await mkdir(root, { recursive: true });
    await writeFile(resolve(root, "output.txt"), "a\r\nb\r\n", "utf8");

    const outcomes = await applyGenerated([{ contents: "a\nb\n", path: "output.txt" }], { root });

    expect(outcomes[0]?.hasDrift).toBe(false);
  });
});
