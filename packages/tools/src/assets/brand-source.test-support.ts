import { createHash } from "node:crypto";

import { createBrandSource, type BrandSource } from "./brand-source.ts";

const BASE_URL = "https://brand.test/brand/";

/** A brand served from memory, through the real {@link createBrandSource}. */
export interface MemoryBrand {
  source: BrandSource;
  /** Files by path below `assets/`; change one to change what is served. */
  files: Map<string, string>;
  /** Overrides what the index lists for a path, to serve bytes that do not match. */
  listed: Map<string, string>;
  /** When set, every request fails as if the network were down. */
  isOffline: boolean;
  /** Paths requested, for asserting how often the index is fetched. */
  requests: string[];
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Serves `files` as the brand at a test URL.
 * @param files Contents by path below `assets/`, such as `{ "logo/logo-dark.svg": "<svg/>" }`.
 * @returns The brand and the switches tests flip.
 */
export function createMemoryBrand(files: Record<string, string>): MemoryBrand {
  const brand: MemoryBrand = {
    files: new Map(Object.entries(files)),
    isOffline: false,
    listed: new Map(),
    requests: [],
    source: createBrandSource({
      baseUrl: BASE_URL,
      fetch: async (input) => {
        const path = String(input).slice(BASE_URL.length);
        brand.requests.push(path);
        if (brand.isOffline) {
          throw new TypeError("fetch failed");
        }
        if (path === "index.json") {
          return Response.json({
            version: 1,
            files: [...brand.files].map(([name, content]) => {
              const listed = brand.listed.get(name) ?? content;
              return {
                path: `assets/${name}`,
                sha256: sha256(listed),
                size: Buffer.byteLength(listed),
                type: "application/octet-stream",
              };
            }),
          });
        }
        const content = brand.files.get(path.replace(/^assets\//, ""));
        return content === undefined ? new Response("Not found", { status: 404 }) : new Response(content);
      },
    }),
  };
  return brand;
}
