import { describe, expect, it } from "vitest";

import { number } from "../primitives/number";
import { string } from "../primitives/string";
import { issuesOf, valueOf } from "../test-utils";
import { object } from "./object";
import { refine } from "./refine";

describe("refine", () => {
  const notReserved = refine(string(), (name) => name !== "admin", "Reserved name");

  it("should pass the value through when the check accepts it", () => {
    expect(valueOf(notReserved("ada"))).toBe("ada");
  });

  it("should report a custom issue when the check rejects it, using a string as the message", () => {
    expect(issuesOf(notReserved("admin"))).toEqual([{ code: "custom", path: [], message: "Reserved name" }]);
  });

  it("should take a code, params, message and path in an issue object", () => {
    const passwords = refine(
      object({ password: string(), confirm: string() }),
      (data) => data.password === data.confirm,
      { code: "mismatch", path: ["confirm"], message: "Passwords must match", params: { field: "password" } },
    );
    expect(issuesOf(passwords({ password: "a", confirm: "b" }))).toEqual([
      { code: "mismatch", path: ["confirm"], message: "Passwords must match", params: { field: "password" } },
    ]);
  });

  it("should default to a plain custom issue at the value", () => {
    expect(issuesOf(refine(number(), (n) => n > 0)(-1))).toEqual([{ code: "custom", path: [] }]);
  });

  it("should not run the check when the wrapped validator failed", () => {
    let calls = 0;
    const counted = refine(string(), () => {
      calls += 1;
      return true;
    });
    counted(42);
    expect(calls).toBe(0);
    expect(issuesOf(counted(42))[0]?.code).toBe("invalid_type");
  });

  it("should receive the value the wrapped validator produced, not the input", () => {
    const seen: string[] = [];
    refine(string({ trim: true }), (value) => {
      seen.push(value);
      return true;
    })("  a  ");
    expect(seen).toEqual(["a"]);
  });

  it("should place the issue under the parent property when nested", () => {
    const form = object({ user: refine(object({ name: string() }), () => false, { path: ["name"] }) });
    expect(issuesOf(form({ user: { name: "x" } }))[0]?.path).toEqual(["user", "name"]);
  });

  it("should stay synchronous with a synchronous check", () => {
    expect("then" in notReserved("ada")).toBe(false);
  });

  it("should become asynchronous with a check that returns a promise", async () => {
    const isFree = refine(string(), async (name) => name !== "taken", { code: "username_taken" });
    expect(valueOf(await isFree("ada"))).toBe("ada");
    expect(issuesOf(await isFree("taken"))[0]?.code).toBe("username_taken");
  });

  it("should give each rejection its own issues, so changing one result cannot change the next", () => {
    const rejectAll = refine(string(), () => false, { code: "no", path: ["field"] });
    const first = issuesOf(rejectAll("a"));
    (first as unknown[]).push({ code: "injected", path: [] });
    const path = first[0]?.path as unknown[];
    expect(() => path.push("x")).toThrow(TypeError);
    expect(issuesOf(rejectAll("a"))).toEqual([{ code: "no", path: ["field"] }]);
  });

  it("should let exceptions thrown by a check propagate, as bugs and not invalid input", () => {
    const broken = refine(string(), () => {
      throw new Error("bug");
    });
    expect(() => broken("a")).toThrow("bug");
  });
});
