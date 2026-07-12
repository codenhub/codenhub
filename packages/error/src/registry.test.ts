import { afterEach, describe, expect, it } from "vitest";

import {
  createAppError,
  createErrorRegistry,
  freezeRegistry,
  getErrorRegistry,
  setErrorRegistry,
  type ErrorRegistry,
  type ReadonlyErrorRegistry,
} from "./index";

afterEach(() => {
  getErrorRegistry().clear();
});

describe("createErrorRegistry", () => {
  it("should create isolated blank registries", () => {
    const firstRegistry = createErrorRegistry();
    const secondRegistry = createErrorRegistry();

    firstRegistry.codes.add("invalid_credentials", {
      message: "Invalid email or password.",
      source: "auth",
    });

    expect(createAppError({ code: "invalid_credentials" }, { registry: firstRegistry })).toMatchObject({
      type: "known",
    });
    expect(createAppError({ code: "invalid_credentials" }, { registry: secondRegistry })).toMatchObject({
      type: "unknown",
    });
  });

  it("should merge preset registries on creation", () => {
    const firstPreset = createErrorRegistry();
    firstPreset.codes.add("code_one", { message: "Message one" });
    const secondPreset = createErrorRegistry();
    secondPreset.names.add("NameTwo", { message: "Message two" });

    const merged = createErrorRegistry([firstPreset, secondPreset]);

    expect(merged.codes.get("code_one")).toEqual({ message: "Message one" });
    expect(merged.names.get("NameTwo")).toEqual({ message: "Message two" });
  });

  it("should accept ReadonlyErrorRegistry presets", () => {
    const source = createErrorRegistry();
    source.codes.add("code_a", { message: "Message A" });
    const frozen: ReadonlyErrorRegistry = freezeRegistry(source);

    const merged = createErrorRegistry([frozen]);
    expect(merged.codes.get("code_a")).toEqual({ message: "Message A" });
  });

  it("should keep merge and clear callable when destructured", () => {
    const sourceRegistry = createErrorRegistry();
    const targetRegistry = createErrorRegistry();
    const { merge, clear } = targetRegistry;

    sourceRegistry.codes.add("invalid_credentials", { message: "Invalid email or password." });
    merge(sourceRegistry);

    expect(targetRegistry.codes.get("invalid_credentials")).toBeDefined();

    clear();

    expect(targetRegistry.codes.get("invalid_credentials")).toBeUndefined();
  });

  it("should merge all bucket types from source into target", () => {
    const source = createErrorRegistry();
    const target = createErrorRegistry();

    source.codes.add("500", { message: "Internal server error.", source: "server" });
    source.names.add("AbortError", { message: "Request cancelled.", source: "browser" });
    source.messages.add("Exact message", { message: "Matched message" });
    source.prefixes.add("Upload failed:", { message: "Upload failure." });
    source.patterns.add(/failed to fetch/gi, { message: "Network request failed.", isRetryable: true });

    target.merge(source);
    source.clear();

    expect(createAppError({ code: "500" }, { registry: target })).toMatchObject({
      type: "known",
      message: "Internal server error.",
    });
    expect(createAppError(new Error("failed to fetch"), { registry: target })).toMatchObject({
      type: "unexpected",
      message: "Network request failed.",
    });
  });
});

describe("getErrorRegistry / setErrorRegistry", () => {
  it("should return the same mutable global registry instance", () => {
    const registry = getErrorRegistry();
    expect(registry).toBe(getErrorRegistry());
  });

  it("should replace the active registry and affect createAppError", () => {
    const defaultRegistry = getErrorRegistry();
    const customRegistry = createErrorRegistry();
    customRegistry.codes.add("code_one", { message: "Custom message" });

    setErrorRegistry(customRegistry);
    expect(getErrorRegistry()).toBe(customRegistry);
    expect(createAppError({ code: "code_one" })).toMatchObject({
      type: "known",
      message: "Custom message",
    });

    setErrorRegistry(defaultRegistry);
  });

  it("should reject a non-object registry value", () => {
    expect(() => setErrorRegistry(null as never)).toThrow(TypeError);
    expect(() => setErrorRegistry("invalid" as never)).toThrow(TypeError);
  });
});

