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
];
