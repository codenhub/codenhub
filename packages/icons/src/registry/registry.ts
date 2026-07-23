import type { IconDefinition, IconProvider, IconRegistryOptions, IconSet, ResolvedIcon } from "./types.js";

/**
 * Manages icon registrations, provider lookups, alias normalizations, and resolution.
 */
export class IconRegistry {
  private readonly defaultPrefix: string;
  private readonly icons = new Map<string, Map<string, IconDefinition>>();
  private readonly aliases = new Map<string, Map<string, string>>();
  private readonly providers = new Map<string, IconProvider>();

  /**
   * Constructs a new IconRegistry instance.
   *
   * @param options - Optional configuration options for the registry.
   */
  constructor(options?: IconRegistryOptions) {
    this.defaultPrefix = options?.defaultPrefix ?? "lucide";
  }

  /**
   * Registers a single icon under a specified name and prefix.
   *
   * @param name - Icon name (can include prefix e.g. `"lucide:close"` or plain `"close"`).
   * @param icon - Icon definition object or raw SVG string.
   * @param prefix - Optional prefix. Overridden if name contains a prefix prefix (e.g. `"prefix:name"`).
   */
  public registerIcon(name: string, icon: IconDefinition | string, prefix?: string): void {
    const parsed = this.parseName(name, prefix);
    const iconDef: IconDefinition = typeof icon === "string" ? { svg: icon } : { ...icon };

    let prefixIcons = this.icons.get(parsed.prefix);
    if (!prefixIcons) {
      prefixIcons = new Map();
      this.icons.set(parsed.prefix, prefixIcons);
    }
    prefixIcons.set(parsed.name, iconDef);

    if (iconDef.alt && Array.isArray(iconDef.alt)) {
      for (const alias of iconDef.alt) {
        this.addAlias(parsed.prefix, alias, parsed.name);
      }
    }
  }

  /**
   * Registers an entire set of icons under the set's prefix.
   *
   * @param set - Icon set containing prefix, icon map, and optional alias map.
   */
  public registerSet(set: IconSet): void {
    const prefix = set.prefix;
    for (const [name, icon] of Object.entries(set.icons)) {
      this.registerIcon(name, icon, prefix);
    }

    if (set.aliases) {
      for (const [alias, target] of Object.entries(set.aliases)) {
        this.addAlias(prefix, alias, target);
      }
    }
  }

  /**
   * Registers a dynamic icon provider for a given prefix.
   *
   * @param provider - Icon provider implementation.
   */
  public registerProvider(provider: IconProvider): void {
    this.providers.set(provider.prefix, provider);
  }

  /**
   * Resolves an icon by name into a full `ResolvedIcon` structure.
   *
   * @param name - The icon name or qualified identifier (e.g. `"close"`, `"lucide:close"`).
   * @returns The resolved icon object, or `undefined` if not found.
   */
  public resolve(name: string): ResolvedIcon | undefined {
    const parsed = this.parseName(name);
    let targetName = parsed.name;

    const prefixAliases = this.aliases.get(parsed.prefix);
    if (prefixAliases?.has(targetName)) {
      targetName = prefixAliases.get(targetName)!;
    }

    const prefixIcons = this.icons.get(parsed.prefix);
    const foundIcon = prefixIcons?.get(targetName);

    if (foundIcon) {
      return {
        name: `${parsed.prefix}:${targetName}`,
        primaryName: targetName,
        prefix: parsed.prefix,
        svg: foundIcon.svg,
      };
    }

    const provider = this.providers.get(parsed.prefix);
    if (provider) {
      const providerIcon =
        provider.getIcon(targetName) ?? (targetName !== parsed.name ? provider.getIcon(parsed.name) : undefined);
      if (providerIcon) {
        const iconObj = typeof providerIcon === "string" ? { svg: providerIcon } : providerIcon;
        const primaryName = (iconObj as { primaryName?: string }).primaryName ?? targetName;
        this.registerIcon(primaryName, iconObj, parsed.prefix);
        if (targetName !== primaryName) {
          this.addAlias(parsed.prefix, targetName, primaryName);
        }
        return {
          name: `${parsed.prefix}:${primaryName}`,
          primaryName,
          prefix: parsed.prefix,
          svg: iconObj.svg,
        };
      }
    }

    return undefined;
  }

  /**
   * Retrieves the `IconDefinition` for a given icon name.
   *
   * @param name - Icon name or qualified identifier.
   * @returns The icon definition if found, otherwise `undefined`.
   */
  public get(name: string): IconDefinition | undefined {
    const resolved = this.resolve(name);
    if (!resolved) {
      return undefined;
    }
    return { svg: resolved.svg };
  }

  /**
   * Checks whether an icon exists in registered icons, aliases, or providers.
   *
   * @param name - Icon name or qualified identifier.
   * @returns `true` if icon can be resolved, `false` otherwise.
   */
  public has(name: string): boolean {
    return this.resolve(name) !== undefined;
  }

  /**
   * Lists all primary registered icon names.
   *
   * @param prefix - Optional prefix to filter listed icons. If omitted, lists for default prefix.
   * @returns Array of primary icon names.
   */
  public list(prefix?: string): string[] {
    const targetPrefix = prefix ?? this.defaultPrefix;
    const prefixIcons = this.icons.get(targetPrefix);
    if (!prefixIcons) {
      return [];
    }
    return Array.from(prefixIcons.keys());
  }

  private parseName(fullName: string, overridePrefix?: string): { prefix: string; name: string } {
    const colonIndex = fullName.indexOf(":");
    if (colonIndex !== -1) {
      return {
        prefix: fullName.slice(0, colonIndex),
        name: fullName.slice(colonIndex + 1),
      };
    }
    return {
      prefix: overridePrefix ?? this.defaultPrefix,
      name: fullName,
    };
  }

  private addAlias(prefix: string, alias: string, targetName: string): void {
    let prefixAliases = this.aliases.get(prefix);
    if (!prefixAliases) {
      prefixAliases = new Map();
      this.aliases.set(prefix, prefixAliases);
    }
    prefixAliases.set(alias, targetName);
  }
}
