import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { CommandOutcome, CommandSpec } from "../process/execute.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import { createPublishRunner, distTagForVersion, parseReleaseTag, resolveTagTarget } from "./publish.ts";

function createPackage(name: string, version = "1.0.0", isPrivate = false): WorkspacePackage {
  const unscopedName = name.slice(name.lastIndexOf("/") + 1);
  return {
    directory: `/repo/packages/${unscopedName}`,
    directoryName: unscopedName,
    isPrivate,
    location: `packages/${unscopedName}`,
    manifest: { name, private: isPrivate, version },
    name,
    scripts: {},
    unscopedName,
    workspaceDependencies: [],
  };
}

describe("parseReleaseTag", () => {
  it("splits a scoped name from its version at the last separator", () => {
    expect(parseReleaseTag("@codenhub/error@0.3.0")).toEqual({ name: "@codenhub/error", version: "0.3.0" });
  });

  it("splits an unscoped name", () => {
    expect(parseReleaseTag("hub@2.1.0")).toEqual({ name: "hub", version: "2.1.0" });
  });

  it("keeps a pre-release version whole", () => {
    expect(parseReleaseTag("@codenhub/error@1.0.0-beta.1")).toEqual({
      name: "@codenhub/error",
      version: "1.0.0-beta.1",
    });
  });

  it("rejects a tag carrying no version", () => {
    expect(parseReleaseTag("v1.0.0")).toBeUndefined();
    expect(parseReleaseTag("@codenhub/error")).toBeUndefined();
    expect(parseReleaseTag("@codenhub/error@")).toBeUndefined();
  });
});

describe("resolveTagTarget", () => {
  const packages = [createPackage("@codenhub/error", "0.3.0"), createPackage("@codenhub/tools", "1.0.0", true)];

  it("resolves a tag whose version matches the manifest", () => {
    expect(resolveTagTarget("@codenhub/error@0.3.0", packages)).toEqual({ package: packages[0] });
  });

  it("refuses a version the manifest does not declare", () => {
    const result = resolveTagTarget("@codenhub/error@0.4.0", packages);

    expect(result).toMatchObject({ reason: "version-mismatch" });
  });

  it("refuses a private package", () => {
    expect(resolveTagTarget("@codenhub/tools@1.0.0", packages)).toMatchObject({ reason: "private" });
  });

  it("refuses a name no package carries", () => {
    expect(resolveTagTarget("@codenhub/ghost@1.0.0", packages)).toMatchObject({ reason: "unknown-package" });
  });

  it("refuses a tag that is not shaped like a release", () => {
    expect(resolveTagTarget("v0.3.0", packages)).toMatchObject({ reason: "malformed" });
  });
});

describe("distTagForVersion", () => {
  it("leaves a normal release on npm's default latest", () => {
    expect(distTagForVersion("1.0.0")).toBeUndefined();
    expect(distTagForVersion("0.3.0")).toBeUndefined();
    expect(distTagForVersion("1.0.0+build.5")).toBeUndefined();
  });

  it("publishes any pre-release under next so it cannot take latest", () => {
    expect(distTagForVersion("1.0.0-beta.1")).toBe("next");
    expect(distTagForVersion("2.0.0-rc.0")).toBe("next");
    expect(distTagForVersion("1.0.0-alpha")).toBe("next");
    expect(distTagForVersion("1.0.0-0")).toBe("next");
    expect(distTagForVersion("1.0.0-beta.1+build.5")).toBe("next");
  });
});

describe("createPublishRunner", () => {
  function createRecorder(options: { failing?: string; tarballs?: number } = {}) {
    const calls: CommandSpec[] = [];
    let destination = "";
    const run = async (spec: CommandSpec): Promise<CommandOutcome> => {
      calls.push(spec);
      const [subcommand] = spec.args;
      if (subcommand === "pack") {
        destination = spec.args[2] as string;
        await Promise.all(
          Array.from({ length: options.tarballs ?? 1 }, (_, index) =>
            writeFile(join(destination, `package-${index}.tgz`), ""),
          ),
        );
      }
      const isSuccess = subcommand !== options.failing;
      return { didTimeOut: false, durationMs: 0, isSuccess, output: `${spec.command} ${subcommand}` };
    };
    return { calls, destination: () => destination, run };
  }

  const withPrepublish = (version = "1.0.0"): WorkspacePackage => ({
    ...createPackage("@codenhub/error", version),
    scripts: { prepublishOnly: "pnpm build && pnpm typecheck" },
  });

  it("runs prepublishOnly, packs with pnpm, and publishes the packed tarball with npm", async () => {
    const recorder = createRecorder();

    const outcome = await createPublishRunner(recorder.run)(withPrepublish());

    expect(outcome.isSuccess).toBe(true);
    expect(recorder.calls.map(({ args, command }) => [command, args[0]])).toEqual([
      ["pnpm", "run"],
      ["pnpm", "pack"],
      ["npm", "publish"],
    ]);
    expect(recorder.calls[0]?.args).toEqual(["run", "prepublishOnly"]);
    expect(recorder.calls[2]?.args).toEqual([
      "publish",
      join(recorder.destination(), "package-0.tgz"),
      "--access",
      "public",
    ]);
  });

  it("publishes a pre-release tarball under next", async () => {
    const recorder = createRecorder();

    await createPublishRunner(recorder.run)(withPrepublish("1.0.0-beta.1"));

    expect(recorder.calls.at(-1)?.args.slice(-2)).toEqual(["--tag", "next"]);
  });

  it("skips prepublishOnly when the package defines none", async () => {
    const recorder = createRecorder();

    await createPublishRunner(recorder.run)(createPackage("@codenhub/error"));

    expect(recorder.calls.map(({ args }) => args[0])).toEqual(["pack", "publish"]);
  });

  it("publishes nothing when prepublishOnly fails", async () => {
    const recorder = createRecorder({ failing: "run" });

    const outcome = await createPublishRunner(recorder.run)(withPrepublish());

    expect(outcome).toEqual({ isSuccess: false, output: "pnpm run" });
    expect(recorder.calls).toHaveLength(1);
  });

  it("publishes nothing when the pack does not leave exactly one tarball", async () => {
    const recorder = createRecorder({ tarballs: 2 });

    const outcome = await createPublishRunner(recorder.run)(withPrepublish());

    expect(outcome.isSuccess).toBe(false);
    expect(outcome.output).toContain("Expected one tarball");
    expect(recorder.calls.map(({ args }) => args[0])).toEqual(["run", "pack"]);
  });

  it("removes the packed tarball whether or not the publish succeeds", async () => {
    const recorder = createRecorder({ failing: "publish" });

    const outcome = await createPublishRunner(recorder.run)(withPrepublish());

    expect(outcome.isSuccess).toBe(false);
    await expect(access(recorder.destination())).rejects.toThrow(/ENOENT/);
  });
});
