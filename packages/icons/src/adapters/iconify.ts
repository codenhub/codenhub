import type { IconAlias, IconData, IconFamilyData, IconFamilyInfo } from "../core/types.js";

/**
 * The subset of an IconifyJSON document this package reads.
 *
 * Declared here rather than imported: the shapes are compatible so third-party
 * icon data loads unchanged, and the package depends on nothing from Iconify.
 */
export interface IconifyJson {
  prefix: string;
  icons: Record<string, { body: string; width?: number; height?: number; left?: number; top?: number }>;
  aliases?: Record<string, { parent: string }>;
  width?: number;
  height?: number;
  left?: number;
  top?: number;
  info?: {
    name?: string;
    total?: number;
    author?: { name?: string; url?: string };
    license?: { title?: string; spdx?: string; url?: string };
  };
}

/**
 * Metadata an adopted third-party set cannot supply about itself.
 */
export interface IconifyAdapterOptions {
  /**
   * Obligation the set's license places on distributed output. Defaults to
   * `"notice"`, the safe reading for an unknown permissive license.
   */
  attribution?: IconFamilyInfo["attribution"];

  /**
   * Authored stroke width, when the set is stroke-based and should accept
   * stroke width changes.
   */
  strokeWidth?: number;
}

const UNKNOWN = "Unknown";
const NOT_APPLICABLE = "";

function adoptIcons(icons: IconifyJson["icons"]): Record<string, IconData> {
  return Object.fromEntries(
    Object.entries(icons).map(([name, icon]) => [
      name,
      {
        body: icon.body,
        ...(icon.width === undefined ? {} : { width: icon.width }),
        ...(icon.height === undefined ? {} : { height: icon.height }),
        ...(icon.left === undefined ? {} : { left: icon.left }),
        ...(icon.top === undefined ? {} : { top: icon.top }),
      },
    ]),
  );
}

function adoptAliases(aliases: IconifyJson["aliases"]): Record<string, IconAlias> | undefined {
  if (!aliases) {
    return undefined;
  }
  return Object.fromEntries(Object.entries(aliases).map(([name, alias]) => [name, { parent: alias.parent }]));
}

/**
 * Adopts an IconifyJSON-shaped icon set as a family this registry can resolve.
 *
 * Icon bodies are taken as authored; only the metadata this package requires
 * and Iconify does not carry — obligation level, tier, provenance — is filled
 * in. Adopted sets are always `"extended"` tier: the package makes its licensing
 * promise about the families it generates, not about data a consumer supplies.
 *
 * @param source - IconifyJSON document, such as the default export of an `@iconify-json` package.
 * @param options - Obligation level and stroke behavior the document cannot state.
 * @returns Family data ready for `IconRegistry.registerFamily`.
 */
export function adoptIconifySet(source: IconifyJson, options?: IconifyAdapterOptions): IconFamilyData {
  const icons = adoptIcons(source.icons);
  const aliases = adoptAliases(source.aliases);

  return {
    icons,
    info: {
      attribution: options?.attribution ?? "notice",
      author: { name: source.info?.author?.name ?? UNKNOWN, url: source.info?.author?.url ?? NOT_APPLICABLE },
      license: {
        spdx: source.info?.license?.spdx ?? UNKNOWN,
        title: source.info?.license?.title ?? UNKNOWN,
        url: source.info?.license?.url ?? NOT_APPLICABLE,
      },
      name: source.info?.name ?? source.prefix,
      tier: "extended",
      total: source.info?.total ?? Object.keys(icons).length,
      upstream: { package: NOT_APPLICABLE, version: NOT_APPLICABLE },
      ...(options?.strokeWidth === undefined ? {} : { strokeWidth: options.strokeWidth }),
    },
    prefix: source.prefix,
    ...(aliases === undefined ? {} : { aliases }),
    ...(source.width === undefined ? {} : { width: source.width }),
    ...(source.height === undefined ? {} : { height: source.height }),
    ...(source.left === undefined ? {} : { left: source.left }),
    ...(source.top === undefined ? {} : { top: source.top }),
  };
}
