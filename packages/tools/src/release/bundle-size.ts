import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isBuiltin } from "node:module";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { rolldown, VERSION } from "rolldown";

import { execute } from "../process/execute.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import type { ReadinessCheck } from "./readiness.ts";
import {
  compareSizeReports,
  listMeasuredEntrypoints,
  parseSizeReport,
  SIZE_FILE,
  type EntrypointSize,
  type SizeReport,
} from "./size-report.ts";

/** The bundler as `size.json` names it. */
export const BUNDLER = `rolldown@${VERSION}`;

function isExternal(id: string, peers: readonly string[]): boolean {
  return isBuiltin(id) || peers.some((peer) => id === peer || id.startsWith(`${peer}/`));
}

/**
 * Measures one built entrypoint the way `docs/specs/packages-lifecycle.md` "Bundle size" defines.
 *
 * The file is bundled as an entry, which keeps every export it has, with its
 * dependencies inlined, its peers and Node.js builtins external, and dynamic
 * imports inlined so the result is one file. An import that does not resolve
 * fails the measurement instead of being left external, which would understate
 * the size.
 * @param file Absolute path of the built entrypoint.
 * @param peers Peer dependency names to leave external.
 * @returns The entrypoint's size.
 * @throws When rolldown cannot bundle the entrypoint.
 */
export async function measureEntrypoint(file: string, peers: readonly string[]): Promise<EntrypointSize> {
  const bundle = await rolldown({
    external: (id) => isExternal(id, peers),
    input: file,
    onLog: (level, log, handler) => {
      if (log.code === "UNRESOLVED_IMPORT") {
        handler("error", log);
        return;
      }
      if (level !== "debug" && level !== "info") {
        handler(level, log);
      }
    },
    platform: "neutral",
    resolve: { conditionNames: ["import", "default"], mainFields: ["module", "main"] },
  });
  try {
    const { output } = await bundle.generate({ codeSplitting: false, format: "esm", minify: true });
    const [chunk] = output;
    const code = Buffer.from(chunk.code, "utf8");
    return {
      gzip: gzipSync(code, { level: 9 }).length,
      minified: code.length,
      sha256: createHash("sha256").update(code).digest("hex"),
    };
  } finally {
    await bundle.close();
  }
}

/** Builds a package before it is measured. Injected by tests. */
export type PackageBuilder = (
  workspacePackage: WorkspacePackage,
  timeoutMs?: number,
) => Promise<{ isSuccess: boolean; didTimeOut?: boolean; output: string }>;

const runBuild: PackageBuilder = async (workspacePackage, timeoutMs) => {
  const outcome = await execute(
    { args: ["run", "build"], command: "pnpm", cwd: workspacePackage.directory },
    { stdio: "pipe", timeoutMs },
  );
  return { didTimeOut: outcome.didTimeOut, isSuccess: outcome.isSuccess, output: outcome.output ?? "" };
};

/** How {@link measurePackage} builds and measures. Injected by tests. */
export interface MeasureOptions {
  /** Package builder, defaulting to `pnpm run build` in the package directory. */
  build?: PackageBuilder;
  /** Entrypoint measurer, defaulting to {@link measureEntrypoint}. */
  measure?: typeof measureEntrypoint;
  /** Milliseconds before the build is killed, or `undefined` to wait indefinitely. */
  timeoutMs?: number;
}

/**
 * Builds a package and measures every JavaScript `exports` entrypoint.
 *
 * The build always runs, so the measurement is of output built from the source
 * on disk now, never of whatever an earlier build left in `dist`.
 * @param workspacePackage Package to measure.
 * @param options Builder and measurer, injected by tests.
 * @returns The package's size report.
 * @throws When the build fails or an entrypoint cannot be bundled.
 */
export async function measurePackage(
  workspacePackage: WorkspacePackage,
  options: MeasureOptions = {},
): Promise<SizeReport> {
  const built = await (options.build ?? runBuild)(workspacePackage, options.timeoutMs);
  if (built.didTimeOut === true) {
    // A build killed at the timeout is not a compile failure, and its partial
    // output would read like one.
    throw new Error(
      `${workspacePackage.name} did not finish building within ${String((options.timeoutMs ?? 0) / 1000)} s, so its size cannot be measured; raise --timeout or find what hangs.\n${built.output}`,
    );
  }
  if (!built.isSuccess) {
    throw new Error(`${workspacePackage.name} did not build, so its size cannot be measured.\n${built.output}`);
  }
  const peers = Object.keys((workspacePackage.manifest.peerDependencies as Record<string, unknown> | undefined) ?? {});
  const measure = options.measure ?? measureEntrypoint;
  const measured = await Promise.all(
    listMeasuredEntrypoints(workspacePackage.manifest).map(
      async ({ subpath, target }) => [subpath, await measure(join(workspacePackage.directory, target), peers)] as const,
    ),
  );
  return { bundler: BUNDLER, entrypoints: Object.fromEntries(measured) };
}

/**
 * Checks that the `size.json` a release carries matches what the package measures now.
 *
 * This is the `size` publish precondition. A missing or unreadable file blocks,
 * because every release from this one on records its size; so does any
 * difference in the bundler, an entrypoint's minified length, or its hash.
 * @param workspacePackage Package about to be published.
 * @param options Builder, measurer, and build timeout.
 * @returns A `size` precondition in the shape the preflight reports.
 */
export async function checkBundleSize(
  workspacePackage: WorkspacePackage,
  options: MeasureOptions = {},
): Promise<ReadinessCheck> {
  const block = (detail: string): ReadinessCheck => ({ detail, name: "size", status: "blocked" });
  let contents: string;
  try {
    contents = await readFile(join(workspacePackage.directory, SIZE_FILE), "utf8");
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? block(`no ${SIZE_FILE}; cut the release with \`pnpm hub release ${workspacePackage.name} --cut=<version>\``)
      : block(`${SIZE_FILE} could not be read: ${(error as Error).message}`);
  }
  let recorded: SizeReport;
  let measured: SizeReport;
  try {
    recorded = parseSizeReport(contents, SIZE_FILE);
    measured = await measurePackage(workspacePackage, options);
  } catch (error) {
    return block(error instanceof Error ? error.message : String(error));
  }
  const differences = compareSizeReports(recorded, measured);
  if (differences.length > 0) {
    return block(`${SIZE_FILE} does not match this build: ${differences.join("; ")}`);
  }
  const count = Object.keys(measured.entrypoints).length;
  return { detail: `${SIZE_FILE} matches ${count} measured entrypoint(s)`, name: "size", status: "ready" };
}
