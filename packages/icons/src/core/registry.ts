import { SEMANTIC_ALIASES } from "../semantic/semantic-aliases.js";
import type { IconFamilyData, IconFamilyLoader, IconRegistryOptions, ResolvedIcon } from "./types.js";

const DEFAULT_VIEWBOX_SIZE = 24;
const DEFAULT_VIEWBOX_ORIGIN = 0;
const PREFIX_SEPARATOR = ":";

interface ParsedName {
  prefix?: string;
  iconName: string;
}

function parseName(name: string): ParsedName {
  const separatorIndex = name.indexOf(PREFIX_SEPARATOR);
  if (separatorIndex === -1) {
    return { iconName: name };
  }
  return { iconName: name.slice(separatorIndex + 1), prefix: name.slice(0, separatorIndex) };
}

function unwrapLoaded(loaded: IconFamilyData | { default: IconFamilyData }): IconFamilyData {
  return "default" in loaded ? loaded.default : loaded;
}

/**
 * Holds icon families and resolves icon names against them.
 *
 * Families are registered either as loaded data or as loaders invoked the first
 * time one of their icons is requested. Build-time consumers stay on the
 * synchronous {@link IconRegistry.resolve}, because a build knows which families
 * it needs before it starts; runtime consumers use
 * {@link IconRegistry.resolveAsync}, which loads a family on demand.
 */
export class IconRegistry {
  private readonly defaultPrefix?: string;
  private readonly semanticAliases: Record<string, string>;
  private readonly families = new Map<string, IconFamilyData>();
  private readonly loaders = new Map<string, IconFamilyLoader>();
  private readonly pendingLoads = new Map<string, Promise<IconFamilyData>>();

  /**
   * Creates a registry holding no families.
   *
   * @param options - Default prefix and semantic alias configuration.
   */
  constructor(options?: IconRegistryOptions) {
    this.defaultPrefix = options?.defaultPrefix;
    this.semanticAliases = options?.semanticAliases === false ? {} : (options?.semanticAliases ?? SEMANTIC_ALIASES);
  }

  /**
   * Registers already-loaded family data under its own prefix.
   *
   * Registering a prefix that already holds a family replaces it, which is what
   * lets a project override a bundled family with its own artwork.
   *
   * @param family - Family data to make resolvable.
   */
  public registerFamily(family: IconFamilyData): void {
    this.families.set(family.prefix, family);
  }

  /**
   * Registers a loader invoked the first time an icon of this prefix is
   * requested asynchronously.
   *
   * The family stays absent from synchronous resolution until it is loaded, so
   * a build-time consumer must await {@link IconRegistry.load} first.
   *
   * @param prefix - Family prefix the loader provides.
   * @param loader - Function returning the family data, typically a dynamic import.
   */
  public registerLoader(prefix: string, loader: IconFamilyLoader): void {
    this.loaders.set(prefix, loader);
  }

  /**
   * Loads a registered family so it becomes available to synchronous
   * resolution.
   *
   * Concurrent calls for the same prefix share one load. An already-loaded
   * family is returned as-is without invoking its loader again.
   *
   * @param prefix - Family prefix to load.
   * @returns The loaded family data.
   * @throws When no family or loader is registered for the prefix.
   */
  public async load(prefix: string): Promise<IconFamilyData> {
    const loaded = this.families.get(prefix);
    if (loaded) {
      return loaded;
    }

    const pending = this.pendingLoads.get(prefix);
    if (pending) {
      return pending;
    }

    const loader = this.loaders.get(prefix);
    if (!loader) {
      throw new Error(`No icon family or loader registered for prefix "${prefix}".`);
    }

    const load = this.runLoader(prefix, loader);
    this.pendingLoads.set(prefix, load);
    return load;
  }

  /**
   * Resolves an icon name against the families already loaded.
   *
   * Unprefixed names resolve through the semantic alias map first, then against
   * the configured default prefix. A name whose family is registered only as a
   * loader does not resolve here.
   *
   * @param name - Icon name, qualified (`"lucide:x"`) or not (`"close"`).
   * @returns The resolved icon, or `undefined` when it is not available.
   */
  public resolve(name: string): ResolvedIcon | undefined {
    for (const candidate of this.readCandidates(name)) {
      const family = this.families.get(candidate.prefix);
      const resolved = family && this.resolveInFamily(family, candidate.iconName);
      if (resolved) {
        return resolved;
      }
    }
    return undefined;
  }

