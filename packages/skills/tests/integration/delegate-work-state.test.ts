import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { expect, it } from "vitest";

const statePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../skills/delegate-work/scripts/lib/state.mjs",
);

it("shouldKeepRunMetadataReadableDuringConcurrentUpdates", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "delegate-work-state-"));
  const id = "abcdef";
  const run = path.join(dir, "runs", id);
  const priorState = process.env.DELEGATE_WORK_STATE;
  fs.mkdirSync(run, { recursive: true });
  fs.writeFileSync(path.join(run, "meta.json"), JSON.stringify({ id, phase: "running" }));
  const code = `
    const { saveMeta } = await import(${JSON.stringify(pathToFileURL(statePath).href)});
    const meta = { id: ${JSON.stringify(id)}, phase: 'running', brief: 'x'.repeat(15000) };
    for (let i = 0; i < 200; i++) saveMeta(meta.id, meta);
  `;

  try {
    process.env.DELEGATE_WORK_STATE = dir;
    const { loadMeta } = await import(statePath);
    const child = spawn(process.execPath, ["--input-type=module", "-e", code], {
      env: { ...process.env, DELEGATE_WORK_STATE: dir },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let isDone = false;
    let error = "";
    child.stderr.on("data", (chunk: Buffer) => (error += chunk.toString()));
    const exit = new Promise<number | null>((resolve) => child.on("close", resolve));
    child.on("close", () => (isDone = true));

    while (!isDone) {
      const meta = loadMeta(id);
      expect(meta.id).toBe(id);
      // oxlint-disable-next-line no-await-in-loop -- polls until the child finishes writing metadata.
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    const exitCode = await exit;
    if (exitCode !== 0) {
      throw new Error(`metadata writer failed: ${error}`);
    }
    expect(exitCode).toBe(0);
  } finally {
    if (priorState === undefined) {
      delete process.env.DELEGATE_WORK_STATE;
    } else {
      process.env.DELEGATE_WORK_STATE = priorState;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
}, 15000);

