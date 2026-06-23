import { describe, expect, it } from "vitest";

import { processCode } from "./build.js";

describe("processCode", () => {
  it("should strip simple export function and detect sync action", () => {
    const code = `
      export function action(properties, context) {
        console.log("hello");
      }
    `;
    const result = processCode(code);
    expect(result.hasAction).toBe(true);
    expect(result.isAsync).toBe(false);
    expect(result.content).toContain("function action(properties, context)");
    expect(result.content).not.toContain("export");
  });

  it("should strip async export function and detect async action", () => {
    const code = `
      export async function action(properties, context) {
        return await Promise.resolve("hello");
      }
    `;
    const result = processCode(code);
    expect(result.hasAction).toBe(true);
    expect(result.isAsync).toBe(true);
    expect(result.content).toContain("async function action(properties, context)");
    expect(result.content).not.toContain("export");
  });

  it("should strip arrow function action exports and detect async action", () => {
    const code = `
      export const action = async (properties, context) => {
        return "hello";
      };
    `;
    const result = processCode(code);
    expect(result.hasAction).toBe(true);
    expect(result.isAsync).toBe(true);
    expect(result.content).toContain("const action = async (properties, context) =>");
    expect(result.content).not.toContain("export");
  });

  it("should clean trailing export lists", () => {
    const code = `
      function action(properties, context) {}
      export { action };
    `;
    const result = processCode(code);
    expect(result.hasAction).toBe(true);
    expect(result.content.trim()).toBe("function action(properties, context) { }");
  });

  it("should clean default exports", () => {
    const code = `
      function action(properties, context) {}
      export default action;
    `;
    const result = processCode(code);
    expect(result.hasAction).toBe(true);
    expect(result.content.trim()).toBe("function action(properties, context) { }");
  });

  it("should clean other declarations", () => {
    const code = `
      export const myVar = 42;
      export class MyClass {}
      export enum MyEnum { A }
    `;
    const result = processCode(code);
    expect(result.content).toContain("const myVar = 42;");
    expect(result.content).toContain("class MyClass {");
    expect(result.content).toContain("enum MyEnum");
    expect(result.content).not.toContain("export");
  });

  it("should check custom function names for elements", () => {
    const code = `
      export function initialize(instance, context) {}
    `;
    const result = processCode(code, "initialize");
    expect(result.hasFunction).toBe(true);
    expect(result.hasAction).toBe(false);
    expect(result.content).toContain("function initialize(instance, context)");
  });

  it("should remove empty exports added by bundlers", () => {
    const code = `
      const x = 1;
      export {};
    `;
    const result = processCode(code);
    expect(result.content.trim()).toBe("const x = 1;");
  });
});
