import { type CheckedPathnameEntry, fail } from "../locale/config-validators";
import { formatReportedKey } from "../locale/dictionary";
import { findPathnameProblem, normalizeSegment, splitPathname } from "./path";

const PARAMETER_NAME_PATTERN = /^[A-Za-z0-9_]+$/;
// A segment written as a catch-all, as a route pattern passed to `localize` ends.
const REST_KEY_PATTERN = /^:[A-Za-z0-9_]+\*$/;
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
  /**
   * The first item whose pattern matches the normalized segments `keys`, with its parameters read from `segments`. A
   * last key written as a catch-all, such as `:path*`, matches only a catch-all, so a route pattern such as
   * `/help/:path*` is read as the catch-all route it names, not as a parameter route of one segment.
   */
  find(
    keys: readonly string[],
    segments: readonly string[],
  ): { readonly item: T; readonly parameters: Parameters } | undefined;
}

/** The compiled table. Indexes keep a fixed segment ahead of a parameter. @internal */
export interface Pathnames<TLocale extends string> {
  /** Every route, in table order. */
  readonly routes: readonly Route<TLocale>[];
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

const indexByShape = <T>(items: readonly T[], patternOf: (item: T) => Pattern): ShapeIndex<T> => {
  const root = createShapeNode<T>();

  for (const item of items) {
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
    (isRest ? node.rests : node.ends).push({ item });
  }

  // The walk keeps its own stack: a pattern may have about 4,000 segments, and a call per segment overflows the call
  // stack. At each segment it tries a fixed word, then a parameter, then a catch-all, which is the order
  // `bySpecificity` sorts items in, so the first item it reaches is the most specific match and it stops there. Items at
  // one node match the same paths, so only the first of them can be found.
  return {
    find(keys, segments) {
      const restDepth = REST_KEY_PATTERN.test(keys.at(-1) ?? "") ? keys.length - 1 : undefined;
      const pending: ({ readonly node: ShapeNode<T>; readonly depth: number } | IndexEntry<T>)[] = [
        { node: root, depth: 0 },
      ];
      for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
        if ("item" in next) {
          return { item: next.item, parameters: readParameters(patternOf(next.item), segments) };
        }
        const { node, depth } = next;
        if (depth === keys.length) {
          const end = node.ends[0];
          if (end !== undefined) {
            pending.push(end);
          }
          continue;
        }
        // Pushed in reverse, so a fixed word is tried first and a catch-all, which takes this segment and the rest, last.
        const rest = node.rests[0];
        if (rest !== undefined) {
          pending.push(rest);
        }
        if (depth === restDepth) {
          continue;
        }
        if (node.param !== undefined) {
          pending.push({ node: node.param, depth: depth + 1 });
        }
        const child = node.byValue.get(keys[depth]!);
        if (child !== undefined) {
          pending.push({ node: child, depth: depth + 1 });
        }
      }
      return undefined;
    },
  };
};

/** One locale's form of a route. */
interface LocaleForm<TLocale extends string> {
  readonly locale: TLocale;
  readonly pattern: Pattern;
}

/** Patterns whose segments are of the same kinds, so that two of them differ only in their fixed segments' words. */
interface PatternClass<T> {
  readonly length: number;
  readonly isRest: boolean;
  /** Whether each segment before a catch-all is fixed. */
  readonly isFixed: readonly boolean[];
  readonly items: T[];
  /** Each item's locale by its words at some positions, keyed by those positions, built once per set of positions. */
  readonly byWords: Map<string, Map<string, { readonly locale: string; isMixed: boolean }>>;
}

const classify = <T>(items: readonly T[], patternOf: (item: T) => Pattern): PatternClass<T>[] => {
  const classes = new Map<string, PatternClass<T>>();
  for (const item of items) {
    const { segments } = patternOf(item);
    const isRest = hasRest(patternOf(item));
    const isFixed = (isRest ? segments.slice(0, -1) : segments).map((segment) => segment.kind === "static");
    const key = `${isRest ? "*" : ""}${isFixed.map((fixed) => (fixed ? "s" : "p")).join("")}`;
    let found = classes.get(key);
    if (found === undefined) {
      found = {
        length: segments.length,
        isRest,
        isFixed,
        items: [],
        byWords: new Map(),
      };
      classes.set(key, found);
    }
    found.items.push(item);
  }
  return [...classes.values()];
};

/**
 * How many leading segments two classes' patterns must agree on to match a common path, or `undefined` when their
 * lengths rule one out: a catch-all matches one or more segments, and agrees with whatever it covers.
 */
const comparedLength = <T>(a: PatternClass<T>, b: PatternClass<T>): number | undefined => {
  if (a.isRest && b.isRest) {
    return Math.min(a.length, b.length) - 1;
  }
  if (a.isRest) {
    return b.length >= a.length ? a.length - 1 : undefined;
  }
  if (b.isRest) {
    return a.length >= b.length ? b.length - 1 : undefined;
  }
  return a.length === b.length ? a.length : undefined;
};

/** A pattern's words at `positions`, which are fixed segments; a word never contains `/`. */
const wordsAt = (pattern: Pattern, positions: readonly number[]): string =>
  positions.map((index) => (pattern.segments[index] as { readonly value: string }).value).join("/");

