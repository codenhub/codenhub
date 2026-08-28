import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

/** A package's own `demo/` the aggregator can proxy to during `astro dev`. */
export interface DemoDevTarget {
  demoDir: string;
  slug: string;
}

/** A demo dev server that started successfully and is ready to receive requests. */
export interface RunningDemoDevServer {
  port: number;
  slug: string;
  stop: () => void;
}

const READY_PATTERN = /Local:\s+https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):(\d+)/;
const ANSI_ESCAPE_PATTERN = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");
const START_TIMEOUT_MS = 20_000;

/**
 * Kills the spawned shell and every process it started, not just the shell
 * itself — `shell: true` makes `child` a shell wrapping `pnpm run dev`, which
 * spawns its own descendants (pnpm, then the demo's dev server); killing only
 * the shell would orphan the rest.
 * @param child Shell process started with `shell: true`.
 */
function killDemoDevServer(child: ChildProcess): void {
  if (child.pid === undefined) {
    return;
  }
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(-child.pid);
  } catch {
    child.kill();
  }
}

/**
 * Discovers every `packages/*\/demo`, the same directory role
 * `discoverBuiltDemos` (`demo-integration.ts`) discovers for build-time
 * copying. Dev-mode proxying only needs the directory to exist, not a
 * completed build, since it starts each demo's own dev server rather than
 * serving prebuilt output.
 * @param packagesRoot Absolute path to the workspace `packages/` directory.
 * @returns Discovered demo directories, sorted by slug.
 */
export function discoverDemoDirs(packagesRoot: string): DemoDevTarget[] {
  return readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((slug) => existsSync(path.join(packagesRoot, slug, "demo", "package.json")))
    .map((slug) => ({ demoDir: path.join(packagesRoot, slug, "demo"), slug }))
    .sort((left, right) => left.slug.localeCompare(right.slug));
}

/**
 * Starts one package's own `demo` dev server with its base path set to
 * `/<slug>/`, so the aggregator can mount it there through a dev-time
 * proxy. Resolves once the server reports the port it is listening on;
 * rejects if it exits first or reports nothing within `timeoutMs`.
 * @param target Demo directory and slug to start.
 * @param timeoutMs Milliseconds to wait for a listening port. Defaults to {@link START_TIMEOUT_MS}.
 * @returns The running server's port and a `stop` callback.
 */
export function startDemoDevServer(
  target: DemoDevTarget,
  timeoutMs: number = START_TIMEOUT_MS,
): Promise<RunningDemoDevServer> {
  // A single pre-formatted command line, not an argument array, keeps this off
  // Node's shell+argument-array deprecation path (DEP0190) — `target.slug`
  // is a workspace directory name, not untrusted input reaching the shell.
  // No `--` before the extra args: pnpm already forwards them to the script
  // as-is, and a `--` here is passed through as a literal, misparsed argument.
  const child = spawn(`pnpm run dev --base /${target.slug}/`, {
    cwd: target.demoDir,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    // A POSIX process group leader, so `killDemoDevServer` can signal the
    // whole tree via its negative pid. Windows has no such mechanism and
    // `taskkill /t` there doesn't need it.
    detached: process.platform !== "win32",
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (run: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      run();
    };
    const timer = setTimeout(() => {
      settle(() => {
        killDemoDevServer(child);
        reject(new Error(`${target.slug} demo dev server did not report a listening port within ${timeoutMs}ms.`));
      });
    }, timeoutMs);

    const forward = (prefix: string) => (chunk: Buffer) => process.stdout.write(`${prefix}${chunk.toString()}`);
    child.stdout?.on("data", forward(`[demo:${target.slug}] `));
    // Buffered rather than matched chunk-by-chunk: Node's stdout pipe can
    // split one printed line — including the "Local:" line this waits for —
    // across multiple `data` events. The listener removes itself once matched
    // so `output` stops growing for the rest of the (long-lived) dev session.
    let output = "";
    const matchReadyLine = (chunk: Buffer) => {
      output += chunk.toString().replace(ANSI_ESCAPE_PATTERN, "");
      const match = READY_PATTERN.exec(output);
      if (match !== null) {
        child.stdout?.off("data", matchReadyLine);
        settle(() => resolve({ port: Number(match[1]), slug: target.slug, stop: () => killDemoDevServer(child) }));
      }
    };
    child.stdout?.on("data", matchReadyLine);
    child.stderr?.on("data", forward(`[demo:${target.slug}] `));
    child.once("error", (error) => settle(() => reject(error)));
    child.once("exit", (code) => {
      settle(() => reject(new Error(`${target.slug} demo dev server exited before starting (code ${code}).`)));
    });
  });
}
