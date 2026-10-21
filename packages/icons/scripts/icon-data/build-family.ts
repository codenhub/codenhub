import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { IconAttribution, IconData, IconFamilyData } from "../../src/core/types.ts";
import { mapConcurrent } from "./concurrency.ts";
import {
  BRAND_TIER_OBLIGATIONS,
  CORE_TIER_OBLIGATIONS,
  EXTENDED_TIER_OBLIGATIONS,
  LICENSE_OBLIGATIONS,
  RESERVED_PREFIXES,
  RESERVED_SIZE_TOKENS,
  type IconFamilyDefinition,
} from "./family-definitions.ts";
import { findUnsupportedMarkup, namespaceIds, optimizeArtwork } from "./multicolor-svg.ts";
import { normalizeSvg, type NormalizedIcon } from "./normalize-svg.ts";

/** A generated family, with the license material that has to travel with it. */
export interface BuiltFamily {
  document: IconFamilyData;
  licenseText: string;
  attributionText: string;
}

interface ViewBox {
  width: number;
  height: number;
  left: number;
  top: number;
}

const SVG_EXTENSION = ".svg";
const DEFAULT_SIZE = 24;
// A family can hold tens of thousands of files, so reads are bounded rather
// than opened all at once.
const READ_CONCURRENCY = 32;

function readObligation(definition: IconFamilyDefinition): IconAttribution {
  if (RESERVED_PREFIXES.includes(definition.prefix)) {
    throw new Error(`Family prefix "${definition.prefix}" is reserved by the icon utility classes.`);
  }

  const obligation = LICENSE_OBLIGATIONS[definition.license.spdx];
  if (!obligation) {
    throw new Error(
      `Family "${definition.prefix}" declares license "${definition.license.spdx}", which is not on the accepted list.`,
    );
  }
  if (definition.tier === "core" && !CORE_TIER_OBLIGATIONS.includes(obligation)) {
    throw new Error(
      `Family "${definition.prefix}" is core tier but its license "${definition.license.spdx}" requires crediting the author.`,
    );
  }
  if (definition.tier === "extended" && !EXTENDED_TIER_OBLIGATIONS.includes(obligation)) {
    throw new Error(
      `Family "${definition.prefix}" is extended tier but its license "${definition.license.spdx}" requires no credit, so it belongs in the core tier.`,
    );
  }
  if (definition.tier === "brand" && !BRAND_TIER_OBLIGATIONS.includes(obligation)) {
    throw new Error(
      `Family "${definition.prefix}" is brand tier but its license "${definition.license.spdx}" places an obligation on the consumer.`,
    );
  }
  return obligation;
}

function readUpstreamName(fileName: string, definition: IconFamilyDefinition): string | undefined {
  if (!fileName.endsWith(SVG_EXTENSION)) {
    return undefined;
  }
  const base = fileName.slice(0, -SVG_EXTENSION.length);
  if (definition.fileSuffix) {
    return base.endsWith(definition.fileSuffix) ? base.slice(0, -definition.fileSuffix.length) : undefined;
  }
  // A directory can hold several variants, as Material Symbols does with its
  // filled icons, so the base variant has to skip what belongs to a sibling.
  return definition.excludedFileSuffix && base.endsWith(definition.excludedFileSuffix) ? undefined : base;
}

/**
 * Reads which icons carry a license of their own that the family cannot pass on.
 *
 * A family has one license, so an icon whose own license places any obligation
 * -- or one not on the accepted list at all -- has to be left out rather than
 * shipped under the family's terms.
 */
async function readIncompatibleIcons(packageDirectory: string, definition: IconFamilyDefinition): Promise<Set<string>> {
  if (!definition.iconLicensesFile) {
    return new Set();
  }
  const source = await readFile(resolve(packageDirectory, definition.iconLicensesFile), "utf8");
  const entries = JSON.parse(source) as { slug: string; license?: { type: string } }[];
  return new Set(
    entries
      .filter(({ license }) => license !== undefined && LICENSE_OBLIGATIONS[license.type] !== "none")
      .map(({ slug }) => slug),
  );
}

const UPSTREAM_HEX = /^[0-9a-f]{6}$/i;

/**
 * Reads each icon's brand color, keyed by upstream name, as a lowercase `#rrggbb`.
 *
 * @throws When a color is not six hex digits, so a malformed upstream value
 * fails generation rather than reaching a stylesheet.
 */
