/* The generator: the rules of the Tailwind utilities a project names, written
   into `dist/purge/index.css` before it is trimmed, for a project that does
   not run Tailwind (docs/internal/generator.md). Everything it writes is read
   from `dist/utilities.json`, which `scripts/build-utilities.mjs` reads from
   Tailwind when the package is built. */
import { readPackageFile } from "./package";
import { classSelector, type Node, parse } from "./purge";

export const UTILITIES_TABLE = "dist/utilities.json";

interface Table {
  tailwind: string;
  // Each variant, in Tailwind's order, and the CSS it wraps a rule in: `$s` is the selector, `$b` the body.
  variants: Record<string, string>;
  // How many classes are ranked: a class under a variant sorts after every one without.
  stride: number;
  utilities: Record<string, [rank: number, body: string]>;
  // The sort key of each node of the source's utilities layer, `null` where a utility's place does not matter.
  rules: (number | null)[];
  // The theme values the utilities read that the source does not declare.
  theme: Record<string, string>;
}

export interface Utilities {
  // Every class the generator writes: each utility, plain and under each variant.
  readonly names: ReadonlySet<string>;
  readonly table: Table;
}

export async function readUtilities(): Promise<Utilities> {
  const table = JSON.parse(await readPackageFile(UTILITIES_TABLE)) as Table;
  const plain = Object.keys(table.utilities);
  const names = new Set([
    ...plain,
    ...Object.keys(table.variants).flatMap((variant) => plain.map((name) => `${variant}:${name}`)),
  ]);

  return { names, table };
}

const isLayer = (node: Extract<Node, { kind: "group" }>, name: string) => node.prelude.trim() === `@layer ${name}`;

/**
 * Returns `tree`, the untrimmed `dist/purge/index.css`, with the rules of each
 * utility `found` names in its utilities layer, where Tailwind sorts them
 * among the package's own when it compiles `/tw`, and the theme values those
 * rules read added to its theme layer. Names that are not utilities are
 * ignored. `tree` itself is left as it was.
 */
export function generate(tree: readonly Node[], found: Iterable<string>, { names, table }: Utilities): Node[] {
  const variants = Object.keys(table.variants);
  const written = [...new Set(found)]
    .filter((name) => names.has(name))
    .map((candidate) => {
      const colon = candidate.indexOf(":");
      const variant = colon === -1 ? undefined : candidate.slice(0, colon);
      const [rank, body] = table.utilities[candidate.slice(colon + 1)]!;
      const selector = classSelector(candidate);
      const css =
        variant === undefined
          ? `${selector}{${body}}`
          : table.variants[variant]!.replaceAll("$s", () => selector).replaceAll("$b", () => body);

      return { key: (variant === undefined ? 0 : variants.indexOf(variant) + 1) * table.stride + rank, body, css };
    })
    .toSorted((a, b) => a.key - b.key);

  if (written.length === 0) {
    return [...tree];
  }

  const read = new Set(written.flatMap(({ body }) => [...body.matchAll(/var\((--[\w-]+)/g)].map((match) => match[1]!)));
  const theme = Object.entries(table.theme).filter(([property]) => read.has(property));

  return tree.map((node) => {
    if (node.kind !== "group") {
      return node;
    }
    if (isLayer(node, "utilities")) {
      return { ...node, children: merge(node.children, table.rules, written) };
    }

    return isLayer(node, "theme") && theme.length > 0 ? { ...node, children: withTheme(node.children, theme) } : node;
  });
}

// Each rule written before the first node whose key is larger, and the rest after the last.
function merge(
  children: readonly Node[],
  keys: readonly (number | null)[],
  written: readonly { key: number; css: string }[],
) {
  if (keys.length !== children.length) {
    throw new Error(
      `${UTILITIES_TABLE} keys ${keys.length} rules of the utilities layer, which holds ${children.length}; reinstall @codenhub/styles.`,
    );
  }

  const merged: Node[] = [];
  let next = 0;

  children.forEach((child, index) => {
    const key = keys[index];

    for (; key !== null && key !== undefined && next < written.length && written[next]!.key < key; next += 1) {
      merged.push(...parse(written[next]!.css));
    }
    merged.push(child);
  });

  for (; next < written.length; next += 1) {
    merged.push(...parse(written[next]!.css));
  }

  return merged;
}

// The values go in the theme layer's first rule, `:root`, where the source declares the others.
function withTheme(children: readonly Node[], theme: readonly [string, string][]): Node[] {
  const declarations = theme.map(([property, value]) => `${property}:${value}`).join(";");
  const first = children.findIndex((child) => child.kind === "block" && child.isRule);

  if (first === -1) {
    return [...children, { kind: "block", prelude: ":root", body: declarations, isRule: true }];
  }

  return children.map((child, index) => {
    if (index !== first || child.kind !== "block") {
      return child;
    }

    return { ...child, body: child.body === "" ? declarations : `${child.body};${declarations}` };
  });
}
