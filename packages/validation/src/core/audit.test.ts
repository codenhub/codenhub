import { describe, expect, it } from "vitest";

import { check } from "../builders/check";
import { guard } from "../builders/guard";
import { coerceNumber } from "../coercion/coerce-number";
import { coerceString } from "../coercion/coerce-string";
import { array } from "../composition/array";
import { codec } from "../composition/codec";
import { json } from "../composition/json";
import { lazy } from "../composition/lazy";
import { map } from "../composition/map";
import { meta } from "../composition/meta";
import { object } from "../composition/object";
import { optional } from "../composition/optional";
import { pipe } from "../composition/pipe";
import { record } from "../composition/record";
import { set } from "../composition/set";
import { tagged } from "../composition/tagged";
import { transform } from "../composition/transform";
import { tuple } from "../composition/tuple";
import { union } from "../composition/union";
import { email } from "../formats/email";
import { searchParams } from "../formats/search-params";
import { url } from "../formats/url";
import { uuid } from "../formats/uuid";
import { standard } from "../interop/standard";
import { boolean } from "../primitives/boolean";
import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { unknown } from "../primitives/unknown";
import { audit } from "./audit";
import type { Validator } from "./types";

const name = string({ max: 100 });

describe("audit", () => {
  it("should find nothing in a schema that bounds what it accepts", () => {
    const signup = object({
      name,
      email: email(),
      id: uuid(),
      age: optional(number({ int: true })),
      tags: array(string({ max: 20 }), { max: 10 }),
      admin: boolean(),
      extra: unknown(),
    });
    expect(audit(signup)).toEqual([]);
  });

  it("should report a collection without a max, at its place in the schema", () => {
    const schema = object({
      tags: array(name),
      ids: set(uuid()),
      scores: map(name, number()),
      labels: record(name, name),
      pair: tuple([name], { rest: name }),
      fixed: tuple([name, name]),
      exact: array(name, { length: 3 }),
    });
    expect(audit(schema)).toEqual([
      { rule: "unbounded_size", path: "tags", kind: "array" },
      { rule: "unbounded_size", path: "ids", kind: "set" },
      { rule: "unbounded_size", path: "scores", kind: "map" },
      { rule: "unbounded_size", path: "labels", kind: "record" },
      { rule: "unbounded_size", path: "pair", kind: "tuple" },
    ]);
  });

  it("should report text without a max, and a format that does not bound its own", () => {
    const schema = object({ bio: string(), site: url(), raw: coerceString(), count: coerceNumber(), mail: email() });
    expect(audit(schema)).toEqual([
      { rule: "unbounded_text", path: "bio", kind: "string" },
      { rule: "unbounded_text", path: "site", kind: "format" },
      { rule: "unbounded_text", path: "raw", kind: "string" },
    ]);
  });

  it("should take text bounded before it in a pipe as bounding what reads it", () => {
    const settings = pipe(string({ max: 10_000 }), json(object({ tags: array(string()) })));
    expect(audit(settings)).toEqual([]);
    expect(audit(pipe(string({ max: 2048 }), url()))).toEqual([]);
    expect(audit(json(object({ tags: array(name, { max: 5 }) })))).toEqual([
      { rule: "unbounded_text", path: "", kind: "json" },
    ]);
    expect(audit(searchParams(object({ q: name })))).toEqual([
      { rule: "unbounded_text", path: "", kind: "searchParams" },
    ]);
  });

  it("should report a lazy whose limits were raised above their defaults, and walk it once", () => {
    type Tree = { name: string; children: Tree[] };
    const tree: Validator<Tree> = lazy(() => object({ name, children: array(tree, { max: 10 }) }));
    expect(audit(tree)).toEqual([]);
    const deep: Validator<Tree> = lazy(() => object({ name, children: array(deep, { max: 10 }) }), {
      maxDepth: 1000,
    });
    expect(audit(deep)).toEqual([{ rule: "raised_limit", path: "", kind: "lazy" }]);
    const busy: Validator<Tree> = lazy(() => object({ name, children: array(busy) }), { maxCalls: 100_000 });
    expect(audit(busy)).toEqual([
      { rule: "raised_limit", path: "", kind: "lazy" },
      { rule: "unbounded_size", path: "children", kind: "array" },
    ]);
  });

  it("should walk a lazy at each place it is used, and report its raised limits once", () => {
    const note = lazy(() => object({ text: string() }), { maxCalls: 20_000 });
    const body = pipe(string({ max: 1000 }), json(note));
    expect(audit(object({ sent: body, kept: note }))).toEqual([
      { rule: "raised_limit", path: "sent", kind: "lazy" },
      { rule: "unbounded_text", path: "kept.text", kind: "string" },
    ]);
  });

  it("should count a bound held by a wrapper or a nested pipe for the steps after it", () => {
    const parsed = json(object({ bio: string() }));
    expect(audit(pipe(pipe(string({ max: 100 }), parsed), object({ bio: string() })))).toEqual([]);
    expect(audit(pipe(optional(string({ max: 100 })), parsed))).toEqual([]);
    expect(audit(pipe(meta(coerceString({ max: 100 }), { title: "Body" }), parsed))).toEqual([]);
    expect(audit(pipe(union([string({ max: 10 }), email()]), parsed))).toEqual([]);
    expect(audit(pipe(union([string({ max: 10 }), string()]), parsed))).toEqual([
      { rule: "unbounded_text", path: "", kind: "string" },
      { rule: "unbounded_text", path: "", kind: "json" },
      { rule: "unbounded_text", path: "bio", kind: "string" },
    ]);
  });

  it("should name a part it cannot read rather than pass it in silence", () => {
    const byHand: Validator<string> = (input) => ({ ok: true, value: String(input) });
    expect(audit(object({ code: byHand, items: array(name, { max: 2 }) }))).toEqual([
      { rule: "unreadable", path: "code", kind: "unknown" },
    ]);
    expect(audit(guard("Date", (input): input is Date => input instanceof Date)())).toEqual([]);
  });

  it("should look through every wrapper and composer to what it holds", () => {
    const event = tagged("type", { note: object({ text: string() }), ping: object({}) });
    const schema = meta(
      standard(
        object({
          choice: union([string(), number()]),
          event,
          shown: transform(string(), (text) => text.length),
          checked: string(check(() => true)),
        }),
      ),
      { title: "Schema" },
    );
    expect(audit(schema)).toEqual([
      { rule: "unbounded_text", path: "choice", kind: "string" },
      { rule: "unbounded_text", path: "event.text", kind: "string" },
      { rule: "unbounded_text", path: "shown", kind: "string" },
      { rule: "unbounded_text", path: "checked", kind: "string" },
    ]);
  });

  it("should read a codec by what is sent, its input", () => {
    const count = codec(string(), number(), { decode: Number, encode: String });
    expect(audit(object({ count }))).toEqual([{ rule: "unbounded_text", path: "count", kind: "string" }]);
    expect(audit(codec(name, number(), { decode: Number, encode: String }))).toEqual([]);
  });

  it("should give a frozen list, and refuse what is not a function", () => {
    expect(Object.isFrozen(audit(string()))).toBe(true);
    expect(() => audit(undefined as never)).toThrow(TypeError);
  });
});
