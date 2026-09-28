import { describe, expect, it } from "vitest";

import { val, type Validator } from "./index";
import { pathsOf, valueOf } from "./test-utils";

describe("lazy", () => {
  interface Category {
    name: string;
    children: Category[];
  }
  const category: Validator<Category> = val.lazy(() =>
    val.object({ name: val.string(), children: val.array(category) }),
  );

  it("validates recursive structures", () => {
    const tree = { name: "a", children: [{ name: "b", children: [] }] };
    expect(valueOf(category.validate(tree))).toEqual(tree);
  });

  it("locates failures deep inside", () => {
    expect(
      pathsOf(category.validate({ name: "a", children: [{ name: "b", children: [{ name: 1, children: [] }] }] })),
    ).toEqual([["children", 0, "children", 0, "name"]]);
  });

  it("builds the schema once, on first use", () => {
    let calls = 0;
    const schema = val.lazy(() => {
      calls += 1;
      return val.string();
    });
    expect(calls).toBe(0);
    schema.validate("a");
    schema.validate("b");
    expect(calls).toBe(1);
  });

  it("composes with modifiers", () => {
    expect(category.optional().validate(undefined).ok).toBe(true);
  });
});
