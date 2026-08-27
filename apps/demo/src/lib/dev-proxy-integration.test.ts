import { describe, expect, it, vi } from "vitest";

import { createDemoDevProxyIntegration } from "./dev-proxy-integration";

function fakeLogger() {
  return { warn: vi.fn() } as never;
}

describe("createDemoDevProxyIntegration", () => {
  it("does nothing outside the dev command", async () => {
    const updateConfig = vi.fn();
    const startDemoDevServer = vi.fn();
    const integration = createDemoDevProxyIntegration({
      discoverDemoDirs: () => [{ demoDir: "/repo/packages/icons/demo", slug: "icons" }],
      packagesRoot: "/repo/packages",
      startDemoDevServer,
    });

    await integration.hooks["astro:config:setup"]!({
      command: "build",
      logger: fakeLogger(),
      updateConfig,
    } as never);

    expect(startDemoDevServer).not.toHaveBeenCalled();
    expect(updateConfig).not.toHaveBeenCalled();
  });

  it("proxies to every demo dev server that starts successfully", async () => {
    const updateConfig = vi.fn();
    const integration = createDemoDevProxyIntegration({
      discoverDemoDirs: () => [
        { demoDir: "/repo/packages/icons/demo", slug: "icons" },
        { demoDir: "/repo/packages/error/demo", slug: "error" },
      ],
      packagesRoot: "/repo/packages",
      startDemoDevServer: async (target) => ({
        port: target.slug === "icons" ? 5186 : 5187,
        slug: target.slug,
        stop: vi.fn(),
      }),
    });

    await integration.hooks["astro:config:setup"]!({ command: "dev", logger: fakeLogger(), updateConfig } as never);

    expect(updateConfig).toHaveBeenCalledWith({
      vite: {
        server: {
          proxy: {
            "^/icons(/.*)?$": { changeOrigin: true, target: "http://localhost:5186", ws: true },
            "^/error(/.*)?$": { changeOrigin: true, target: "http://localhost:5187", ws: true },
          },
        },
      },
    });
  });

  it("skips a demo whose dev server fails to start, without throwing", async () => {
    const updateConfig = vi.fn();
    const logger = fakeLogger();
    const integration = createDemoDevProxyIntegration({
      discoverDemoDirs: () => [{ demoDir: "/repo/packages/icons/demo", slug: "icons" }],
      packagesRoot: "/repo/packages",
      startDemoDevServer: async () => {
        throw new Error("boom");
      },
    });

    await integration.hooks["astro:config:setup"]!({ command: "dev", logger, updateConfig } as never);

    expect(updateConfig).toHaveBeenCalledWith({ vite: { server: { proxy: {} } } });
    expect((logger as { warn: ReturnType<typeof vi.fn> }).warn).toHaveBeenCalledWith(
      expect.stringContaining("icons demo will not be mounted"),
    );
  });
});
