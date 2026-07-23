/**
 * Represents the detailed definition of a single icon.
 */
export interface IconDefinition {
  /**
   * The raw SVG string content of the icon.
   */
  svg: string;

  /**
   * Optional alternative names or aliases for the icon (e.g. `["close", "cancel", "times"]` for `x`).
   */
  alt?: string[];
}

/**
 * Represents a collection of icons grouped under a common prefix.
 */
export interface IconSet {
  /**
   * The namespace prefix for all icons in this set (e.g. `"lucide"`).
   */
  prefix: string;

  /**
   * Map of icon primary names to their definitions or raw SVG strings.
   */
  icons: Record<string, IconDefinition | string>;

  /**
   * Optional map of alias names to primary icon names within this set.
   */
  aliases?: Record<string, string>;
}

/**
 * Interface for dynamic or lazy icon dataset providers.
 */
export interface IconProvider {
  /**
   * The prefix or namespace handled by this provider (e.g. `"lucide"`).
   */
  prefix: string;

  /**
   * Retrieves an icon definition or SVG string by name from this provider.
   *
   * @param name - The icon primary name or alias to retrieve.
   * @returns The icon definition or SVG string, or `undefined` if not found.
   */
  getIcon(name: string): IconDefinition | string | undefined;
}

/**
 * Options for configuring an `IconRegistry` instance.
 */
export interface IconRegistryOptions {
  /**
   * Default namespace prefix to use when looking up un-prefixed icon names.
   * Defaults to `"lucide"`.
   */
  defaultPrefix?: string;
}

/**
 * Represents a fully resolved icon with its prefix, primary name, full identifier, and SVG string.
 */
export interface ResolvedIcon {
  /**
   * The full qualified identifier including prefix (e.g. `"lucide:close"`).
   */
  name: string;

  /**
   * The primary name of the icon without prefix (e.g. `"close"`).
   */
  primaryName: string;

  /**
   * The namespace prefix of the icon (e.g. `"lucide"`).
   */
  prefix: string;

  /**
   * The raw SVG string content of the icon.
   */
  svg: string;
}
