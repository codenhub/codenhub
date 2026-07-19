import type { ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";

import type { AstroIntegration } from "astro";

import { loadWorkspaceDocumentation } from "./package-documentation";
import { copyPublicResources, createResourceMiddleware, type PublicResource } from "./resource-publisher";

interface IntegrationOptions {
  loadDocumentation?: (packagesRoot: string) => Promise<PublicResource[]>;
  packagesRoot: string;
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
  let resources: PublicResource[] = [];
  return {
    name: "codenhub-package-documentation",
    hooks: {
      "astro:config:setup": async ({ updateConfig }) => {
        resources = await loadDocumentation(options.packagesRoot);
        updateConfig({ vite: { plugins: [createResourcePlugin(resources)] } });
      },
      "astro:build:done": async ({ dir }) => {
        await copyPublicResources(resources, fileURLToPath(dir));
      },
    },
  };
}
