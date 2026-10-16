import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Miniflare } from "miniflare";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { scenarios } from "../scenarios";

/*
 * Runs the end-to-end scenarios in workerd, Cloudflare's Workers runtime, against the built package. Its
 * Web Crypto, `Request` and `Response` are its own, not Node.js's, so the Node.js run says nothing about
 * it. Miniflare loads every file of `dist/`, the installed `@codenhub/jwt`, the scenarios compiled from
 * TypeScript, and a worker that runs the scenario a request names. workerd resolves a bare specifier
 * relative to the importing module, so imports of `@codenhub/jwt` are pointed at the module loaded here.
 */

const packageRoot = new URL("../../", import.meta.url);
const dist = new URL("dist/", packageRoot);
const jwtEntry = new URL("node_modules/@codenhub/jwt/dist/index.js", packageRoot);

const WORKER = `
import * as jwt from "./codenhub-jwt.js";
import * as client from "./dist/client.js";
import * as provider from "./dist/provider.js";
import * as testing from "./dist/testing.js";
import { runScenario } from "./tests/scenarios.js";

export default {
  async fetch(request) {
    const name = new URL(request.url).searchParams.get("scenario") ?? "";
    return new Response(await runScenario({ jwt, client, provider, testing }, name));
  },
};
`;

let worker: Miniflare | undefined;

beforeAll(async () => {
  if (!existsSync(new URL("client.js", dist))) {
    throw new Error("run `pnpm build oidc` first: this test reads dist/");
  }
  const scenarioSource = readFileSync(new URL("tests/scenarios.ts", packageRoot), "utf8");
  worker = new Miniflare({
    compatibilityDate: "2026-07-01",
    modulesRoot: fileURLToPath(packageRoot),
    modules: [
      { type: "ESModule", path: "worker.js", contents: WORKER },
      { type: "ESModule", path: "codenhub-jwt.js", contents: readFileSync(jwtEntry, "utf8") },
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
          contents: readFileSync(new URL(file, dist), "utf8").replaceAll(
            'from "@codenhub/jwt"',
            'from "../codenhub-jwt.js"',
          ),
        })),
    ],
  });
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
