import type { ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";

import { loadWorkspaceDocumentation, type PublicResource } from "@codenhub/tools/documentation";
import type { AstroIntegration } from "astro";

import { loadArchivedResources, type ArchivedResources } from "./archived-resources";
import { readsPublishedSnapshot } from "./published-docs-snapshot-integration";
import { copyPublicResources, createResourceMiddleware } from "./resource-publisher";

interface IntegrationOptions {
  loadArchivedResources?: (snapshotRoot: string) => Promise<ArchivedResources>;
  loadDocumentation?: (packagesRoot: string) => Promise<PublicResource[]>;
  /** Packages read outside a production build: the working tree, so local edits show immediately. */
  packagesRoot: string;
  /**
   * Packages read by a production build: the tag-scoped snapshot, so resources
   * ship from the same release as the pages that link to them. Must already
   * exist when this integration's setup runs.
   */
  publishedPackagesRoot: string;
  /** The snapshot directory, whose archived versions a production build also publishes. */
  publishedSnapshotRoot: string;
}

interface ConnectRequest {
  headers: { host?: string };
  method?: string;
  url?: string;
}

interface ConnectServer {
  middlewares: {
    use(handler: (request: ConnectRequest, response: ServerResponse, next: (error?: unknown) => void) => void): void;
  };
}

function createResourcePlugin(resources: PublicResource[]) {
  const serveResource = createResourceMiddleware(resources);
  async function sendResource(
    request: ConnectRequest,
    response: ServerResponse,
    next: (error?: unknown) => void,
  ): Promise<void> {
    try {
      const host = request.headers.host ?? "localhost";
      const url = new URL(request.url ?? "/", `http://${host}`);
      const resourceResponse = await serveResource(new Request(url, { method: request.method }));
      if (resourceResponse === undefined) {
        next();
        return;
      }
      response.statusCode = resourceResponse.status;
      resourceResponse.headers.forEach((value, name) => response.setHeader(name, value));
      response.end(Buffer.from(await resourceResponse.arrayBuffer()));
    } catch (error) {
      next(error);
    }
  }
  return {
    name: "codenhub-public-document-resources",
    configureServer(server: ConnectServer) {
      server.middlewares.use((request, response, next) => {
        void sendResource(request, response, next);
      });
    },
  };
}

export function createDocumentationIntegration(options: IntegrationOptions): AstroIntegration {
  const loadDocumentation = options.loadDocumentation ?? loadWorkspaceDocumentation;
  const loadArchived = options.loadArchivedResources ?? loadArchivedResources;
  let resources: PublicResource[] = [];
  return {
    name: "codenhub-package-documentation",
    hooks: {
      "astro:config:setup": async ({ command, logger, updateConfig }) => {
        if (readsPublishedSnapshot(command)) {
          const archived = await loadArchived(options.publishedSnapshotRoot);
          for (const warning of archived.warnings) {
            logger.warn(warning);
          }
          resources = [...(await loadDocumentation(options.publishedPackagesRoot)), ...archived.resources];
        } else {
          resources = await loadDocumentation(options.packagesRoot);
        }
        updateConfig({ vite: { plugins: [createResourcePlugin(resources)] } });
      },
      "astro:build:done": async ({ dir }) => {
        await copyPublicResources(resources, fileURLToPath(dir));
      },
    },
  };
}
