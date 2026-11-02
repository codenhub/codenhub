/** File at a package root recording the bundle size of the release it was cut for. */
export const SIZE_FILE = "size.json";

/** The minified bytes one source contributed to a bundle. */
export interface SourceSize {
  /** Byte count. */
  bytes: number;
  /**
   * The same bytes by the top-level declaration they came from, largest
   * first, summing to `bytes`: a function or variable by name, a class
   * member as `Class.member` (`Class.#name` when private) with the class's
   * own heading and braces under `Class`, `default` for an anonymous default
   * export, and `(top level)` for anything outside a declaration. Absent for a dependency, for `(unattributed)`, and
   * for a file that could not be parsed.
   */
  declarations?: Record<string, number>;
}

/**
 * Minified bytes of a bundle by where they came from, largest first, summing
 * to the bundle's minified length. Keys are package-relative source files, as
 * far as the build's source maps reach, `node_modules/<name>` for a
 * dependency, or `(unattributed)` for code the bundler added.
 */
export type SourceBreakdown = Record<string, SourceSize>;

/** What importing one export alone costs, tree-shaken. */
export interface ExportSize {
  /** Byte length of the minified bundle. */
  minified: number;
  /** Byte length of the minified bundle gzipped at level 9. */
  gzip: number;
  /** Where the bundle's bytes came from. Absent from a release recorded before it was measured. */
  files?: SourceBreakdown;
}

/** One entrypoint's measured cost, as `docs/specs/packages-lifecycle.md` "Bundle size" defines it. */
export interface EntrypointSize {
  /** Byte length of the minified bundle. */
  minified: number;
  /** Byte length of the minified bundle gzipped at level 9. */
  gzip: number;
  /** Hex SHA-256 of the minified bundle, which is what the publish check compares. */
  sha256: string;
  /**
   * Cost of each runtime export imported alone, keyed by export name. Absent
   * from a release recorded before exports were measured.
   */
  exports?: Record<string, ExportSize>;
  /** Where the whole bundle's bytes came from. Absent from a release recorded before files were measured. */
  files?: SourceBreakdown;
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
    const { exports, files, gzip, minified, sha256 } = (size ?? {}) as Record<string, unknown>;
    if (!isNonNegativeInteger(minified) || !isNonNegativeInteger(gzip) || typeof sha256 !== "string") {
      return fail(`"${subpath}" needs integer "minified" and "gzip" and a "sha256" string`);
    }
    if (!SHA256.test(sha256)) {
      return fail(`"${subpath}" has a "sha256" that is not 64 lowercase hex digits`);
    }
    const entry: EntrypointSize = { gzip, minified, sha256 };
    if (exports !== undefined) {
      // A null prototype, so an export named `__proto__` is kept as a key.
      entry.exports = Object.create(null) as Record<string, ExportSize>;
      for (const [name, value] of Object.entries(asRecord(exports, `"${subpath}" "exports"`, fail))) {
        const {
          files: exportFiles,
          gzip: exportGzip,
          minified: exportMinified,
        } = (value ?? {}) as Record<string, unknown>;
        if (!isNonNegativeInteger(exportMinified) || !isNonNegativeInteger(exportGzip)) {
          return fail(`"${subpath}" export "${name}" needs integer "minified" and "gzip"`);
        }
        const exportSize: ExportSize = { gzip: exportGzip, minified: exportMinified };
        if (exportFiles !== undefined) {
          exportSize.files = parseBreakdown(exportFiles, `"${subpath}" export "${name}"`, fail);
        }
        entry.exports[name] = exportSize;
      }
    }
    if (files !== undefined) {
      entry.files = parseBreakdown(files, `"${subpath}"`, fail);
    }
    sizes[subpath] = entry;
  }
  return { bundler, entrypoints: sizes };
}

