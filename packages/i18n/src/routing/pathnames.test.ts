// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { CheckedPathnameEntry } from "../locale/config-validators";
import { createLocaleRouting } from "../routing";
import { compilePathnames } from "./pathnames";

const LOCALES = ["en", "pt", "es"] as const;
type Locale = (typeof LOCALES)[number];

/** A seeded generator, so a failing table can be reproduced from its seed. */
const random = (seed: number) => () => {
  seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
  return seed / 2_147_483_648;
};

const segmentsOf = (pathname: string): string[] => (pathname === "/" ? [] : pathname.slice(1).split("/"));

/**
 * Whether some path matches both patterns, written straight from what a pattern matches: a fixed segment matches
 * itself, a parameter any one segment, and a last catch-all one or more segments.
 */
const overlaps = (a: string, b: string): boolean => {
  const [x, y] = [segmentsOf(a), segmentsOf(b)];
  const isRest = (segments: string[]) => segments.at(-1)?.endsWith("*") === true;
  const fixedLength = (segments: string[]) => (isRest(segments) ? segments.length - 1 : segments.length);
  if (!isRest(x) && !isRest(y) && x.length !== y.length) {
    return false;
  }
  if (isRest(x) && !isRest(y) && y.length < x.length) {
    return false;
  }
  if (isRest(y) && !isRest(x) && x.length < y.length) {
    return false;
  }
  const compared = Math.min(fixedLength(x), fixedLength(y));
  for (let index = 0; index < compared; index += 1) {
    const [p, q] = [x[index]!, y[index]!];
    if (!p.startsWith(":") && !q.startsWith(":") && p !== q) {
      return false;
    }
  }
  return true;
};

/** A random table whose forms use their canonical path's parameters, each form with its own segment count and order. */
const randomTable = (next: () => number, size: number): CheckedPathnameEntry[] => {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
  const pattern = (names: readonly string[], rest: string | undefined): string => {
    const length = names.length + Math.floor(next() * 3);
    const slots = Array.from({ length }, () => pick(["a", "b", "c"]));
    const free = [...slots.keys()];
    for (const name of names) {
      const [slot] = free.splice(Math.floor(next() * free.length), 1);
      slots[slot!] = `:${name}`;
    }
    if (rest !== undefined) {
      slots.push(`:${rest}*`);
    }
    return `/${slots.join("/")}`;
  };

  return Array.from({ length: size }, () => {
    const names = ["p", "q"].slice(0, Math.floor(next() * 3));
    const rest = next() < 0.2 ? "r" : undefined;
    const pathname = pattern(names, rest);
    const forms = LOCALES.filter(() => next() < 0.5).map((locale) => ({
      locale,
      path: `${pathname}.${locale}`,
      pathname: pattern(names, rest),
    }));
    return { path: pathname, pathname, forms };
  });
};