async function readColors(packageDirectory: string, definition: IconFamilyDefinition): Promise<Map<string, string>> {
  if (!definition.iconColorsFile) {
    return new Map();
  }
  const source = await readFile(resolve(packageDirectory, definition.iconColorsFile), "utf8");
  const entries = JSON.parse(source) as { slug: string; hex?: string }[];
  return new Map(
    entries.flatMap(({ hex, slug }) => {
      if (hex === undefined) {
        return [];
      }
      if (!UPSTREAM_HEX.test(hex)) {
        throw new Error(
          `Family "${definition.prefix}" lists color "${hex}" for "${slug}", which is not six hex digits.`,
        );
      }
      return [[slug, `#${hex.toLowerCase()}`] as const];
    }),
  );
}

async function readTags(packageDirectory: string, definition: IconFamilyDefinition): Promise<Record<string, string[]>> {
  if (!definition.tagsFile) {
    return {};
  }
  const source = await readFile(resolve(packageDirectory, definition.tagsFile), "utf8");
  return JSON.parse(source) as Record<string, string[]>;
}

function pickDominantViewBox(viewBoxes: Iterable<string>): ViewBox {
  const counts = new Map<string, number>();
  for (const viewBox of viewBoxes) {
    counts.set(viewBox, (counts.get(viewBox) ?? 0) + 1);
  }
  const dominant = [...counts].toSorted((first, second) => second[1] - first[1])[0]?.[0];
  if (!dominant) {
    return { height: DEFAULT_SIZE, left: 0, top: 0, width: DEFAULT_SIZE };
  }
  const [left, top, width, height] = dominant.split(" ").map(Number);
  return { height, left, top, width };
}

function readViewBoxKey(viewBox: ViewBox): string {
  return `${viewBox.left} ${viewBox.top} ${viewBox.width} ${viewBox.height}`;
}

/** An upstream file read, or the markup that keeps it out of a multicolor family. */
type ReadIcon = { iconName: string } & ({ icon: NormalizedIcon } | { reason: string });

interface Exclusions {
  /** Upstream icons left out because their own license could not be passed on. */
  licensed: number;
  /** Icon names left out because the utility classes reserve them. */
  reserved: string[];
  /** Icons left out of a multicolor family, with the markup that kept each out. */
  unsupported: { iconName: string; reason: string }[];
}

function renderExclusions(exclusions: Exclusions): string {
  const lines: string[] = [];
  if (exclusions.licensed > 0) {
    lines.push(
      `${exclusions.licensed} upstream icon(s) carry a license of their own that places an obligation, or is not on the accepted list, and are not included.`,
    );
  }
  if (exclusions.reserved.length > 0) {
    lines.push(
      `Not included because the ic-xs–ic-xl size axis reserves the name: ${exclusions.reserved.map((name) => `\`${name}\``).join(", ")}.`,
    );
  }
  if (exclusions.unsupported.length > 0) {
    lines.push(
      `Not included because their markup cannot render as a self-contained icon: ${exclusions.unsupported
        .map(({ iconName, reason }) => `\`${iconName}\` (${reason})`)
        .join(", ")}.`,
    );
  }
  return lines.length === 0 ? "" : `\n${lines.join("\n\n")}\n`;
}

function renderAttribution(document: IconFamilyData, exclusions: Exclusions): string {
  const { author, license, name, tier, upstream } = document.info;
  const trademark =
    tier === "brand"
      ? `
The icons depict brand marks. They are trademarks of their owners and subject to
each owner's brand guidelines, which this license does not grant and no build
setting satisfies.
`
      : "";
  return `# ${name}

Icon artwork in \`${document.prefix}\` comes from ${name}, generated from
\`${upstream.package}@${upstream.version}\`.

- Author: [${author.name}](${author.url})
- License: [${license.title} (${license.spdx})](${license.url})
- Obligation: ${document.info.attribution}
${trademark}${renderExclusions(exclusions)}
The full license text is in \`LICENSE\` beside this file. It is redistributed
with the artwork and must stay with it.
`;
}

/**
 * Reads an upstream package and builds one family from it.
 *
 * Icons are read from the upstream package installed for `@codenhub/icons`, so
 * the lockfile pins exactly what the committed data was generated from.
 *
 * @param definition - Family to build.
 * @param packageDirectory - Absolute directory of the installed upstream package.
 * @param version - Installed upstream version.
 * @returns The family document and the license material that ships with it.
 * @throws When the license is not accepted, or an icon cannot be normalized.
 */
