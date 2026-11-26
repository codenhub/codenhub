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
import { waitUntil } from "cloudflare:workers";
import * as jwt from "./dist/index.js";
import { runScenario } from "./tests/scenarios.js";

// A remote key set shared by requests, as a module-level one is in a real Worker. Its fetch waits on a
// timer, which workerd cancels with the request that started it unless that request's work is kept alive.
// A request that joins the cancelled fetch then waits, depending on the workerd version, either until the
// fetch's deadline (\`timeout\` plus a second) or not at all, and fetches again.
const runs = new Map();
const HEADER = { alg: "ES256", kid: "k1" };

async function start(url) {
  const pair = await jwt.generateKeyPair({ alg: "ES256", kid: "k1" });
  const jwks = JSON.stringify({ keys: [await jwt.exportPublicJwk(pair.publicKey)] });
  const run = { fetches: 0 };
  const slowFetch = async () => {
    run.fetches += 1;
    await new Promise((resolve) => setTimeout(resolve, 200));
    return new Response(jwks, { headers: { "content-type": "application/json" } });
  };
  const keepAlive = url.searchParams.get("keepAlive") === "yes";
  run.keys = jwt.createRemoteKeySet({
    url: "https://issuer.test/jwks",
    fetch: slowFetch,
    timeout: 1,
    ...(keepAlive ? { waitUntil } : {}),
  });
  // Started and not awaited: this request ends while the fetch is still waiting.
  run.keys.select(HEADER).catch(() => {});
  runs.set(url.searchParams.get("run"), run);
  return new Response("started");
}

async function join(url) {
  const run = runs.get(url.searchParams.get("run"));
  try {
    const result = await run.keys.select(HEADER);
    return Response.json({ ok: result.ok, fetches: run.fetches });
  } catch (error) {
    return Response.json({ rejected: String(error) });
  }
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/start") return start(url);
    if (url.pathname === "/join") return join(url);
    const name = url.searchParams.get("scenario") ?? "";
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
        // The build writes one file per module, in subdirectories; paths are joined with "/" on Windows too.
        ...readdirSync(dist, { recursive: true, encoding: "utf8" })
          .map((file) => file.replaceAll("\\", "/"))
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

  describe("a remote key fetch started by a request that ended", () => {
    const startThenJoin = async (run: string, keepAlive: boolean): Promise<unknown> => {
      const mf = worker as Miniflare;
      const keep = keepAlive ? "yes" : "no";
      await (await mf.dispatchFetch(`http://worker.test/start?run=${run}&keepAlive=${keep}`)).text();
      return (await mf.dispatchFetch(`http://worker.test/join?run=${run}`)).json();
    };

    it("is fetched again by the next request instead of failing it", async () => {
      expect(await startThenJoin("cancelled", false)).toEqual({ ok: true, fetches: 2 });
    }, 15_000);

    it("completes when waitUntil keeps it alive", async () => {
      expect(await startThenJoin("kept", true)).toEqual({ ok: true, fetches: 1 });
    });
  });
});
