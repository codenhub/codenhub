import { type CheckedPathnameEntry, fail } from "../locale/config-validators";
import { findPathnameProblem, normalizeSegment, splitPathname } from "./path";

const PARAMETER_NAME_PATTERN = /^[A-Za-z0-9_]+$/;
const RESERVED_PARAMETER_NAMES = new Set(["__proto__", "constructor", "prototype"]);

type PatternSegment =
  | { readonly kind: "static"; readonly value: string }
  | { readonly kind: "param"; readonly name: string };

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

/** The compiled table. Lists are sorted so a fixed segment wins over a parameter. @internal */
export interface Pathnames<TLocale extends string> {
  /** Every route, to find one by its canonical path. */
  readonly byCanonical: readonly Route<TLocale>[];
  /** Each locale's routes, to read a path in that locale. */
  readonly byLocale: ReadonlyMap<TLocale, readonly Route<TLocale>[]>;
  /** Routes with a form that needs no prefix, and that form's locale. */
  readonly unprefixed: readonly {
    readonly route: Route<TLocale>;
    readonly locale: TLocale;
  }[];
}

/** The values matched by a pattern's parameters, as written in the path. @internal */
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
  if (pattern.segments.length !== keys.length) {
    return undefined;
  }

  const parameters = new Map<string, string>();

  for (const [index, segment] of pattern.segments.entries()) {
    if (segment.kind === "param") {
      parameters.set(segment.name, segments[index]!);
    } else if (segment.value !== keys[index]) {
      return undefined;
    }
  }

  return parameters;
};

/** @internal */
export const buildPattern = (pattern: Pattern, parameters: Parameters): string[] =>
  pattern.segments.map((segment) => (segment.kind === "static" ? segment.value : parameters.get(segment.name)!));

/** Whether some path matches both patterns. */
const overlaps = (a: Pattern, b: Pattern): boolean =>
  a.segments.length === b.segments.length &&
  a.segments.every((segment, index) => {
    const other = b.segments[index]!;
    return segment.kind === "param" || other.kind === "param" || segment.value === other.value;
  });

/** Whether both patterns match exactly the same paths. */
const hasSameShape = (a: Pattern, b: Pattern): boolean =>
  a.segments.length === b.segments.length &&
  a.segments.every((segment, index) => {
    const other = b.segments[index]!;
    return (
      segment.kind === other.kind && (segment.kind === "param" || segment.value === (other as typeof segment).value)
    );
  });

/** Orders patterns so that, at the first segment where two differ in kind, the fixed one comes first. */
const bySpecificity = (a: Pattern, b: Pattern): number => {
  for (let index = 0; index < Math.min(a.segments.length, b.segments.length); index += 1) {
    const difference = Number(a.segments[index]!.kind === "param") - Number(b.segments[index]!.kind === "param");
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
};

const parameterNames = (pattern: Pattern): string[] =>
  pattern.segments.flatMap((segment) => (segment.kind === "param" ? [segment.name] : [])).sort();

const parsePattern = (pathname: string, path: string, isLocale: (segment: string) => boolean): Pattern => {
  const problem = findPathnameProblem(pathname);

  if (problem !== undefined) {
    fail(
      path,
      problem === "invalid" ? "Must be a valid absolute application pathname" : "Must not contain dot segments",
    );
  }

  const names = new Set<string>();
  const segments = splitPathname(pathname).segments.map((segment, index): PatternSegment => {
    if (!segment.startsWith(":")) {
      const value = normalizeSegment(segment);
      if (index === 0 && isLocale(value)) {
        fail(path, "Must not start with a locale");
      }
      return { kind: "static", value };
    }

    const name = segment.slice(1);
    if (!PARAMETER_NAME_PATTERN.test(name) || RESERVED_PARAMETER_NAMES.has(name)) {
      fail(path, "Must name each parameter with letters, digits, and _");
    }
    if (names.has(name)) {
      fail(path, "Must not repeat a parameter");
    }
    names.add(name);
    return { kind: "param", name };
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

    for (const [index, other] of routes.entries()) {
      const otherPathname = entries[index]!.pathname;

      for (const locale of locales) {
        if (hasSameShape(forms.get(locale)!, other.forms.get(locale)!)) {
          fail(
            paths.get(locale)!,
            `Must not have the same path as ${JSON.stringify(otherPathname)} in ${JSON.stringify(locale)}`,
          );
        }
      }
      if (hasSameShape(canonical, other.canonical)) {
        fail(entry.path, `Must not be the same path as ${JSON.stringify(otherPathname)}`);
      }
    }

    const route: Route<TLocale> = { canonical, forms, unprefixed: new Set() };
    routes.push(route);
    translated.set(
      route,
      entry.forms.map((form) => form.locale as TLocale),
    );
  }

  // A translated form drops the prefix only when it has a fixed segment and no other locale's path could match it.
  for (const route of routes) {
    for (const locale of translated.get(route)!) {
      const form = route.forms.get(locale)!;
      const isUnambiguous =
        locale !== defaultLocale &&
        form.segments.some((segment) => segment.kind === "static") &&
        routes.every((other) =>
          locales.every((otherLocale) => otherLocale === locale || !overlaps(form, other.forms.get(otherLocale)!)),
        );

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
    byCanonical: sortRoutes([...routes], (route) => route.canonical),
    byLocale: new Map(locales.map((locale) => [locale, sortRoutes([...routes], (route) => route.forms.get(locale)!)])),
    unprefixed,
  };
};
