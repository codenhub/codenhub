import type { IconDefinition, IconProvider, IconSet } from "../../types.js";
import { lucideIcons } from "./icons.js";

/**
 * Built-in Lucide icon dataset containing SVG icon definitions and aliases.
 */
export const lucideIconSet: IconSet = {
  prefix: "lucide",
  icons: lucideIcons,
};

// Pre-build alias lookup map for O(1) alias resolution
const lucideAliasMap = new Map<string, string>();
for (const [key, iconVal] of Object.entries(lucideIconSet.icons)) {
  if (typeof iconVal !== "string" && iconVal.alt) {
    for (const alias of iconVal.alt) {
      lucideAliasMap.set(alias, key);
    }
  }
}

/**
 * Built-in provider for Lucide dataset icons.
 */
export const lucideProvider: IconProvider = {
  prefix: "lucide",
  getIcon(name: string): (IconDefinition & { primaryName?: string }) | undefined {
    const primaryName = lucideIconSet.icons[name] ? name : lucideAliasMap.get(name);
    if (!primaryName) {
      return undefined;
    }

    const entry = lucideIconSet.icons[primaryName];
    if (!entry) {
      return undefined;
    }

    const def = typeof entry === "string" ? { svg: entry } : { ...entry };
    return { ...def, primaryName };
  },
};
