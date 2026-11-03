import type { IconRegistry } from "./registry.js";
import type { ResolvedIcon } from "./types.js";

const STROKE_MODIFIER = /^[0-9]+(?:\.[0-9]+)?$/;

/**
 * Icon names the motion utilities own exactly, as `ic-on-hover` and `ic-trigger`.
 * @internal
 */
export const RESERVED_MOTION_NAMES: readonly string[] = ["on-hover", "trigger"];

/**
 * Whether an icon name, or a `prefix:name` reference, belongs to the motion
 * utilities rather than to an icon: `anim`, `anim-*`, `anim:*`, or one of
 * {@link RESERVED_MOTION_NAMES}. See docs/internal/motion.md.
 * @param name - Icon part of a class, with the utility prefix stripped.
 * @returns Whether the name is reserved for motion.
 * @internal
 */
export function isMotionName(name: string): boolean {
  return /^anim(?:$|[-:])/.test(name) || RESERVED_MOTION_NAMES.includes(name);
}

/**
 * An icon utility class taken apart into the parts that address an icon.
 */
export interface ParsedIconClass {
  /**
   * Icon part of the class, with the utility prefix and any modifier removed.
   */
  name: string;

  /**
   * Stroke width written as a modifier, as in `ic-heart/1.5`.
   *
   * Stroke width is baked into the artwork a rule carries, so it belongs to the
   * class rather than to a second class beside it: one token addresses one
   * icon at one width, and the generated stylesheet holds one rule for it.
   */
  strokeWidth?: string;
}

/**
 * Takes an icon utility class apart into its icon name and stroke modifier.
 *
 * The utility prefix is not examined here; callers strip it first, because a
 * scanner already matched it to find the class at all.
 *
 * @param name - Icon part of the class, with the utility prefix already stripped.
 * @returns The icon name and its stroke modifier, if any.
 */
export function parseIconClass(name: string): ParsedIconClass {
  const separatorIndex = name.lastIndexOf("/");
  if (separatorIndex === -1) {
    return { name };
  }

  const modifier = name.slice(separatorIndex + 1);
  if (!STROKE_MODIFIER.test(modifier)) {
    return { name };
  }

  return { name: name.slice(0, separatorIndex), strokeWidth: modifier };
}

/**
 * Resolves the icon part of a utility class, where a family prefix is written
 * with a dash because a class name cannot contain a colon.
 *
 * `x` resolves through the default prefix, while `lucide-heart` resolves to
 * `lucide:heart`. The longest matching family prefix wins, so a family named
 * `material-symbols-outlined` is preferred over one named `material` when both
 * are loaded.
 *
 * @param registry - Registry holding the loaded families.
 * @param name - Icon part of the class, with the utility prefix already stripped.
 * @returns The resolved icon, or `undefined` when no reading of the name resolves.
 */
export function resolveIconClassName(registry: IconRegistry, name: string): ResolvedIcon | undefined {
  if (isMotionName(name)) {
    return undefined;
  }
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
