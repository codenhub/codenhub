import type { AstroIntegration } from "astro";

import { discoverDemoDirs, startDemoDevServer, type RunningDemoDevServer } from "./demo-dev-server";

interface IntegrationOptions {
  discoverDemoDirs?: typeof discoverDemoDirs;
  packagesRoot: string;
  startDemoDevServer?: typeof startDemoDevServer;
}

function isRunning(server: RunningDemoDevServer | undefined): server is RunningDemoDevServer {
  return server !== undefined;
}

/**
 * Mounts every discovered package demo under `astro dev` too, not just
 * `astro build`. `astro:build:done` (`demo-integration.ts`) has no dev-mode
 * equivalent, since it copies output that only exists after a build. This
 * integration instead starts each demo's own `dev` script with its base
 * path set to `/<slug>/` and reverse-proxies requests there, so a demo
 * keeps its own dev server and hot reload rather than being rebuilt and
 * copied on every change.
 * @param options Packages root, and injectable discovery/start functions for tests.
 * @returns An Astro integration that no-ops outside the `dev` command.
 */
export function createDemoDevProxyIntegration(options: IntegrationOptions): AstroIntegration {
  const discover = options.discoverDemoDirs ?? discoverDemoDirs;
  const start = options.startDemoDevServer ?? startDemoDevServer;
  let servers: RunningDemoDevServer[] = [];
  let isExitHandlerRegistered = false;

  const stopServers = () => {
    const runningServers = servers;
    servers = [];
    for (const server of runningServers) {
      server.stop();
    }
  };

  const stopServersOnExit = () => {
    stopServers();
    isExitHandlerRegistered = false;
  };

  return {
    hooks: {
      "astro:config:setup": async ({ command, logger, updateConfig }) => {
        if (command !== "dev") {
          return;
        }

        stopServers();
        const targets = discover(options.packagesRoot);
        const started = await Promise.all(
          targets.map(async (target) => {
            try {
              return await start(target);
            } catch (error) {
              logger.warn(
                `${target.slug} demo will not be mounted: ${error instanceof Error ? error.message : String(error)}`,
              );
              return undefined;
            }
          }),
        );
        servers = started.filter(isRunning);

        if (!isExitHandlerRegistered) {
          process.once("exit", stopServersOnExit);
          isExitHandlerRegistered = true;
        }

        updateConfig({
          vite: {
            server: {
              proxy: Object.fromEntries(
                servers.map((server) => [
                  `^/${server.slug}(/.*)?$`,
                  { changeOrigin: true, target: `http://localhost:${server.port}`, ws: true },
                ]),
              ),
            },
          },
        });
      },
      "astro:server:done": () => {
        stopServers();
        process.off("exit", stopServersOnExit);
        isExitHandlerRegistered = false;
      },
    },
    name: "codenhub-package-demos-dev-proxy",
  };
}
