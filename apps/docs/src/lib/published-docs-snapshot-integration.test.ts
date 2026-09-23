import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createPublishedDocsSnapshotIntegration,
  readsPublishedSnapshot,
} from "./published-docs-snapshot-integration.ts";

const OPTIONS = { repoRoot: "C:/repo", snapshotRoot: "C:/repo/apps/docs/.codenhub-published-docs" };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("readsPublishedSnapshot", () => {
  it("is true for a production build", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(readsPublishedSnapshot("build")).toBe(true);
  });

  it("is false for a build started under a test runner, whose pages read the working tree", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(readsPublishedSnapshot("build")).toBe(false);
  });

  it("is false for astro dev", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(readsPublishedSnapshot("dev")).toBe(false);
  });
});

describe("Astro published-docs snapshot integration", () => {
  it("builds the snapshot for a production build", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const build = vi.fn().mockResolvedValue(undefined);
    const integration = createPublishedDocsSnapshotIntegration({ build, ...OPTIONS });

    await integration.hooks["astro:config:setup"]!({ command: "build" } as never);

    expect(build).toHaveBeenCalledWith(OPTIONS);
  });

  it("does nothing for astro dev, so local doc edits keep hot-reloading live", async () => {
    const build = vi.fn().mockResolvedValue(undefined);
    const integration = createPublishedDocsSnapshotIntegration({ build, ...OPTIONS });

    await integration.hooks["astro:config:setup"]!({ command: "dev" } as never);

    expect(build).not.toHaveBeenCalled();
  });
});
