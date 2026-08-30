import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { appendStartupOutput, discoverDemoDirs, startDemoDevServer } from "./demo-dev-server";

describe("discoverDemoDirs", () => {
  it("finds only packages with a demo/package.json, sorted by slug", async () => {
    const packagesRoot = await mkdtemp(path.join(tmpdir(), "codenhub-demo-dev-discovery-"));
    await mkdir(path.join(packagesRoot, "icons", "demo"), { recursive: true });
    await writeFile(path.join(packagesRoot, "icons", "demo", "package.json"), "{}");
    await mkdir(path.join(packagesRoot, "error", "demo"), { recursive: true });
    await writeFile(path.join(packagesRoot, "error", "demo", "package.json"), "{}");
    await mkdir(path.join(packagesRoot, "store"), { recursive: true });

    expect(discoverDemoDirs(packagesRoot)).toEqual([
      { demoDir: path.join(packagesRoot, "error", "demo"), slug: "error" },
      { demoDir: path.join(packagesRoot, "icons", "demo"), slug: "icons" },
    ]);
  });
});

async function writeFixtureDemo(script: string): Promise<string> {
  const demoDir = await mkdtemp(path.join(tmpdir(), "codenhub-demo-dev-fixture-"));
  await writeFile(path.join(demoDir, "server.js"), script);
  await writeFile(path.join(demoDir, "package.json"), JSON.stringify({ scripts: { dev: "node server.js" } }));
  return demoDir;
}

describe("startDemoDevServer", () => {
  it("keeps only the tail needed to detect the readiness line", () => {
    const output = appendStartupOutput("x".repeat(70_000), Buffer.from("Local: http://localhost:59123/"));

    expect(output.length).toBeLessThanOrEqual(64 * 1024);
    expect(output).toContain("Local: http://localhost:59123/");
  });

  it("resolves with the port the demo server reports listening on", async () => {
    const demoDir = await writeFixtureDemo(
      "console.log('Local: http://localhost:59123/fixture/'); setInterval(() => {}, 1000);",
    );

    const server = await startDemoDevServer({ demoDir, slug: "fixture" });
    try {
      expect(server.port).toBe(59123);
      expect(server.slug).toBe("fixture");
    } finally {
      server.stop();
    }
  });

  it("rejects when the demo server exits before reporting a port", async () => {
    const demoDir = await writeFixtureDemo("process.exit(1);");

    await expect(startDemoDevServer({ demoDir, slug: "fixture" })).rejects.toThrow(/exited before starting/);
  });

  it("rejects when the demo server reports nothing within the timeout", async () => {
    const demoDir = await writeFixtureDemo("setInterval(() => {}, 1000);");

    await expect(startDemoDevServer({ demoDir, slug: "fixture" }, 200)).rejects.toThrow(
      /did not report a listening port/,
    );
  });
});
