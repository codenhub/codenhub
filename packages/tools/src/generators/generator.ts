import type { Workspace, WorkspacePackage } from "../workspace/discover.ts";

/** A file a generator owns end to end, or a region it owns inside one. */
export interface GeneratedFile {
  /** Repository-relative POSIX path. */
  path: string;
  /** Full contents the file should have. */
  contents: string;
}

/** What a generator may look at. */
export interface GeneratorContext {
  /** Discovered workspace. */
  workspace: Workspace;
  /** Packages the selection resolved to. */
  packages: readonly WorkspacePackage[];
  /** Whether the selection covers the whole workspace. */
  isWholeWorkspace: boolean;
}

/** A producer of repository files derived from canonical sources. */
export interface Generator {
  /** Stable generator identifier used in output. */
  name: string;
  /** One-line description shown in help output. */
  summary: string;
  /**
   * Produces the files this generator owns.
   *
   * Generators return contents rather than writing, so the command can diff them
   * and support `--dry-run` without every generator reimplementing it.
   * @param context Workspace and selection.
   * @returns Files with the contents they should have.
   */
  generate(context: GeneratorContext): Promise<GeneratedFile[]>;
}

/**
 * Compares generated and authored text while ignoring line-ending differences.
 *
 * Repository files are checked out with platform line endings, so a byte
 * comparison would report every generated file as stale on Windows.
 * @param generated Freshly generated text.
 * @param authored Text currently on disk.
 * @returns `true` when the two differ in anything but line endings.
 */
export function hasContentDrift(generated: string, authored: string): boolean {
  return generated.replaceAll("\r\n", "\n") !== authored.replaceAll("\r\n", "\n");
}

const MARKER = /^<!-- generated: (?<name>[a-z-]+) (?<edge>start|end) -->$/;

/**
 * Replaces the region a generator owns inside an otherwise hand-written file.
 * @param source Current file contents.
 * @param name Region name used by its markers.
 * @param body Replacement content for the region.
 * @returns File contents with the region replaced.
 * @throws When the region markers are missing or out of order.
 */
export function replaceGeneratedRegion(source: string, name: string, body: string): string {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => MARKER.exec(line)?.groups?.name === name && line.includes("start"));
  const end = lines.findIndex((line) => MARKER.exec(line)?.groups?.name === name && line.includes("end"));
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Missing "${name}" generated region markers.`);
  }
  return [...lines.slice(0, start + 1), "", body.trim(), "", ...lines.slice(end)].join("\n");
}
