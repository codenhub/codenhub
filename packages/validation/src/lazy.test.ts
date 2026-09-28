import { describe, expect, it } from "vitest";

import { type ValidationErr, type Validator, val } from ".";

interface TreeNode {
  value: string;
  children?: TreeNode[];
}

describe("LazyValidator", () => {
  const treeSchema: Validator<TreeNode> = val.object({
    value: val.string().min(1),
    children: val.lazy(() => val.array(treeSchema)).optional(),
  });

  it("validates recursive data structures synchronously", () => {
    const validTree: TreeNode = {
      value: "root",
      children: [
        {
          value: "child-1",
          children: [
            {
              value: "grandchild-1",
            },
          ],
        },
        {
          value: "child-2",
        },
      ],
    };

    const res = treeSchema.validate(validTree);
    expect(res).toEqual({
      ok: true,
      value: validTree,
    });
  });

  it("rejects invalid nodes within recursive structures with correct path", () => {
    const invalidTree = {
      value: "root",
      children: [
        {
          value: "child-1",
          children: [
            {
              value: "", // invalid empty string
            },
          ],
        },
      ],
    };

    const res = treeSchema.validate(invalidTree) as ValidationErr;
    expect(res.ok).toBe(false);
    expect(res.error.path).toEqual(["children", 0, "children", 0, "value"]);
    expect(res.error.code).toBe("too_small");
  });

  it("supports asynchronous validation of recursive structures", async () => {
    interface AsyncItem {
      id: string;
      subItems?: AsyncItem[];
    }

    const asyncItemSchema: Validator<AsyncItem> = val.object({
      id: val.string().refineAsync(async (s) => s.startsWith("item-"), "Must start with item-"),
      subItems: val.lazy(() => val.array(asyncItemSchema)).optional(),
    });

    const validData = {
      id: "item-1",
      subItems: [{ id: "item-2" }],
    };

    const validRes = await asyncItemSchema.validateAsync(validData);
    expect(validRes).toEqual({
      ok: true,
      value: validData,
    });

    const invalidData = {
      id: "item-1",
      subItems: [{ id: "bad-id" }],
    };

    const invalidRes = (await asyncItemSchema.validateAsync(invalidData)) as ValidationErr;
    expect(invalidRes.ok).toBe(false);
    expect(invalidRes.error.path).toEqual(["subItems", 0, "id"]);
    expect(invalidRes.error.message).toBe("Must start with item-");
  });

  it("defers evaluation until accessed and caches resolved schema", () => {
    let callCount = 0;
    const lazyVal = val.lazy(() => {
      callCount++;
      return val.number();
    });

    expect(callCount).toBe(0);
    const resolved = lazyVal.schema;
    expect(callCount).toBe(1);
    expect(lazyVal.schema).toBe(resolved);
    expect(callCount).toBe(1);
  });

  it("avoids infinite recursion during isAsync() checks on self-referential schemas", () => {
    interface TreeNode {
      name: string;
      children?: TreeNode[];
    }

    const treeSchema: Validator<TreeNode> = val.lazy(() =>
      val.object({
        name: val.string(),
        children: val.array(treeSchema).optional(),
      }),
    );

    // Standard schema validation triggers isAsync() under the hood
    const standard = treeSchema["~standard"];
    expect(standard).toBeDefined();

    const result = standard.validate({ name: "root", children: [{ name: "child" }] });
    expect(result).toEqual({
      value: { name: "root", children: [{ name: "child" }] },
    });
  });
});
