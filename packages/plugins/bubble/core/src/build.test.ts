import fs from "fs";
import path from "path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { processCode, runBuild } from "./build.js";

describe("processCode", () => {
  it("should strip simple export function and detect action", () => {
    const code = `
      export function action(properties, context) {
        console.log("hello");
      }
    `;
    const result = processCode(code);
    expect(result.hasAction).toBe(true);
    expect(result.content).toContain("function action(properties, context)");
    expect(result.content).not.toContain("export");
  });

  it("should strip async export function and detect action", () => {
    const code = `
      export async function action(properties, context) {
        return await Promise.resolve("hello");
      }
    `;
    const result = processCode(code);
    expect(result.hasAction).toBe(true);
    expect(result.content).toContain("async function action(properties, context)");
    expect(result.content).not.toContain("export");
  });

  it("should strip arrow function action exports and detect action", () => {
    const code = `
      export const action = async (properties, context) => {
        return "hello";
      };
    `;
    const result = processCode(code);
    expect(result.hasAction).toBe(true);
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

describe("runBuild", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(process.cwd(), "temp-build-test-"));
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should warn and create default bubble.json when missing", async () => {
    const srcDir = path.join(tempDir, "src");
    fs.mkdirSync(srcDir);
    fs.mkdirSync(path.join(srcDir, "actions"));
    fs.mkdirSync(path.join(srcDir, "elements"));

    fs.writeFileSync(
      path.join(srcDir, "actions", "my-action.ts"),
      "export function action(properties, context) { console.log('hello'); }",
      "utf8",
    );

    await runBuild();

    const configPath = path.join(tempDir, "bubble.json");
    expect(fs.existsSync(configPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    expect(config.name).toBeDefined();
    expect(config.actions).toEqual([{ name: "my-action", type: "client" }]);

    const outputPath = path.join(tempDir, "dist/actions/my-action.js");
    expect(fs.existsSync(outputPath)).toBe(true);
    const outputContent = fs.readFileSync(outputPath, "utf8");
    expect(outputContent).toContain("function action");
    expect(outputContent).toContain("action(properties, context);");
  });

  it("should throw error if bubble.json is malformed", async () => {
    fs.writeFileSync(path.join(tempDir, "bubble.json"), "{ invalid: json }", "utf8");
    await expect(runBuild()).rejects.toThrow("Failed to parse bubble.json");
  });

  it("should throw error if action does not declare 'action' function", async () => {
    fs.writeFileSync(
      path.join(tempDir, "bubble.json"),
      JSON.stringify({
        name: "Test",
        actions: [{ name: "invalid-action", type: "client" }],
      }),
      "utf8",
    );

    const srcDir = path.join(tempDir, "src/actions");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, "invalid-action.ts"), "export function wrongFunctionName() {}", "utf8");

    await expect(runBuild()).rejects.toThrow("does not declare a function named 'action'");
  });

  it("should not compile sibling helper files as entry points", async () => {
    fs.writeFileSync(
      path.join(tempDir, "bubble.json"),
      JSON.stringify({
        name: "Test",
        actions: [{ name: "my-action", type: "client" }],
      }),
      "utf8",
    );

    const srcDir = path.join(tempDir, "src/actions");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, "my-action.ts"),
      "import { value } from './helper.js'; export function action() { console.log(value); }",
      "utf8",
    );
    fs.writeFileSync(path.join(srcDir, "helper.ts"), "export const value = 42;", "utf8");

    await runBuild();

    const mainOutputPath = path.join(tempDir, "dist/actions/my-action.js");
    expect(fs.existsSync(mainOutputPath)).toBe(true);
    const outputContent = fs.readFileSync(mainOutputPath, "utf8");
    expect(outputContent).toContain("42");

    const helperOutputPath = path.join(tempDir, "dist/actions/helper.js");
    expect(fs.existsSync(helperOutputPath)).toBe(false);
  });
});
