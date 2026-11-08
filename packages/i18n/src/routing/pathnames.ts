import { type CheckedPathnameEntry, fail } from "../locale/config-validators";
import { findPathnameProblem, normalizeSegment, splitPathname } from "./path";

const PARAMETER_NAME_PATTERN = /^[A-Za-z0-9_]+$/;
const RESERVED_PARAMETER_NAMES = new Set(["__proto__", "constructor", "prototype"]);

/** A fixed segment, a `:name` parameter, or a last `:name*` catch-all matching one or more segments. */
type PatternSegment =
  | { readonly kind: "static"; readonly value: string }
  | { readonly kind: "param"; readonly name: string }
  | { readonly kind: "rest"; readonly name: string };

const hasRest = (pattern: Pattern): boolean => pattern.segments.at(-1)?.kind === "rest";

/** A path of fixed, normalized segments and named parameters. @internal */
export interface Pattern {
  readonly segments: readonly PatternSegment[];
}

/** A table entry: its canonical path, and each locale's form, the canonical one where the table lists none. @internal */
export interface Route<TLocale extends string> {
  readonly canonical: Pattern;
  readonly forms: ReadonlyMap<TLocale, Pattern>;
  /** Locales whose form needs no prefix under `when-ambiguous`; empty under any other policy. */
  readonly unprefixed: ReadonlySet<TLocale>;
}

/**
 * Items stored by their pattern's segments, so a lookup visits only the branches that could match. Where several items
 * match, the one that went in first wins.
 *
 * @internal
 */
export interface ShapeIndex<T> {
  /** The first item whose pattern matches the normalized segments `keys`, with its parameters read from `segments`. */
  find(
    keys: readonly string[],
    segments: readonly string[],
  ): { readonly item: T; readonly parameters: Parameters } | undefined;
  /** Whether an item whose pattern matches some path that `pattern` matches satisfies `predicate`. */
  someOverlapping(pattern: Pattern, predicate: (item: T) => boolean): boolean;
}

/** The compiled table. Indexes keep a fixed segment ahead of a parameter. @internal */
export interface Pathnames<TLocale extends string> {
  /** Every route, to find one by its canonical path. */
  readonly byCanonical: ShapeIndex<Route<TLocale>>;
  /** Each locale's routes, to read a path in that locale. */
  readonly byLocale: ReadonlyMap<TLocale, ShapeIndex<Route<TLocale>>>;
  /** Routes with a form that needs no prefix, and that form's locale. */
  readonly unprefixed: ShapeIndex<{
    readonly route: Route<TLocale>;
    readonly locale: TLocale;
  }>;
}

/** The values matched by a pattern's parameters, as written in the path; a catch-all's segments are joined by `/`. @internal */
export type Parameters = ReadonlyMap<string, string>;

/**
 * Reads the raw text of each parameter of the pattern that the index found for these segments; the index already
 * matched the segment count and every fixed segment.
 */
const readParameters = (pattern: Pattern, segments: readonly string[]): Parameters => {
  const parameters = new Map<string, string>();

  for (const [index, segment] of pattern.segments.entries()) {
    if (segment.kind === "param") {
      parameters.set(segment.name, segments[index]!);
    } else if (segment.kind === "rest") {
      parameters.set(segment.name, segments.slice(index).join("/"));
    }
  }

  return parameters;
};

/** @internal */
export const buildPattern = (pattern: Pattern, parameters: Parameters): string[] =>
  pattern.segments.flatMap((segment) => {
    if (segment.kind === "static") {
      return [segment.value];
    }
    const value = parameters.get(segment.name)!;
    return segment.kind === "rest" ? value.split("/") : [value];
  });

interface IndexEntry<T> {
  readonly item: T;
  readonly order: number;
}

/** The items whose patterns start with the segments that lead to this node. */
interface ShapeNode<T> {
  readonly byValue: Map<string, ShapeNode<T>>;
  param: ShapeNode<T> | undefined;
  /** Items whose pattern ends here, in the order they went in. */
  readonly ends: IndexEntry<T>[];
  /** Items whose catch-all starts here, in the order they went in. */
  readonly rests: IndexEntry<T>[];
}

const createShapeNode = <T>(): ShapeNode<T> => ({ byValue: new Map(), param: undefined, ends: [], rests: [] });

const childrenOf = <T>(node: ShapeNode<T>): ShapeNode<T>[] =>
  node.param === undefined ? [...node.byValue.values()] : [...node.byValue.values(), node.param];

