import { describe, expect, it } from "vitest";

import { array } from "../composition/array";
import { lazy } from "../composition/lazy";
import { object } from "../composition/object";
import { optional } from "../composition/optional";
import { pipe } from "../composition/pipe";
import { record } from "../composition/record";
import { transform } from "../composition/transform";
import { union } from "../composition/union";
import { email } from "../formats/email";
import { url } from "../formats/url";
import { englishMessages } from "../messages/english-messages";
import { formatIssue } from "../messages/format-issue";
import { literal } from "../primitives/literal";
import { number } from "../primitives/number";
import { oneOf } from "../primitives/one-of";
import { string } from "../primitives/string";
import { unknown } from "../primitives/unknown";
import { issuesOf } from "../test-utils";
import type { ValidationIssue, Validator } from "./types";

// An issue that carries the issues behind it in `params.issues` holds each of them without the issues
// behind that one, so nesting stops at one level whatever composes it: a recursive schema otherwise nests
// once per level, which an asynchronous one does 10,000 times, past what a serializer can write.
describe("issues held in params.issues", () => {
  it("should hold a failed union inside a part of a URL by its code and path", () => {
    const link = url({ query: object({ mode: union([literal("a"), literal("b")]) }) });
    expect(issuesOf(link("https://example.com/?mode=c"))[0]?.params?.["issues"]).toEqual([
      { code: "invalid_union", path: ["mode"] },
    ]);
  });

  it("should hold a failed part inside a bad key with the part's issues, which carry none of their own", () => {
    const byAddress = record(email({ domain: oneOf(["example.com"]) }), unknown());
    const [bad] = issuesOf(byAddress({ "ada@other.com": 1 }));
    expect(bad?.params?.["issues"]).toEqual([
      {
        code: "invalid_format",
        path: [],
        params: {
          format: "email",
          part: "domain",
          issues: [{ code: "invalid_value", path: [], params: { options: ["example.com"] } }],
        },
      },
    ]);
  });

  it("should nest at most three deep, a union inside a part inside a key held by its code and path", () => {
    const byLink = record(url({ query: object({ mode: union([literal("a"), literal("b")]) }) }), unknown());
    const [bad] = issuesOf(byLink({ "https://example.com/?mode=c": 1 }));
    expect(bad?.params?.["issues"]).toEqual([
      {
        code: "invalid_format",
        path: [],
        params: { format: "url", part: "query", issues: [{ code: "invalid_union", path: ["mode"] }] },
      },
    ]);
  });

  it("should keep the failure of an asynchronous recursive URL schema serializable", async () => {
    const later = transform(unknown(), async (value) => value);
    const link: Validator<unknown> = lazy(() =>
      url({ host: unknown(), query: pipe(later, object({ next: optional(link) })) }),
    ) as Validator<unknown>;
    const nested: Validator<unknown> = lazy(() =>
      union([url({ query: pipe(later, object({ next: nested })) }), literal("x")]),
    ) as Validator<unknown>;
    const input = `${"https://example.com/?next=".repeat(3_000)}zzz`;
    const results = await Promise.all([link(input), nested(input)]);
    for (const result of results) {
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result).length).toBeLessThan(1_000);
    }
  });

  it("should keep a limit of lazy that stopped the validation, in place of the issue that held it", () => {
    const value: Validator<unknown> = lazy(() => union([string(), number(), array(value)])) as Validator<unknown>;
    let deep: unknown = [];
    for (let level = 0; level < 150; level += 1) {
      deep = [deep];
    }
    const [found] = issuesOf(value(deep));
    const options = found?.params?.["issues"] as ValidationIssue[][];
    expect(found?.code).toBe("invalid_union");
    expect(options[2]).toEqual([
      { code: "too_big", path: Array(128).fill(0), params: { maximum: 128, type: "depth" } },
    ]);
    expect(formatIssue(found as ValidationIssue, englishMessages)).toBe(
      `${"[0]".repeat(128)}: Must be nested at most 128 levels deep`,
    );
  });

  it("should keep a limit found behind a union written by hand without a path, at the root", () => {
    const handWritten = (() => ({
      ok: false,
      error: {
        issues: [
          {
            code: "invalid_union",
            params: { issues: [[{ code: "too_big", path: [], params: { maximum: 1, type: "depth" } }]] },
          },
        ],
      },
    })) as unknown as Validator<unknown>;
    expect(issuesOf(union([handWritten])("x"))[0]?.params?.["issues"]).toEqual([
      [{ code: "too_big", path: [], params: { maximum: 1, type: "depth" } }],
    ]);
  });
});
