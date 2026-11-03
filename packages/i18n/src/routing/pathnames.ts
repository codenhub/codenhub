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
  /** Locales whose form needs no prefix under `when-ambiguous`. */
  readonly unprefixed: ReadonlySet<TLocale>;
}

/**
 * Items grouped by their pattern's segment count and first fixed segment, so a lookup visits only the items that could
 * match. Items come out in the order they went in.
 *
 * @internal
 */
export interface ShapeIndex<T> {
  /**
   * Items that can match `length` segments whose first segment is `first` or a parameter; all that can match that
   * length when `first` is `undefined`. A catch-all pattern can match any length from its own up.
   */
  candidates(length: number, first: string | undefined): Iterable<T>;
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
 * Matches normalized segments against a pattern, returning the raw text of each parameter.
 *
 * @internal
 */
export const matchPattern = (
  pattern: Pattern,
  keys: readonly string[],
  segments: readonly string[],
): Parameters | undefined => {
  const { length } = pattern.segments;
  if (hasRest(pattern) ? keys.length < length : keys.length !== length) {
    return undefined;
  }

  const parameters = new Map<string, string>();

  for (const [index, segment] of pattern.segments.entries()) {
    if (segment.kind === "param") {
      parameters.set(segment.name, segments[index]!);
    } else if (segment.kind === "rest") {
      parameters.set(segment.name, segments.slice(index).join("/"));
    } else if (segment.value !== keys[index]) {
      return undefined;
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

interface ShapeBucket<T> {
  readonly all: IndexEntry<T>[];
  readonly byFirst: Map<string, IndexEntry<T>[]>;
  /** Items whose first segment is a parameter, or that have none. */
  readonly open: IndexEntry<T>[];
}

interface RestEntry<T> extends IndexEntry<T> {
  readonly minLength: number;
  readonly first: string | undefined;
}

const indexByShape = <T>(items: readonly T[], patternOf: (item: T) => Pattern): ShapeIndex<T> => {
  const buckets = new Map<number, ShapeBucket<T>>();
  // Catch-all patterns match many lengths, so they are kept apart and checked against each lookup.
  const rests: RestEntry<T>[] = [];

  for (const [order, item] of items.entries()) {
    const pattern = patternOf(item);
    const { segments } = pattern;
    if (hasRest(pattern)) {
      rests.push({ item, order, minLength: segments.length, first: firstFixed(pattern) });
      continue;
    }
    let bucket = buckets.get(segments.length);
    if (bucket === undefined) {
      bucket = { all: [], byFirst: new Map(), open: [] };
      buckets.set(segments.length, bucket);
    }

    const entry = { item, order };
    const first = segments[0];
    bucket.all.push(entry);
    if (first === undefined || first.kind !== "static") {
      bucket.open.push(entry);
    } else {
      const list = bucket.byFirst.get(first.value);
      if (list === undefined) {
        bucket.byFirst.set(first.value, [entry]);
      } else {
        list.push(entry);
      }
    }
  }

  const exactCandidates = (length: number, first: string | undefined): readonly IndexEntry<T>[] => {
    const bucket = buckets.get(length);
    if (bucket === undefined) {
      return [];
    }
    if (first === undefined) {
      return bucket.all;
    }

    // Merge the two lists back into the order the items went in.
    const fixed = bucket.byFirst.get(first) ?? [];
    const { open } = bucket;
    const merged: IndexEntry<T>[] = [];
    let fixedIndex = 0;
    let openIndex = 0;
    while (fixedIndex < fixed.length || openIndex < open.length) {
      const isFixedNext =
        openIndex === open.length || (fixedIndex < fixed.length && fixed[fixedIndex]!.order < open[openIndex]!.order);
      merged.push(isFixedNext ? fixed[fixedIndex++]! : open[openIndex++]!);
    }
    return merged;
  };

  return {
    *candidates(length, first) {
      const exact = exactCandidates(length, first);
      const rest = rests.filter(
        (entry) =>
          entry.minLength <= length && (first === undefined || entry.first === undefined || entry.first === first),
      );
      const entries = rest.length === 0 ? exact : [...exact, ...rest].sort((a, b) => a.order - b.order);

      for (const entry of entries) {
        yield entry.item;
      }
    },
  };
};

/** The first segment's fixed value, or `undefined` when it is a parameter or there is none. */
const firstFixed = (pattern: Pattern): string | undefined => {
  const first = pattern.segments[0];
  return first?.kind === "static" ? first.value : undefined;
};

/** Whether some path matches both patterns. */
const overlaps = (a: Pattern, b: Pattern): boolean => {
  const aMax = hasRest(a) ? Infinity : a.segments.length;
  const bMax = hasRest(b) ? Infinity : b.segments.length;
  if (Math.max(a.segments.length, b.segments.length) > Math.min(aMax, bMax)) {
    return false;
  }

  for (let index = 0; index < Math.min(a.segments.length, b.segments.length); index += 1) {
    const segment = a.segments[index]!;
    const other = b.segments[index]!;
    if (segment.kind === "rest" || other.kind === "rest") {
      return true; // A catch-all takes whatever the other pattern has left.
    }
    if (segment.kind === "static" && other.kind === "static" && segment.value !== other.value) {
      return false;
    }
  }
  return true;
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

/**
 * Compiles the translated-path table, rejecting paths that are invalid, parameters that differ between forms, and two
 * entries that would share a path in one locale. Problems are thrown with `fail`, for `assertConfig` to word.
 *
 * @internal
 */
export const compilePathnames = <TLocale extends string>(
  entries: readonly CheckedPathnameEntry[],
  locales: readonly TLocale[],
  defaultLocale: TLocale,
  isLocale: (segment: string) => boolean,
): Pathnames<TLocale> => {
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

  // A translated form drops the prefix only when it has a fixed segment and no other locale's path could match it.
  const formList = routes.flatMap((route) => locales.map((locale) => ({ locale, pattern: route.forms.get(locale)! })));
  const allForms = indexByShape(formList, (form) => form.pattern);
  for (const route of routes) {
    for (const locale of translated.get(route)!) {
      const form = route.forms.get(locale)!;
      // A catch-all can overlap forms of any length from its own up, which the index doesn't look up by length.
      const others = hasRest(form) ? formList : allForms.candidates(form.segments.length, firstFixed(form));
      const isUnambiguous =
        locale !== defaultLocale &&
        form.segments.some((segment) => segment.kind === "static") &&
        [...others].every((other) => other.locale === locale || !overlaps(form, other.pattern));

      if (isUnambiguous) {
        (route.unprefixed as Set<TLocale>).add(locale);
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
