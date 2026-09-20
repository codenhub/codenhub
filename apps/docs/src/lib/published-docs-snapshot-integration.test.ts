import { describe, expect, it, vi } from "vitest";

import { createPublishedDocsSnapshotIntegration } from "./published-docs-snapshot-integration.ts";

describe("Astro published-docs snapshot integration", () => {
  it("builds the snapshot for an astro build", async () => {
    const build = vi.fn().mockResolvedValue(undefined);
    const integration = createPublishedDocsSnapshotIntegration({
      build,
      repoRoot: "C:/repo",
      snapshotRoot: "C:/repo/apps/docs/.codenhub-published-docs",
    });

    await integration.hooks["astro:config:setup"]!({ command: "build" } as never);

    expect(build).toHaveBeenCalledWith({
      repoRoot: "C:/repo",
      snapshotRoot: "C:/repo/apps/docs/.codenhub-published-docs",
    });
  });

  it("does nothing for astro dev, so local doc edits keep hot-reloading live", async () => {
    const build = vi.fn().mockResolvedValue(undefined);
    const integration = createPublishedDocsSnapshotIntegration({
      build,
      repoRoot: "C:/repo",
      snapshotRoot: "C:/repo/apps/docs/.codenhub-published-docs",
    });

    await integration.hooks["astro:config:setup"]!({ command: "dev" } as never);

    expect(build).not.toHaveBeenCalled();
  });
});
