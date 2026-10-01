import { describe, expect, it } from "vitest";

import { check } from "../builders/check";
import { pattern } from "../checks/pattern";
import { unique } from "../checks/unique";
import { coerceDate } from "../coercion/coerce-date";
import { array } from "../composition/array";
import { intersection } from "../composition/intersection";
import { object } from "../composition/object";
import { base64 } from "../formats/base64";
import { datetime } from "../formats/datetime";
import { email } from "../formats/email";
import { hostname } from "../formats/hostname";
import { ip } from "../formats/ip";
import { searchParams } from "../formats/search-params";
import { ulid } from "../formats/ulid";
import { url } from "../formats/url";
import { uuid } from "../formats/uuid";
import { englishMessages } from "../messages/english-messages";
import { flatten, formatIssue } from "../messages/format-issue";
import { bigint } from "../primitives/bigint";
import { number } from "../primitives/number";
import { oneOf } from "../primitives/one-of";
import { string } from "../primitives/string";
import { unknown } from "../primitives/unknown";
import { issuesOf, valueOf } from "../test-utils";
import type { Validator } from "./types";

describe("a mistake in the schema", () => {
  const mistakes: [string, () => unknown][] = [
    ["number min as text", () => number({ min: "5" as never })],
    ["number int as text", () => number({ int: "yes" as never })],
    ["number safeInt as a number", () => number({ safeInt: 1 as never })],
    ["clamp without max", () => number({ clamp: { min: 0 } as never })],
    ["clamp bounds as text", () => number({ clamp: { min: "0", max: "10" } as never })],
    ["bigint bound as a number", () => bigint({ min: 0 as never })],
    ["string trim as text", () => string({ trim: "yes" as never })],
    ["datetime offset as text", () => datetime({ offset: "yes" as never })],
    ["base64 url as text", () => base64({ url: "yes" as never })],
    ["email allowPlus as text", () => email({ allowPlus: "no" as never })],
    ["email domain as text", () => email({ domain: "example.com" as never })],
    ["url host as text", () => url({ host: "example.com" as never })],
    ["url repeated as text", () => url({ repeated: "yes" as never })],
    ["url protocols as text", () => url({ protocols: "https" as never })],
    ["url without protocols", () => url({ protocols: [] })],
    ["searchParams repeated as text", () => searchParams(unknown(), { repeated: "yes" as never })],
    ["a message in place of unique's by", () => unique("Must be unique" as never)],
    ["checks given as a list", () => array(string(), [unique()] as never)],
  ];

  it.each(mistakes)("should throw when the validator is made, for %s", (_, make) => {
    expect(make).toThrow(TypeError);
  });

  it("should still accept every option left out", () => {
    expect(() => [number({}), bigint({}), string({}), url({}), email({}), unique(undefined, "Twice")]).not.toThrow();
  });
});

describe("a part of a URL or an address that fails", () => {
  it("should be reported at the field, so a form shows it beside the field", () => {
    const form = object({ contact: email({ domain: oneOf(["company.com"]) }) });
    const result = form({ contact: "ada@other.com" });
    expect(issuesOf(result)[0]?.path).toEqual(["contact"]);
    expect(flatten(result.ok ? never() : result.error, englishMessages)).toEqual({
      formErrors: [],
      fieldErrors: { contact: ['Invalid email address domain: Expected one of "company.com"'] },
    });
  });

  it("should be worded in English with what the part's validator found first", () => {
    const [found] = issuesOf(url({ query: object({ page: string() }) })("https://example.com/?x=1"));
    expect(found && formatIssue(found, englishMessages)).toBe("Invalid URL query: Expected string, received undefined");
  });
});

describe("a validator's message", () => {
  it("should word a check that has no message of its own, and leave one that has", () => {
    const username = string({ min: 3, message: "Invalid username" }, pattern(/^\w+$/), pattern(/^a/, "Start with a"));
    expect(issuesOf(username("b c")).map((issue) => issue.message)).toEqual(["Invalid username", "Start with a"]);
  });

  it("should word the checks of a composer and a format too, but never a child's issue", () => {
    const pair = object(
      { a: string(), b: string() },
      { message: "Pair" },
      check((value) => value.a === value.b),
    );
    expect(issuesOf(pair({ a: "x", b: "y" }))[0]?.message).toBe("Pair");
    expect(issuesOf(pair({ a: 1, b: "y" }))[0]?.message).toBeUndefined();
    expect(
      issuesOf(
        ip(
          { message: "IP" },
          check((value) => value !== "::1"),
        )("::1"),
      )[0]?.message,
    ).toBe("IP");
  });
});

describe("canonical output", () => {
  it("should give one value for one hostname, UUID and ULID however they were written", () => {
    expect(valueOf(hostname()("Intranet.Example."))).toBe("intranet.example.");
    expect(valueOf(uuid()("123E4567-E89B-12D3-A456-426614174000"))).toBe("123e4567-e89b-12d3-a456-426614174000");
    expect(valueOf(ulid()("01arz3ndektsv4rrffq69g5fav"))).toBe("01ARZ3NDEKTSV4RRFFQ69G5FAV");
  });
});

describe("coerceDate", () => {
  it("should read what an HTML datetime-local input sends, without seconds", () => {
    expect(valueOf(coerceDate()("2026-09-28T10:00")).toISOString()).toBe("2026-09-28T10:00:00.000Z");
    expect(valueOf(coerceDate()("2026-09-28T10:00+02:00")).toISOString()).toBe("2026-09-28T08:00:00.000Z");
    expect(coerceDate()("2026-09-28T10:00.5").ok).toBe(false);
  });
});

describe("a validator written by hand", () => {
  it("should have an issue without a path placed at the child it came from", () => {
    const pathless = (() => ({ ok: false, error: { issues: [{ code: "x" }] } })) as unknown as Validator<string>;
    expect(issuesOf(object({ a: pathless })({ a: 1 }))).toEqual([{ code: "x", path: ["a"] }]);
  });
});

describe("input large enough to be slow", () => {
  it("should read a query of many distinct keys in time that grows with their number", () => {
    const query = Array.from({ length: 80_000 }, (_, index) => `k${index}=`).join("&");
    const start = performance.now();
    expect(searchParams(unknown())(query).ok).toBe(true);
    expect(url({ query: unknown() })(`https://example.com/?${query}`).ok).toBe(true);
    // Each took about 20 seconds when every key scanned the whole query.
    expect(performance.now() - start).toBeLessThan(2000);
  });

  it("should merge equal values in an intersection without testing each for a date", () => {
    const both = intersection(array(unknown()), array(unknown()));
    const items = Array.from({ length: 200_000 }, (_, index) => index);
    const start = performance.now();
    expect(both(items).ok).toBe(true);
    // About 1.5 seconds when every value was first tested for a date by throwing.
    expect(performance.now() - start).toBeLessThan(750);
  });
});

function never(): never {
  throw new Error("Expected a failure");
}
