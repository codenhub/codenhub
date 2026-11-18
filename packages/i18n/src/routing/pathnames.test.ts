// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { CheckedPathnameEntry } from "../locale/config-validators";
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
    it("should drop the prefix from exactly the translated forms no other locale's form overlaps", () => {
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
        const expected = entries.map((entry) =>
          entry.forms
            .map((form) => form.locale as Locale)
            .filter(
              (locale) =>
                locale !== defaultLocale &&
                segmentsOf(formOf(entry, locale)).some((segment) => !segment.startsWith(":")) &&
                !entries.some((other) =>
                  LOCALES.some(
                    (otherLocale) =>
                      otherLocale !== locale && overlaps(formOf(entry, locale), formOf(other, otherLocale)),
                  ),
                ),
            )
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
  });
});
