import plugin from "tailwindcss/plugin";

import { describeFamilyNotice } from "../catalog/attribution.js";
import { parseIconClass, resolveIconClassName } from "../core/class-names.js";
import { IconRegistry } from "../core/registry.js";
import type { IconFamilyData } from "../core/types.js";
import { getIconMaskUrl } from "../generator/css-generator.js";

/**
 * How the Tailwind plugin emits the license notices of the families it used.
 *
 * Tailwind's plugin API builds declarations, not comments, so the notice ships
 * as a custom property on `:root` rather than as a `/*!` banner. It is emitted
 * for a family the first time one of its icons produces a utility, so a build
 * carries notices for the artwork it actually shipped and no other.
 */
export type TailwindAttributionMode = "auto" | "off";

/**
 * The Tailwind plugin this package publishes.
 *
 * Named here because Tailwind does not export the type of what
 * `plugin.withOptions` returns, and a declaration file cannot reference a type
 * it has no way to name.
 */
export type IconsTailwindPlugin = ReturnType<typeof plugin.withOptions<TailwindIconsOptions>>;

/**
 * Options for the Tailwind icons plugin, written in CSS as
 * `@plugin "@codenhub/icons/tailwind" { default: lucide; }`.
 */
export interface TailwindIconsOptions {
  /**
   * Family prefixes to make resolvable, such as `lucide, phosphor-fill`.
   *
   * Defaults to every family the package ships. Narrowing this does not make
   * the build cheaper -- the plugin has to be synchronous, so all families are
   * already loaded by the time options are read -- it decides which names
   * resolve, and which notices the output can carry.
   */
  families?: string | string[];

  /**
   * Family prefix that unqualified icon names resolve against.
   *
   * There is no default. Without it `ic-home` resolves to nothing and only
   * qualified names such as `ic-lucide-home` work, because the package names no
   * default family of its own.
   */
  default?: string;

  /**
   * Prefix for icon utility classes. Defaults to `"ic"`.
   */
  prefix?: string;

  /**
   * Stroke width for icons of stroke-based families that carry no stroke
   * modifier of their own.
   *
   * Write it as `stroke-width` in a `@plugin` block. Tailwind passes an option
   * name through exactly as written, but a CSS formatter lowercases a property
   * name, so a camelCase key survives being authored and not being reformatted:
   * `strokeWidth` becomes `strokewidth` and is silently ignored. The hyphenated
   * spelling is also the one a CSS file reads as CSS.
   */
  "stroke-width"?: number | string;

  /**
   * Stroke width, named the way JavaScript names it.
   *
   * {@link TailwindIconsOptions."stroke-width"} is the spelling to use from
   * CSS. This one is for a caller building the plugin in JavaScript, and wins
   * when both are given.
   */
  strokeWidth?: number | string;

  /**
   * How license notices reach the output. Defaults to `"auto"`.
   */
  attribution?: TailwindAttributionMode;
}

function toArray(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return Array.isArray(value) ? value : [value];
}

function selectFamilies(available: readonly IconFamilyData[], requested: string | string[] | undefined) {
  const prefixes = toArray(requested);
  if (!prefixes) {
    return [...available];
  }

  const wanted = new Set(prefixes.map((prefix) => prefix.trim()).filter(Boolean));
  const selected = available.filter((family) => wanted.has(family.prefix));
  for (const prefix of wanted) {
    if (!selected.some((family) => family.prefix === prefix)) {
      throw new Error(
        `@codenhub/icons: unknown icon family "${prefix}". Available families: ${available
          .map((family) => family.prefix)
          .join(", ")}.`,
      );
    }
  }
  return selected;
}

/**
 * Builds the map of utility values Tailwind matches icon classes against.
 *
 * Qualified names are always present. Unqualified ones are added only for the
 * configured default family, and never overwrite a qualified name, so a family
 * whose icon is called `lucide-heart` cannot shadow the family named `lucide`.
 */
