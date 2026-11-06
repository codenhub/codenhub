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
  it("builds the snapshot with archived versions for a production build and logs what it left out", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const build = vi.fn().mockResolvedValue({ warnings: ["Left out the archived docs of @codenhub/x@1.0.0."] });
    const logger = { warn: vi.fn() };
    const integration = createPublishedDocsSnapshotIntegration({ build, ...OPTIONS });

    await integration.hooks["astro:config:setup"]!({ command: "build", logger } as never);

    expect(build).toHaveBeenCalledWith({ ...OPTIONS, archives: true });
    expect(logger.warn).toHaveBeenCalledWith("Left out the archived docs of @codenhub/x@1.0.0.");
  });

  it("does nothing for astro dev, so local doc edits keep hot-reloading live", async () => {
    const build = vi.fn().mockResolvedValue({ warnings: [] });
    const integration = createPublishedDocsSnapshotIntegration({ build, ...OPTIONS });

    await integration.hooks["astro:config:setup"]!({ command: "dev" } as never);

    expect(build).not.toHaveBeenCalled();
  });
});