export async function buildFamily(
  definition: IconFamilyDefinition,
  packageDirectory: string,
  version: string,
): Promise<BuiltFamily> {
  const attribution = readObligation(definition);
  const iconsDirectory = resolve(packageDirectory, definition.iconsDirectory);
  const fileNames = (await readdir(iconsDirectory)).toSorted((first, second) => first.localeCompare(second));
  const tags = await readTags(packageDirectory, definition);
  const incompatible = await readIncompatibleIcons(packageDirectory, definition);
  const colors = await readColors(packageDirectory, definition);
  const exclusions: Exclusions = { licensed: 0, reserved: [], unsupported: [] };

  const iconFiles = fileNames.flatMap((fileName) => {
    const upstreamName = readUpstreamName(fileName, definition);
    if (upstreamName === undefined) {
      return [];
    }
    if (incompatible.has(upstreamName)) {
      exclusions.licensed += 1;
      return [];
    }
    const iconName = definition.kebabCaseNames ? upstreamName.toLowerCase().replace(/[._]/g, "-") : upstreamName;
    // A brand family is opt-in and outside the core promise, so one reserved
    // name costs that icon rather than the whole family.
    if (definition.tier === "brand" && RESERVED_SIZE_TOKENS.includes(iconName)) {
      exclusions.reserved.push(iconName);
      return [];
    }
    return [{ fileName, iconName, upstreamName }];
  });

  const colorsByIcon = new Map(
    iconFiles.flatMap(({ iconName, upstreamName }) => {
      const color = colors.get(upstreamName);
      return color === undefined ? [] : [[iconName, color] as const];
    }),
  );

  const duplicateNames = iconFiles
    .map(({ iconName }) => iconName)
    .filter((iconName, index, names) => names.indexOf(iconName) !== index);
  if (duplicateNames.length > 0) {
    throw new Error(
      `Family "${definition.prefix}" maps several upstream files to ${duplicateNames.map((name) => `"${name}"`).join(", ")}.`,
    );
  }

  const read = await mapConcurrent(iconFiles, READ_CONCURRENCY, async ({ fileName, iconName }): Promise<ReadIcon> => {
    const source = await readFile(resolve(iconsDirectory, fileName), "utf8");
    const origin = `${definition.upstreamPackage}/${definition.iconsDirectory}/${fileName}`;
    if (!definition.multicolor) {
      return { icon: normalizeSvg(source, origin), iconName };
    }
    const reason = findUnsupportedMarkup(source);
    if (reason !== undefined) {
      return { iconName, reason };
    }
    const icon = normalizeSvg(optimizeArtwork(source, origin), origin);
    return { icon: { ...icon, body: namespaceIds(icon.body, `${definition.prefix}-${iconName}`) }, iconName };
  });
  const normalized = new Map(
    read.flatMap((entry) => {
      if ("reason" in entry) {
        exclusions.unsupported.push(entry);
        return [];
      }
      return [[entry.iconName, entry.icon] as const];
    }),
  );

  if (normalized.size === 0) {
    throw new Error(`Family "${definition.prefix}" produced no icons from ${definition.upstreamPackage}.`);
  }

  const reservedNames = [...normalized.keys()].filter((name) => RESERVED_SIZE_TOKENS.includes(name));
  if (reservedNames.length > 0) {
    throw new Error(
      `Family "${definition.prefix}" ships ${reservedNames
        .map((name) => `"${name}"`)
        .join(", ")}, reserved by the ic-xs–ic-xl size axis. Rename or drop the icon(s) upstream.`,
    );
  }

  const familyViewBox = pickDominantViewBox([...normalized.values()].map(readViewBoxKey));

  const icons: Record<string, IconData> = {};
  for (const [iconName, icon] of normalized) {
    const iconTags = tags[iconName];
    const color = colorsByIcon.get(iconName);
    icons[iconName] = {
      body: icon.body,
      ...(icon.width === familyViewBox.width ? {} : { width: icon.width }),
      ...(icon.height === familyViewBox.height ? {} : { height: icon.height }),
      ...(icon.left === familyViewBox.left ? {} : { left: icon.left }),
      ...(icon.top === familyViewBox.top ? {} : { top: icon.top }),
      ...(iconTags && iconTags.length > 0 ? { tags: iconTags } : {}),
      ...(color === undefined ? {} : { color }),
    };
  }

  const document: IconFamilyData = {
    height: familyViewBox.height,
    icons,
    info: {
      attribution,
      author: definition.author,
      license: definition.license,
      name: definition.name,
      tier: definition.tier,
      total: normalized.size,
      upstream: { package: definition.upstreamRepository ?? definition.upstreamPackage, version },
      ...(definition.strokeWidth === undefined ? {} : { strokeWidth: definition.strokeWidth }),
      ...(definition.style === undefined ? {} : { style: definition.style }),
      ...(definition.weight === undefined ? {} : { weight: definition.weight }),
      ...(definition.multicolor ? { multicolor: true } : {}),
    },
    left: familyViewBox.left,
    prefix: definition.prefix,
    top: familyViewBox.top,
    width: familyViewBox.width,
  };

  return {
    attributionText: renderAttribution(document, exclusions),
    document,
    licenseText: await readFile(resolve(packageDirectory, definition.licenseFile), "utf8"),
  };
}