  /**
   * Resolves an icon name, loading its family first when it is not yet
   * available.
   *
   * @param name - Icon name, qualified (`"lucide:x"`) or not (`"close"`).
   * @returns The resolved icon, or `undefined` when the name is unknown or its
   * family has neither data nor a loader.
   */
  public async resolveAsync(name: string): Promise<ResolvedIcon | undefined> {
    return this.resolveCandidate(this.readCandidates(name), 0);
  }

  /**
   * Reports whether an icon name resolves against the families already loaded.
   *
   * @param name - Icon name, qualified or not.
   * @returns `true` when {@link IconRegistry.resolve} would return an icon.
   */
  public has(name: string): boolean {
    return this.resolve(name) !== undefined;
  }

  /**
   * Lists the primary icon names of a loaded family, excluding aliases.
   *
   * @param prefix - Family prefix to list. Defaults to the configured default prefix.
   * @returns Icon names in the order the family declares them, or an empty array
   * when the family is not loaded.
   */
  public list(prefix?: string): string[] {
    const target = prefix ?? this.defaultPrefix;
    const family = target ? this.families.get(target) : undefined;
    return family ? Object.keys(family.icons) : [];
  }

  /**
   * Lists the prefixes of every family currently loaded.
   *
   * @returns Loaded family prefixes.
   */
  public listFamilies(): string[] {
    return [...this.families.keys()];
  }

  /**
   * Returns loaded family data by prefix.
   *
   * Consumers use it to read family metadata such as license and attribution.
   *
   * @param prefix - Family prefix to read.
   * @returns The family data, or `undefined` when it is not loaded.
   */
  public getFamily(prefix: string): IconFamilyData | undefined {
    return this.families.get(prefix);
  }

  private async runLoader(prefix: string, loader: IconFamilyLoader): Promise<IconFamilyData> {
    try {
      const family = unwrapLoaded(await loader());
      this.families.set(prefix, family);
      return family;
    } finally {
      this.pendingLoads.delete(prefix);
    }
  }

  /**
   * Every reading of a name, in the order they are tried.
   *
   * A semantic name is tried before the default prefix, but does not shadow it:
   * a curated alias pointing at a family the project never registered has to
   * fall through rather than fail the lookup.
   */
  private readCandidates(name: string): { prefix: string; iconName: string }[] {
    const parsed = parseName(name);
    if (parsed.prefix) {
      return [{ iconName: parsed.iconName, prefix: parsed.prefix }];
    }

    const candidates: { prefix: string; iconName: string }[] = [];
    const semantic = this.semanticAliases[parsed.iconName];
    if (semantic) {
      const target = parseName(semantic);
      if (target.prefix) {
        candidates.push({ iconName: target.iconName, prefix: target.prefix });
      }
    }
    if (this.defaultPrefix) {
      candidates.push({ iconName: parsed.iconName, prefix: this.defaultPrefix });
    }
    return candidates;
  }

  private async resolveCandidate(
    candidates: readonly { prefix: string; iconName: string }[],
    index: number,
  ): Promise<ResolvedIcon | undefined> {
    const candidate = candidates[index];
    if (!candidate) {
      return undefined;
    }
    const isAvailable = this.families.has(candidate.prefix) || this.loaders.has(candidate.prefix);
    const family = isAvailable ? await this.load(candidate.prefix) : undefined;
    const resolved = family && this.resolveInFamily(family, candidate.iconName);
    return resolved ?? this.resolveCandidate(candidates, index + 1);
  }

  private resolveInFamily(family: IconFamilyData, requestedName: string): ResolvedIcon | undefined {
    const iconName = family.aliases?.[requestedName]?.parent ?? requestedName;
    const icon = family.icons[iconName];
    if (!icon) {
      return undefined;
    }

    return {
      body: icon.body,
      height: icon.height ?? family.height ?? DEFAULT_VIEWBOX_SIZE,
      iconName,
      left: icon.left ?? family.left ?? DEFAULT_VIEWBOX_ORIGIN,
      name: `${family.prefix}${PREFIX_SEPARATOR}${iconName}`,
      prefix: family.prefix,
      top: icon.top ?? family.top ?? DEFAULT_VIEWBOX_ORIGIN,
      width: icon.width ?? family.width ?? DEFAULT_VIEWBOX_SIZE,
      ...(family.info.strokeWidth === undefined ? {} : { strokeWidth: family.info.strokeWidth }),
    };
  }
}
