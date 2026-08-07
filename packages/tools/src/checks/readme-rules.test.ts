import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { WorkspacePackage } from "../workspace/discover.ts";
import { createReadmeRules } from "./readme-rules.ts";
import type { Finding } from "./rule.ts";

const ACTIVE_README = "# @codenhub/example\n\nAn example package.\n\n## Installation\n";

async function runRule(readme: string, docs: Record<string, unknown> = {}): Promise<Finding[]> {
  const directory = await mkdtemp(join(tmpdir(), "codenhub-readme-rule-"));
  await writeFile(join(directory, "README.md"), readme, "utf8");
  const workspacePackage = {
    directory,
    isPrivate: false,
    location: "packages/example",
    manifest: { codenhub: { docs: { label: "Example", status: "active", ...docs } }, name: "@codenhub/example" },
    name: "@codenhub/example",
    unscopedName: "example",
  } as unknown as WorkspacePackage;
  const [rule] = createReadmeRules();

  return rule === undefined ? [] : rule.run({ includePack: false, package: workspacePackage });
}

describe("readme status rule", () => {
  it("accepts an active package with no status notice", async () => {
    expect(await runRule(ACTIVE_README)).toEqual([]);
  });

  it("accepts an experimental package that opens with an experimental notice", async () => {
    const readme = ACTIVE_README.replace("An example", "> **Experimental:** the API may change.\n\nAn example");

    expect(await runRule(readme, { status: "experimental" })).toEqual([]);
  });

  it("reports an experimental package with no notice", async () => {
    expect((await runRule(ACTIVE_README, { status: "experimental" })).map(({ code }) => code)).toEqual([
      "readme/missing-status-notice",
    ]);
  });

  it("reports a deprecated package with no notice", async () => {
    expect((await runRule(ACTIVE_README, { status: "deprecated" })).map(({ code }) => code)).toEqual([
      "readme/missing-status-notice",
    ]);
  });

  it("reports an active package still carrying a deprecation notice", async () => {
    const readme = ACTIVE_README.replace("An example", "> **Deprecated:** use @codenhub/other.\n\nAn example");

    expect((await runRule(readme)).map(({ code }) => code)).toEqual(["readme/conflicting-status-notice"]);
  });

  it("reports an experimental package whose notice claims deprecation", async () => {
    const readme = ACTIVE_README.replace(
      "An example",
      "> **Experimental:** the API may change.\n> It is not deprecated yet.\n\nAn example",
    );

    expect((await runRule(readme, { status: "experimental" })).map(({ code }) => code)).toEqual([
      "readme/conflicting-status-notice",
    ]);
  });

  it("ignores the word experimental outside a notice", async () => {
    const readme = `${ACTIVE_README}\nThe experimental flag enables tracing.\n`;

    expect(await runRule(readme)).toEqual([]);
  });

  it("ignores a notice placed below the first section", async () => {
    const readme = `${ACTIVE_README}\n> This package is experimental.\n`;

    expect(await runRule(readme)).toEqual([]);
  });

  it("stays quiet when the documentation metadata is malformed", async () => {
    expect(await runRule(ACTIVE_README, { status: "shipped" })).toEqual([]);
  });

  it("stays quiet when the package has no README", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codenhub-readme-rule-"));
    const workspacePackage = {
      directory,
      isPrivate: false,
      location: "packages/example",
      manifest: { codenhub: { docs: { label: "Example", status: "experimental" } }, name: "@codenhub/example" },
      name: "@codenhub/example",
    } as unknown as WorkspacePackage;
    const [rule] = createReadmeRules();

    expect(await rule?.run({ includePack: false, package: workspacePackage })).toEqual([]);
  });
});
