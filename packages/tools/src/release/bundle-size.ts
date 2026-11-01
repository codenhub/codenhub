import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isBuiltin } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";

import { rolldown, VERSION, type OutputChunk, type Plugin } from "rolldown";

import { execute } from "../process/execute.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import type { ReadinessCheck } from "./readiness.ts";
import {
  compareSizeReports,
  listMeasuredEntrypoints,
  parseSizeReport,
  SIZE_FILE,
  type EntrypointSize,
  type ExportSize,
  type SizeReport,
} from "./size-report.ts";

/** The bundler as `size.json` names it. */
export const BUNDLER = `rolldown@${VERSION}`;

function isExternal(id: string, peers: readonly string[]): boolean {
  return isBuiltin(id) || peers.some((peer) => id === peer || id.startsWith(`${peer}/`));
}

const VIRTUAL_ENTRY = "\0codenhub-size-export";
const IDENTIFIER = /^[\p{ID_Start}$_][\p{ID_Continue}$‌‍]*$/u;
const UNATTRIBUTED = "(unattributed)";
const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Hands rolldown the source map a built file has beside it, so its output map reaches the sources. */
const readSourceMaps: Plugin = {
  async load(id) {
    if (id.startsWith("\0")) {
      return null;
    }
    try {
      const [code, map] = await Promise.all([readFile(id, "utf8"), readFile(`${id}.map`, "utf8")]);
      return { code, map };
    } catch {
      return null;
    }
  },
  name: "codenhub-size-source-maps",
};

/** Bundles one entry the way every measurement does, and returns the single minified chunk. */
async function bundleMinified(input: string, peers: readonly string[], plugins: Plugin[]): Promise<OutputChunk> {
  const bundle = await rolldown({
    external: (id) => isExternal(id, peers),
    input,
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
    plugins,
    resolve: { conditionNames: ["import", "default"], mainFields: ["module", "main"] },
  });
  try {
    // A hidden map adds no comment to the code, so the measured bytes are the
    // ones a build without a map produces.
    const { output } = await bundle.generate({
      codeSplitting: false,
      format: "esm",
      minify: true,
      sourcemap: "hidden",
    });
    return output[0];
  } finally {
    await bundle.close();
  }
}

function decodeVlq(segment: string): number[] {
  const values: number[] = [];
  let shift = 0;
  let value = 0;
  for (const character of segment) {
    const digit = BASE64.indexOf(character);
    value += (digit & 31) << shift;
    if ((digit & 32) === 0) {
      values.push((value & 1) === 1 ? -(value >>> 1) : value >>> 1);
      shift = 0;
      value = 0;
    } else {
      shift += 5;
    }
  }
  return values;
}

/** Names where a source came from: a dependency by package name, anything else by package-relative path. */
function describeSource(source: string, directory: string, packageDirectory: string): string {
  const path = resolve(directory, source).replaceAll("\\", "/");
  const dependency = /\/node_modules\/((?:@[^/]+\/)?[^/]+)\/(?!.*\/node_modules\/)/u.exec(path);
  return dependency === null
    ? relative(packageDirectory, path).replaceAll("\\", "/")
    : `node_modules/${dependency[1] ?? ""}`;
}

/**
 * Attributes every byte of a chunk to the source its map points it at.
 *
 * A byte belongs to the mapping segment that starts at or before it on its
 * line. Bytes before a line's first segment, in a segment with no source, and
 * the line breaks themselves are unattributed, so the counts sum to the
 * chunk's byte length.
 */
function attributeBytes(chunk: OutputChunk, directory: string, packageDirectory: string): Record<string, number> {
  const sources = (chunk.map?.sources ?? []).map((source) => describeSource(source, directory, packageDirectory));
  const lines = chunk.code.split("\n");
  const mappings = chunk.map?.mappings.split(";") ?? [];
  const bytes = new Map<string, number>();
  const add = (key: string, text: string): void => {
    bytes.set(key, (bytes.get(key) ?? 0) + Buffer.byteLength(text, "utf8"));
  };
  let sourceIndex = 0;
  lines.forEach((text, lineIndex) => {
    const segments: { column: number; source: string }[] = [];
    let column = 0;
    for (const segment of mappings[lineIndex]?.split(",") ?? []) {
      if (segment === "") {
        continue;
      }
      const [columnDelta = 0, sourceDelta] = decodeVlq(segment);
      column += columnDelta;
      if (sourceDelta !== undefined) {
        sourceIndex += sourceDelta;
      }
      segments.push({
        column,
        source: sourceDelta === undefined ? UNATTRIBUTED : (sources[sourceIndex] ?? UNATTRIBUTED),
      });
    }
    add(UNATTRIBUTED, text.slice(0, segments[0]?.column ?? text.length));
    segments.forEach(({ column: start, source }, index) => {
      add(source, text.slice(start, segments[index + 1]?.column ?? text.length));
    });
    if (lineIndex < lines.length - 1) {
      add(UNATTRIBUTED, "\n");
    }
  });
  return Object.fromEntries(
    [...bytes].filter(([, count]) => count > 0).sort(([a, x], [b, y]) => y - x || (a < b ? -1 : a > b ? 1 : 0)),
  );
}

function sizeOf(chunk: OutputChunk): { code: Buffer; gzip: number; minified: number } {
  const code = Buffer.from(chunk.code, "utf8");
  return { code, gzip: gzipSync(code, { level: 9 }).length, minified: code.length };
}

/**
 * Measures one built entrypoint the way `docs/specs/packages-lifecycle.md` "Bundle size" defines.
 *
 * The file is bundled as an entry, which keeps every export it has, with its
 * dependencies inlined, its peers and Node.js builtins external, and dynamic
 * imports inlined so the result is one file. An import that does not resolve
 * fails the measurement instead of being left external, which would understate
 * the size. Each runtime export is then bundled alone, the way a consumer
 * importing only it would get it, and the whole bundle's bytes are attributed
 * to their sources through any source maps the build wrote beside its files.
 * @param file Absolute path of the built entrypoint.
 * @param peers Peer dependency names to leave external.
 * @param packageDirectory Directory source files are named relative to, defaulting to the one above the entrypoint's.
 * @returns The entrypoint's size.
 * @throws When rolldown cannot bundle the entrypoint.
 */
export async function measureEntrypoint(
  file: string,
  peers: readonly string[],
  packageDirectory: string = dirname(dirname(file)),
): Promise<EntrypointSize> {
  const whole = await bundleMinified(file, peers, [readSourceMaps]);
  const { code, gzip, minified } = sizeOf(whole);
  const exports: Record<string, ExportSize> = Object.fromEntries(
    await Promise.all(
      whole.exports.map(async (name) => {
        const specifier = IDENTIFIER.test(name) ? name : JSON.stringify(name);
        const alone = await bundleMinified(VIRTUAL_ENTRY, peers, [
          {
            load: (id) => (id === VIRTUAL_ENTRY ? `export { ${specifier} } from ${JSON.stringify(file)};` : null),
            name: "codenhub-size-export",
            resolveId: (id) => (id === VIRTUAL_ENTRY ? id : null),
          },
        ]);
        const { gzip: exportGzip, minified: exportMinified } = sizeOf(alone);
        return [name, { gzip: exportGzip, minified: exportMinified }] as const;
      }),
    ),
  );
  return {
    exports,
    files: attributeBytes(whole, dirname(file), packageDirectory),
    gzip,
    minified,
    sha256: createHash("sha256").update(code).digest("hex"),
  };
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
      async ({ subpath, target }) =>
        [subpath, await measure(join(workspacePackage.directory, target), peers, workspacePackage.directory)] as const,
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
