import { spawn, spawnSync } from "node:child_process";
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

it.skipIf(process.platform === "win32")("shouldCountACheckAsWorkingWhileItsGroupOutlivesItsShell", async () => {
  const { working } = await import(statePath);
  const checkStarted = Date.now();
  // The shell exits at once, leaving a process it started in its group, as a check dispatch was killed during may.
  const shell = spawn("sh", ["-c", "sleep 30 &"], { detached: true, stdio: "ignore" });
  await new Promise((resolve) => shell.on("close", resolve));
  const meta = { phase: "interrupted", checkPid: shell.pid, checkStarted };

  try {
    expect(working(meta)).toBe(true);
  } finally {
    process.kill(-(shell.pid as number), "SIGKILL");
  }
  await expect.poll(() => working(meta)).toBe(false);
});

it.skipIf(!["win32", "linux"].includes(process.platform))(
  "shouldTellAWorkerFromAProcessThatReusedItsPid",
  async () => {
    const { working } = await import(statePath);
    const workerStarted = Date.now();
    const worker = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], { stdio: "ignore" });

    try {
      expect(working({ phase: "interrupted", workerPid: worker.pid, workerStarted })).toBe(true);
      // Recorded as started before this process existed: the pid is someone else's now.
      expect(working({ phase: "interrupted", workerPid: worker.pid, workerStarted: workerStarted - 60000 })).toBe(
        false,
      );
    } finally {
      worker.kill("SIGKILL");
    }
  },
  15000,
);

it.skipIf(process.platform !== "win32")("shouldCountAWorkerAsWorkingWhenProcessesCannotBeListed", async () => {
  const { working } = await import(statePath);
  const gone = spawnSync(process.execPath, ["-e", ""]).pid;
  const path = process.env.PATH;
  // No PATH, no powershell.exe to list the processes with.
  process.env.PATH = "";

  try {
    const seen: { unlisted?: boolean } = {};
    expect(working({ phase: "interrupted", workerPid: gone, workerStarted: Date.now() }, seen)).toBe(true);
    expect(seen.unlisted).toBe(true);
    // Past the bound, the pid is taken for someone else's.
    expect(working({ phase: "interrupted", workerPid: gone, workerStarted: Date.now() - 7 * 3600000 })).toBe(false);
  } finally {
    process.env.PATH = path;
  }
});