function buildValues(families: readonly IconFamilyData[], defaultPrefix: string | undefined): Record<string, string> {
  const values: Record<string, string> = {};

  for (const family of families) {
    for (const name of Object.keys(family.icons)) {
      values[`${family.prefix}-${name}`] = `${family.prefix}:${name}`;
    }
    for (const alias of Object.keys(family.aliases ?? {})) {
      values[`${family.prefix}-${alias}`] = `${family.prefix}:${alias}`;
    }
  }

  const fallback = families.find((family) => family.prefix === defaultPrefix);
  if (fallback) {
    for (const name of Object.keys(fallback.icons)) {
      values[name] ??= `${fallback.prefix}:${name}`;
    }
    for (const alias of Object.keys(fallback.aliases ?? {})) {
      values[alias] ??= `${fallback.prefix}:${alias}`;
    }
  }

  return values;
}

/**
 * Creates the Tailwind CSS v4 plugin that resolves icon utility classes.
 *
 * The families are passed in rather than imported here because the list is
 * generated: the published plugin module is what binds this factory to the
 * families the package ships.
 *
 * Icons are generated as Tailwind matches them, so a project carries only the
 * icons its markup used without any stylesheet being scanned or shipped. Stroke
 * width is written as a modifier, `ic-lucide-heart/1.5`, which Tailwind hands
 * to the value function directly.
 *
 * @param availableFamilies - Every family the plugin can resolve against.
 * @returns The Tailwind plugin, ready to be a module's default export.
 */
export function createIconsTailwindPlugin(availableFamilies: readonly IconFamilyData[]): IconsTailwindPlugin {
  return plugin.withOptions((options: TailwindIconsOptions = {}) => {
    return ({ addBase, matchUtilities }) => {
      const prefix = options.prefix ?? "ic";
      const attribution = options.attribution ?? "auto";
      const strokeWidth = options.strokeWidth ?? options["stroke-width"];
      const families = selectFamilies(availableFamilies, options.families);

      // A default naming a family that is not selected resolves nothing, so
      // `ic-heart` would emit no CSS and no error. Refusing the configuration
      // says which of the two options is wrong, rather than leaving an icon to
      // go missing at a glance.
      if (options.default !== undefined && !families.some((family) => family.prefix === options.default)) {
        throw new Error(
          `@codenhub/icons: default icon family "${options.default}" is not among the families this plugin resolves: ${families
            .map((family) => family.prefix)
            .join(", ")}.`,
        );
      }

      const registry = new IconRegistry({ defaultPrefix: options.default });
      for (const family of families) {
        registry.registerFamily(family);
      }

      const values = buildValues(families, options.default);
      const noticed = new Set<string>();

      /**
       * Emits a family's license notice the first time it produces a utility.
       *
       * Called from inside the value function rather than up front, because
       * only Tailwind knows which icons a project actually used, and a notice
       * for artwork the build never shipped is noise rather than compliance.
       */
      function noticeFamily(familyPrefix: string): void {
        if (attribution === "off" || noticed.has(familyPrefix)) {
          return;
        }
        noticed.add(familyPrefix);

        const family = registry.getFamily(familyPrefix);
        if (!family || family.info.attribution === "none") {
          return;
        }
        addBase({
          ":root": { [`--${prefix}-attribution-${familyPrefix}`]: JSON.stringify(describeFamilyNotice(family)) },
        });
      }

      // Tailwind's published type says a value function returns a rule, but
      // returning nothing is how it rejects a candidate, and rejecting is most
      // of what this one does: every bare candidate in the project reaches it.
      const utilities = {
        [prefix]: (value: string, extra?: { modifier?: string | null }) => {
          // A matched candidate arrives already qualified, as `lucide:heart`,
          // but Tailwind also offers bare candidates it could not match
          // against `values`, which arrive as written. `resolveIconClassName`
          // reads both, and rejects everything that is not an icon.
          const parsed = parseIconClass(String(value));
          const icon = resolveIconClassName(registry, parsed.name);
          if (!icon) {
            return null;
          }

          const width = extra?.modifier ?? parsed.strokeWidth ?? strokeWidth;
          const url = getIconMaskUrl(icon.name, registry, { strokeWidth: width });
          if (!url) {
            return null;
          }

          noticeFamily(icon.prefix);
          return { [`--${prefix}-uri`]: url, [`--${prefix}-mask`]: `var(--${prefix}-uri)` };
        },
      };

      matchUtilities(utilities as unknown as Parameters<typeof matchUtilities>[0], { modifiers: "any", values });
    };
  });
}
