import type { SizeReport } from "@codenhub/tools/release";

/** One name an entrypoint exports, and what importing it alone costs. */
export interface ExportRow {
  name: string;
  minified: number;
  gzip: number;
  /** Fraction of the whole entrypoint's minified bytes, from 0 to 1. */
  share: number;
}

/** One `exports` entrypoint, with as much of its cost as its release measured. */
export interface EntrypointRow {
  /** `exports` subpath, such as `.` or `./client`. */
  subpath: string;
  /** Absent for an entrypoint that was not measured, such as CSS, or a release cut before sizes were. */
  size?: { minified: number; gzip: number };
  /** In name order; absent when the release did not record the entrypoint's exports. */
  exports?: ExportRow[];
}

function fraction(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

// No runtime code costs nothing, not the 20 bytes gzip spends on an empty file, as `describeRootSize` reads it.
function emptyGzip(minified: number, gzip: number): number {
  return minified === 0 ? 0 : gzip;
}

/**
 * Describes every entrypoint a package exports, with whatever its release measured.
 *
 * An entrypoint that was not measured, such as CSS, has no size. A release cut
 * before exports were measured has no export list, and its entrypoints read as
 * their totals alone.
 * @param subpaths The manifest's `exports` subpaths, in order.
 * @param size The release's size report, absent for a release cut before sizes were recorded.
 * @returns One row per subpath, in the order given.
 */
export function describeEntrypoints(subpaths: readonly string[], size: SizeReport | undefined): EntrypointRow[] {
  return subpaths.map((subpath) => {
    const entry = size?.entrypoints[subpath];
    if (entry === undefined) {
      return { subpath };
    }
    return {
      exports:
        entry.exports === undefined
          ? undefined
          : Object.entries(entry.exports)
              .map(([name, { gzip, minified }]) => ({
                gzip: emptyGzip(minified, gzip),
                minified,
                name,
                // An export bundled alone can come out a few bytes larger than the whole entrypoint.
                share: Math.min(1, fraction(minified, entry.minified)),
              }))
              .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
      size: { gzip: emptyGzip(entry.minified, entry.gzip), minified: entry.minified },
      subpath,
    };
  });
}