const indexByShape = <T>(items: readonly T[], patternOf: (item: T) => Pattern): ShapeIndex<T> => {
  const root = createShapeNode<T>();

  for (const [order, item] of items.entries()) {
    const pattern = patternOf(item);
    const isRest = hasRest(pattern);
    let node = root;
    for (const segment of isRest ? pattern.segments.slice(0, -1) : pattern.segments) {
      if (segment.kind !== "static") {
        node = node.param ??= createShapeNode();
        continue;
      }
      let child = node.byValue.get(segment.value);
      if (child === undefined) {
        child = createShapeNode();
        node.byValue.set(segment.value, child);
      }
      node = child;
    }
    (isRest ? node.rests : node.ends).push({ item, order });
  }

  const isAnyBelow = (node: ShapeNode<T>, predicate: (item: T) => boolean): boolean =>
    [...node.ends, ...node.rests].some((entry) => predicate(entry.item)) ||
    childrenOf(node).some((child) => isAnyBelow(child, predicate));

  return {
    find(keys, segments) {
      // The first item of each matching node, since items at one node match the same paths.
      const matches: IndexEntry<T>[] = [];
      const visit = (node: ShapeNode<T> | undefined, depth: number): void => {
        if (node === undefined) {
          return;
        }
        if (depth === keys.length) {
          matches.push(...node.ends.slice(0, 1));
          return;
        }
        matches.push(...node.rests.slice(0, 1)); // A catch-all takes this segment and the rest.
        visit(node.byValue.get(keys[depth]!), depth + 1);
        visit(node.param, depth + 1);
      };

      visit(root, 0);
      const found = matches.reduce<IndexEntry<T> | undefined>(
        (first, entry) => (first === undefined || entry.order < first.order ? entry : first),
        undefined,
      );
      return found && { item: found.item, parameters: readParameters(patternOf(found.item), segments) };
    },

    someOverlapping(pattern, predicate) {
      const visit = (node: ShapeNode<T> | undefined, depth: number): boolean => {
        if (node === undefined) {
          return false;
        }
        const segment = pattern.segments[depth];
        if (segment === undefined) {
          return node.ends.some((entry) => predicate(entry.item));
        }
        if (node.rests.some((entry) => predicate(entry.item))) {
          return true; // Another catch-all takes this segment and the rest.
        }
        if (segment.kind === "rest") {
          return childrenOf(node).some((child) => isAnyBelow(child, predicate));
        }
        const next = segment.kind === "param" ? childrenOf(node) : [node.byValue.get(segment.value), node.param];
        return next.some((child) => visit(child, depth + 1));
      };

      return visit(root, 0);
    },
  };
};

/** A key that two patterns share exactly when they match the same paths. */
const shapeKey = (pattern: Pattern): string =>
  JSON.stringify(
    pattern.segments.map((segment) =>
      segment.kind === "static" ? segment.value : segment.kind === "param" ? null : 0,
    ),
  );

const SPECIFICITY = { static: 0, param: 1, rest: 2 } as const;

/**
 * Orders patterns so that, at the first segment where two differ in kind, the more specific one comes first: a fixed
 * segment, then a parameter, then a catch-all.
 */
