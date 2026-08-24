import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { mapConcurrent } from "../../process/concurrency.ts";
import {
  CORE_TIER_OBLIGATIONS,
  LICENSE_OBLIGATIONS,
  RESERVED_PREFIXES,
  type IconAttribution,
  type IconFamilyDefinition,
} from "./family-definitions.ts";
import { normalizeSvg } from "./normalize-svg.ts";

/** Icon entry as it is written to family data. */
interface IconEntry {
  body: string;
  width?: number;
  height?: number;
  left?: number;
  top?: number;
  tags?: string[];
}

/**
 * Family data as it is written to disk.
 *
 * The shape is declared here rather than imported from `@codenhub/icons` so the
 * tooling stays independent of the package it generates for. The icons package
 * types each generated document as `IconFamilyData` when it builds them, which
 * is what fails the build if the two ever disagree.
 */
export interface IconFamilyDocument {
  prefix: string;
  info: {
    name: string;
    total: number;
    author: { name: string; url: string };
    license: { title: string; spdx: string; url: string };
    attribution: IconAttribution;
    tier: "core" | "extended";
    upstream: { package: string; version: string };
    strokeWidth?: number;
    style?: string;
    weight?: string;
  };
  width: number;
  height: number;
  left: number;
  top: number;
  icons: Record<string, IconEntry>;
}

/** A generated family, with the license material that has to travel with it. */
export interface BuiltFamily {
  document: IconFamilyDocument;
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
  return obligation;
}

function readIconName(fileName: string, definition: IconFamilyDefinition): string | undefined {
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

function renderAttribution(document: IconFamilyDocument): string {
  const { author, license, name, upstream } = document.info;
  return `# ${name}

Icon artwork in \`${document.prefix}\` comes from ${name}, generated from
\`${upstream.package}@${upstream.version}\`.

- Author: [${author.name}](${author.url})
- License: [${license.title} (${license.spdx})](${license.url})
- Obligation: ${document.info.attribution}

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

  const iconFiles = fileNames.flatMap((fileName) => {
    const iconName = readIconName(fileName, definition);
    return iconName === undefined ? [] : [{ fileName, iconName }];
  });

  const normalized = new Map(
    await mapConcurrent(iconFiles, READ_CONCURRENCY, async ({ fileName, iconName }) => {
      const source = await readFile(resolve(iconsDirectory, fileName), "utf8");
      const origin = `${definition.upstreamPackage}/${definition.iconsDirectory}/${fileName}`;
      return [iconName, normalizeSvg(source, origin)] as const;
    }),
  );

  if (normalized.size === 0) {
    throw new Error(`Family "${definition.prefix}" produced no icons from ${definition.upstreamPackage}.`);
  }

  const familyViewBox = pickDominantViewBox([...normalized.values()].map(readViewBoxKey));

  const icons: Record<string, IconEntry> = {};
  for (const [iconName, icon] of normalized) {
    const iconTags = tags[iconName];
    icons[iconName] = {
      body: icon.body,
      ...(icon.width === familyViewBox.width ? {} : { width: icon.width }),
      ...(icon.height === familyViewBox.height ? {} : { height: icon.height }),
      ...(icon.left === familyViewBox.left ? {} : { left: icon.left }),
      ...(icon.top === familyViewBox.top ? {} : { top: icon.top }),
      ...(iconTags && iconTags.length > 0 ? { tags: iconTags } : {}),
    };
  }

  const document: IconFamilyDocument = {
    height: familyViewBox.height,
    icons,
    info: {
      attribution,
      author: definition.author,
      license: definition.license,
      name: definition.name,
      tier: definition.tier,
      total: normalized.size,
      upstream: { package: definition.upstreamPackage, version },
      ...(definition.strokeWidth === undefined ? {} : { strokeWidth: definition.strokeWidth }),
      ...(definition.style === undefined ? {} : { style: definition.style }),
      ...(definition.weight === undefined ? {} : { weight: definition.weight }),
    },
    left: familyViewBox.left,
    prefix: definition.prefix,
    top: familyViewBox.top,
    width: familyViewBox.width,
  };

  return {
    attributionText: renderAttribution(document),
    document,
    licenseText: await readFile(resolve(packageDirectory, definition.licenseFile), "utf8"),
  };
}
