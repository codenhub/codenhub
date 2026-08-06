import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildLlmsFull, listLlmsFullSources } from "../documentation/llms-full.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import { createDocumentationRules } from "./documentation-rules.ts";
import type { CheckRule, Finding } from "./rule.ts";

const INDEX = "---\ntitle: Example\n---\n\n# Example\n";
const README = "# @codenhub/example\n\n[Docs](docs/index.md)\n";
const LLMS = "# @codenhub/example\n\n> Example package.\n\n## Docs\n\n- [Index](docs/index.md): Entrypoint.\n";

interface PackageOverrides {
  files?: Record<string, string>;
  manifest?: Record<string, unknown>;
  omit?: readonly string[];
}

/**
 * Writes a package that satisfies every documentation rule, minus any overrides.
 * @param overrides Extra files, manifest fields, and surfaces to leave out.
 * @returns The workspace package the rules should inspect.
 */
async function createDocumentedPackage(overrides: PackageOverrides = {}): Promise<WorkspacePackage> {
  const directory = await mkdtemp(join(tmpdir(), "codenhub-docs-rule-"));
  await mkdir(join(directory, "docs"), { recursive: true });

  const surfaces: Record<string, string> = {
    "README.md": README,
    "docs/index.md": INDEX,
    "llms.txt": LLMS,
    ...overrides.files,
  };
  const omit = new Set(overrides.omit ?? []);
  await Promise.all(
    Object.entries(surfaces)
      .filter(([path]) => !omit.has(path))
      .map(async ([path, contents]) => {
        await mkdir(join(directory, path, ".."), { recursive: true });
        await writeFile(join(directory, path), contents, "utf8");
      }),
  );
  if (!omit.has("llms-full.txt")) {
    const sources = await listLlmsFullSources(directory);
    await writeFile(join(directory, "llms-full.txt"), await buildLlmsFull(directory, sources), "utf8");
  }

  return {
    directory,
    directoryName: "example",
    isPrivate: false,
    location: "packages/example",
    manifest: {
      codenhub: { docs: { label: "Example", status: "active" } },
      name: "@codenhub/example",
      ...overrides.manifest,
    },
    name: "@codenhub/example",
    scripts: {},
    unscopedName: "example",
    workspaceDependencies: [],
  };
}

async function runRule(name: string, workspacePackage: WorkspacePackage): Promise<Finding[]> {
  const rule = createDocumentationRules().find((candidate: CheckRule) => candidate.name === name);
  return rule === undefined ? [] : rule.run({ includePack: false, package: workspacePackage });
}

describe("documentation rule", () => {
  it("reports nothing for a package that satisfies every surface", async () => {
    expect(await runRule("documentation", await createDocumentedPackage())).toEqual([]);
  });

  it("reports a missing required surface", async () => {
    const workspacePackage = await createDocumentedPackage({ omit: ["llms.txt"] });

    expect((await runRule("documentation", workspacePackage)).map(({ code }) => code)).toContain(
      "documentation/missing-required-surface",
    );
  });

  it("reports a public document without frontmatter", async () => {
    const workspacePackage = await createDocumentedPackage({ files: { "docs/index.md": "# Example\n" } });

    expect((await runRule("documentation", workspacePackage)).map(({ code }) => code)).toContain(
      "documentation/invalid-frontmatter",
    );
  });

  it("reports a link with no target", async () => {
    const workspacePackage = await createDocumentedPackage({
      files: { "docs/index.md": `${INDEX}\n[Gone](gone.md)\n` },
    });

    expect((await runRule("documentation", workspacePackage)).map(({ code }) => code)).toContain(
      "documentation/missing-target",
    );
  });

  it("reports malformed documentation metadata instead of inspecting the package", async () => {
    const workspacePackage = await createDocumentedPackage({
      manifest: { codenhub: { docs: { label: "Example", status: "shipped" } } },
    });

    expect(await runRule("documentation", workspacePackage)).toEqual([
      expect.objectContaining({ code: "documentation/invalid-metadata", severity: "error" }),
    ]);
  });

  it("applies to a private package that opts in through documentation metadata", () => {
    const rules = createDocumentationRules();
    const optedIn = {
      isPrivate: true,
      manifest: { codenhub: { docs: { label: "Example", status: "active" } } },
    } as unknown as WorkspacePackage;

    expect(rules.every((rule) => rule.appliesTo(optedIn))).toBe(true);
  });

  it("skips a private package with no documentation metadata", () => {
    const internal = { isPrivate: true, manifest: {} } as unknown as WorkspacePackage;

    expect(createDocumentationRules().some((rule) => rule.appliesTo(internal))).toBe(false);
  });
});

describe("llms-full rule", () => {
  it("reports nothing when the compilation is current", async () => {
    expect(await runRule("llms-full", await createDocumentedPackage())).toEqual([]);
  });

  it("reports a missing compilation", async () => {
    const workspacePackage = await createDocumentedPackage({ omit: ["llms-full.txt"] });

    expect((await runRule("llms-full", workspacePackage)).map(({ code }) => code)).toEqual(["llms-full/missing"]);
  });

  it("reports a compilation that no longer matches its sources", async () => {
    const workspacePackage = await createDocumentedPackage();
    await writeFile(join(workspacePackage.directory, "llms-full.txt"), "# Stale\n", "utf8");

    expect((await runRule("llms-full", workspacePackage)).map(({ code }) => code)).toEqual(["llms-full/drift"]);
  });

  it("ignores line-ending differences between the compilation and its sources", async () => {
    const workspacePackage = await createDocumentedPackage();
    const sources = await listLlmsFullSources(workspacePackage.directory);
    const generated = await buildLlmsFull(workspacePackage.directory, sources);
    await writeFile(join(workspacePackage.directory, "llms-full.txt"), generated.replaceAll("\n", "\r\n"), "utf8");

    expect(await runRule("llms-full", workspacePackage)).toEqual([]);
  });
});
