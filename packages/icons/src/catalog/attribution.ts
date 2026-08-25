import type { IconAttribution, IconFamilyData } from "../core/types.js";

/**
 * How a build emits the license notices of the families it used.
 */
export type AttributionMode = "auto" | "file" | "off";

const OBLIGATION_ORDER: Record<IconAttribution, number> = { credit: 2, none: 0, notice: 1 };

function hasObligation(family: IconFamilyData): boolean {
  return family.info.attribution !== "none";
}

function describeFamily(family: IconFamilyData): string {
  const { author, license, name, upstream } = family.info;
  const line = `${name} (${family.prefix}) ${upstream.version} — ${license.title} (${license.spdx}) — ${author.name} ${author.url}`;
  // Metadata for an adopted set is consumer-supplied; a "*/" in it must not close the /*! ... */ comment early.
  return line.replace(/\*\//g, "*\\/");
}

/**
 * Lists the families a build must carry a license notice for, most demanding
 * obligation first.
 *
 * Families under a public-domain dedication are omitted because nothing is owed
 * for them.
 *
 * @param families - Families the build resolved icons from.
 * @returns Families that place an obligation on distributed output.
 */
export function collectAttributedFamilies(families: Iterable<IconFamilyData>): IconFamilyData[] {
  return [...families]
    .filter(hasObligation)
    .toSorted(
      (first, second) =>
        OBLIGATION_ORDER[second.info.attribution] - OBLIGATION_ORDER[first.info.attribution] ||
        first.prefix.localeCompare(second.prefix),
    );
}

/**
 * Renders the plain-text license notice for the families a build used.
 *
 * @param families - Families the build resolved icons from.
 * @returns The notice text, or `undefined` when no family places an obligation.
 */
export function renderAttributionNotice(families: Iterable<IconFamilyData>): string | undefined {
  const attributed = collectAttributedFamilies(families);
  if (attributed.length === 0) {
    return undefined;
  }

  return ["Icon artwork in this build:", ...attributed.map((family) => `- ${describeFamily(family)}`)].join("\n");
}

/**
 * Renders the license notice as a preserved CSS comment.
 *
 * The `/*!` form is what esbuild and terser keep under their default
 * `legalComments` setting, so the notice survives minification.
 *
 * @param families - Families the build resolved icons from.
 * @returns The banner comment, or `undefined` when no family places an obligation.
 */
export function renderAttributionBanner(families: Iterable<IconFamilyData>): string | undefined {
  const notice = renderAttributionNotice(families);
  return notice === undefined ? undefined : `/*!\n${notice}\n*/`;
}

/**
 * Renders the build warning shown when notices are suppressed while families
 * still place an obligation.
 *
 * @param families - Families the build resolved icons from.
 * @returns The warning text, or `undefined` when suppressing notices owes nothing.
 */
export function renderSuppressedAttributionWarning(families: Iterable<IconFamilyData>): string | undefined {
  const attributed = collectAttributedFamilies(families);
  if (attributed.length === 0) {
    return undefined;
  }

  const names = attributed.map((family) => `${family.info.name} (${family.info.license.spdx})`).join(", ");
  return `Icon attribution is disabled, but this build uses families whose licenses require a notice: ${names}. Their notices ship in the package under @codenhub/icons data directories.`;
}
