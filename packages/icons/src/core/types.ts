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
 * satisfied by the notice the build emits. `"extended"` families are opt-in and
 * outside the package's licensing promise: their `info.attribution` says
 * whether a notice or author credit is owed. A generated extended family owes
 * credit; a set adopted through `adoptIconifySet` is always extended, and owes
 * whatever its caller declared. `"brand"` families hold logos and brand
 * marks: they owe nothing on the copyright side, are opt-in, and remain subject
 * to each brand owner's trademark guidelines, which no build setting satisfies.
 */
export type IconFamilyTier = "core" | "extended" | "brand";

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

  /**
   * Whether the artwork carries its own colors, as full-color logos do.
   *
   * A multicolor icon paints its artwork rather than one color, until
   * `--ic-color` (`--<prefix>-color` under a custom class prefix) is set, which
   * turns it into a one-color silhouette. Absent for one-color families.
   */
  multicolor?: boolean;
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
   * viewBox origin on the x axis, when it differs from the family default.
   */
  left?: number;

  /**
   * viewBox origin on the y axis, when it differs from the family default.
   */
  top?: number;

  /**
   * Search keywords for catalog and documentation surfaces.
   */
  tags?: string[];

  /**
   * The icon's own color, as a hex value such as `#181717`. Brand families
   * carry their mark's color here; it is the icon's default paint, and
   * `--ic-color` overrides it (`--<prefix>-color` under a custom class prefix).
   * A value that is not a hex color is ignored.
   */
  color?: string;
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
 * The icon and geometry fields follow IconifyJSON's shape, so icon bodies
 * authored for that format need no transformation, while this package depends
 * on nothing from it. An IconifyJSON document still lacks the required `info`,
 * so it loads through `adoptIconifySet`, not directly.
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
   * Default viewBox origin on the x axis. Defaults to `0`.
   */
  left?: number;

  /**
   * Default viewBox origin on the y axis. Defaults to `0`.
   *
   * Families such as Material Symbols draw above the origin, so an icon that
   * kept only its size would render blank.
   */
  top?: number;

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
   * Prefix an unqualified icon name resolves against.
   *
   * There is no built-in default: the package names no default family, so
   * without this option an unqualified name resolves to nothing.
   */
  defaultPrefix?: string;
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
   * viewBox origin on the x axis.
   */
  left: number;

  /**
   * viewBox origin on the y axis.
   */
  top: number;

  /**
   * Authored stroke width, present only when the icon's family is stroke-based
   * and therefore accepts a different stroke width.
   */
  strokeWidth?: number;

  /**
   * The icon's own color as a hex value, present only when its data declares a
   * valid one.
   */
  color?: string;

  /**
   * Present only when the icon's family is multicolor, so its artwork carries
   * its own colors. See {@link IconFamilyInfo.multicolor}.
   */
  multicolor?: true;
}
