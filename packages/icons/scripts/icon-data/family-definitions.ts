import type { IconAttribution, IconFamilyTier } from "../../src/core/types.ts";

/** Everything the generator needs to turn an upstream package into a family. */
export interface IconFamilyDefinition {
  /** Namespace icons of this family resolve under, such as `lucide`. */
  prefix: string;
  /** Display name, such as `Lucide`. */
  name: string;
  /** Upstream npm package the artwork is read from. */
  upstreamPackage: string;
  /**
   * GitHub repository, as `owner/name`, the artwork comes from when upstream
   * publishes no npm package of its own. The repository is installed under
   * `upstreamPackage` as a git dependency pinned to a commit, and that commit is
   * the version the family records.
   */
  upstreamRepository?: string;
  /** Directory of SVG files inside the upstream package. */
  iconsDirectory: string;
  /** License file inside the upstream package, copied verbatim. */
  licenseFile: string;
  /** License the artwork is distributed under. */
  license: { title: string; spdx: string; url: string };
  /** Author or project credited for the artwork. */
  author: { name: string; url: string };
  /** Catalog tier, which the license obligation has to agree with. */
  tier: IconFamilyTier;
  /** Authored stroke width, for stroke-based families only. */
  strokeWidth?: number;
  /** Descriptive style, such as `outlined` or `filled`. */
  style?: string;
  /** Descriptive weight, such as `regular` or `bold`. */
  weight?: string;
  /** Suffix upstream file names carry for this variant, such as `-fill`. */
  fileSuffix?: string;
  /** Suffix marking files that belong to a sibling variant in the same directory. */
  excludedFileSuffix?: string;
  /** JSON file inside the upstream package mapping icon names to keywords. */
  tagsFile?: string;
  /**
   * JSON file inside the upstream package listing a license per icon, as an
   * array of `{ slug, license?: { type } }`. Icons whose own license places an
   * obligation, or is not on the accepted list, are left out of the family.
   */
  iconLicensesFile?: string;
  /**
   * JSON file inside the upstream package listing a brand color per icon, as an
   * array of `{ slug, hex }` with `hex` six hex digits and no `#`. Each icon
   * keeps its color, which renders by default.
   */
  iconColorsFile?: string;
  /**
   * Lowercases upstream file names and rewrites `_` and `.` to `-`, so icon
   * names stay kebab-case and need no escaping in a class name.
   */
  kebabCaseNames?: boolean;
  /**
   * Keeps the colors upstream artwork is drawn in, for full-color logos. Ids in
   * each icon are namespaced by its name, so two inlined icons never draw with
   * each other's gradients, and artwork the mask and inline paths cannot render
   * faithfully is left out.
   */
  multicolor?: boolean;
}

/**
 * Obligation each accepted license places on distributed output.
 *
 * A license absent from this table cannot be generated: the promise the package
 * makes about licensing is only as good as the list it is checked against.
 */
export const LICENSE_OBLIGATIONS: Record<string, IconAttribution> = {
  "Apache-2.0": "notice",
  "CC-BY-4.0": "credit",
  "CC0-1.0": "none",
  ISC: "notice",
  MIT: "notice",
  Unlicense: "none",
};

/**
 * Size-axis tokens the utility classes own.
 *
 * `ic-xs` through `ic-xl` each set `--ic-size`, so a family that shipped an icon
 * or took a prefix by one of these names would carve a hole in that scale: the
 * same class would mean a size through the base rules and an icon through the
 * generated set. The generator refuses such a family rather than let the
 * meaning depend on which rules load first.
 */
export const RESERVED_SIZE_TOKENS: readonly string[] = ["xs", "sm", "md", "lg", "xl"];

/**
 * Prefixes a family may not use.
 *
 * `ic-xs` through `ic-xl` are the size axis, so a family named after one would
 * produce classes the base rules read as a size rather than an icon. Stroke
 * width is not among them because it is written as a modifier on the icon class
 * itself, as in `ic-heart/1.5`, and so claims no prefix of its own; `after` and
 * `bg` are no longer reserved since the package dropped its `::after` and
 * form-control forms.
 */
export const RESERVED_PREFIXES: readonly string[] = [...RESERVED_SIZE_TOKENS];

/** Obligations a `core` family may place on a consumer. */
export const CORE_TIER_OBLIGATIONS: readonly IconAttribution[] = ["none", "notice"];

