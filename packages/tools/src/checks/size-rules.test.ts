import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { ReadinessCheck } from "../release/readiness.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import { createSizeRules, type SizeRuleSources } from "./size-rules.ts";

async function createPackage(version: string, options: { sizeFile?: boolean } = {}): Promise<WorkspacePackage> {
  const directory = await mkdtemp(join(tmpdir(), "codenhub-size-"));
  if (options.sizeFile === true) {
    await writeFile(join(directory, "size.json"), "{}\n");
  }
  return {
    directory,
    directoryName: "example",
    isPrivate: false,
    location: "packages/example",
    manifest: { name: "@codenhub/example", version },
    name: "@codenhub/example",
    scripts: {},
    unscopedName: "example",
    workspaceDependencies: [],
  } as WorkspacePackage;
}

function createRule(tags: readonly string[], check: ReadinessCheck = { detail: "ok", name: "size", status: "ready" }) {
  const checkSize = vi.fn<SizeRuleSources["checkSize"]>(async () => check);
  const [rule] = createSizeRules({ checkSize, listTags: async () => tags });
  return { checkSize, rule: rule! };
}

describe("size rule", () => {
  it("leaves a released version alone, since size.json records the release rather than the code since", async () => {
    const { checkSize, rule } = createRule(["@codenhub/example@0.2.0"]);

    expect(await rule.run({ includePack: false, package: await createPackage("0.2.0") })).toEqual([]);
    expect(checkSize).not.toHaveBeenCalled();
  });

  it("leaves a package that has never been released through a tag alone", async () => {
    const { checkSize, rule } = createRule(["@codenhub/other@1.0.0"]);

    expect(await rule.run({ includePack: false, package: await createPackage("0.1.0") })).toEqual([]);
    expect(checkSize).not.toHaveBeenCalled();
  });

  it("reports a version awaiting release that carries no size.json", async () => {
    const { checkSize, rule } = createRule(["@codenhub/example@0.2.0"]);

    const findings = await rule.run({ includePack: false, package: await createPackage("0.3.0") });

    expect(findings).toEqual([
      expect.objectContaining({ code: "size/missing", location: "size.json", severity: "error" }),
    ]);
    expect(findings[0]!.message).toContain("--cut=0.3.0");
    expect(checkSize).not.toHaveBeenCalled();
  });

  it("reports a version awaiting release whose size.json no longer matches its build", async () => {
    const { rule } = createRule(["@codenhub/example@0.2.0"], {
      detail: "size.json does not match this build: . is 20551 bytes minified, recorded 20518",
      name: "size",
      status: "blocked",
    });

    const findings = await rule.run({ includePack: false, package: await createPackage("0.3.0", { sizeFile: true }) });

    expect(findings).toEqual([expect.objectContaining({ code: "size/stale", severity: "error" })]);
    expect(findings[0]!.message).toContain("recorded 20518");
  });

  it("passes a version awaiting release whose size.json matches, forwarding the timeout", async () => {
    const { checkSize, rule } = createRule(["@codenhub/example@0.2.0"]);
    const workspacePackage = await createPackage("0.3.0", { sizeFile: true });

    expect(await rule.run({ includePack: false, package: workspacePackage, timeoutMs: 1000 })).toEqual([]);
    expect(checkSize).toHaveBeenCalledWith(workspacePackage, 1000);
  });

  it("runs one comparison at a time, since each one builds its package", async () => {
    let running = 0;
    let overlapped = false;
    const checkSize = vi.fn<SizeRuleSources["checkSize"]>(async () => {
      running += 1;
      overlapped ||= running > 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      running -= 1;
      return { detail: "ok", name: "size", status: "ready" };
    });
    const [rule] = createSizeRules({ checkSize, listTags: async () => ["@codenhub/example@0.2.0"] });
    const packages = await Promise.all([1, 2, 3].map(async () => createPackage("0.3.0", { sizeFile: true })));

    await Promise.all(
      packages.map(async (workspacePackage) => rule!.run({ includePack: false, package: workspacePackage })),
    );

    expect(checkSize).toHaveBeenCalledTimes(3);
    expect(overlapped).toBe(false);
  });

  it("does not apply to a private package", async () => {
    const { rule } = createRule([]);

    expect(rule.appliesTo({ ...(await createPackage("0.1.0")), isPrivate: true })).toBe(false);
  });
});
