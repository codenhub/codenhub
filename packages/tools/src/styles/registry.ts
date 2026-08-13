import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/** Package directory, relative to the repository root, that owns the registry. */
export const STYLES_LOCATION = "packages/styles";

/** Registry file name, relative to the styles package. */
export const REGISTRY_FILE = "registry.json";

/** The two presentation tokens a fill class declares. */
export interface FillPresentation {
  "ui-fill": string;
  "ui-fg-on-fill": string;
}

/** The one presentation token an edge class declares. */
export interface EdgePresentation {
  "ui-border": string;
}

/** A component's resting pair and depth. */
export interface ComponentDefault {
  fill?: string;
  edge?: string;
  elevation: number;
}

/** One supported component. */
export interface ComponentEntry {
  class: string;
  role: string;
  default: ComponentDefault;
  art?: readonly string[];
  native: readonly string[];
  renamedFrom?: string;
  renameReason?: string;
  wave: number;
}

/** What a role permits and what it bounds. */
export interface RoleEntry {
  fill: readonly string[];
  edge: readonly string[];
  invariant: string | null;
}

/** One intent class and the color family behind it. */
export interface IntentEntry {
  family: string;
  vocabulary: string;
  aliases?: readonly string[];
}

/** An aesthetic and the role blocks it declares. */
export interface AestheticEntry {
  class: string;
  roleBlocks: readonly string[];
  completeShadow: boolean;
  completeShadowReason?: string;
}

/** The parsed `registry.json`. */
export interface StyleRegistry {
  version: number;
  presentation: {
    fill: Readonly<Record<string, FillPresentation>>;
    edge: Readonly<Record<string, EdgePresentation>>;
    hoverStep: string;
  };
  intents: Readonly<Record<string, IntentEntry>>;
  modifiers: Readonly<Record<string, unknown>>;
  roles: Readonly<Record<string, RoleEntry>>;
  components: readonly ComponentEntry[];
  helpers?: readonly { class: string; purpose: string }[];
  aesthetics?: readonly AestheticEntry[];
  removed?: readonly { class: string; replacedBy: string | null; note?: string }[];
}

/**
 * Reads the styles registry from a workspace root.
 * @param root Absolute repository root.
 * @returns The parsed registry, or `undefined` when the package has none.
 */
export async function loadStyleRegistry(root: string): Promise<StyleRegistry | undefined> {
  const path = resolve(root, STYLES_LOCATION, REGISTRY_FILE);
  const source = await readFile(path, "utf8").catch(() => undefined);
  return source === undefined ? undefined : (JSON.parse(source) as StyleRegistry);
}

/**
 * Lists every selector that reaches a component: its class and its native elements.
 *
 * The native mappings are part of the same list rather than a second one so a
 * role block, an intent reset, and a membership rule cannot disagree about
 * whether a bare `<button>` is an action.
 * @param component Component entry.
 * @returns Selectors in authoring order, class first.
 */
export function selectorsFor(component: ComponentEntry): string[] {
  return [`.${component.class}`, ...component.native];
}

/**
 * Lists every selector that reaches a role.
 * @param registry Parsed registry.
 * @param role Role name.
 * @returns Selectors for every component in the role.
 */
export function roleSelectors(registry: StyleRegistry, role: string): string[] {
  return registry.components.filter((component) => component.role === role).flatMap(selectorsFor);
}

/**
 * Lists every class name the package would ship.
 *
 * Used by the collision check and by the docs, so a name that exists in exactly
 * one of them is a finding rather than a surprise.
 * @param registry Parsed registry.
 * @returns Class names, with duplicates preserved so they can be reported.
 */
export function shippedClassNames(registry: StyleRegistry): string[] {
  const modifiers = Object.entries(registry.modifiers).flatMap(([group, value]) =>
    group === "elevation" ? Object.keys(value as object) : (value as string[]),
  );
  return [
    ...Object.keys(registry.presentation.fill),
    ...Object.keys(registry.presentation.edge),
    ...Object.keys(registry.intents),
    ...Object.values(registry.intents).flatMap((intent) => intent.aliases ?? []),
    ...modifiers,
    ...registry.components.map((component) => component.class),
    ...registry.components.flatMap((component) => component.art ?? []),
    ...(registry.helpers ?? []).map((helper) => helper.class),
    ...(registry.aesthetics ?? []).map((aesthetic) => aesthetic.class),
  ];
}
