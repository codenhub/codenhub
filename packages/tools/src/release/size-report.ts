/** File at a package root recording the bundle size of the release it was cut for. */
export const SIZE_FILE = "size.json";

/** One entrypoint's measured cost, as `docs/specs/packages-lifecycle.md` "Bundle size" defines it. */
export interface EntrypointSize {
  /** Byte length of the minified bundle. */
  minified: number;
  /** Byte length of the minified bundle gzipped at level 9. */
  gzip: number;
  /** Hex SHA-256 of the minified bundle, which is what the publish check compares. */
  sha256: string;
}

/** What `size.json` holds. */
export interface SizeReport {
  /** Bundler that measured, as `<name>@<version>`, such as `rolldown@1.1.5`. */
  bundler: string;
  /** Measured sizes keyed by `exports` subpath, such as `.` or `./client`. */
  entrypoints: Record<string, EntrypointSize>;
}

/** An `exports` subpath and the JavaScript file it resolves to. */
export interface MeasuredEntrypoint {
  /** Subpath as written in `exports`, such as `.` or `./client`. */
  subpath: string;
  /** Package-relative POSIX path of the file, such as `dist/index.js`. */
  target: string;
}

const CONDITIONS = ["import", "default"] as const;
const JAVASCRIPT = /\.m?js$/u;
const SHA256 = /^[0-9a-f]{64}$/u;

function resolveTarget(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  for (const condition of CONDITIONS) {
    if (condition in value) {
      return resolveTarget((value as Record<string, unknown>)[condition]);
    }
  }
  return undefined;
}

/**
 * Lists the `exports` entrypoints whose size is measured.
 *
 * Each subpath is resolved through its `import` condition, else `default`,
 * nesting included. Only a `.js` or `.mjs` target is kept: CSS, wildcard
 * subpaths, and `./package.json` have no JavaScript bundle to measure.
 * @param manifest Parsed package manifest.
 * @returns Measured entrypoints in `exports` order.
 */
export function listMeasuredEntrypoints(manifest: Readonly<Record<string, unknown>>): MeasuredEntrypoint[] {
  const { exports } = manifest;
  const isSubpathMap =
    typeof exports === "object" &&
    exports !== null &&
    !Array.isArray(exports) &&
    Object.keys(exports).every((key) => key.startsWith("."));
  const entries: [string, unknown][] = isSubpathMap ? Object.entries(exports) : [[".", exports]];
  return entries.flatMap(([subpath, value]) => {
    const target = resolveTarget(value);
    return !subpath.includes("*") && target?.startsWith("./") === true && JAVASCRIPT.test(target)
      ? [{ subpath, target: target.slice(2) }]
      : [];
  });
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Reads `size.json` contents, refusing anything but the shape {@link SizeReport} describes.
 * @param contents File contents.
 * @param source Where the contents came from, for the error message.
 * @returns The parsed report.
 * @throws When the contents are not JSON or not a size report.
 */
export function parseSizeReport(contents: string, source: string): SizeReport {
  const fail = (reason: string): never => {
    throw new Error(`${source} is not a size report: ${reason}.`);
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    return fail("it is not JSON");
  }
  if (typeof parsed !== "object" || parsed === null) {
    return fail("expected an object");
  }
  const { bundler, entrypoints } = parsed as Record<string, unknown>;
  if (typeof bundler !== "string" || bundler === "") {
    return fail(`"bundler" must name the bundler`);
  }
  if (typeof entrypoints !== "object" || entrypoints === null || Array.isArray(entrypoints)) {
    return fail(`"entrypoints" must be an object`);
  }
  const sizes: Record<string, EntrypointSize> = {};
  for (const [subpath, size] of Object.entries(entrypoints)) {
    const { gzip, minified, sha256 } = (size ?? {}) as Record<string, unknown>;
    if (!isNonNegativeInteger(minified) || !isNonNegativeInteger(gzip) || typeof sha256 !== "string") {
      return fail(`"${subpath}" needs integer "minified" and "gzip" and a "sha256" string`);
    }
    if (!SHA256.test(sha256)) {
      return fail(`"${subpath}" has a "sha256" that is not 64 lowercase hex digits`);
    }
    sizes[subpath] = { gzip, minified, sha256 };
  }
  return { bundler, entrypoints: sizes };
}

/**
 * Writes a size report the way `size.json` stores it.
 * @param report Report to write.
 * @returns File contents, with a trailing newline.
 */
export function serializeSizeReport(report: SizeReport): string {
  return `${JSON.stringify(report, undefined, 2)}\n`;
}

/**
 * Lists how a measured report differs from a recorded one, in the fields the publish check compares.
 *
 * The gzipped length is not compared: identical bytes can gzip to different
 * lengths on different CPUs, and the hash already proves the bytes match.
 * @param recorded Report the release commit carries.
 * @param measured Report measured now.
 * @returns One line per difference, empty when they agree.
 */
export function compareSizeReports(recorded: SizeReport, measured: SizeReport): string[] {
  const differences: string[] = [];
  if (recorded.bundler !== measured.bundler) {
    differences.push(`measured with ${measured.bundler}, recorded with ${recorded.bundler}`);
  }
  const subpaths = new Set([...Object.keys(recorded.entrypoints), ...Object.keys(measured.entrypoints)]);
  for (const subpath of subpaths) {
    const [before, now] = [recorded.entrypoints[subpath], measured.entrypoints[subpath]];
    if (before === undefined || now === undefined) {
      differences.push(
        `${subpath} is ${before === undefined ? "measured but not recorded" : "recorded but not measured"}`,
      );
    } else if (before.minified !== now.minified) {
      differences.push(`${subpath} is ${now.minified} bytes minified, recorded ${before.minified}`);
    } else if (before.sha256 !== now.sha256) {
      differences.push(`${subpath} has the recorded length but different bytes`);
    }
  }
  return differences;
}
