/**
 * Obligation a family's license places on the consumer who ships its icons.
 *
 * - `"none"`: public-domain dedications such as CC0 and Unlicense. Nothing is
 *   owed in distributed output.
 * - `"notice"`: permissive licenses such as MIT, ISC, and Apache-2.0. The
 *   copyright and license notice must be preserved in distributions, which the
 *   build integrations emit automatically.
 * - `"credit"`: licenses such as CC-BY that require crediting the author
 *   visibly, beyond preserving a notice.
 */
export type IconAttribution = "none" | "notice" | "credit";

/**
 * Catalog tier a family belongs to.
 *
 * `"core"` families are public-domain or notice-only, and their obligations are
 * satisfied by the notice the build emits. `"extended"` families require
 * crediting the author and are opt-in.
 */
export type IconFamilyTier = "core" | "extended";

/**
 * Upstream project a family's artwork was generated from.
 */
export interface IconFamilyUpstream {
  /**
   * Package name the artwork was read from, such as `"lucide-static"`.
   */
  package: string;

  /**
   * Exact upstream version the committed data was generated from.
   */
  version: string;
}

/**
 * License a family's artwork is distributed under.
 */
export interface IconFamilyLicense {
  /**
   * Human-readable license name, such as `"ISC License"`.
   */
  title: string;

  /**
   * SPDX identifier, such as `"ISC"`.
   */
  spdx: string;

  /**
   * URL of the license text.
   */
  url: string;
}

/**
 * Author or project credited for a family's artwork.
 */
export interface IconFamilyAuthor {
  /**
   * Display name of the author or project.
   */
  name: string;

  /**
   * URL of the author or project homepage.
   */
  url: string;
}

/**
 * Provenance, licensing, and presentation metadata for an icon family.
 */
export interface IconFamilyInfo {
  /**
   * Display name of the family, such as `"Lucide"`.
   */
  name: string;

  /**
   * Number of icons the family contains, excluding aliases.
   */
  total: number;

  /**
   * Author or project credited for the artwork.
   */
  author: IconFamilyAuthor;

  /**
   * License the artwork is distributed under.
   */
  license: IconFamilyLicense;

  /**
   * What a consumer shipping these icons owes in their own output.
   */
  attribution: IconAttribution;

  /**
   * Catalog tier the family belongs to.
   */
  tier: IconFamilyTier;

  /**
   * Upstream package and version the committed data was generated from.
   */
  upstream: IconFamilyUpstream;

  /**
   * Authored stroke width, present only for stroke-based families.
   *
   * Its presence is what makes a family's icons stroke-configurable; families
   * drawn as filled paths omit it and ignore stroke width requests.
   */
  strokeWidth?: number;

  /**
   * Descriptive style of the family, such as `"outlined"` or `"filled"`.
   *
   * Catalog and documentation metadata only. Styles are separate families with
   * separate prefixes; this never participates in resolution.
   */
  style?: string;

  /**
   * Descriptive weight of the family, such as `"regular"` or `"bold"`.
   *
   * Catalog and documentation metadata only, like {@link IconFamilyInfo.style}.
   */
  weight?: string;
}

/**
 * A single icon's artwork and its optional per-icon geometry.
 */
export interface IconData {
  /**
   * Inner SVG markup, without the surrounding `<svg>` element.
   *
   * The wrapper is reconstructed at render time so size, color, and stroke
   * width stay controllable by the consumer.
   */
  body: string;

  /**
   * viewBox width, when it differs from the family default.
   */
  width?: number;

  /**
   * viewBox height, when it differs from the family default.
   */
  height?: number;

  /**
   * Search keywords for catalog and documentation surfaces.
   */
  tags?: string[];
}

/**
 * An alternative name pointing at an icon in the same family.
 */
export interface IconAlias {
  /**
   * Name of the icon this alias resolves to. Never another alias.
   */
  parent: string;
}

/**
 * A complete icon family: its artwork, aliases, geometry, and metadata.
 *
 * The shape is structurally compatible with IconifyJSON, so icon data authored
 * for that format loads without transformation, while this package depends on
 * nothing from it.
 */
export interface IconFamilyData {
  /**
   * Namespace all icons in this family resolve under, such as `"lucide"`.
   */
  prefix: string;

  /**
   * Provenance, licensing, and presentation metadata.
   */
  info: IconFamilyInfo;

  /**
   * Default viewBox width for icons that do not override it. Defaults to `24`.
   */
  width?: number;

  /**
   * Default viewBox height for icons that do not override it. Defaults to `24`.
   */
  height?: number;

  /**
   * Icons by primary name.
   */
  icons: Record<string, IconData>;

  /**
   * Alternative names by alias name.
   */
  aliases?: Record<string, IconAlias>;
}

/**
 * Loads a family's data the first time one of its icons is requested.
 *
 * Returning the module namespace of a dynamic import is supported directly, so
 * `() => import("@codenhub/icons/data/lucide")` is a valid loader.
 */
export type IconFamilyLoader = () => Promise<IconFamilyData | { default: IconFamilyData }>;

/**
 * Options for configuring an {@link IconRegistry}.
 */
export interface IconRegistryOptions {
  /**
   * Prefix an unprefixed icon name resolves against.
   *
   * There is no built-in default: without this option an unprefixed name
   * resolves only through the semantic alias map.
   */
  defaultPrefix?: string;

  /**
   * Semantic names mapped to fully qualified icon names, such as
   * `{ close: "lucide:x" }`.
   *
   * Defaults to the curated map exported by this package. Pass an object to
   * replace it, or `false` to disable semantic resolution entirely.
   */
  semanticAliases?: Record<string, string> | false;
}

/**
 * An icon located in a loaded family, with the geometry needed to render it.
 */
export interface ResolvedIcon {
  /**
   * Fully qualified name, such as `"lucide:x"`.
   */
  name: string;

  /**
   * Family prefix the icon belongs to.
   */
  prefix: string;

  /**
   * Primary icon name within the family, with aliases already resolved.
   */
  iconName: string;

  /**
   * Inner SVG markup, without the surrounding `<svg>` element.
   */
  body: string;

  /**
   * viewBox width to render the icon at.
   */
  width: number;

  /**
   * viewBox height to render the icon at.
   */
  height: number;

  /**
   * Authored stroke width, present only when the icon's family is stroke-based
   * and therefore accepts a different stroke width.
   */
  strokeWidth?: number;
}
