import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const REGISTER_PATH = "docs/specs/packages-exceptions.md";
const SECTION_HEADING = /^##\s+`(?<name>[^`]+)`/;
const BYPASS_BULLET = /^-\s+\*\*Checks bypassed:\*\*\s*(?<codes>.+)$/;
const CODE = /`(?<code>[^`]+)`/g;

/** Check codes waived per package by the exception register. */
export type CheckExceptions = ReadonlyMap<string, ReadonlySet<string>>;

/**
 * Reads the machine-readable bypass declarations from the exception register.
 *
 * Register entries stay prose-first; only the `Checks bypassed` bullet is parsed,
 * so a documented exception and the check that honors it cannot drift apart.
 * @param markdown Raw register contents.
 * @returns Waived check codes keyed by package name.
 */
export function parseCheckExceptions(markdown: string): CheckExceptions {
  const exceptions = new Map<string, Set<string>>();
  let current: string | undefined;

  for (const line of markdown.split(/\r?\n/)) {
    const heading = SECTION_HEADING.exec(line);
    if (heading?.groups !== undefined) {
      current = heading.groups.name;
      continue;
    }
    const bullet = BYPASS_BULLET.exec(line.trim());
    if (bullet?.groups === undefined || current === undefined) {
      continue;
    }
    const codes = [...(bullet.groups.codes as string).matchAll(CODE)].map((match) => match.groups?.code as string);
    const existing = exceptions.get(current) ?? new Set<string>();
    for (const code of codes) {
      existing.add(code);
    }
    exceptions.set(current, existing);
  }

  return exceptions;
}

/**
 * Loads the exception register from the repository.
 * @param root Absolute repository root.
 * @returns Waived check codes keyed by package name, empty when no register exists.
 */
export async function loadCheckExceptions(root: string): Promise<CheckExceptions> {
  const markdown = await readFile(resolve(root, REGISTER_PATH), "utf8").catch(() => undefined);
  return markdown === undefined ? new Map() : parseCheckExceptions(markdown);
}
