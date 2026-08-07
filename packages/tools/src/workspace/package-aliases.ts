import type { WorkspacePackage } from "./discover.ts";

const MAX_SUGGESTIONS = 3;
const MAX_SUGGESTION_DISTANCE = 4;

/**
 * How directly an alias identifies a package. Declared aliases come from the
 * manifest name or the workspace location; derived aliases are conveniences that
 * may collide between nested packages.
 */
type AliasRank = "declared" | "derived";

interface AliasEntry {
  package: WorkspacePackage;
  rank: AliasRank;
}

/** Names that can be typed to select a package. */
export type AliasIndex = ReadonlyMap<string, readonly AliasEntry[]>;

/** Result of resolving a single selector token against the alias index. */
export type AliasLookup =
  | { kind: "match"; package: WorkspacePackage }
  | { kind: "ambiguous"; candidates: readonly WorkspacePackage[] }
  | { kind: "unknown" };

/**
 * Collects every alias that selects a package, with how directly it identifies it.
 *
 * Directory names are included because they are the shortest useful selector,
 * even though nested workspaces can make one collide.
 * @param workspacePackage Package to describe.
 * @returns Aliases paired with their rank.
 */
export function collectAliases(workspacePackage: WorkspacePackage): { alias: string; rank: AliasRank }[] {
  const declared = [workspacePackage.name, workspacePackage.unscopedName, workspacePackage.location];
  const aliases = new Map<string, AliasRank>([[workspacePackage.directoryName, "derived"]]);
  for (const alias of declared) {
    aliases.set(alias, "declared");
  }
  return [...aliases].map(([alias, rank]) => ({ alias, rank }));
}

/**
 * Builds a lookup of every package alias.
 *
 * Colliding aliases are all kept so ambiguity can be reported instead of
 * silently resolving to an arbitrary package.
 * @param packages Discovered workspace packages.
 * @returns Alias index mapping each alias to its candidate packages.
 */
export function createAliasIndex(packages: readonly WorkspacePackage[]): AliasIndex {
  const index = new Map<string, AliasEntry[]>();
  for (const workspacePackage of packages) {
    for (const { alias, rank } of collectAliases(workspacePackage)) {
      const entries = index.get(alias) ?? [];
      entries.push({ package: workspacePackage, rank });
      index.set(alias, entries);
    }
  }
  return index;
}

/**
 * Resolves one selector token to a package.
 *
 * A manifest name or workspace location always wins over a directory name, so a
 * nested package such as `packages/plugins/vite/icons` never shadows the
 * package actually published as `@codenhub/icons`.
 * @param index Alias index to search.
 * @param token Selector typed by the caller.
 * @returns Whether the token matched exactly one package, several, or none.
 */
export function lookupPackage(index: AliasIndex, token: string): AliasLookup {
  const entries = index.get(token) ?? [];
  const declared = entries.filter(({ rank }) => rank === "declared");
  const candidates = (declared.length > 0 ? declared : entries).map(({ package: candidate }) => candidate);

  if (candidates.length === 0) {
    return { kind: "unknown" };
  }
  if (candidates.length > 1) {
    return { candidates, kind: "ambiguous" };
  }
  return { kind: "match", package: candidates[0] as WorkspacePackage };
}

function editDistance(first: string, second: string): number {
  let previousRow = Array.from({ length: second.length + 1 }, (_, index) => index);

  for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1) {
    const currentRow = [firstIndex];
    for (let secondIndex = 1; secondIndex <= second.length; secondIndex += 1) {
      const substitutionCost = first[firstIndex - 1] === second[secondIndex - 1] ? 0 : 1;
      currentRow.push(
        Math.min(
          (currentRow[secondIndex - 1] as number) + 1,
          (previousRow[secondIndex] as number) + 1,
          (previousRow[secondIndex - 1] as number) + substitutionCost,
        ),
      );
    }
    previousRow = currentRow;
  }

  return previousRow[second.length] as number;
}

/**
 * Finds the aliases closest to an unrecognized token.
 * @param index Alias index to search.
 * @param token Unrecognized selector.
 * @returns Up to three nearby aliases, closest first.
 */
export function suggestAliases(index: AliasIndex, token: string): string[] {
  const normalized = token.toLowerCase();
  return [...index.keys()]
    .map((alias) => ({ alias, distance: editDistance(normalized, alias.toLowerCase()) }))
    .filter(({ alias, distance }) => distance <= MAX_SUGGESTION_DISTANCE || alias.toLowerCase().startsWith(normalized))
    .toSorted((first, second) => first.distance - second.distance || first.alias.localeCompare(second.alias))
    .slice(0, MAX_SUGGESTIONS)
    .map(({ alias }) => alias);
}