describe("compilePathnames", () => {
  describe("with `when-ambiguous`", () => {
    it("should drop the prefix from exactly the translated forms no other form read without a prefix overlaps", () => {
      let checkedTables = 0;
      for (let seed = 1; checkedTables < 400; seed += 1) {
        const next = random(seed);
        const entries = randomTable(next, 1 + Math.floor(next() * 8));
        const defaultLocale = LOCALES[seed % LOCALES.length]!;
        let compiled;
        try {
          compiled = compilePathnames<Locale>({
            entries,
            locales: LOCALES,
            defaultLocale,
            localePrefix: "when-ambiguous",
            isLocale: (segment) => (LOCALES as readonly string[]).includes(segment),
          });
        } catch {
          continue; // Two pages with one path, which the table rejects.
        }
        checkedTables += 1;

        const formOf = (entry: CheckedPathnameEntry, locale: Locale) =>
          entry.forms.find((form) => form.locale === locale)?.pathname ?? entry.pathname;
        // A path without a prefix is read as an unprefixed form, else as the default locale's. A translated form with a
        // fixed segment may drop its prefix when no default-locale form overlaps it; it does, unless it also overlaps
        // another locale's form that may.
        const candidates = entries.flatMap((entry) =>
          entry.forms
            .map((form) => form.locale as Locale)
            .filter(
              (locale) =>
                locale !== defaultLocale &&
                segmentsOf(formOf(entry, locale)).some((segment) => !segment.startsWith(":")) &&
                !entries.some((other) => overlaps(formOf(entry, locale), formOf(other, defaultLocale))),
            )
            .map((locale) => ({
              entry,
              locale,
              pathname: formOf(entry, locale),
            })),
        );
        const expected = entries.map((entry) =>
          candidates
            .filter(
              (candidate) =>
                candidate.entry === entry &&
                !candidates.some(
                  (other) => other.locale !== candidate.locale && overlaps(candidate.pathname, other.pathname),
                ),
            )
            .map((candidate) => candidate.locale)
            .sort(),
        );
        const actual = compiled.routes.map((route) => [...route.unprefixed].sort());
        expect({ seed, entries, actual }).toEqual({
          seed,
          entries,
          actual: expected,
        });
      }
    });

    it("should build no link that opens another page where `except-default` builds one, and read each back", () => {
      let checkedTables = 0;
      for (let seed = 1; checkedTables < 150; seed += 1) {
        const next = random(seed);
        const entries = randomTable(next, 1 + Math.floor(next() * 8));
        const defaultLocale = LOCALES[seed % LOCALES.length]!;
        const create = (localePrefix: "except-default" | "when-ambiguous") =>
          createLocaleRouting<Locale>({
            locales: LOCALES,
            defaultLocale,
            localePrefix,
            pathnames: Object.fromEntries(
              entries.map((entry) => [
                entry.pathname,
                Object.fromEntries(entry.forms.map((form) => [form.locale, form.pathname])),
              ]),
            ),
          });
        let routing;
        let prefixed;
        try {
          routing = create("when-ambiguous");
          prefixed = create("except-default");
        } catch {
          continue; // Two pages with one path, which the table rejects.
        }
        checkedTables += 1;

        const fill = (pathname: string, value: string) =>
          segmentsOf(pathname).map((segment) =>
            segment.endsWith("*") ? `${value}/c` : segment.startsWith(":") ? value : segment,
          );
        const failures: string[] = [];
        const localizes = (on: typeof routing, pathname: string, locale: Locale) => {
          try {
            on.localize(pathname, locale);
            return true;
          } catch {
            return false;
          }
        };
        // Each listed page, in every locale: dropping a prefix must not make its link open another page.
        for (const value of ["a", "b", "x"]) {
          for (const entry of entries) {
            const pathname = `/${fill(entry.pathname, value).join("/")}`;
            for (const locale of LOCALES) {
              if (localizes(prefixed, pathname, locale) && !localizes(routing, pathname, locale)) {
                failures.push(`${pathname} in ${locale}`);
              }
            }
          }
        }
        // Each form with its parameters filled in, as itself and behind each locale's prefix, read and built again.
        const paths = new Set<string>();
        for (const pathname of entries.flatMap((entry) => [
          entry.pathname,
          ...entry.forms.map((form) => form.pathname),
        ])) {
          for (const value of ["a", "b", "x"]) {
            for (const prefix of [[], ...LOCALES.map((locale) => [locale])]) {
              paths.add(`/${[...prefix, ...fill(pathname, value)].join("/")}`);
            }
          }
        }
        for (const path of paths) {
          const route = routing.parse(path);
          if (route === undefined) {
            continue;
          }
          const canonical = routing.localize(route.pathname, route.locale);
          if (routing.parse(canonical)?.pathname !== route.pathname) {
            failures.push(`${path} -> ${canonical}`);
          }
          for (const alternate of route.alternates) {
            const read = routing.parse(alternate.pathname);
            if (read?.locale !== alternate.locale || read.pathname !== route.pathname) {
              failures.push(`${path}: ${JSON.stringify(alternate)} -> ${JSON.stringify(read)}`);
            }
          }
        }
        expect({ seed, entries, failures }).toEqual({
          seed,
          entries,
          failures: [],
        });
      }
    });
  });
});