describe("freezeRegistry", () => {
  it("should return a ReadonlyErrorRegistry that still allows reads", () => {
    const registry = createErrorRegistry();
    registry.codes.add("code1", { message: "Msg" });
    const frozen = freezeRegistry(registry);

    expect(frozen.codes.get("code1")).toEqual({ message: "Msg" });
    expect([...frozen.codes.values()]).toHaveLength(1);
  });

  it("should throw TypeError when mutation methods are called on frozen buckets (runtime guard)", () => {
    const registry = createErrorRegistry();
    const frozen = freezeRegistry(registry);

    // TypeScript prevents direct calls — cast to test runtime guard
    const mutableCodes = frozen.codes as unknown as ErrorRegistry["codes"];
    expect(() => mutableCodes.add("code", { message: "err" })).toThrow(TypeError);
    expect(() => mutableCodes.addList([["code", { message: "err" }]])).toThrow(TypeError);
    expect(() => mutableCodes.clear()).toThrow(TypeError);
    expect(() => mutableCodes.delete("code")).toThrow(TypeError);

    const mutablePrefixes = frozen.prefixes as unknown as ErrorRegistry["prefixes"];
    expect(() => mutablePrefixes.add("prefix", { message: "err" })).toThrow(TypeError);
    expect(() => mutablePrefixes.addList([["prefix", { message: "err" }]])).toThrow(TypeError);
    expect(() => mutablePrefixes.clear()).toThrow(TypeError);
    expect(() => mutablePrefixes.delete("prefix")).toThrow(TypeError);

    const mutablePatterns = frozen.patterns as unknown as ErrorRegistry["patterns"];
    expect(() => mutablePatterns.add(/p/, { message: "err" })).toThrow(TypeError);
    expect(() => mutablePatterns.addList([[/p/, { message: "err" }]])).toThrow(TypeError);
    expect(() => mutablePatterns.clear()).toThrow(TypeError);
    expect(() => mutablePatterns.delete(/p/)).toThrow(TypeError);
  });

  it("should throw TypeError when advanced structural mutations are attempted on a frozen bucket", () => {
    const registry = createErrorRegistry();
    const frozen = freezeRegistry(registry);

    expect(() => {
      delete (frozen.codes as unknown as Record<string, unknown>).add;
    }).toThrow(TypeError);

    expect(() => {
      Object.defineProperty(frozen.codes, "newProp", { value: "val" });
    }).toThrow(TypeError);

    expect(() => {
      Object.preventExtensions(frozen.codes);
    }).toThrow(TypeError);

    expect(() => {
      Object.setPrototypeOf(frozen.codes, {});
    }).toThrow(TypeError);
  });

  it("should throw TypeError when a property is set on a frozen bucket", () => {
    const registry = createErrorRegistry();
    const frozen = freezeRegistry(registry);

    expect(() => {
      (frozen.codes as unknown as Record<string, unknown>).foo = "bar";
    }).toThrow(TypeError);
  });

  it("should be usable as a preset source for createErrorRegistry", () => {
    const source = createErrorRegistry();
    source.codes.add("code_a", { message: "Message A" });
    const frozen = freezeRegistry(source);

    const merged = createErrorRegistry([frozen]);
    expect(merged.codes.get("code_a")).toEqual({ message: "Message A" });
  });

  it("should be usable as a source for registry.merge", () => {
    const source = createErrorRegistry();
    source.codes.add("code_b", { message: "Message B" });
    const frozen = freezeRegistry(source);

    const target = createErrorRegistry();
    target.merge(frozen);
    expect(target.codes.get("code_b")).toEqual({ message: "Message B" });
  });
});
