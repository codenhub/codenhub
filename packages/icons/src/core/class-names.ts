import type { IconRegistry } from "./registry.js";
import type { ResolvedIcon } from "./types.js";

/**
 * Resolves the icon part of a utility class, where a family prefix is written
 * with a dash because a class name cannot contain a colon.
 *
 * `close` resolves through semantic aliases or the default prefix, while
 * `lucide-heart` resolves to `lucide:heart`. The longest matching family prefix
 * wins, so a family named `material-symbols-outlined` is preferred over one
 * named `material` when both are loaded.
 *
 * @param registry - Registry holding the loaded families.
 * @param name - Icon part of the class, with the utility prefix already stripped.
 * @returns The resolved icon, or `undefined` when no reading of the name resolves.
 */
export function resolveIconClassName(registry: IconRegistry, name: string): ResolvedIcon | undefined {
  const direct = registry.resolve(name);
  if (direct) {
    return direct;
  }

  const candidates = registry
    .listFamilies()
    .filter((prefix) => name.startsWith(`${prefix}-`))
    .toSorted((first, second) => second.length - first.length);

  for (const prefix of candidates) {
    const resolved = registry.resolve(`${prefix}:${name.slice(prefix.length + 1)}`);
    if (resolved) {
      return resolved;
    }
  }

  return undefined;
}
