import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ALIAS, codeFlow, get, ISSUER, SECRETS } from "./support";

/*
 * Runs the Worker itself in workerd, with its Durable Object, the way `wrangler deploy` ships it. The host's
 * behavior is covered in Node.js by host.test.ts; this proves what only the Worker adds: that every request reaches
 * the one object, so a code issued by one request is redeemed by the next, and that a missing secret fails loudly.
 */

const entry = fileURLToPath(new URL("../src/worker.ts", import.meta.url));
// Read from the file `wrangler deploy` reads, so the test runs the Worker under the date it ships with.
const compatibilityDate = /"compatibility_date":\s*"([^"]+)"/.exec(
  readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
)?.[1];
if (compatibilityDate === undefined) {
  throw new Error("wrangler.jsonc names no compatibility_date.");
}
let script = "";
let worker: Miniflare | undefined;
let incomplete: Miniflare | undefined;

const send = async (request: Request): Promise<Response> =>
  (await (worker as Miniflare).dispatchFetch(request.url, {
    method: request.method,
    headers: [...request.headers],
    body: request.body === null ? undefined : await request.text(),
    redirect: "manual",
  })) as unknown as Response;

function start(bindings: Record<string, string>): Miniflare {
  return new Miniflare(
    convertV4MiniflareOptions({
      compatibilityDate,
      modules: true,
      script,
      scriptPath: entry,
      durableObjects: { HOST: { className: "ConformanceHost", useSQLite: true } },
      bindings,
    }),
  );
}

beforeAll(async () => {
  const bundled = await build({
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    platform: "neutral",
    mainFields: ["module", "main"],
    conditions: ["import", "workerd", "worker"],
    target: "es2024",
    write: false,
  });
  script = bundled.outputFiles[0]?.text ?? "";
  worker = start({
    ISSUER,
    SUITE_ALIAS: ALIAS,
    CLIENT_SECRET_1: SECRETS.first,
    CLIENT_SECRET_2: SECRETS.second,
    CLIENT_SECRET_POST: SECRETS.post,
    CLIENT_SECRET_CONTROL: SECRETS.control,
  });
  incomplete = start({ ISSUER, SUITE_ALIAS: ALIAS, CLIENT_SECRET_1: SECRETS.first });
  await Promise.all([worker.ready, incomplete.ready]);
}, 120_000);

afterAll(async () => {
  await Promise.all([worker?.dispose(), incomplete?.dispose()]);
});

describe("the Worker in workerd", () => {
  it("serves discovery", async () => {
    const metadata = (await (await get(send, `${ISSUER}/.well-known/openid-configuration`)).json()) as Record<
      string,
      unknown
    >;

    expect(metadata["id_token_signing_alg_values_supported"]).toContain("RS256");
  });

  it("redeems at one request the code another request issued", async () => {
    const { tokens, userinfo } = await codeFlow(send);

    expect(tokens.token_type).toBe("Bearer");
    expect(userinfo["sub"]).toBe("conformance-user");
  });

  it("names the missing secrets and no value when it is not configured", async () => {
    const response = await (incomplete as Miniflare).dispatchFetch(`${ISSUER}/`);

    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).toContain("Missing configuration: CLIENT_SECRET_2, CLIENT_SECRET_POST, CLIENT_SECRET_CONTROL.");
    expect(text).not.toContain(SECRETS.first);
  });
});
