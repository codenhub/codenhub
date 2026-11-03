import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import ts from "typescript";
import { afterAll, beforeAll, expect, it } from "vitest";

const packageRoot = new URL("../../../", import.meta.url);
const dist = new URL("dist/", packageRoot);
let worker: Miniflare | undefined;

beforeAll(async () => {
  if (!existsSync(new URL("cloudflare.js", dist))) {
    throw new Error("run `pnpm build store` first: this test reads dist/");
  }
  worker = new Miniflare(
    convertV4MiniflareOptions({
      compatibilityDate: "2026-07-01",
      modulesRoot: fileURLToPath(packageRoot),
      kvNamespaces: ["RECORDS"],
      durableObjects: { STORES: { className: "StoreObject", useSQLite: true } },
      modules: [
        {
          type: "ESModule",
          path: "tests/integration/cloudflare/worker.js",
          contents: ts.transpileModule(
            readFileSync(new URL("tests/integration/cloudflare/worker.ts", packageRoot), "utf8"),
            {
              compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2024 },
            },
          ).outputText,
        },
        ...readdirSync(dist)
          .filter((file) => file.endsWith(".js"))
          .map((file) => ({
            type: "ESModule" as const,
            path: `dist/${file}`,
            contents: readFileSync(new URL(file, dist), "utf8"),
          })),
      ],
    }),
  );
  await worker.ready;
}, 60_000);

afterAll(async () => {
  await worker?.dispose();
});

it.each(["kv", "do"])("round-trips and clears the built %s driver with a real binding", async (driver) => {
  const response = await worker!.dispatchFetch(`http://worker.test/${driver}`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    empty: { theme: "light", count: 0 },
    saved: true,
    persisted: { theme: "dark", count: 2 },
    cleared: { theme: "light", count: 0 },
    raw: null,
  });
});