const bySpecificity = (a: Pattern, b: Pattern): number => {
  for (let index = 0; index < Math.min(a.segments.length, b.segments.length); index += 1) {
    const difference = SPECIFICITY[a.segments[index]!.kind] - SPECIFICITY[b.segments[index]!.kind];
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
};

const parameterNames = (pattern: Pattern): string[] =>
  pattern.segments
    .flatMap((segment) =>
      segment.kind === "param" ? [segment.name] : segment.kind === "rest" ? [`${segment.name}*`] : [],
    )
    .sort();

const parsePattern = (pathname: string, path: string, isLocale: (segment: string) => boolean): Pattern => {
  const problem = findPathnameProblem(pathname);

  if (problem !== undefined) {
    fail(
      path,
      problem === "invalid" ? "Must be a valid absolute application pathname" : "Must not contain dot segments",
    );
  }

  const names = new Set<string>();
  const parts = splitPathname(pathname).segments;
  const segments = parts.map((segment, index): PatternSegment => {
    if (!segment.startsWith(":")) {
      const value = normalizeSegment(segment);
      if (index === 0 && isLocale(value)) {
        fail(path, "Must not start with a locale");
      }
      return { kind: "static", value };
    }

    const isRest = segment.endsWith("*");
    const name = segment.slice(1, isRest ? -1 : undefined);
    if (!PARAMETER_NAME_PATTERN.test(name) || RESERVED_PARAMETER_NAMES.has(name)) {
      fail(path, "Must name each parameter with letters, digits, and _");
    }
    if (isRest && index !== parts.length - 1) {
      fail(path, "Must put a catch-all last");
    }
    if (names.has(name)) {
      fail(path, "Must not repeat a parameter");
    }
    names.add(name);
    return { kind: isRest ? "rest" : "param", name };
  });

  return { segments };
};

/** The table and the routing configuration it is compiled for. @internal */
export interface CompilePathnamesOptions<TLocale extends string> {
  readonly entries: readonly CheckedPathnameEntry[];
  readonly locales: readonly TLocale[];
  readonly defaultLocale: TLocale;
  readonly localePrefix: "always" | "except-default" | "when-ambiguous";
  /** Whether a normalized first segment is a locale, which a path must not start with. */
  readonly isLocale: (segment: string) => boolean;
}

/**
 * Compiles the translated-path table, rejecting paths that are invalid, parameters that differ between forms, and two
 * entries that would share a path in one locale. Problems are thrown with `fail`, for `assertConfig` to word.
 *
 * @internal
 */
export const compilePathnames = <TLocale extends string>({
  entries,
  locales,
  defaultLocale,
  localePrefix,
  isLocale,
}: CompilePathnamesOptions<TLocale>): Pathnames<TLocale> => {
  const routes: Route<TLocale>[] = [];
  const translated = new Map<Route<TLocale>, readonly TLocale[]>();
  // The canonical path of the first page with each shape, overall and in each locale.
  const canonicalShapes = new Map<string, string>();
  const localeShapes = new Map<TLocale, Map<string, string>>(locales.map((locale) => [locale, new Map()]));

  for (const entry of entries) {
    const canonical = parsePattern(entry.pathname, entry.path, isLocale);
    const expectedNames = parameterNames(canonical).join();
    const forms = new Map<TLocale, Pattern>(locales.map((locale) => [locale, canonical]));
    const paths = new Map<TLocale, string>(locales.map((locale) => [locale, entry.path]));

    for (const form of entry.forms) {
      const pattern = parsePattern(form.pathname, form.path, isLocale);
      if (parameterNames(pattern).join() !== expectedNames) {
        const names = parameterNames(canonical);
        fail(
          form.path,
          names.length === 0 ? "Must not use parameters" : `Must use the parameters :${names.join(", :")}`,
        );
      }
      forms.set(form.locale as TLocale, pattern);
      paths.set(form.locale as TLocale, form.path);
    }

    for (const locale of locales) {
      const shapes = localeShapes.get(locale)!;
      const key = shapeKey(forms.get(locale)!);
      const otherPathname = shapes.get(key);
      if (otherPathname !== undefined) {
        fail(
          paths.get(locale)!,
          `Must not have the same path as ${JSON.stringify(otherPathname)} in ${JSON.stringify(locale)}`,
        );
      }
      shapes.set(key, entry.pathname);
    }
    const canonicalKey = shapeKey(canonical);
    const otherPathname = canonicalShapes.get(canonicalKey);
    if (otherPathname !== undefined) {
      fail(entry.path, `Must not be the same path as ${JSON.stringify(otherPathname)}`);
    }
    canonicalShapes.set(canonicalKey, entry.pathname);

    const route: Route<TLocale> = { canonical, forms, unprefixed: new Set() };
    routes.push(route);
    translated.set(
      route,
      entry.forms.map((form) => form.locale as TLocale),
    );
  }

  // Under `when-ambiguous`, a translated form drops the prefix only when it has a fixed segment and no other locale's
  // path could match it. No other policy reads the decision, so it is not made.
  if (localePrefix === "when-ambiguous") {
    const allForms = indexByShape(
      routes.flatMap((route) => locales.map((locale) => ({ locale, pattern: route.forms.get(locale)! }))),
      (form) => form.pattern,
    );
    for (const route of routes) {
      for (const locale of translated.get(route)!) {
        const form = route.forms.get(locale)!;
        const isUnambiguous =
          locale !== defaultLocale &&
          form.segments.some((segment) => segment.kind === "static") &&
          !allForms.someOverlapping(form, (other) => other.locale !== locale);

        if (isUnambiguous) {
          (route.unprefixed as Set<TLocale>).add(locale);
        }
      }
    }
  }

  const sortRoutes = (list: Route<TLocale>[], patternOf: (route: Route<TLocale>) => Pattern): Route<TLocale>[] =>
    list.sort((a, b) => bySpecificity(patternOf(a), patternOf(b)));
  const unprefixed = routes
    .flatMap((route) => [...route.unprefixed].map((locale) => ({ route, locale })))
    .sort((a, b) => bySpecificity(a.route.forms.get(a.locale)!, b.route.forms.get(b.locale)!));

  return {
    byCanonical: indexByShape(
      sortRoutes([...routes], (route) => route.canonical),
      (route) => route.canonical,
    ),
    byLocale: new Map(
      locales.map((locale) => {
        const patternOf = (route: Route<TLocale>) => route.forms.get(locale)!;
        return [locale, indexByShape(sortRoutes([...routes], patternOf), patternOf)];
      }),
    ),
    unprefixed: indexByShape(unprefixed, ({ route, locale }) => route.forms.get(locale)!),
  };
};