/** Obligations an `extended` family may place on a consumer. */
export const EXTENDED_TIER_OBLIGATIONS: readonly IconAttribution[] = ["credit"];

/** Obligations a `brand` family may place on a consumer. */
export const BRAND_TIER_OBLIGATIONS: readonly IconAttribution[] = ["none"];

/**
 * Every family the generator produces.
 *
 * Variants are separate families with separate prefixes, because resolution
 * stays one-dimensional and `style`/`weight` exist only to group them for
 * humans.
 */
export const ICON_FAMILIES: readonly IconFamilyDefinition[] = [
  {
    author: { name: "Lucide Contributors", url: "https://lucide.dev" },
    iconsDirectory: "icons",
    license: { spdx: "ISC", title: "ISC License", url: "https://github.com/lucide-icons/lucide/blob/main/LICENSE" },
    licenseFile: "LICENSE",
    name: "Lucide",
    prefix: "lucide",
    strokeWidth: 2,
    style: "outlined",
    tagsFile: "tags.json",
    tier: "core",
    upstreamPackage: "lucide-static",
    weight: "regular",
  },
  {
    author: { name: "Phosphor Icons", url: "https://phosphoricons.com" },
    iconsDirectory: "assets/regular",
    license: { spdx: "MIT", title: "MIT License", url: "https://github.com/phosphor-icons/core/blob/main/LICENSE" },
    licenseFile: "LICENSE",
    name: "Phosphor Regular",
    prefix: "phosphor",
    style: "outlined",
    tier: "core",
    upstreamPackage: "@phosphor-icons/core",
    weight: "regular",
  },
  {
    author: { name: "Phosphor Icons", url: "https://phosphoricons.com" },
    fileSuffix: "-thin",
    iconsDirectory: "assets/thin",
    license: { spdx: "MIT", title: "MIT License", url: "https://github.com/phosphor-icons/core/blob/main/LICENSE" },
    licenseFile: "LICENSE",
    name: "Phosphor Thin",
    prefix: "phosphor-thin",
    style: "outlined",
    tier: "core",
    upstreamPackage: "@phosphor-icons/core",
    weight: "thin",
  },
  {
    author: { name: "Phosphor Icons", url: "https://phosphoricons.com" },
    fileSuffix: "-light",
    iconsDirectory: "assets/light",
    license: { spdx: "MIT", title: "MIT License", url: "https://github.com/phosphor-icons/core/blob/main/LICENSE" },
    licenseFile: "LICENSE",
    name: "Phosphor Light",
    prefix: "phosphor-light",
    style: "outlined",
    tier: "core",
    upstreamPackage: "@phosphor-icons/core",
    weight: "light",
  },
  {
    author: { name: "Phosphor Icons", url: "https://phosphoricons.com" },
    fileSuffix: "-bold",
    iconsDirectory: "assets/bold",
    license: { spdx: "MIT", title: "MIT License", url: "https://github.com/phosphor-icons/core/blob/main/LICENSE" },
    licenseFile: "LICENSE",
    name: "Phosphor Bold",
    prefix: "phosphor-bold",
    style: "outlined",
    tier: "core",
    upstreamPackage: "@phosphor-icons/core",
    weight: "bold",
  },
  {
    author: { name: "Phosphor Icons", url: "https://phosphoricons.com" },
    fileSuffix: "-fill",
    iconsDirectory: "assets/fill",
    license: { spdx: "MIT", title: "MIT License", url: "https://github.com/phosphor-icons/core/blob/main/LICENSE" },
    licenseFile: "LICENSE",
    name: "Phosphor Fill",
    prefix: "phosphor-fill",
    style: "filled",
    tier: "core",
    upstreamPackage: "@phosphor-icons/core",
    weight: "regular",
  },
  {
    author: { name: "Phosphor Icons", url: "https://phosphoricons.com" },
    fileSuffix: "-duotone",
    iconsDirectory: "assets/duotone",
    license: { spdx: "MIT", title: "MIT License", url: "https://github.com/phosphor-icons/core/blob/main/LICENSE" },
    licenseFile: "LICENSE",
    name: "Phosphor Duotone",
    prefix: "phosphor-duotone",
    style: "duotone",
    tier: "core",
    upstreamPackage: "@phosphor-icons/core",
    weight: "regular",
  },
  {
    author: { name: "Google", url: "https://fonts.google.com/icons" },
    excludedFileSuffix: "-fill",
    iconsDirectory: "outlined",
    license: { spdx: "Apache-2.0", title: "Apache License 2.0", url: "https://www.apache.org/licenses/LICENSE-2.0" },
    licenseFile: "LICENSE",
    name: "Material Symbols Outlined",
    prefix: "material-symbols-outlined",
    style: "outlined",
    tier: "core",
    upstreamPackage: "@material-symbols/svg-400",
    weight: "400",
  },
  {
    author: { name: "Google", url: "https://fonts.google.com/icons" },
    fileSuffix: "-fill",
    iconsDirectory: "outlined",
    license: { spdx: "Apache-2.0", title: "Apache License 2.0", url: "https://www.apache.org/licenses/LICENSE-2.0" },
    licenseFile: "LICENSE",
    name: "Material Symbols Outlined Filled",
    prefix: "material-symbols-outlined-fill",
    style: "filled",
    tier: "core",
    upstreamPackage: "@material-symbols/svg-400",
    weight: "400",
  },
  {
    author: { name: "Google", url: "https://fonts.google.com/icons" },
    excludedFileSuffix: "-fill",
    iconsDirectory: "rounded",
    license: { spdx: "Apache-2.0", title: "Apache License 2.0", url: "https://www.apache.org/licenses/LICENSE-2.0" },
    licenseFile: "LICENSE",
    name: "Material Symbols Rounded",
    prefix: "material-symbols-rounded",
    style: "outlined",
    tier: "core",
    upstreamPackage: "@material-symbols/svg-400",
    weight: "400",
  },
  {
    author: { name: "Google", url: "https://fonts.google.com/icons" },
    fileSuffix: "-fill",
    iconsDirectory: "rounded",
    license: { spdx: "Apache-2.0", title: "Apache License 2.0", url: "https://www.apache.org/licenses/LICENSE-2.0" },
    licenseFile: "LICENSE",
    name: "Material Symbols Rounded Filled",
    prefix: "material-symbols-rounded-fill",
    style: "filled",
    tier: "core",
    upstreamPackage: "@material-symbols/svg-400",
    weight: "400",
  },
  {
    author: { name: "Google", url: "https://fonts.google.com/icons" },
    excludedFileSuffix: "-fill",
    iconsDirectory: "sharp",
    license: { spdx: "Apache-2.0", title: "Apache License 2.0", url: "https://www.apache.org/licenses/LICENSE-2.0" },
    licenseFile: "LICENSE",
    name: "Material Symbols Sharp",
    prefix: "material-symbols-sharp",
    style: "outlined",
    tier: "core",
    upstreamPackage: "@material-symbols/svg-400",
    weight: "400",
  },
  {
    author: { name: "Google", url: "https://fonts.google.com/icons" },
    fileSuffix: "-fill",
    iconsDirectory: "sharp",
    license: { spdx: "Apache-2.0", title: "Apache License 2.0", url: "https://www.apache.org/licenses/LICENSE-2.0" },
    licenseFile: "LICENSE",
    name: "Material Symbols Sharp Filled",
    prefix: "material-symbols-sharp-fill",
    style: "filled",
    tier: "core",
    upstreamPackage: "@material-symbols/svg-400",
    weight: "400",
  },
  {
    author: { name: "Simple Icons Collaborators", url: "https://simpleicons.org" },
    kebabCaseNames: true,
    iconColorsFile: "data/simple-icons.json",
    iconLicensesFile: "data/simple-icons.json",
    iconsDirectory: "icons",
    license: {
      spdx: "CC0-1.0",
      title: "CC0 1.0 Universal",
      url: "https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md",
    },
    licenseFile: "LICENSE.md",
    name: "Simple Icons",
    prefix: "simple-icons",
    style: "filled",
    tier: "brand",
    upstreamPackage: "simple-icons",
  },
  {
    author: { name: "Gil Barbara", url: "https://svgporn.com" },
    iconsDirectory: "logos",
    kebabCaseNames: true,
    license: {
      spdx: "CC0-1.0",
      title: "CC0 1.0 Universal",
      url: "https://github.com/gilbarbara/logos/blob/main/LICENSE.txt",
    },
    licenseFile: "LICENSE.txt",
    multicolor: true,
    name: "Logos",
    prefix: "logos",
    style: "full-color",
    tier: "brand",
    upstreamPackage: "gilbarbara-logos",
    upstreamRepository: "gilbarbara/logos",
  },
];
