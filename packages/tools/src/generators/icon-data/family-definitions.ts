/** Obligation a license places on output that ships the artwork. */
export type IconAttribution = "none" | "notice" | "credit";

/** Catalog tier a family belongs to. */
export type IconFamilyTier = "core" | "extended";

/** Everything the generator needs to turn an upstream package into a family. */
export interface IconFamilyDefinition {
  /** Namespace icons of this family resolve under, such as `lucide`. */
  prefix: string;
  /** Display name, such as `Lucide`. */
  name: string;
  /** Upstream npm package the artwork is read from. */
  upstreamPackage: string;
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
 * Prefixes a family may not use.
 *
 * The utility classes reserve these words: `ic-stroke-1.5`, `ic-after`, and
 * `ic-bg` are modifiers, so a family named after one would produce classes the
 * scanner reads as a modifier rather than an icon.
 */
export const RESERVED_PREFIXES: readonly string[] = ["after", "bg", "stroke"];

/** Obligations a `core` family may place on a consumer. */
export const CORE_TIER_OBLIGATIONS: readonly IconAttribution[] = ["none", "notice"];

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
    name: "Phosphor Regular",
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
];