/**
 * The queries that match some path an item of another locale matches. Two patterns of given classes match a common path
 * exactly when their words agree where both have a fixed segment, so each pair of classes is compared once, through a
 * map of one class's words. Walking an index of the items for each query instead visited every branch a parameter
 * could take, which made a table of forms starting with a parameter take quadratic time to create.
 */
const findOverlapped = <TLocale extends string>(
  items: readonly LocaleForm<TLocale>[],
  queries: readonly LocaleForm<TLocale>[],
): Set<LocaleForm<TLocale>> => {
  const overlapped = new Set<LocaleForm<TLocale>>();
  const itemClasses = classify(items, (item) => item.pattern);

  for (const queryClass of classify(queries, (query) => query.pattern)) {
    for (const itemClass of itemClasses) {
      const compared = comparedLength(queryClass, itemClass);
      const pending = queryClass.items.filter((query) => !overlapped.has(query));
      if (compared === undefined || pending.length === 0) {
        continue;
      }

      const positions: number[] = [];
      for (let index = 0; index < compared; index += 1) {
        if (queryClass.isFixed[index] === true && itemClass.isFixed[index] === true) {
          positions.push(index);
        }
      }
      const positionsKey = positions.join();
      let byWords = itemClass.byWords.get(positionsKey);
      if (byWords === undefined) {
        byWords = new Map();
        for (const item of itemClass.items) {
          const words = wordsAt(item.pattern, positions);
          const found = byWords.get(words);
          if (found === undefined) {
            byWords.set(words, { locale: item.locale, isMixed: false });
          } else if (found.locale !== item.locale) {
            found.isMixed = true;
          }
        }
        itemClass.byWords.set(positionsKey, byWords);
      }

      for (const query of pending) {
        const found = byWords.get(wordsAt(query.pattern, positions));
        if (found !== undefined && (found.isMixed || found.locale !== query.locale)) {
          overlapped.add(query);
        }
      }
    }
  }

  return overlapped;
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
 * segment, then a parameter, then a catch-all. Where one pattern's kinds start the other's, the shorter comes first.
 * Those two never match the same path, but without that tie-break the order is inconsistent, so `/blog` listed between
 * `/blog/:slug` and `/blog/archive` left the parameter first.
 */
const bySpecificity = (a: Pattern, b: Pattern): number => {
  for (let index = 0; index < Math.min(a.segments.length, b.segments.length); index += 1) {
    const difference = SPECIFICITY[a.segments[index]!.kind] - SPECIFICITY[b.segments[index]!.kind];
    if (difference !== 0) {
      return difference;
    }
  }
  return a.segments.length - b.segments.length;
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
          `Must not have the same path as ${formatReportedKey(otherPathname)} in ${formatReportedKey(locale)}`,
        );
      }
      shapes.set(key, entry.pathname);
    }
    const canonicalKey = shapeKey(canonical);
    const otherPathname = canonicalShapes.get(canonicalKey);
    if (otherPathname !== undefined) {
      fail(entry.path, `Must not be the same path as ${formatReportedKey(otherPathname)}`);
    }
    canonicalShapes.set(canonicalKey, entry.pathname);

    const route: Route<TLocale> = { canonical, forms, unprefixed: new Set() };
    routes.push(route);
    translated.set(
      route,
      entry.forms.map((form) => form.locale as TLocale),
    );
  }

  // Under `when-ambiguous`, a path without a prefix is read as a form that dropped its prefix, else as the default
  // locale's, so a translated form with a fixed segment drops its prefix only when no form read that way could match
  // it too. Comparing it with a form that keeps its prefix would only take the prefix from paths that need none.
  // Which forms drop it depends on which others do, so it is settled in two steps that no table order changes: a form
  // a default-locale form overlaps keeps its prefix, and of the rest, a form that overlaps another locale's keeps it
  // too, even where that other one keeps it as well. No other policy reads the decision, so it is not made.
  if (localePrefix === "when-ambiguous") {
    const formsIn = (locale: TLocale) => routes.map((route) => ({ route, locale, pattern: route.forms.get(locale)! }));
    const candidates = locales.flatMap((locale) =>
      locale === defaultLocale
        ? []
        : formsIn(locale).filter(
            ({ route, pattern }) =>
              translated.get(route)!.includes(locale) && pattern.segments.some((segment) => segment.kind === "static"),
          ),
    );
    const overlappedByDefault = findOverlapped(formsIn(defaultLocale), candidates);
    const eligible = candidates.filter((candidate) => !overlappedByDefault.has(candidate));
    const overlapped = findOverlapped(eligible, eligible);
    for (const candidate of eligible) {
      if (!overlapped.has(candidate)) {
        (candidate.route.unprefixed as Set<TLocale>).add(candidate.locale);
      }
    }
  }

  const sortRoutes = (list: Route<TLocale>[], patternOf: (route: Route<TLocale>) => Pattern): Route<TLocale>[] =>
    list.sort((a, b) => bySpecificity(patternOf(a), patternOf(b)));
  const unprefixed = routes
    .flatMap((route) => [...route.unprefixed].map((locale) => ({ route, locale })))
    .sort((a, b) => bySpecificity(a.route.forms.get(a.locale)!, b.route.forms.get(b.locale)!));

  return {
    routes,
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