function parseBreakdown(value: unknown, owner: string, fail: (reason: string) => never): SourceBreakdown {
  const breakdown: SourceBreakdown = {};
  for (const [file, size] of Object.entries(asRecord(value, `${owner} "files"`, fail))) {
    const { bytes, declarations } = (size ?? {}) as Record<string, unknown>;
    if (!isNonNegativeInteger(bytes)) {
      return fail(`${owner} file "${file}" needs an integer "bytes"`);
    }
    const source: SourceSize = { bytes };
    if (declarations !== undefined) {
      const counts = Object.entries(asRecord(declarations, `${owner} file "${file}" "declarations"`, fail));
      for (const [name, count] of counts) {
        if (!isNonNegativeInteger(count)) {
          return fail(`${owner} file "${file}" declaration "${name}" needs an integer byte count`);
        }
      }
      // Not assigned key by key: assigning `__proto__` sets the prototype instead.
      source.declarations = Object.fromEntries(counts) as Record<string, number>;
    }
    breakdown[file] = source;
  }
  return breakdown;
}

function asRecord(value: unknown, field: string, fail: (reason: string) => never): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : fail(`${field} must be an object`);
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
 * The gzipped lengths are not compared: identical bytes can gzip to different
 * lengths on different CPUs, and the hash already proves the bytes match.
 * Export, file, and declaration sizes are compared even when the whole bundle
 * matches, because they can change without it: dropping a `@__PURE__`
 * annotation changes what an export tree-shakes to, and moving code between
 * files or declarations changes its attribution. A breakdown the release did
 * not record is not compared.
 * @param recorded Report the release commit carries.
 * @param measured Report measured now.
 * @returns One line per difference, empty when they agree.
 */
export function compareSizeReports(recorded: SizeReport, measured: SizeReport): string[] {
  const differences: string[] = [];
  if (recorded.bundler !== measured.bundler) {
    differences.push(`measured with ${measured.bundler}, recorded with ${recorded.bundler}`);
  }
  differences.push(
    ...compareKeyed(recorded.entrypoints, measured.entrypoints, "", (subpath, before, now) => {
      if (before.minified !== now.minified) {
        return [`${subpath} is ${now.minified} bytes minified, recorded ${before.minified}`];
      }
      return before.sha256 === now.sha256 ? [] : [`${subpath} has the recorded length but different bytes`];
    }),
  );
  for (const [subpath, before] of Object.entries(recorded.entrypoints)) {
    const now = measured.entrypoints[subpath];
    if (now !== undefined && before.exports !== undefined) {
      differences.push(
        ...compareKeyed(before.exports, now.exports ?? {}, `${subpath} export `, (name, was, is) => [
          ...(was.minified === is.minified
            ? []
            : [`${name} is ${is.minified} bytes minified, recorded ${was.minified}`]),
          ...compareBreakdowns(was.files, is.files).map((line) => `${name} ${line}`),
        ]),
      );
    }
    if (now !== undefined) {
      differences.push(...compareBreakdowns(before.files, now.files).map((line) => `${subpath} ${line}`));
    }
  }
  return differences;
}

function compareBreakdowns(recorded: SourceBreakdown | undefined, measured: SourceBreakdown | undefined): string[] {
  if (recorded === undefined) {
    return [];
  }
  return compareKeyed(recorded, measured ?? {}, "file ", (file, was, is) => [
    ...(was.bytes === is.bytes ? [] : [`${file} is ${is.bytes} bytes, recorded ${was.bytes}`]),
    ...(was.declarations === undefined
      ? []
      : compareKeyed(was.declarations, is.declarations ?? {}, `${file} declaration `, (name, bytesWas, bytesIs) =>
          bytesWas === bytesIs ? [] : [`${name} is ${bytesIs} bytes, recorded ${bytesWas}`],
        )),
  ]);
}

function compareKeyed<T>(
  recorded: Record<string, T>,
  measured: Record<string, T>,
  prefix: string,
  compare: (key: string, before: T, now: T) => string[],
): string[] {
  const keys = new Set([...Object.keys(recorded), ...Object.keys(measured)]);
  return [...keys].flatMap((key) => {
    const [before, now] = [recorded[key], measured[key]];
    if (before === undefined || now === undefined) {
      return [`${prefix}${key} is ${before === undefined ? "measured but not recorded" : "recorded but not measured"}`];
    }
    return compare(key, before, now).map((line) => `${prefix}${line}`);
  });
}
