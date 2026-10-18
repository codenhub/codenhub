import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { scenarios } from "../scenarios";

/*
 * Runs the runtime scenarios in workerd, Cloudflare's Workers runtime, against the built package. Its
 * Web Crypto is its own, not Node.js's, so the unit tests passing says nothing about it. Miniflare
 * starts a local workerd and loads the modules given here: every file of `dist/`, the scenarios
 * compiled from TypeScript, and a worker that runs the scenario a request names.
 */

const packageRoot = new URL("../../", import.meta.url);
const dist = new URL("dist/", packageRoot);

const WORKER = `
import * as jwt from "./dist/index.js";
import { runScenario } from "./tests/scenarios.js";

export default {
  async fetch(request) {
    const name = new URL(request.url).searchParams.get("scenario") ?? "";
    return new Response(await runScenario(jwt, name));
  },
};
`;

let worker: Miniflare | undefined;

beforeAll(async () => {
  if (!existsSync(new URL("index.js", dist))) {
    throw new Error("run `pnpm build jwt` first: this test reads dist/");
  }
  const scenarioSource = readFileSync(new URL("tests/scenarios.ts", packageRoot), "utf8");
  worker = new Miniflare(
    convertV4MiniflareOptions({
      compatibilityDate: "2026-07-01",
      modulesRoot: fileURLToPath(packageRoot),
      modules: [
        { type: "ESModule", path: "worker.js", contents: WORKER },
        {
          type: "ESModule",
          path: "tests/scenarios.js",
          contents: ts.transpileModule(scenarioSource, {
            compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2024 },
          }).outputText,
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

describe("workerd", () => {
  it.each(Object.keys(scenarios))("%s", async (name) => {
    const response = await (worker as Miniflare).dispatchFetch(
      `http://worker.test/?scenario=${encodeURIComponent(name)}`,
    );
    expect(await response.text()).toBe("ok");
  });
});
